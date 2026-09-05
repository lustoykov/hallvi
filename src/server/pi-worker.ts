import Database from "better-sqlite3";
import { realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { databasePath, listActiveDecisions, listMessages } from "./db";
import {
  boundedChatContext,
  CONTEXT_LIMITS,
  PiContextError,
} from "./pi-context";
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
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
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
      "Pi exceeded the execution time limit. Retry when ready; no Decisions were saved.",
    );
    controller.abort();
  }, options.timeoutMs ?? 120_000);
  let abortListener: (() => void) | undefined;
  try {
    const work = async () => {
      controller.signal.throwIfAborted();
      const { application, chat } = loadChat(run.applicationId, run.chatId);
      if (chat.archivedAt) throw new Error("This Chat is archived.");
      const decisions = listActiveDecisions(application.id);
      const viewSummary = buildViewSummary(application);
      // All active Decisions or a visible failure, never silent truncation.
      if (
        JSON.stringify(decisions).length > CONTEXT_LIMITS.decisionCharacters ||
        viewSummary.length > CONTEXT_LIMITS.viewCharacters
      )
        throw new PiContextError(
          "Current Decisions or checks exceed the context budget. No model call was made and no Decisions were dropped. Adjust the budget before retrying.",
        );
      const context = await boundedChatContext(run, controller.signal);
      const user = listMessages(run.chatId).find(
        (message) => message.id === run.userMessageId,
      );
      if (!user) throw new Error("The accepted user message is missing.");
      recordPiCall(run.id);
      const reply = await askPi(
        { userMessage: user.body, decisions, viewSummary, ...context },
        {
          signal: controller.signal,
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
        abortListener = () => reject(new Error("Pi execution stopped."));
        controller.signal.addEventListener("abort", abortListener, {
          once: true,
        });
        if (controller.signal.aborted) abortListener();
      }),
    ]);
  } catch (error) {
    // Provider errors may contain payloads or credentials. Persist only a safe
    // recovery instruction; precise transient failures stay out of public APIs.
    finishPiRun(
      run.id,
      "failed",
      error instanceof PiContextError
        ? error.message
        : "Pi could not finish this attempt. Check Settings or retry. Your message is saved; no Decisions were saved from this attempt.",
    );
  } finally {
    clearInterval(poll);
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", stop);
    if (abortListener)
      controller.signal.removeEventListener("abort", abortListener);
  }
  return getPiRun(run.id);
}

export async function runPiWorker(signal: AbortSignal) {
  const release = acquireWorkerLock();
  try {
    interruptRunningPiRuns();
    console.info("Pi worker ready. Watching saved requests, one at a time.");
    while (!signal.aborted) {
      const run = claimNextPiRun();
      if (run) await executePiRun(run, { signal });
      else await delay(250, undefined, { signal }).catch(() => undefined);
    }
  } finally {
    release();
  }
}
