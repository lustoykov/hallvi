import { createHash } from "node:crypto";
import {
  chatCollections,
  type ChatFrame,
  type ChatInitial,
  type ChatCollection,
} from "@/lib/chat-stream";
import type { ChatSnapshot } from "./types";

// A fingerprint is scoped to this application, conversation and wire version.
// No page snapshot is retained: connecting still reads the worker afresh.
function fingerprint(
  applicationId: string,
  chatId: string,
  collection: ChatCollection,
  snapshot: ChatSnapshot,
) {
  return createHash("sha256")
    .update(JSON.stringify([1, applicationId, chatId, collection]))
    .update("\0")
    .update(JSON.stringify(snapshot[collection]))
    .digest("hex");
}

/** Describe precisely the collections included in the page or action view. */
export function chatStreamBaseline(
  applicationId: string,
  chatId: string,
  snapshot: ChatSnapshot,
) {
  return [
    "1",
    ...chatCollections.map((key) =>
      fingerprint(applicationId, chatId, key, snapshot),
    ),
  ].join(".");
}

/** Acknowledge unchanged collections; replace changed ones completely. */
export function initialChatFrame(
  applicationId: string,
  chatId: string,
  snapshot: ChatSnapshot,
  baseline: string | null,
): ChatFrame {
  if (!baseline || !/^1(?:\.[a-f0-9]{64}){4}$/.test(baseline)) return snapshot;
  const known = baseline.split(".").slice(1);
  const frame: ChatInitial = {
    type: "initial",
    status: snapshot.status,
    worker: snapshot.worker,
  };
  chatCollections.forEach((key, index) => {
    if (fingerprint(applicationId, chatId, key, snapshot) !== known[index])
      Object.assign(frame, { [key]: snapshot[key] });
  });
  return frame;
}
