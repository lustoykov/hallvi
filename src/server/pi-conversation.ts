import { listActivity } from "./pi-activity";
import { workerPresence } from "./worker-presence";
import { listExecutions } from "./operator-execution";
import { and, asc, eq, sql } from "drizzle-orm";
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
} from "./applications";
import { sendChatMessageRequestSchema } from "./schemas";
import { logDiagnostic, type DiagnosticFailure } from "./diagnostics";
import { listInformation } from "./saved-information";
import { nativeEntryIds } from "./pi-sessions";
import type { ChatMessage, ChatSnapshot, PiReply } from "./types";

// A conversation is durable messages and one status. The owner's messages wait
// until Pi reads them; what Pi says and does between two of them is one reply
// row. Pi decides when anything runs. Nothing here schedules.

const now = () => new Date().toISOString();

function touch(id: string, values: Partial<typeof messages.$inferInsert>) {
  return db()
    .update(messages)
    .set({
      ...values,
      updatedAt: now(),
      revision: sql`${messages.revision} + 1`,
    })
    .where(eq(messages.id, id));
}

function runningReply(chatId: string) {
  return db()
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.status, "running")))
    .get();
}

function setChat(
  chatId: string,
  status: NonNullable<typeof chats.$inferInsert.status>,
) {
  db()
    .update(chats)
    .set({ status, updatedAt: now() })
    .where(eq(chats.id, chatId))
    .run();
}

export function getPiReply(id: string): PiReply | null {
  const message = getMessage(id);
  const chat = message && getChat(message.chatId);
  if (!message || !chat || message.role !== "assistant") return null;
  return {
    id: message.id,
    applicationId: chat.applicationId,
    chatId: chat.id,
    status: message.status,
    createdAt: message.createdAt,
    startedAt: message.startedAt,
  };
}

export function chatSnapshot(
  applicationId: string,
  chatId: string,
): ChatSnapshot {
  loadChat(applicationId, chatId);
  // Read outside the transaction: it is a file beside the database, and the
  // conversation needs it on every frame that shows a message waiting.
  const worker = workerPresence();
  return withTransaction(() => ({
    worker,
    status: getChat(chatId)?.status ?? "idle",
    messages: listMessages(chatId),
    executions: listExecutions(applicationId),
    piActivity: listActivity(applicationId),
    operations: [],
    activity: [],
    information: listInformation(applicationId, "", true).filter(
      (r) => r.presentation,
    ),
  }));
}

/** Accept a message. Whether it prompts Pi or joins its queue is Pi's call. */
export function sendChatMessage(
  applicationId: string,
  chatId: string,
  body: string,
  requestKey: string,
  delivery: NonNullable<ChatMessage["delivery"]> = "next",
): ChatMessage {
  const input = sendChatMessageRequestSchema.parse({
    message: body,
    requestKey,
    delivery,
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
      if (existing.body !== input.message)
        throw new ExistingApplicationConflictError(
          "This request key was already used for a different message.",
        );
      return existing;
    }
    const user = insertMessage(
      chatId,
      "user",
      input.message,
      "user",
      "waiting",
    );
    db()
      .update(messages)
      .set({ requestKey: input.requestKey, delivery })
      .where(eq(messages.id, user.id))
      .run();
    if (!runningReply(chatId)) setChat(chatId, "working");
    return getMessage(user.id)!;
  });
}

/**
 * Stop is a boundary for this conversation, recorded here and now: what was
 * waiting was written for an outcome that will not exist, so it is settled as
 * never started before the worker has even heard. Nothing delivers it later.
 */
export function stopConversation(applicationId: string, chatId: string) {
  return withTransaction(() => {
    loadChat(applicationId, chatId);
    const reply = runningReply(chatId);
    if (reply)
      touch(reply.id, {
        status: "cancelled",
        error:
          "Stopped. Commands already started may have changed the server; check execution history.",
        finishedAt: now(),
      }).run();
    for (const waiting of db()
      .select()
      .from(messages)
      .where(and(eq(messages.chatId, chatId), eq(messages.status, "waiting")))
      .all())
      touch(waiting.id, {
        status: "cancelled",
        error: "Not started because the conversation was stopped.",
        finishedAt: now(),
      }).run();
    setChat(chatId, "idle");
    return chatSnapshot(applicationId, chatId);
  });
}

// ---- The worker's side: what Pi's events mean for the durable record. ----

/** Every message still waiting, oldest first, with where it belongs. */
export function waitingMessages() {
  return db()
    .select({ message: messages, applicationId: chats.applicationId })
    .from(messages)
    .innerJoin(chats, eq(chats.id, messages.chatId))
    .where(eq(messages.status, "waiting"))
    .orderBy(asc(messages.createdAt), asc(sql`${messages}.rowid`))
    .all();
}

function closeReply(
  chatId: string,
  status: "completed" | "failed" | "interrupted",
  error: string | null = null,
) {
  const reply = runningReply(chatId);
  if (reply) touch(reply.id, { status, error, finishedAt: now() }).run();
  return reply;
}

/**
 * Pi has begun reading a message: it is delivered, what Pi was writing before
 * it is finished, and a new reply opens under it. Returns that reply, or null
 * when the conversation was stopped first and the message must not run.
 */
export function messageSeen(
  id: string,
  /** How what Pi was writing until now ended. */
  previous: { status: "completed" | "failed"; error: string | null } = {
    status: "completed",
    error: null,
  },
) {
  return withTransaction(() => {
    const message = getMessage(id);
    if (!message) return null;
    // Stop settles what waits before the worker has heard: only a message
    // that still waits may run.
    if (message.status !== "waiting") return null;
    closeReply(message.chatId, previous.status, previous.error);
    const at = now();
    touch(id, {
      status: "delivered",
      error: null,
      startedAt: at,
      finishedAt: null,
    }).run();
    const reply = insertMessage(
      message.chatId,
      "assistant",
      "",
      "pi",
      "running",
    );
    db()
      .update(messages)
      .set({ responseTo: id, startedAt: at })
      .where(eq(messages.id, reply.id))
      .run();
    setChat(message.chatId, "working");
    return getPiReply(reply.id)!;
  });
}

/**
 * Pi could not be started for this message. It was not read and is not tried
 * again by itself: the conversation says why and keeps the instruction.
 */
export function failToStart(
  id: string,
  error: string,
  failure?: DiagnosticFailure,
) {
  return withTransaction(
    () => {
      const message = getMessage(id);
      if (message?.status !== "waiting") return null;
      const at = now();
      touch(id, {
        status: "cancelled",
        error: "Not started.",
        finishedAt: at,
      }).run();
      const reply = insertMessage(
        message.chatId,
        "assistant",
        "",
        "pi",
        "failed",
      );
      db()
        .update(messages)
        .set({ responseTo: id, error, startedAt: at, finishedAt: at })
        .where(eq(messages.id, reply.id))
        .run();
      setChat(message.chatId, "idle");
      return getPiReply(reply.id);
    },
    (reply) => {
      if (reply)
        logDiagnostic("reply.failed", reply, { outcome: "failed", failure });
    },
  );
}

/**
 * What Pi is told as a stretch of work begins: only what its own history
 * cannot say, which is how Hallvi saw the previous reply end.
 */
export function conversationContext(applicationId: string, chatId: string) {
  const previous = listMessages(chatId)
    .filter((m) => m.role === "assistant" && m.status !== "running")
    .at(-1);
  return JSON.stringify({
    createdAt: now(),
    applicationId,
    chatId,
    previousReply: previous
      ? {
          status: previous.status,
          outcome:
            "Read execution history for actual effects. A stopped or failed reply may already have changed the server. Check uncertain outcomes before repeating work.",
        }
      : null,
  });
}

/** The reply's text so far, or its final text. Ignored once it has ended. */
export function writeReply(id: string, body: string) {
  if (body.length > 10000)
    throw new Error("Pi returned a message longer than 10,000 characters.");
  db()
    .update(messages)
    .set({ body, updatedAt: now(), revision: sql`${messages.revision} + 1` })
    .where(and(eq(messages.id, id), eq(messages.status, "running")))
    .run();
}

/**
 * Pi's run ended. After Stop there is no open reply: Stop settled it. A worker
 * shutting down settles its conversations as interrupted, as a crash would.
 */
export function settleConversation(
  chatId: string,
  status: "completed" | "failed" | "interrupted",
  error: string | null = null,
  failure?: DiagnosticFailure,
) {
  return withTransaction(
    () => {
      const reply = closeReply(chatId, status, error);
      const waiting = db()
        .select()
        .from(messages)
        .where(and(eq(messages.chatId, chatId), eq(messages.status, "waiting")))
        .get();
      setChat(
        chatId,
        status === "interrupted" ? "interrupted" : waiting ? "working" : "idle",
      );
      return reply ? getPiReply(reply.id) : null;
    },
    (reply) => {
      if (reply)
        logDiagnostic(`reply.${status}`, reply, { outcome: status, failure });
    },
  );
}

/** Pi wrote the message into its own history: from here on Pi remembers it. */
export function messagePersisted(id: string, nativeEntryId: string) {
  db().update(messages).set({ nativeEntryId }).where(eq(messages.id, id)).run();
}

/**
 * A worker that died mid-conversation says so, once, at the next start. Work
 * is never replayed. The message Pi was reading when it died is looked up in
 * Pi's own history by the entry id Pi gave it. When it is not there, Pi will
 * not remember it and nothing was recorded as run under it, but whether the
 * model had begun to answer cannot be known: the conversation says exactly
 * that, keeps the instruction, and does not send it again by itself.
 */
export function interruptConversations() {
  for (const reply of db()
    .select()
    .from(messages)
    .where(eq(messages.status, "running"))
    .all()) {
    const chat = getChat(reply.chatId);
    const asked = reply.responseTo ? getMessage(reply.responseTo) : null;
    settleConversation(
      reply.chatId,
      "interrupted",
      "The worker stopped. Read execution evidence before continuing; commands are not replayed.",
    );
    if (
      chat &&
      asked?.status === "delivered" &&
      !(
        asked.nativeEntryId &&
        nativeEntryIds(chat.applicationId, chat.id).has(asked.nativeEntryId)
      )
    )
      touch(asked.id, {
        status: "interrupted",
        error:
          "Hallvi stopped as Pi was reading this. It is not in Pi's history, so Pi will not remember it, and nothing was recorded as run under it. Whether the model had begun to answer is not known. It was not sent again; send it again when ready.",
        finishedAt: now(),
      }).run();
  }
}
