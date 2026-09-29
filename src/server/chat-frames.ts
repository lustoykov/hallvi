import { isDeepStrictEqual } from "node:util";
import {
  chatCollections,
  type ChatFrame,
  type ChatChanges,
  type CollectionChanges,
} from "@/lib/chat-stream";
import type { ChatSnapshot } from "./types";

function changes<T extends { id: string }>(
  before: T[],
  after: T[],
): CollectionChanges<T> | undefined {
  const old = new Map(before.map((record) => [record.id, record]));
  const upsert: T[] = [];
  for (const record of after) {
    // Primitive strings compare without JSON encoding unchanged output. The
    // nested blocks/presentation use the same structural comparison.
    if (!isDeepStrictEqual(old.get(record.id), record)) upsert.push(record);
    old.delete(record.id);
  }
  const sameOrder =
    before.length === after.length &&
    before.every((record, index) => record.id === after[index].id);
  return upsert.length || old.size || !sameOrder
    ? {
        upsert,
        remove: [...old.keys()],
        ...(sameOrder ? {} : { order: after.map((record) => record.id) }),
      }
    : undefined;
}

/** One disposable baseline per SSE connection, never a history of frames. */
export class ChatFrames {
  private previous?: ChatSnapshot;

  clear() {
    this.previous = undefined;
  }

  next(snapshot: ChatSnapshot): ChatFrame | undefined {
    const before = this.previous;
    this.previous = snapshot;
    if (!before) return snapshot;
    const frame: ChatChanges = { type: "changes" };
    if (before.status !== snapshot.status) frame.status = snapshot.status;
    if (!isDeepStrictEqual(before.worker, snapshot.worker))
      frame.worker = snapshot.worker;
    for (const key of chatCollections) {
      // Each collection has its own record type, but the diff only reads id.
      const difference = changes<{ id: string }>(before[key], snapshot[key]);
      if (difference) Object.assign(frame, { [key]: difference });
    }
    return Object.keys(frame).length > 1 ? frame : undefined;
  }
}
