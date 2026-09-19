// The conversation as the page shows it, read from Pi's own lane snapshot.
//
// Pi's history, queues and operation state are the record of what was said,
// what waits and what is running. Nothing here is stored: it is projected on
// every read, and Hallvi's execution evidence is placed into it by the id Pi
// gave each tool call.
import type {
  Entry,
  LaneQueuedItem,
  LaneSnapshot,
} from "@earendil-works/pi-agent-core";

import type { ConversationStatus } from "./operator-data";
import type { ChatMessage } from "./types";

/** Every message handed to Pi carries the id its sender gave it. */
export const MESSAGE_TAG = "hallviMessageId";
export const tagOf = (message: unknown) =>
  (message as Record<string, unknown> | undefined)?.[MESSAGE_TAG] as
    string | undefined;

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

export interface Transcript {
  status: ConversationStatus;
  messages: ChatMessage[];
  /** Each of Pi's tool calls, by Pi's tool-call id. */
  calls: Record<string, TranscriptCall>;
  /** What Pi said between its calls, in the same sequence. */
  said: { replyId: string; sequence: number; text: string; at: string }[];
}

type Part = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

/**
 * A tool result as Pi stores it: the tool's own words, and whether it
 * failed.
 */
type ToolResult = {
  role: string;
  toolCallId?: string;
  toolName?: string;
  content: unknown;
  isError?: boolean;
  timestamp?: number;
};

function textOf(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Part[])
    .map((part) => (part.type === "text" ? String(part.text) : ""))
    .join("");
}

/**
 * What to do about a model failure. Pi keeps the provider's own words; the
 * page gets advice, never those words.
 */
function advice(errorMessage: string | undefined) {
  const said = errorMessage ?? "";
  return `${
    /\b(401|403)\b|unauthori|invalid_grant|forbidden/i.test(said)
      ? "The model connection was rejected. Open Settings and reconnect."
      : /\b429\b|rate.?limit|usage.?limit|quota/i.test(said)
        ? "The model reports a usage or rate limit. Check the account allowance, then retry."
        : /\b5\d\d\b|overloaded|network|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(
              said,
            )
          ? "The model service could not be reached. Check your connection and retry."
          : "Hallvi could not finish this attempt. Check Settings or retry."
  } Check execution history for any effects.`;
}

const at = (timestamp: number | undefined) =>
  new Date(timestamp ?? 0).toISOString();

/**
 * The part of Pi's lane a transcript reads: whether an operation is open, what
 * it is streaming, and what is waiting in the queue.
 *
 * A narrow shape on purpose. A worker driving the conversation has the whole
 * lane; a reader that only opens Pi's stored session has these three facts and
 * no runtime at all, and both must produce the same transcript.
 */
export interface LaneView {
  operation: {
    id: string;
    startedAt: number;
    streamingMessage?: { content: unknown; timestamp?: number };
  } | null;
  queues: LaneQueuedItem[];
}

export const laneView = (snapshot: LaneSnapshot): LaneView => ({
  operation: snapshot.operation,
  queues: snapshot.queues,
});

/** The operation in which Pi reads its queue, named after its first entry. */
export const queueOperation = (entryId: string) => `queue:${entryId}`;

/**
 * The entries at which Pi says an operation was aborted.
 *
 * An operation begins at one of the owner's messages and is named after it:
 * a prompt's after the message's own id, a queue read's after the entry id of
 * the first message Pi read from the queue. Both are asked for, over every
 * message in the branch, because a reply stopped three turns ago is still
 * stopped — a reader that only asks about the newest operation quietly
 * promotes old cancelled work to completed.
 *
 * The caller says how a result is fetched: a driving worker asks its lane, a
 * reader asks Pi's stored session. The derivation is the same either way.
 */
export async function abortedTips(
  history: Entry[],
  resultOf: (
    operationId: string,
  ) => Promise<{ status: string; tipId?: string | null } | undefined>,
) {
  const abortedAt = new Set<string>();
  for (const entry of history) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    for (const id of [tagOf(entry.message), queueOperation(entry.id)]) {
      const result = id ? await resultOf(id) : undefined;
      if (result?.status === "aborted" && result.tipId)
        abortedAt.add(result.tipId);
    }
  }
  return abortedAt;
}

/** True while anything of Pi's is unfinished: an operation, or a queue. */
export function unfinished(lane: LaneView) {
  return Boolean(lane.operation) || lane.queues.length > 0;
}

/**
 * `history` is Pi's whole branch: its lane snapshot holds only what the model
 * is still sent, which a compaction shortens. `driving` is the one fact Pi's
 * records cannot hold: whether this worker is running the lane right now.
 * Unfinished work that nobody is driving was interrupted, and stays so until
 * its owner continues or stops it.
 */
export function projectTranscript(
  chatId: string,
  history: Entry[],
  /** Entries at which Pi says an operation was aborted. */
  abortedAt: ReadonlySet<string>,
  lane: LaneView,
  driving: boolean,
): Transcript {
  const messages: ChatMessage[] = [];
  const calls: Transcript["calls"] = {};
  const said: Transcript["said"] = [];
  let reply: ChatMessage | undefined;
  let sequence = 0;
  /** save_information calls that asked to be shown, until their result. */
  const shown = new Set<string>();

  const replyFor = (entryId: string, timestamp: number) => {
    if (reply) return reply;
    sequence = 0;
    const asked = messages.findLast((m) => m.role === "user")?.id;
    reply = {
      // Named after the message it answers, so it is the same reply while it
      // streams, once Pi has written it, and after an interruption.
      id: `reply:${asked ?? entryId}`,
      chatId,
      role: "assistant",
      body: "",
      source: "pi",
      status: "completed",
      createdAt: at(timestamp),
      startedAt: at(timestamp),
      responseTo: asked ?? null,
      revision: 0,
    };
    messages.push(reply);
    return reply;
  };

  const assistant = (
    entryId: string,
    message: {
      content: unknown;
      timestamp?: number;
      stopReason?: string;
      errorMessage?: string;
    },
  ) => {
    const to = replyFor(entryId, message.timestamp ?? 0);
    for (const part of (message.content as Part[]) ?? []) {
      if (part.type === "text" && part.text?.trim()) {
        to.body = part.text;
        said.push({
          replyId: to.id,
          sequence: ++sequence,
          text: part.text,
          at: at(message.timestamp),
        });
      } else if (part.type === "toolCall" && part.id) {
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
    to.finishedAt = at(message.timestamp);
    to.status =
      message.stopReason === "error"
        ? "failed"
        : message.stopReason === "aborted"
          ? "cancelled"
          : "completed";
    to.error =
      message.stopReason === "error" ? advice(message.errorMessage) : null;
  };

  for (const entry of history) {
    if (entry.type !== "message") continue;
    // Stopped mid-call, Pi's last words are a finished message and a tool
    // result; that the reply was cut is in Pi's record of the operation.
    const cut = () => {
      if (reply && abortedAt.has(entry.id)) reply.status = "cancelled";
    };
    const message = entry.message as ToolResult;
    if (message.role === "user") {
      reply = undefined;
      messages.push({
        id: tagOf(message) ?? entry.id,
        requestKey: tagOf(message),
        chatId,
        role: "user",
        body: textOf(message.content),
        source: "user",
        status: "delivered",
        createdAt: at(message.timestamp ?? entry.timestamp),
        revision: 0,
      });
    } else if (message.role === "assistant") {
      assistant(entry.id, message);
      cut();
    } else if (message.role === "toolResult") {
      cut();
      const call = message.toolCallId && calls[message.toolCallId];
      if (call)
        call.result = {
          text: textOf(message.content),
          failed: Boolean(message.isError),
          at: at(message.timestamp ?? entry.timestamp),
        };
    }
    if (
      message.role === "toolResult" &&
      message.toolCallId &&
      shown.has(message.toolCallId)
    ) {
      try {
        const saved = JSON.parse(textOf(message.content));
        if (typeof saved.id === "string" && saved.presentation)
          calls[message.toolCallId].informationId = saved.id;
      } catch {
        // A refused save returns prose, and shows nothing.
      }
    }
  }

  const streaming = lane.operation?.streamingMessage;
  if (streaming)
    replyFor(
      `${lane.operation!.id}:streaming`,
      streaming.timestamp ?? lane.operation!.startedAt,
    ).body = textOf(streaming.content);

  const status: ConversationStatus = driving
    ? "working"
    : unfinished(lane)
      ? "interrupted"
      : "idle";
  if (lane.operation) {
    // The operation is Pi's; whether anyone is driving it is the worker's.
    const open =
      reply ?? replyFor(`${lane.operation.id}:open`, lane.operation.startedAt);
    open.status = driving ? "running" : "interrupted";
    open.finishedAt = null;
    open.error = driving
      ? null
      : "The worker stopped while Pi was working. Whether the last command finished is not known: read execution evidence before continuing. Nothing runs again until you continue.";
  }

  for (const item of lane.queues) {
    if (item.type !== "message") continue;
    messages.push({
      id: tagOf(item.message) ?? item.entryId,
      requestKey: tagOf(item.message),
      chatId,
      role: "user",
      body: textOf((item.message as { content: unknown }).content),
      source: "user",
      status: "waiting",
      delivery: item.kind === "steer" ? "steer" : "next",
      createdAt: at((item.message as { timestamp?: number }).timestamp),
      revision: 0,
    });
  }
  return { status, messages, calls, said };
}

/** The text of the message Pi holds under this id, read or still queued. */
export function holds(history: Entry[], lane: LaneView, id: string) {
  const held =
    lane.queues.find(
      (item) => item.type === "message" && tagOf(item.message) === id,
    ) ??
    history.find(
      (entry) => entry.type === "message" && tagOf(entry.message) === id,
    );
  return held?.type === "message"
    ? textOf((held.message as { content: unknown }).content)
    : undefined;
}
