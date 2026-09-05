import Database from "better-sqlite3";
import { realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { databasePath, listMessages } from "./db";
import { buildPiRunContext, PiRunContextError } from "./pi-run-context";
import { NativeSessionError } from "./pi-sessions";
import { buildViewSummary, loadChat } from "./phase-one";
import { askPi, normalizePiAssistantMessage } from "./pi";
import {
  claimNextPiRun,
  completePiRun,
  finishPiRun,
  getPiRun,
  interruptRunningPiRuns,
  persistPiDraft,
  recordPiCall,
} from "./pi-runs";
import type { PiRun } from "./types";

// The process must exit instead of releasing its writer locks while SDK work
// may still be alive. This is deliberately not an ordinary failed Run.
export class PiWorkerDrainError extends Error {}
// Retain a poisoned worker's lock strongly until process exit; otherwise the
// native SQLite handle could be garbage-collected while SDK work is alive.
const unsettledWorkerLocks = new Set<() => void>();

// The lock lives in a separate tiny SQLite file: holding it cannot block app
// reads/writes. The OS releases it on crash. No stale PID files or leases.
export function acquireWorkerLock() {
  const path = `${realpathSync(databasePath())}.worker-lock`;
  const lock = new Database(path, { timeout: 0 });
  try {
    lock.exec("BEGIN EXCLUSIVE");
  } catch {
    lock.close();
    throw new Error("A Pi worker is already running for this database.");
  }
  return () => {
    lock.close();
  };
}

export async function executePiRun(
  run: PiRun,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    drainTimeoutMs?: number;
  } = {},
) {
  const controller = new AbortController();
  const stop = () => {
    finishPiRun(
      run.id,
      "interrupted",
      "The worker stopped before this attempt finished. Retry when ready.",
    );
    controller.abort();
  };
  options.signal?.addEventListener("abort", stop, { once: true });
  if (options.signal?.aborted) stop();
  let draft = "";
  let savedDraft = "";
  const poll = setInterval(() => {
    if (getPiRun(run.id)?.status !== "running") controller.abort();
    else if (draft !== savedDraft) {
      persistPiDraft(run.id, draft);
      savedDraft = draft;
    }
  }, 250);
  const timeout = setTimeout(() => {
    finishPiRun(
      run.id,
      "timed-out",
      "The reply exceeded the execution time limit. Retry when ready; no Decisions were saved.",
    );
    controller.abort();
  }, options.timeoutMs ?? 120_000);
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const work = async () => {
      controller.signal.throwIfAborted();
      const { application, chat } = loadChat(run.applicationId, run.chatId);
      if (chat.archivedAt) throw new Error("This Chat is archived.");
      const runContext = buildPiRunContext(run, buildViewSummary(application));
      const user = listMessages(run.chatId).find(
        (message) => message.id === run.userMessageId,
      );
      if (!user) throw new Error("The accepted user message is missing.");
      const reply = await askPi(
        { run, userMessage: user.body, runContext },
        {
          signal: controller.signal,
          onModelCall() {
            if (getPiRun(run.id)?.status === "running") recordPiCall(run.id);
            else controller.abort();
          },
          onText(text) {
            if (text.length <= 10_000) draft = text;
          },
        },
      );
      controller.signal.throwIfAborted();
      completePiRun(run.id, {
        ...reply,
        message: normalizePiAssistantMessage(reply.message),
      });
    };
    await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        abortListener = () => {
          // Cancellation is recorded immediately, but the single writer is
          // retained until the adapter has aborted compaction and settled.
          drainTimer = setTimeout(
            () =>
              reject(
                new PiWorkerDrainError(
                  "The model did not stop within the shutdown deadline. Restart the worker before retrying.",
                ),
              ),
            options.drainTimeoutMs ?? 5_000,
          );
        };
        controller.signal.addEventListener("abort", abortListener, {
          once: true,
        });
        if (controller.signal.aborted) abortListener();
      }),
    ]);
  } catch (error) {
    if (error instanceof PiWorkerDrainError) throw error;
    // Provider errors may contain payloads or credentials. Persist only a safe
    // recovery instruction; precise transient failures stay out of public APIs.
    finishPiRun(
      run.id,
      "failed",
      error instanceof PiRunContextError || error instanceof NativeSessionError
        ? error.message
        : "Server Guy could not finish this attempt. Check Settings or retry. Your message is saved; no Decisions were saved from this attempt.",
    );
  } finally {
    clearInterval(poll);
    clearTimeout(timeout);
    clearTimeout(drainTimer);
    options.signal?.removeEventListener("abort", stop);
    if (abortListener)
      controller.signal.removeEventListener("abort", abortListener);
  }
  return getPiRun(run.id);
}

export async function runPiWorker(signal: AbortSignal) {
  const release = acquireWorkerLock();
  let unsettled = false;
  try {
    interruptRunningPiRuns();
    console.info("Pi worker ready. Watching saved requests, one at a time.");
    while (!signal.aborted) {
      const run = claimNextPiRun();
      if (run) await executePiRun(run, { signal });
      else await delay(250, undefined, { signal }).catch(() => undefined);
    }
  } catch (error) {
    unsettled = error instanceof PiWorkerDrainError;
    throw error;
  } finally {
    // A poisoned worker keeps the OS lock until process exit, not merely until
    // this function rejects. No next writer may overlap an unresponsive SDK.
    if (unsettled) unsettledWorkerLocks.add(release);
    else release();
  }
}
