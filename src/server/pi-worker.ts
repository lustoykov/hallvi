import { cleanupPiWorkspaces } from "./pi-workspace";
import Database from "better-sqlite3";
import { realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { databasePath, listMessages } from "./db";
import { beginRunDiagnostics } from "./tracing";
import { buildPiRunContext } from "./pi-run-context";
import { NativeSessionError } from "./pi-sessions";
import { askPi, normalizePiAssistantMessage, PiUnavailableError } from "./pi";
import { assertChatWritable, loadChat } from "./applications";
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
import { diagnosticFailure, type DiagnosticFailure } from "./diagnostics";

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

/**
 * A reply can read and search the repository in its workspace and prepare
 * operations; the budget covers that work without holding the single worker
 * indefinitely.
 */

export async function executePiRun(
  run: PiRun,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    drainTimeoutMs?: number;
  } = {},
) {
  const controller = new AbortController();
  const diagnostics = beginRunDiagnostics(run);
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
  // Individual commands have timeouts. A conversation can wait for its user.
  const timeout =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          finishPiRun(
            run.id,
            "timed-out",
            "The turn exceeded its execution time limit. Check its command history before continuing.",
          );
          controller.abort();
        }, options.timeoutMs);
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const stage: { value: "context" | "model" | "save" } = { value: "context" };
  try {
    const work = async () => {
      controller.signal.throwIfAborted();
      diagnostics.signal({ type: "start", key: "context", kind: "context" });
      assertChatWritable(loadChat(run.applicationId, run.chatId).chat);
      // No application summary is injected: Pi reads current state through
      // get_application_status when an answer depends on it.
      const runContext = buildPiRunContext(run);
      const user = listMessages(run.chatId).find(
        (message) => message.id === run.userMessageId,
      );
      if (!user) throw new Error("The accepted user message is missing.");
      diagnostics.signal({ type: "end", key: "context" });
      stage.value = "model";
      const reply = await askPi(
        { run, userMessage: user.body, runContext },
        {
          signal: controller.signal,
          onActivity: diagnostics.signal,
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
      stage.value = "save";
      diagnostics.signal({ type: "start", key: "save", kind: "save" });
      try {
        const saved = completePiRun(run.id, {
          ...reply,
          message: normalizePiAssistantMessage(reply.message),
        });
        // completePiRun has committed before either the log or span can claim
        // success. A cancelled/stale result leaves this step incomplete.
        if (saved)
          diagnostics.signal({
            type: "end",
            key: "save",
            metadata: { requirements: reply.decisionProposals.length },
          });
      } catch (error) {
        diagnostics.signal({ type: "end", key: "save", failed: true });
        throw error;
      }
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
    let failure: DiagnosticFailure =
      error instanceof PiUnavailableError
        ? (error.diagnostic ?? diagnosticFailure(error))
        : diagnosticFailure(error);
    if (error instanceof NativeSessionError)
      failure = {
        category: error.code === "busy" ? "busy" : "history-unavailable",
      };
    else if (failure.category === "unknown" && stage.value === "save")
      failure = { category: "validation" };
    const advice =
      failure.category === "authentication"
        ? "The model connection was rejected. Open Settings and reconnect."
        : failure.category === "rate-limit"
          ? "The model reports a usage or rate limit. Check the account allowance, then retry."
          : failure.category === "network" ||
              failure.category === "provider-unavailable"
            ? "The model service could not be reached. Check your connection and retry."
            : failure.category === "storage"
              ? "The reply could not be saved. Check local storage, then retry."
              : "Server Guy could not finish this attempt. Check Settings or retry.";
    finishPiRun(
      run.id,
      "failed",
      error instanceof NativeSessionError
        ? error.message
        : `${advice} Your message is saved; no Decisions were saved from this attempt.`,
      failure,
    );
  } finally {
    diagnostics.finish(getPiRun(run.id)?.status ?? "interrupted");
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
    await cleanupPiWorkspaces().catch(() => undefined);
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
