import { databasePath } from "./database-path";
import { chatSnapshot } from "./pi-conversation";
import type { ChatSnapshot } from "./types";

// Readers of the same chat can share a refresh that is still being read.
// Nothing survives settlement: the next read always asks the worker again.
const pending = new Map<string, Promise<ChatSnapshot>>();
const keyOf = (applicationId: string, chatId: string) =>
  JSON.stringify([databasePath(), applicationId, chatId]);

/** A notice makes a pre-notice read ineligible for subsequent readers. */
export function invalidateSnapshotRead(applicationId: string, chatId: string) {
  pending.delete(keyOf(applicationId, chatId));
}

/** Share SSE refreshes; initial/reconnect and write responses read afresh. */
export async function refreshSnapshot(applicationId: string, chatId: string) {
  const key = keyOf(applicationId, chatId);
  let read = pending.get(key);
  if (!read) {
    read = chatSnapshot(applicationId, chatId);
    pending.set(key, read);
  }
  try {
    // Stream encoding only reads this value. Each reader keeps its own frames.
    return await read;
  } finally {
    if (pending.get(key) === read) pending.delete(key);
  }
}
