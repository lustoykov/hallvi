import type { ChatSnapshot } from "@/server/types";

export const chatCollections = [
  "messages",
  "executions",
  "piActivity",
  "information",
] as const;
export type ChatCollection = (typeof chatCollections)[number];
export type CollectionChanges<T> = {
  /** Replace whole records, so absent optional fields are cleared too. */
  upsert: T[];
  remove: string[];
  /** Sent only when membership or order changes. */
  order?: string[];
};
export type ChatChanges = {
  type: "changes";
  status?: ChatSnapshot["status"];
  worker?: ChatSnapshot["worker"];
} & { [K in ChatCollection]?: CollectionChanges<ChatSnapshot[K][number]> };

/** Each connection starts with full state. Later frames are local to it. */
export type ChatFrame = ChatSnapshot | ChatChanges;

function applyCollection<T extends { id: string }>(
  records: T[],
  changes: CollectionChanges<T>,
): T[] {
  const next = new Map(records.map((record) => [record.id, record]));
  for (const id of changes.remove) next.delete(id);
  for (const record of changes.upsert) next.set(record.id, record);
  return changes.order
    ? changes.order.map((id) => next.get(id)!)
    : [...next.values()];
}

/** Preserve unchanged objects and arrays, including disclosure identities. */
export function applyChatFrame(
  previous: ChatSnapshot | null,
  frame: ChatFrame,
): ChatSnapshot {
  if (!("type" in frame)) return frame;
  if (!previous)
    throw new Error("Conversation changes arrived before its initial state.");
  return {
    status: frame.status ?? previous.status,
    worker: frame.worker ?? previous.worker,
    messages: frame.messages
      ? applyCollection(previous.messages, frame.messages)
      : previous.messages,
    executions: frame.executions
      ? applyCollection(previous.executions, frame.executions)
      : previous.executions,
    piActivity: frame.piActivity
      ? applyCollection(previous.piActivity, frame.piActivity)
      : previous.piActivity,
    information: frame.information
      ? applyCollection(previous.information, frame.information)
      : previous.information,
  };
}
