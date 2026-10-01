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

/** Whether two values read off the wire say the same thing. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        key in b &&
        same(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
    )
  );
}

/**
 * Full state repeats what a reader already holds: the stream's first frame
 * after the page, a reconnect, an action's own response. A record that says
 * what it said before stays the object it was, so a long conversation is not
 * drawn a second time to show that nothing in it changed.
 */
export function keepUnchanged<
  T extends { [K in ChatCollection]?: { id: string }[] },
>(
  held: { [K in ChatCollection]?: { id: string }[] } | null | undefined,
  next: T,
) {
  if (!held) return next;
  const kept: T = { ...next };
  for (const key of chatCollections) {
    const before = held[key];
    const after = next[key];
    if (!before || !after) continue;
    const known = new Map(before.map((record) => [record.id, record]));
    const records = after.map((record) => {
      const old = known.get(record.id);
      return old && same(old, record) ? old : record;
    });
    Object.assign(kept, {
      [key]:
        records.length === before.length &&
        records.every((record, index) => record === before[index])
          ? before
          : records,
    });
  }
  return kept;
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
