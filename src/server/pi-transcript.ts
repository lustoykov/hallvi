// The conversation as the page shows it, read from what Pi durably holds.
//
// Pi's history, its queue and its record of each message are the record of
// what was said, what waits and how each stretch of work ended. Nothing here
// is stored: it is projected on every read, and Hallvi's execution evidence is
// placed into it by the id Pi gave each tool call.
import type { EntryRecord, SubmissionRecord } from "@earendil-works/pi-durable";

import type { ConversationStatus } from "./operator-data";
import type { StoredConversation } from "./pi-sessions";
import type { ChatMessage } from "./types";
import { failureText, nativeFailure } from "./pi-failure";
import { redactSecrets } from "./secrets";

/**
 * A message Hallvi sent itself, such as the branch watch waking Pi to deploy.
 * The id says so, because Pi's history is the only record of a message and
 * such a message must never read as the owner's own words.
 */
export const WAKEUP_PREFIX = "wakeup:";
const sourceOf = (id: string | undefined): "hallvi" | "user" =>
  id?.startsWith(WAKEUP_PREFIX) ? "hallvi" : "user";

/**
 * What Hallvi writes on a message besides its words. Pi keeps a message's
 * content as it was handed over, in its queue and in its history, so these
 * travel on the first part of it and are taken off again before a model is
 * sent anything. The message's id needs no tag: it is the request id of Pi's
 * own record of the message.
 */
export const SENT_AT_TAG = "hallviSentAt";
/**
 * Where a message was written when it was not Hallvi's own composer: the
 * `hallvi` command today, an agent's adapter later. It is provenance only: it
 * names no identity and grants no authority.
 */
export const ORIGIN_TAG = "hallviOrigin";
export const MESSAGE_ORIGINS = ["cli"] as const;
export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number];

/**
 * One of Pi's tool calls, as Pi recorded it: where it sits, what it was, and
 * what came back. Pi writes the call before the tool runs and the result when
 * it returns, so a call with no result is one that never reported an end.
 *
 * Arguments and results are Pi's own, unredacted here. Redaction belongs to
 * the reader that hands them out — `activityFromTranscript` — because Pi's
 * history keeps what the model actually sent.
 */
export interface TranscriptCall {
  replyId: string;
  sequence: number;
  tool: string;
  args: unknown;
  at: string;
  /** Absent until Pi records the tool's own result. */
  result?: { text: string; failed: boolean; at: string };
  informationId?: string;
  /** What has streamed back so far, from the worker running this call. */
  preview?: string;
}

/** One stretch of Pi's work: how Pi says it ended, or that it is still open. */
export interface TranscriptOperation {
  status: "open" | "completed" | "aborted" | "failed";
  startedAt: string;
  endedAt: string | null;
}

export interface Transcript {
  status: ConversationStatus;
  messages: ChatMessage[];
  /** Each of Pi's tool calls, by Pi's tool-call id. */
  calls: Record<string, TranscriptCall>;
  /** What Pi said between its calls, in the same sequence. */
  said: { replyId: string; sequence: number; text: string; at: string }[];
  /**
   * Pi's stretches of work, by the id each message and reply names as the
   * one it was taken in: the request key of the message that began it.
   * Several messages share one when Pi read them in one go. Always there
   * from the worker; a page's stand-in may leave it out.
   */
  operations?: Record<string, TranscriptOperation>;
}

type Part = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

/** A message as Pi stores it, of whichever role. */
type Stored = {
  role: string;
  content: unknown;
  timestamp?: number;
  toolCallId?: string;
  isError?: boolean;
  stopReason?: string;
  errorMessage?: string;
};

function textOf(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Part[])
    .map((part) => (part.type === "text" ? String(part.text) : ""))
    .join("");
}

/**
 * A tool's result as its words. What Pi itself has to say about a call — it
 * was stopped, it was interrupted, its arguments were refused — comes wrapped
 * in a tag meant for the model; the page shows the sentence.
 */
const toolText = (content: unknown) =>
  textOf(content).replace(
    /<harness>\n\[(?:error|warn|info)\] ([\s\S]*?)\n<\/harness>/g,
    "$1",
  );

/** The images in a message, in the order the owner attached them. */
function imagesOf(content: unknown) {
  return Array.isArray(content)
    ? (content as { type: string; data?: string; mimeType?: string }[]).filter(
        (part): part is { type: "image"; data: string; mimeType: string } =>
          part.type === "image",
      )
    : [];
}
const imageCount = (content: unknown) => imagesOf(content).length || undefined;

/** What Hallvi wrote on a message's first part. */
function tagsOf(content: unknown) {
  const first = Array.isArray(content)
    ? (content[0] as Record<string, unknown> | undefined)
    : undefined;
  const sentAt = first?.[SENT_AT_TAG];
  return {
    sentAt: typeof sentAt === "number" ? sentAt : undefined,
    origin: MESSAGE_ORIGINS.find((origin) => origin === first?.[ORIGIN_TAG]),
  };
}

const at = (timestamp: number | undefined) =>
  new Date(timestamp ?? 0).toISOString();

const messageOf = (entry: EntryRecord) =>
  entry.model?.[0] as Stored | undefined;

/**
 * The sender's id of a message, from Pi's record of it. See `requestIdFor`.
 */
const keyOf = (record: SubmissionRecord | undefined) =>
  record?.requestId?.replace(/#\d+$/, "");

/** A message Pi was handed and has not placed in its history yet. */
const waiting = (state: StoredConversation) =>
  state.inbox.items.filter((item) => item.mode !== "write");

/**
 * True while anything of Pi's is unfinished: work it began, or messages it
 * holds and has not read. With nobody running it, that is interrupted work.
 */
export function unfinished(state: StoredConversation) {
  return (
    state.tasks > 0 || Boolean(state.live.run) || waiting(state).length > 0
  );
}

/** Whether Pi answered two messages, or left them unanswered, as one. */
function endedAlike(
  one: SubmissionRecord | undefined,
  other: SubmissionRecord | undefined,
) {
  if (!one || !other) return true;
  return (
    one.status === other.status &&
    one.answer === other.answer &&
    one.reason === other.reason
  );
}

/**
 * `state` is one reading of what Pi holds. `working` is the one fact Pi's
 * records cannot hold: whether this worker is running the conversation right
 * now. Unfinished work that nobody is running was interrupted, and stays so
 * until its owner continues or stops it.
 */
export function projectTranscript(
  chatId: string,
  state: StoredConversation,
  working: boolean,
  clean: (text: string) => string = (text) => redactSecrets(text).text,
): Transcript {
  const messages: ChatMessage[] = [];
  const calls: Transcript["calls"] = {};
  const said: Transcript["said"] = [];
  const operations: NonNullable<Transcript["operations"]> = {};
  let reply: ChatMessage | undefined;
  let sequence = 0;
  /** save_information calls that asked to be shown, until their result. */
  const shown = new Set<string>();
  const taken = new Map(
    state.submissions.flatMap((record) =>
      record.type === "input" && record.entry !== undefined
        ? [[record.entry as number, record] as const]
        : [],
    ),
  );
  const running = (state.live.run?.inputs ?? []) as readonly number[];

  /**
   * The stretch of work the entries being read belong to. A message begins
   * one, named after itself, unless Pi placed it into the one before it. Pi
   * does that in two ways, and its history shows both. Messages it takes
   * from its queue together are written in one commit and carry one time. A
   * steer is written by the task that ran a step's tool calls, after them
   * and before the model is asked again.
   */
  let run: { id: string } | undefined;
  let before: (Stored & { kind: string }) | undefined;
  /** Pi's record of the message read last. */
  let previous: SubmissionRecord | undefined;
  /** Whether the last answer Pi wrote was one it gave up on. */
  let abandoned = false;
  const begin = (entry: EntryRecord, record: SubmissionRecord | undefined) => {
    const stamp = at(messageOf(entry)?.timestamp);
    run = { id: keyOf(record) ?? `entry:${entry.id}` };
    const open =
      record?.status === "placed" ||
      (record !== undefined && running.includes(record.id));
    operations[run.id] = {
      status: open
        ? "open"
        : record?.status === "unanswered"
          ? record.reason === "aborted"
            ? "aborted"
            : "failed"
          : "completed",
      startedAt: stamp,
      endedAt: open ? null : stamp,
    };
  };
  const reached = (timestamp: number | undefined) => {
    const operation = run && operations[run.id];
    if (operation && operation.endedAt !== null && timestamp)
      operation.endedAt = at(timestamp);
  };

  const replyFor = (key: string, timestamp: number | undefined) => {
    if (reply) return reply;
    sequence = 0;
    const asked = messages.findLast((m) => m.role === "user")?.id;
    reply = {
      // Named after the message it answers, so it is the same reply while it
      // streams, once Pi has written it, and after an interruption.
      id: `reply:${asked ?? key}`,
      chatId,
      role: "assistant",
      body: "",
      source: "pi",
      status: "completed",
      createdAt: at(timestamp),
      startedAt: at(timestamp),
      responseTo: asked ?? null,
      operationId: run?.id ?? null,
      revision: 0,
    };
    messages.push(reply);
    return reply;
  };

  for (const entry of state.entries) {
    const message = messageOf(entry);
    if (!message) continue;
    if (entry.kind === "pi.user") {
      const record = taken.get(entry.id);
      const placed =
        before?.kind === "pi.user"
          ? // One time is one commit, unless a clock stood still; Pi also
            // ends the messages of one run alike.
            before.timestamp === message.timestamp &&
            endedAlike(previous, record)
          : entry.byTaskId !== undefined &&
            (before?.kind === "pi.tool-result" ||
              // A call whose tool failed inside Pi leaves no result.
              before?.stopReason === "toolUse");
      if (!run || !placed) begin(entry, record);
      reply = undefined;
      const tags = tagsOf(message.content);
      messages.push({
        id: keyOf(record) ?? String(entry.id),
        requestKey: keyOf(record),
        chatId,
        role: "user",
        body: textOf(message.content),
        images: imageCount(message.content),
        source: sourceOf(keyOf(record)),
        origin: tags.origin,
        status: "delivered",
        createdAt: at(tags.sentAt ?? message.timestamp),
        operationId: run!.id,
        revision: 0,
      });
    } else if (entry.kind === "pi.assistant") {
      const to = replyFor(String(entry.id), message.timestamp);
      // An attempt that failed, or an answer that was cut, is an entry in
      // Pi's history too. Its words are the reply's while nothing follows
      // them, and are never listed among what Pi said: what Pi wrote next
      // says it whole. Pi runs the calls of one kind of answer only, the one
      // that ended asking for them.
      abandoned =
        message.stopReason === "error" || message.stopReason === "aborted";
      const ran = message.stopReason === "toolUse";
      for (const part of (message.content as Part[]) ?? []) {
        if (part.type === "text" && part.text?.trim()) {
          to.body = part.text;
          if (!abandoned)
            said.push({
              replyId: to.id,
              sequence: ++sequence,
              text: part.text,
              at: at(message.timestamp),
            });
        } else if (part.type === "toolCall" && part.id && ran) {
          calls[part.id] = {
            replyId: to.id,
            sequence: ++sequence,
            tool: part.name ?? "",
            args: part.arguments,
            at: at(message.timestamp),
          };
          if (part.name === "save_information" && part.arguments?.showInChat)
            shown.add(part.id);
        }
      }
      // The last thing Pi wrote decides: an attempt it retried, or an answer
      // it sent again after an interruption, is superseded by what followed.
      to.finishedAt = at(message.timestamp);
      to.status =
        message.stopReason === "error"
          ? "failed"
          : message.stopReason === "aborted"
            ? "cancelled"
            : "completed";
      to.failure =
        message.stopReason === "error"
          ? nativeFailure("model", message.errorMessage, clean)
          : undefined;
      to.error = to.failure ? failureText(to.failure) : null;
      reached(message.timestamp);
    } else if (entry.kind === "pi.tool-result") {
      const call = message.toolCallId ? calls[message.toolCallId] : undefined;
      if (call) {
        call.result = {
          text: toolText(message.content),
          failed: Boolean(message.isError),
          at: at(message.timestamp),
        };
        if (shown.has(message.toolCallId!)) {
          try {
            const saved = JSON.parse(textOf(message.content));
            if (typeof saved.id === "string" && saved.presentation)
              call.informationId = saved.id;
          } catch {
            // A refused save returns prose, and shows nothing.
          }
        }
      }
      reached(message.timestamp);
    } else continue;
    if (entry.kind === "pi.user") previous = taken.get(entry.id);
    before = { ...message, kind: entry.kind };
  }

  // How Pi says each stretch ended is its record of the message that began
  // it, whatever the last thing it wrote looks like: a reply stopped mid-call
  // ends in a finished message and a tool result.
  const records = new Map(
    state.submissions.flatMap((record) =>
      record.requestId ? [[keyOf(record)!, record] as const] : [],
    ),
  );
  for (const [id, operation] of Object.entries(operations)) {
    if (operation.status !== "aborted" && operation.status !== "failed")
      continue;
    const of = (message: ChatMessage) => message.operationId === id;
    let ended = messages.findLast(
      (message) => message.role === "assistant" && of(message),
    );
    const asked = messages.findLast(
      (message) => message.role === "user" && of(message),
    );
    // Pi wrote nothing before it stopped or failed: the reply is still said,
    // under the id it had while it ran.
    if (!ended && asked) {
      ended = {
        id: `reply:${asked.id}`,
        chatId,
        role: "assistant",
        body: "",
        source: "pi",
        status: "failed",
        createdAt: operation.startedAt,
        startedAt: operation.startedAt,
        responseTo: asked.id,
        operationId: id,
        revision: 0,
      };
      messages.splice(messages.findLastIndex(of) + 1, 0, ended);
    }
    if (!ended) continue;
    ended.finishedAt ??= operation.endedAt;
    if (operation.status === "aborted") {
      ended.status = "cancelled";
      continue;
    }
    ended.status = "failed";
    ended.finishedAt = operation.endedAt;
    if (!ended.failure?.reason) {
      const record = records.get(id);
      const model = record?.reason === "model_error";
      ended.failure = nativeFailure(
        model ? "model" : "runtime",
        typeof record?.detail === "string"
          ? record.detail
          : record?.reason === "no_model"
            ? "The selected model is not available"
            : record?.reason,
        clean,
      );
      ended.error = failureText(ended.failure);
    }
  }

  const status: ConversationStatus = working
    ? "working"
    : unfinished(state)
      ? "interrupted"
      : "idle";
  if (state.live.run) {
    // The run is Pi's; whether anyone is running it is the worker's.
    const opened = run && operations[run.id]?.status === "open" ? run.id : null;
    const partial = state.live.generation?.message as Stored | undefined;
    const open =
      reply?.operationId === opened && reply
        ? reply
        : ((reply = undefined),
          // Before its first words, the reply began when Pi placed what it
          // answers.
          replyFor(
            `${opened ?? "run"}:open`,
            partial?.timestamp ?? before?.timestamp,
          ));
    // What is being written now, or nothing yet: an attempt Pi gave up on
    // is not the reply it is working on.
    if (partial) open.body = textOf(partial.content) || open.body;
    else if (working && abandoned) open.body = "";
    open.status = working ? "running" : "interrupted";
    open.finishedAt = null;
    open.failure = undefined;
    open.error = working
      ? null
      : "The worker stopped while Pi was working. Whether the last command finished is not known: read execution evidence before continuing. Nothing runs again until you continue.";
  }

  const byId = new Map(state.submissions.map((record) => [record.id, record]));
  for (const item of waiting(state)) {
    const record = byId.get(item.id);
    const tags = tagsOf(item.content);
    messages.push({
      id: keyOf(record) ?? `queued:${item.id}`,
      requestKey: keyOf(record),
      chatId,
      role: "user",
      body: textOf(item.content),
      images: imageCount(item.content),
      source: sourceOf(keyOf(record)),
      origin: tags.origin,
      status: "waiting",
      delivery: item.mode === "steer" ? "steer" : "next",
      createdAt: at(tags.sentAt),
      revision: 0,
    });
  }
  return { status, messages, calls, said, operations };
}

/** Every time Pi was handed a message under this sender's id, in order. */
const handed = (state: StoredConversation, id: string) =>
  state.submissions.filter(
    (record) => record.type === "input" && keyOf(record) === id,
  );

/**
 * The message Pi holds under a sender's id, in its queue or its history. One
 * that a Stop took from the queue unread is not held: Pi keeps a record that
 * it was dropped, and nothing of the message.
 */
function held(state: StoredConversation, id: string) {
  const record = handed(state, id).at(-1);
  if (!record) return undefined;
  const entry =
    record.entry !== undefined &&
    state.entries.find((each) => each.id === record.entry);
  if (entry) return { content: messageOf(entry)?.content };
  const queued = waiting(state).find((item) => item.id === record.id);
  return queued && { content: queued.content };
}

/**
 * The text of the message Pi holds under this id, read or still queued. An
 * image-only message holds an empty text, which is still a message.
 */
export function holds(state: StoredConversation, id: string) {
  const message = held(state, id);
  return message && textOf(message.content);
}

/**
 * The id to hand Pi a message under. It is the sender's own, which is what
 * makes a send repeated after a lost answer one message. Pi never takes an id
 * twice, though, and a message Stop dropped is gone: sent again, it is a new
 * message to Pi, under the sender's id and a count.
 */
export function requestIdFor(
  state: StoredConversation | undefined,
  id: string,
) {
  const before = state ? handed(state, id).length : 0;
  return before ? `${id}#${before + 1}` : id;
}

/** One image of a message Pi holds, by the order it was attached in. */
export function imageOf(state: StoredConversation, id: string, index: number) {
  const message = held(state, id);
  const image = message && imagesOf(message.content)[index];
  return image ? { mimeType: image.mimeType, data: image.data } : undefined;
}
