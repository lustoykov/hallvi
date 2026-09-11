import { operationsFor } from "./operation-store";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  insertMessage,
  listMessages,
  listActivity,
  withTransaction,
} from "./db";
import { logDiagnostic, type DiagnosticFailure } from "./diagnostics";
import { messages, piRuns } from "./db-schema";
import {
  assertChatWritable,
  ExistingApplicationConflictError,
  loadChat,
  NotFoundError,
  savePiDecisions,
} from "./applications";
import { sendChatMessageRequestSchema } from "./schemas";
import type {
  AcceptedPiRun,
  ChatRunSnapshot,
  PiRun,
  PiRunStatus,
  PiTurnResult,
} from "./types";

const pending = ["queued", "running"] as const;
export function getPiRun(id: string) {
  return db().select().from(piRuns).where(eq(piRuns.id, id)).get() ?? null;
}

export function chatRunSnapshot(
  applicationId: string,
  chatId: string,
): ChatRunSnapshot {
  loadChat(applicationId, chatId);
  return withTransaction(() => {
    const runs = db()
      .select()
      .from(piRuns)
      .where(eq(piRuns.chatId, chatId))
      .orderBy(asc(sql`rowid`))
      .all();
    return {
      messages: listMessages(chatId),
      operations: operationsFor(applicationId),
      runs,
      activity: listActivity(applicationId),
    };
  });
}

function scopedRun(applicationId: string, chatId: string, id: string) {
  loadChat(applicationId, chatId);
  const run = getPiRun(id);
  if (!run || run.applicationId !== applicationId || run.chatId !== chatId)
    throw new NotFoundError("Pi request not found.");
  return run;
}

function accepted(run: PiRun): AcceptedPiRun {
  return {
    run,
    userMessageId: run.userMessageId,
    assistantMessageId: run.assistantMessageId,
  };
}

export function sendChatMessage(
  applicationId: string,
  chatId: string,
  body: string,
  requestKey: string,
) {
  const input = sendChatMessageRequestSchema.parse({
    message: body,
    requestKey,
  });
  let created = false;
  return withTransaction(
    () => {
      const { chat } = loadChat(applicationId, chatId);
      assertChatWritable(chat);
      const existing = db()
        .select()
        .from(piRuns)
        .where(
          and(
            eq(piRuns.chatId, chatId),
            eq(piRuns.requestKey, input.requestKey),
          ),
        )
        .get();
      if (existing) {
        const user = db()
          .select()
          .from(messages)
          .where(eq(messages.id, existing.userMessageId))
          .get();
        if (existing.retryOfId || user?.body !== input.message)
          throw new ExistingApplicationConflictError(
            "This request key was already used for a different message.",
          );
        return accepted(existing);
      }
      created = true;
      const user = insertMessage(chatId, "user", input.message, "user");
      return accepted(
        insertRun(applicationId, chatId, user.id, input.requestKey, null),
      );
    },
    (result) => {
      if (created)
        logDiagnostic("reply.accepted", result.run, { outcome: "queued" });
    },
  );
}

function insertRun(
  applicationId: string,
  chatId: string,
  userMessageId: string,
  requestKey: string,
  retryOfId: string | null,
) {
  const assistant = insertMessage(chatId, "assistant", "", "pi", "queued");
  const run = db()
    .insert(piRuns)
    .values({
      id: randomUUID(),
      applicationId,
      chatId,
      userMessageId,
      assistantMessageId: assistant.id,
      requestKey,
      retryOfId,
      status: "queued",
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
  return run;
}

export function retryPiRun(applicationId: string, chatId: string, id: string) {
  let created = false;
  return withTransaction(
    () => {
      const run = scopedRun(applicationId, chatId, id);
      assertChatWritable(loadChat(applicationId, chatId).chat);
      const existing = db()
        .select()
        .from(piRuns)
        .where(eq(piRuns.retryOfId, id))
        .get();
      if (existing) return accepted(existing);
      if (
        run.status === "succeeded" ||
        pending.includes(run.status as (typeof pending)[number])
      )
        throw new ExistingApplicationConflictError(
          "Only an unsuccessful, finished attempt can be retried.",
        );
      created = true;
      return accepted(
        insertRun(applicationId, chatId, run.userMessageId, randomUUID(), id),
      );
    },
    (result) => {
      if (created)
        logDiagnostic("reply.retry", result.run, { outcome: "queued" });
    },
  );
}

export function cancelPiRun(applicationId: string, chatId: string, id: string) {
  return withTransaction(() => {
    const run = scopedRun(applicationId, chatId, id);
    if (pending.includes(run.status as (typeof pending)[number]))
      finishPiRun(
        id,
        "cancelled",
        "Cancelled. No Decisions were saved from this attempt.",
      );
    return getPiRun(id)!;
  });
}

// There is one OS-locked worker. An immediate SQLite transaction also prevents
// overlapping claims by code callers and serializes completion against cancel.
export function claimNextPiRun() {
  return withTransaction(
    () => {
      if (
        db()
          .select({ id: piRuns.id })
          .from(piRuns)
          .where(eq(piRuns.status, "running"))
          .get()
      )
        return null;
      const next = db()
        .select()
        .from(piRuns)
        .where(eq(piRuns.status, "queued"))
        .orderBy(asc(sql`rowid`))
        .limit(1)
        .get();
      if (!next) return null;
      db()
        .update(piRuns)
        .set({
          status: "running",
          startedAt: new Date().toISOString(),
          revision: sql`${piRuns.revision} + 1`,
        })
        .where(eq(piRuns.id, next.id))
        .run();
      db()
        .update(messages)
        .set({ status: "running", revision: sql`${messages.revision} + 1` })
        .where(eq(messages.id, next.assistantMessageId))
        .run();
      return getPiRun(next.id)!;
    },
    (run) => {
      if (run) logDiagnostic("reply.claimed", run, { outcome: "running" });
    },
  );
}

export function persistPiDraft(id: string, body: string) {
  // Only accumulated public text, never reasoning or a tool payload. Limit both
  // database growth and how much provisional output the UI must render.
  if (body.length > 10_000)
    throw new Error("Pi returned a message longer than 10,000 characters.");
  return withTransaction(() => {
    const run = getPiRun(id);
    if (run?.status !== "running") return;
    db()
      .update(messages)
      .set({ body, revision: sql`${messages.revision} + 1` })
      .where(eq(messages.id, run.assistantMessageId))
      .run();
  });
}

export function finishPiRun(
  id: string,
  status: Exclude<PiRunStatus, "queued" | "running" | "succeeded">,
  error: string,
  failure?: DiagnosticFailure,
) {
  return withTransaction(
    () => {
      const run = getPiRun(id);
      if (!run || !pending.includes(run.status as (typeof pending)[number]))
        return false;
      db()
        .update(piRuns)
        .set({
          status,
          error,
          finishedAt: new Date().toISOString(),
          revision: sql`${piRuns.revision} + 1`,
        })
        .where(eq(piRuns.id, id))
        .run();
      db()
        .update(messages)
        .set({ status, revision: sql`${messages.revision} + 1` })
        .where(eq(messages.id, run.assistantMessageId))
        .run();
      return true;
    },
    (changed) => {
      if (!changed) return;
      const run = getPiRun(id);
      if (run)
        logDiagnostic(`reply.${status}`, run, {
          outcome: status,
          durationMs:
            Date.parse(run.finishedAt!) -
            Date.parse(run.startedAt ?? run.createdAt),
          failure: failure ?? {
            category: status === "failed" ? "unknown" : status,
          },
        });
    },
  );
}

export function completePiRun(id: string, reply: PiTurnResult) {
  return withTransaction(
    () => {
      const run = getPiRun(id);
      if (run?.status !== "running") return false;
      // A Chat archived while the answer was being produced cannot receive
      // it; the attempt fails instead of crossing the boundary.
      assertChatWritable(loadChat(run.applicationId, run.chatId).chat);
      savePiDecisions(
        run.applicationId,
        run.userMessageId,
        reply.decisionProposals,
      );
      db()
        .update(messages)
        .set({
          body: reply.message,
          status: "completed",
          revision: sql`${messages.revision} + 1`,
        })
        .where(eq(messages.id, run.assistantMessageId))
        .run();
      db()
        .update(piRuns)
        .set({
          status: "succeeded",
          finishedAt: new Date().toISOString(),
          revision: sql`${piRuns.revision} + 1`,
        })
        .where(eq(piRuns.id, id))
        .run();
      return true;
    },
    (saved) => {
      if (!saved) return;
      const run = getPiRun(id);
      if (run)
        logDiagnostic("reply.succeeded", run, {
          outcome: "succeeded",
          durationMs:
            Date.parse(run.finishedAt!) -
            Date.parse(run.startedAt ?? run.createdAt),
          metadata: { requirements: reply.decisionProposals.length },
        });
    },
  );
}

export function interruptRunningPiRuns() {
  const active = db()
    .select({ id: piRuns.id })
    .from(piRuns)
    .where(inArray(piRuns.status, ["running"]))
    .all();
  for (const run of active)
    finishPiRun(
      run.id,
      "interrupted",
      "The worker stopped before this attempt finished. Retry when ready.",
    );
}

export function recordPiCall(id: string) {
  const result = db()
    .update(piRuns)
    .set({ piCalls: sql`${piRuns.piCalls} + 1` })
    .where(and(eq(piRuns.id, id), eq(piRuns.status, "running")))
    .run();
  if (!result.changes) throw new Error("This attempt is no longer running.");
}
