import { listActivity } from "./pi-activity";
import { workerPresence } from "./worker-presence";
import { listExecutions } from "./operator-execution";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  getChat,
  getMessage,
  insertMessage,
  listMessages,
  withTransaction,
} from "./db";
import { chats, messages } from "./db-schema";
import {
  assertChatWritable,
  ExistingApplicationConflictError,
  loadChat,
  NotFoundError,
} from "./applications";
import { sendChatMessageRequestSchema } from "./schemas";
import { logDiagnostic, type DiagnosticFailure } from "./diagnostics";
import { listInformation } from "./saved-information";
import type {
  AcceptedPiRun,
  ChatRunSnapshot,
  PiRun,
  PiRunStatus,
  PiTurnResult,
} from "./types";

// A worker/API projection of an assistant response. There is no runs table or
// second copy of response state. Execution files use the response ID as runId.
function responseRun(message: typeof messages.$inferSelect): PiRun | null {
  const chat = getChat(message.chatId);
  if (!chat || !message.responseTo || !message.requestKey) return null;
  return {
    id: message.id,
    applicationId: chat.applicationId,
    chatId: chat.id,
    userMessageId: message.responseTo,
    assistantMessageId: message.id,
    requestKey: message.requestKey,
    retryOfId: message.retryOfId,
    status: message.status === "completed" ? "succeeded" : message.status,
    revision: message.revision,
    error: message.error,
    piCalls: message.piCalls,
    createdAt: message.createdAt,
    startedAt: message.startedAt,
    finishedAt: message.finishedAt,
  };
}
export function getPiRun(id: string) {
  const message = getMessage(id);
  return message ? responseRun(message) : null;
}
export function chatRunSnapshot(
  applicationId: string,
  chatId: string,
): ChatRunSnapshot {
  loadChat(applicationId, chatId);
  // Read outside the transaction: it is a file beside the database, and the
  // conversation needs it on every frame that shows a message waiting.
  const worker = workerPresence();
  return withTransaction(() => ({
    worker,
    messages: listMessages(chatId),
    runs: listMessages(chatId).flatMap((m) => responseRun(m) ?? []),
    executions: listExecutions(applicationId),
    piActivity: listActivity(applicationId),
    operations: [],
    activity: [],
    information: listInformation(applicationId, "", true).filter(
      (r) => r.presentation,
    ),
  }));
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
function insertResponse(
  chatId: string,
  userMessageId: string,
  requestKey: string,
  retryOfId: string | null,
) {
  const active = db()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        inArray(messages.status, ["queued", "running"]),
      ),
    )
    .get();
  const response = insertMessage(chatId, "assistant", "", "pi", "queued");
  db()
    .update(messages)
    .set({ responseTo: userMessageId, requestKey, retryOfId })
    .where(eq(messages.id, response.id))
    .run();
  // A follow-up may wait behind active work, but it must not replace the
  // pointer used by activity and approval UI before it actually starts. The
  // queued message row is the durable FIFO.
  if (!active)
    db()
      .update(chats)
      .set({
        currentResponseId: response.id,
        status: "working",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(chats.id, chatId))
      .run();
  return accepted(getPiRun(response.id)!);
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
  return withTransaction(() => {
    assertChatWritable(loadChat(applicationId, chatId).chat);
    const existing = db()
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.requestKey, input.requestKey),
        ),
      )
      .get();
    if (existing) {
      const run = responseRun(existing)!;
      if (
        run.retryOfId ||
        getMessage(run.userMessageId)?.body !== input.message
      )
        throw new ExistingApplicationConflictError(
          "This request key was already used for a different message.",
        );
      return accepted(run);
    }
    const user = insertMessage(chatId, "user", input.message, "user");
    return insertResponse(chatId, user.id, input.requestKey, null);
  });
}
export function retryPiRun(applicationId: string, chatId: string, id: string) {
  return withTransaction(() => {
    const run = scopedRun(applicationId, chatId, id);
    assertChatWritable(loadChat(applicationId, chatId).chat);
    const existing = db()
      .select()
      .from(messages)
      .where(eq(messages.retryOfId, id))
      .get();
    if (existing) return accepted(responseRun(existing)!);
    if (["succeeded", "queued", "running"].includes(run.status))
      throw new ExistingApplicationConflictError(
        "Only an unsuccessful, finished attempt can be retried.",
      );
    return insertResponse(chatId, run.userMessageId, randomUUID(), id);
  });
}
export function cancelPiRun(applicationId: string, chatId: string, id: string) {
  return withTransaction(() => {
    const target = scopedRun(applicationId, chatId, id);
    settle(
      id,
      "cancelled",
      "Turn cancelled. Commands already started may have changed the server; check execution history.",
    );
    // Stop is a boundary for this conversation. Follow-ups written for the
    // outcome of the stopped turn must not start later as though that outcome
    // existed. Keep them in the transcript with a clear never-started result.
    if (target.status === "running")
      for (const queued of db()
        .select()
        .from(messages)
        .where(and(eq(messages.chatId, chatId), eq(messages.status, "queued")))
        .all())
        settle(
          queued.id,
          "cancelled",
          "Not started because the active reply was stopped.",
        );
    return getPiRun(id)!;
  });
}
export function claimNextPiRun() {
  return withTransaction(() => {
    if (
      db().select().from(messages).where(eq(messages.status, "running")).get()
    )
      return null;
    const next = db()
      .select()
      .from(messages)
      .where(and(eq(messages.status, "queued"), isNotNull(messages.responseTo)))
      .orderBy(asc(messages.createdAt), asc(sql`rowid`))
      .get();
    if (!next) return null;
    db()
      .update(messages)
      .set({
        status: "running",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: sql`${messages.revision} + 1`,
      })
      .where(eq(messages.id, next.id))
      .run();
    db()
      .update(chats)
      .set({
        currentResponseId: next.id,
        status: "working",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(chats.id, next.chatId))
      .run();
    return getPiRun(next.id);
  });
}
export function persistPiDraft(id: string, body: string) {
  if (body.length > 10000)
    throw new Error("Pi returned a message longer than 10,000 characters.");
  db()
    .update(messages)
    .set({
      body,
      updatedAt: new Date().toISOString(),
      revision: sql`${messages.revision} + 1`,
    })
    .where(and(eq(messages.id, id), eq(messages.status, "running")))
    .run();
}
function settle(
  id: string,
  status: typeof messages.$inferSelect.status,
  error: string | null,
  body?: string,
) {
  const run = getPiRun(id);
  if (!run || !["queued", "running"].includes(run.status)) return false;
  const now = new Date().toISOString();
  db()
    .update(messages)
    .set({
      status,
      error,
      ...(body === undefined ? {} : { body }),
      finishedAt: now,
      updatedAt: now,
      revision: sql`${messages.revision} + 1`,
    })
    .where(eq(messages.id, id))
    .run();
  const next = db()
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, run.chatId), eq(messages.status, "queued")))
    .orderBy(asc(messages.createdAt), asc(sql`rowid`))
    .get();
  db()
    .update(chats)
    .set({
      status: next
        ? "working"
        : status === "interrupted"
          ? "interrupted"
          : "idle",
      currentResponseId: next?.id ?? null,
      updatedAt: now,
    })
    .where(and(eq(chats.id, run.chatId), eq(chats.currentResponseId, id)))
    .run();
  return true;
}
export function finishPiRun(
  id: string,
  status: Exclude<PiRunStatus, "queued" | "running" | "succeeded">,
  error: string,
  failure?: DiagnosticFailure,
) {
  return withTransaction(
    () => settle(id, status, error),
    (changed) => {
      const run = getPiRun(id);
      if (changed && run)
        logDiagnostic(`reply.${status}`, run, { outcome: status, failure });
    },
  );
}
export function completePiRun(id: string, reply: PiTurnResult) {
  return withTransaction(() => {
    const run = getPiRun(id);
    if (run?.status !== "running") return false;
    assertChatWritable(loadChat(run.applicationId, run.chatId).chat);
    return settle(id, "completed", null, reply.message);
  });
}
export function interruptRunningPiRuns() {
  for (const response of db()
    .select()
    .from(messages)
    .where(eq(messages.status, "running"))
    .all())
    finishPiRun(
      response.id,
      "interrupted",
      "The worker stopped. Read execution evidence before continuing; commands are not replayed.",
    );
}
export function recordPiCall(id: string) {
  const result = db()
    .update(messages)
    .set({ piCalls: sql`${messages.piCalls} + 1` })
    .where(and(eq(messages.id, id), eq(messages.status, "running")))
    .run();
  if (!result.changes) throw new Error("This attempt is no longer running.");
}
