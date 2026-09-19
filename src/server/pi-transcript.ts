// The conversation as the page shows it, read from Pi's own lane snapshot.
//
// Pi's history, queues and operation state are the record of what was said,
// what waits and what is running. Nothing here is stored: it is projected on
// every read, and Hallvi's execution evidence is placed into it by the id Pi
// gave each tool call.
import type { LaneSnapshot } from "@earendil-works/pi-agent-core";

import type { ConversationStatus } from "./operator-data";
import type { ChatMessage } from "./types";

/** Every message handed to Pi carries the id its sender gave it. */
export const MESSAGE_TAG = "hallviMessageId";
export const tagOf = (message: unknown) =>
  (message as Record<string, unknown> | undefined)?.[MESSAGE_TAG] as
    | string
    | undefined;

export interface Transcript {
  status: ConversationStatus;
  messages: ChatMessage[];
  /** Where each of Pi's tool calls sits, by Pi's tool-call id. */
  calls: Record<
    string,
    { replyId: string; sequence: number; informationId?: string }
  >;
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

function textOf(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Part[])
    .map((part) => (part.type === "text" ? String(part.text) : ""))
    .join("");
}

const at = (timestamp: number | undefined) =>
  new Date(timestamp ?? 0).toISOString();

/** True while anything of Pi's is unfinished: an operation, or a queue. */
export function unfinished(snapshot: LaneSnapshot) {
  return Boolean(snapshot.operation) || snapshot.queues.length > 0;
}

/**
 * `driving` is the one fact Pi's records cannot hold: whether this worker is
 * running the lane right now. Unfinished work that nobody is driving was
 * interrupted, and stays so until its owner continues or stops it.
 */
export function projectTranscript(
  chatId: string,
  snapshot: LaneSnapshot,
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
    reply = {
      id: `reply:${entryId}`,
      chatId,
      role: "assistant",
      body: "",
      source: "pi",
      status: "completed",
      createdAt: at(timestamp),
      startedAt: at(timestamp),
      responseTo: messages.findLast((m) => m.role === "user")?.id ?? null,
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
        calls[part.id] = { replyId: to.id, sequence: ++sequence };
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
      message.stopReason === "error"
        ? (message.errorMessage ?? "The model failed.")
        : null;
  };

  for (const entry of snapshot.transcript) {
    if (entry.type !== "message") continue;
    const message = entry.message as {
      role: string;
      content: unknown;
      timestamp?: number;
      toolCallId?: string;
    };
    if (message.role === "user") {
      reply = undefined;
      messages.push({
        id: tagOf(message) ?? entry.id,
        chatId,
        role: "user",
        body: textOf(message.content),
        source: "user",
        status: "delivered",
        createdAt: at(message.timestamp ?? entry.timestamp),
        revision: 0,
      });
    } else if (message.role === "assistant") assistant(entry.id, message);
    else if (
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

  const streaming = snapshot.operation?.streamingMessage;
  if (streaming)
    replyFor(`${snapshot.operation!.id}:streaming`, streaming.timestamp).body =
      textOf(streaming.content);

  const status: ConversationStatus = driving
    ? "working"
    : unfinished(snapshot)
      ? "interrupted"
      : "idle";
  if (snapshot.operation) {
    // The operation is Pi's; whether anyone is driving it is the worker's.
    const open =
      reply ??
      replyFor(`${snapshot.operation.id}:open`, snapshot.operation.startedAt);
    open.status = driving ? "running" : "interrupted";
    open.finishedAt = null;
    open.error = driving
      ? null
      : "The worker stopped while Pi was working. Whether the last command finished is not known: read execution evidence before continuing. Nothing runs again until you continue.";
  }

  for (const item of snapshot.queues) {
    if (item.type !== "message") continue;
    messages.push({
      id: tagOf(item.message) ?? item.entryId,
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

/** Whether Pi already holds a message with this id, read or still queued. */
export function holds(snapshot: LaneSnapshot, id: string) {
  return (
    snapshot.queues.some(
      (item) => item.type === "message" && tagOf(item.message) === id,
    ) ||
    snapshot.transcript.some(
      (entry) => entry.type === "message" && tagOf(entry.message) === id,
    )
  );
}
