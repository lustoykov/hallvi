import { createHash } from "node:crypto";
import {
  chatCollections,
  type ChatFrame,
  type ChatInitial,
  type ChatCollection,
} from "@/lib/chat-stream";
import type { ChatSnapshot } from "./types";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Current fingerprints only, discarded with the stream. No frame history. */
export class ChatStreamBaselines {
  private records = new Map<ChatCollection, Map<string, string>>();
  private collections = new Map<ChatCollection, string>();

  constructor(
    private applicationId: string,
    private chatId: string,
  ) {}

  clear() {
    this.records.clear();
    this.collections.clear();
  }

  next(snapshot: ChatSnapshot, frame: ChatFrame) {
    for (const key of chatCollections) {
      let records = this.records.get(key);
      if (!records || !("type" in frame) || frame.type === "initial") {
        records = new Map(
          snapshot[key].map((record) => [record.id, hash(record)]),
        );
        this.records.set(key, records);
      } else {
        const changes = frame[key];
        if (!changes) continue;
        for (const id of changes.remove) records.delete(id);
        for (const record of changes.upsert)
          records.set(record.id, hash(record));
      }
      // Hash record contents once, then only upserts. Order and membership
      // still contribute, without serializing megabytes of unchanged output.
      this.collections.set(
        key,
        hash([
          2,
          this.applicationId,
          this.chatId,
          key,
          snapshot[key].map((record) => records.get(record.id)),
        ]),
      );
    }
    return [
      "2",
      ...chatCollections.map((key) => this.collections.get(key)),
    ].join(".");
  }
}

/** Describe precisely the collections included in the page or action view. */
export function chatStreamBaseline(
  applicationId: string,
  chatId: string,
  snapshot: ChatSnapshot,
) {
  return new ChatStreamBaselines(applicationId, chatId).next(
    snapshot,
    snapshot,
  );
}

/** Acknowledge unchanged collections; replace changed ones completely. */
export function initialChatFrame(
  applicationId: string,
  chatId: string,
  snapshot: ChatSnapshot,
  baseline: string | null,
  current?: string,
): ChatFrame {
  if (!baseline || !/^2(?:\.[a-f0-9]{64}){4}$/.test(baseline)) return snapshot;
  const known = baseline.split(".").slice(1);
  const latest = (
    current ?? chatStreamBaseline(applicationId, chatId, snapshot)
  )
    .split(".")
    .slice(1);
  const frame: ChatInitial = {
    type: "initial",
    status: snapshot.status,
    worker: snapshot.worker,
  };
  chatCollections.forEach((key, index) => {
    if (latest[index] !== known[index])
      Object.assign(frame, { [key]: snapshot[key] });
  });
  return frame;
}
