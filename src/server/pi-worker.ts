import { cleanupPiWorkspaces } from "./pi-workspace";
import { copyDue, protectController } from "./controller-protection";
import Database from "better-sqlite3";
import { realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { databasePath, getMessage } from "./db";
import { announceWorker } from "./worker-presence";
import { beginRunDiagnostics } from "./tracing";
import { NativeSessionError } from "./pi-sessions";
import { openPiSession, PiUnavailableError, watchPiSession } from "./pi";
import {
  BACKGROUND_CONTEXT,
  createCustomMessage,
} from "@earendil-works/pi-agent-core";
import { heldByPi, liveOperator, type AcceptedMessage } from "./pi-operator";
import {
  applicationsWithActivity,
  endActivity,
  recordMessage,
  settleRunningActivity,
  startActivity,
  updateActivity,
} from "./pi-activity";
import { assertChatWritable, loadApplication, loadChat } from "./applications";
import {
  conversationContext,
  failToStart,
  interruptConversations,
  messageAdmitted,
  messageSeen,
  messageStates,
  replyInterrupted,
  replyResumed,
  settleConversation,
  waitingMessages,
  writeReply,
} from "./pi-conversation";
import type { PiReply } from "./types";
import { diagnosticFailure, type DiagnosticFailure } from "./diagnostics";

// The process must exit instead of releasing its writer locks while SDK work
// may still be alive. This is deliberately not an ordinary failed Run.
export class PiWorkerDrainError extends Error {}

/**
 * Another worker already serves this database. Not a failure: the queue has a
 * reader, and it is not this process. The exit code says so to whatever
 * started it, so a launcher can leave the running one alone instead of
 * restarting into the same lock.
 */
export class PiWorkerBusyError extends Error {}
export const WORKER_BUSY_EXIT = 3;
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
    throw new PiWorkerBusyError(
      "A Pi worker is already running for this database.",
    );
  }
  return () => {
    lock.close();
  };
}

function advice(error: unknown) {
  let failure: DiagnosticFailure =
    error instanceof PiUnavailableError
      ? (error.diagnostic ?? diagnosticFailure(error))
      : diagnosticFailure(error);
  if (error instanceof NativeSessionError)
    failure = {
      category: error.code === "busy" ? "busy" : "history-unavailable",
    };
  const said =
    error instanceof NativeSessionError
      ? error.message
      : `${
          failure.category === "authentication"
            ? "The model connection was rejected. Open Settings and reconnect."
            : failure.category === "rate-limit"
              ? "The model reports a usage or rate limit. Check the account allowance, then retry."
              : failure.category === "network" ||
                  failure.category === "provider-unavailable"
                ? "The model service could not be reached. Check your connection and retry."
                : "Hallvi could not finish this attempt. Check Settings or retry."
        } Your message is saved. Check execution history for any effects.`;
  return { said, failure };
}

/**
 * One live stretch of one conversation: its native session, Pi's events
 * written down as they happen, and the messages handed to Pi so far. Pi decides
 * what runs and when; this records it and answers Stop.
 */
export function converse(
  scope: { applicationId: string; chatId: string },
  first: AcceptedMessage,
  options: { signal?: AbortSignal; drainTimeoutMs?: number } = {},
) {
  const given = new Set([first.id]);
  const early: AcceptedMessage[] = [];
  let operator: ReturnType<typeof liveOperator> | undefined;
  let reply: PiReply | undefined;
  let diagnostics: ReturnType<typeof beginRunDiagnostics> | undefined;
  let replyError: string | null = null;
  let draft = "";
  let savedDraft = "";
  let stopping: Promise<unknown> | undefined;
  let poison!: (error: PiWorkerDrainError) => void;
  const poisoned = new Promise<never>((_, reject) => (poison = reject));

  const stop = () =>
    (stopping ??= (async () => {
      // The conversation is settled at once; the native history stays locked
      // until the SDK has really stopped, or the worker ends instead.
      const timer = setTimeout(
        () =>
          poison(
            new PiWorkerDrainError(
              "The model did not stop within the shutdown deadline. Restart the worker before retrying.",
            ),
          ),
        options.drainTimeoutMs ?? 5_000,
      );
      try {
        // A worker going away aborts nothing: Pi keeps the operation and its
        // queue, and restores them. Only the owner's Stop ends them.
        await ((options.signal?.aborted
          ? operator?.leave()
          : operator?.stop()) ?? done);
      } finally {
        clearTimeout(timer);
      }
    })());

  const endReply = (status: "completed" | "failed" | "interrupted") => {
    if (!reply) return;
    // A call that never reported its end must not keep a spinner.
    settleRunningActivity(scope.applicationId, reply.id);
    diagnostics?.finish(status);
    diagnostics = undefined;
  };

  const done = (async () => {
    let close: (() => Promise<void>) | undefined;
    try {
      assertChatWritable(loadChat(scope.applicationId, scope.chatId).chat);
      const opened = await openPiSession(
        { ...scope, reply: () => reply?.id ?? "" },
        options,
      );
      close = opened.close;
      const { harness, lane } = opened;

      // The one reconciliation between Hallvi's records and Pi's: what Pi
      // already holds. It covers the instant between Pi taking a message and
      // Hallvi recording that, and a Stop given while no worker held the lane.
      const rows = messageStates(scope.chatId);
      const held = await heldByPi(
        lane,
        [...rows.values()]
          .filter((row) => row.status === "waiting" && !row.admittedAt)
          .map((row) => row.id),
      );
      for (const [id, entryId] of held.consumed)
        messageAdmitted(id, entryId, true);
      for (const { messageId, entryId } of held.queued)
        if (rows.get(messageId)?.status === "waiting")
          messageAdmitted(messageId, entryId);
        else await lane.cancelQueued(entryId, BACKGROUND_CONTEXT);
      let start: Parameters<typeof liveOperator>[2] =
        held.queued.some((item) => item.messageId === first.id) ||
        held.consumed.has(first.id)
          ? "sweep"
          : first;
      if (held.openOperationId) {
        // A worker that went away left this operation open. Pi restored it and
        // ran nothing. The owner has now continued the conversation, so Pi
        // resumes it: an interrupted tool is not run again, and the model is
        // told its outcome is unknown. If the owner stopped it instead, it is
        // ended here, and with it whatever Pi still had queued.
        const never = rows.get(held.openOperationId)?.status === "waiting";
        if (never) messageAdmitted(held.openOperationId, null);
        if (never || replyInterrupted(scope.chatId)) {
          if (!never) {
            reply = replyResumed(scope.chatId) ?? undefined;
            if (reply) diagnostics = beginRunDiagnostics(reply);
          }
          if (start !== "sweep" && held.openOperationId !== first.id)
            early.unshift(first);
          start = "resume";
        } else await lane.abort(BACKGROUND_CONTEXT);
      }

      const watch = watchPiSession(harness, {
        onActivity: (event) => diagnostics?.signal(event),
        onText(text) {
          if (text.length <= 10_000) draft = text;
        },
        onTool(event) {
          // Evidence of what Pi did, written as it happens so the conversation
          // can show it before the answer arrives.
          if (!reply) return;
          const at = { applicationId: scope.applicationId, runId: reply.id };
          if (event.type === "start")
            startActivity({ ...at, ...event, id: event.id });
          else if (event.type === "message") recordMessage({ ...at, ...event });
          else if (event.type === "update")
            // The runtime sends a result-so-far, never an increment.
            updateActivity(
              scope.applicationId,
              event.id,
              event.partial,
              "snapshot",
            );
          else endActivity({ applicationId: scope.applicationId, ...event });
        },
      });
      // Pi reads current state through its tools. This says only what its own
      // history cannot: how Hallvi saw the previous reply end.
      if (start !== "resume")
        await lane.appendMessage(
          createCustomMessage(
            "hallvi-conversation",
            conversationContext(scope.applicationId, scope.chatId),
            false,
            undefined,
            Date.now(),
          ),
          BACKGROUND_CONTEXT,
        );
      operator = liveOperator(harness, lane, start, {
        admitted: (id, entryId) => messageAdmitted(id, entryId),
        seen(id) {
          endReply(replyError ? "failed" : "completed");
          const next = messageSeen(id, {
            status: replyError ? "failed" : "completed",
            error: replyError,
          });
          replyError = null;
          draft = savedDraft = "";
          // Stopped before Pi read it: it must not run.
          if (!next) return void stop();
          reply = next;
          diagnostics = beginRunDiagnostics(next);
          watch.reply();
        },
        said(text) {
          if (reply)
            writeReply(reply.id, (draft = savedDraft = text.slice(0, 10_000)));
        },
        errored(error) {
          replyError = advice(error).said;
        },
      });
      for (const message of early.splice(0))
        if (!operator.deliver(message)) given.delete(message.id);
      if (stopping)
        void (options.signal?.aborted ? operator.leave() : operator.stop());
      const outcome = await Promise.race([operator.done, poisoned]);
      watch.unsubscribe();
      const failed = outcome.status === "failed" ? advice(outcome.error) : null;
      if (failed && !reply) failToStart(first.id, failed.said, failed.failure);
      const status = options.signal?.aborted
        ? "interrupted"
        : failed
          ? "failed"
          : "completed";
      endReply(status);
      settleConversation(
        scope.chatId,
        status,
        status === "interrupted"
          ? "The worker stopped before this finished. Whether the last command finished is not known: read execution evidence before continuing. Nothing is run again by itself."
          : (failed?.said ?? null),
        failed?.failure,
      );
    } catch (error) {
      if (error instanceof PiWorkerDrainError) throw error;
      const { said, failure } = advice(error);
      endReply("failed");
      if (reply) settleConversation(scope.chatId, "failed", said, failure);
      else failToStart(first.id, said, failure);
    } finally {
      await Promise.race([close?.(), poisoned]);
    }
  })();

  return {
    ...scope,
    done,
    given,
    /** The reply being written, so the worker can tell it was stopped. */
    reply: () => reply,
    deliver(message: AcceptedMessage) {
      if (operator ? operator.deliver(message) : early.push(message))
        given.add(message.id);
    },
    stop,
    /** Streamed text reaches the page between Pi's own message boundaries. */
    flush() {
      if (reply && draft !== savedDraft)
        writeReply(reply.id, (savedDraft = draft));
    },
  };
}

/**
 * Hallvi's own records are copied off this machine by the worker, not by
 * Pi and not by the owner remembering to. A copy that cannot be taken is
 * recorded where the Backups view reads it; it never stops the worker.
 */
async function keepControllerCopy(trigger: "after-change" | "daily") {
  try {
    if (copyDue(trigger)) await protectController(trigger);
  } catch (error) {
    console.warn(
      `Hallvi could not copy its own records: ${error instanceof Error ? error.message : "unknown reason"}`,
    );
  }
}

/**
 * Hand what the owner has sent to the conversations it belongs to. The only
 * decision made here is whether a conversation may start: never two for one
 * application, and never two on one server.
 */
export function route(
  live: Map<string, ReturnType<typeof converse>>,
  options: { signal?: AbortSignal; drainTimeoutMs?: number } = {},
) {
  const waiting = waitingMessages();
  for (const conversation of live.values()) {
    const reply = conversation.reply();
    if (reply && getMessage(reply.id)?.status !== "running")
      void conversation.stop().catch(() => undefined);
    conversation.flush();
  }
  const host = (applicationId: string) =>
    loadApplication(applicationId).host?.address.toLowerCase();
  for (const { message, applicationId } of waiting) {
    const accepted = {
      id: message.id,
      body: message.body,
      delivery: message.delivery ?? "next",
    };
    const conversation = live.get(message.chatId);
    if (conversation) {
      if (!conversation.given.has(message.id)) conversation.deliver(accepted);
      continue;
    }
    const busy = [...live.values()].some(
      (other) =>
        other.applicationId === applicationId ||
        (host(applicationId) &&
          host(other.applicationId) === host(applicationId)),
    );
    if (busy) continue;
    const started = converse(
      { applicationId, chatId: message.chatId },
      accepted,
      options,
    );
    live.set(message.chatId, started);
    void started.done
      .catch(() => undefined)
      .finally(() => live.delete(message.chatId));
  }
}

export async function runPiWorker(signal: AbortSignal) {
  const release = acquireWorkerLock();
  // Only after the lock: a process that never became the worker must not
  // claim to be one.
  const stopAnnouncing = announceWorker();
  let unsettled = false;
  const live = new Map<string, ReturnType<typeof converse>>();
  try {
    // A crash never reaches this worker's own cleanup, so anything still
    // marked running belongs to work that no longer exists. Startup is the
    // only place to say so.
    interruptConversations();
    for (const applicationId of applicationsWithActivity())
      settleRunningActivity(applicationId, null);
    await cleanupPiWorkspaces().catch(() => undefined);
    console.info("Pi worker ready. Watching saved messages.");
    let nextProtectionCheck = 0;
    let worked = false;
    let poisoned: unknown;
    while (!signal.aborted && !poisoned) {
      route(live, { signal });
      for (const conversation of live.values())
        conversation.done.catch((error) => (poisoned ??= error));
      if (live.size) worked = true;
      else if (worked) {
        worked = false;
        await keepControllerCopy("after-change");
      } else if (Date.now() >= nextProtectionCheck) {
        // Rarely: the check reads one small file, and the copy itself decides
        // whether anything is owed.
        nextProtectionCheck = Date.now() + 60_000;
        await keepControllerCopy("daily");
      }
      await delay(250, undefined, { signal }).catch(() => undefined);
    }
    if (poisoned) throw poisoned;
    // Shutdown interrupts every conversation and waits for each to settle.
    await Promise.all(
      [...live.values()].map((c) => c.stop().then(() => c.done)),
    );
  } catch (error) {
    unsettled = error instanceof PiWorkerDrainError;
    throw error;
  } finally {
    // A poisoned worker keeps the OS lock until process exit, not merely until
    // this function rejects. No next writer may overlap an unresponsive SDK.
    // Its beat stops either way: it is not reading messages any more, and
    // the conversation must say so rather than wait on it.
    stopAnnouncing();
    if (unsettled) unsettledWorkerLocks.add(release);
    else release();
  }
}
