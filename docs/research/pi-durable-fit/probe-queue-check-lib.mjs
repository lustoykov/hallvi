// Shared helpers for the skeptic's probe-queue-check-*.mjs scripts. Only
// pi-ai's faux provider is ever used.
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export * from "./probe-queue-lib.mjs";
import { InboxDoc, context } from "./probe-queue-lib.mjs";

export const CHECK_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "data-queue-check",
);

/** A fresh, empty path under data-queue-check/. */
export async function checkPath(name) {
  await mkdir(CHECK_DIR, { recursive: true });
  const path = join(CHECK_DIR, name);
  for (const suffix of ["", "-wal", "-shm"])
    await rm(path + suffix, { recursive: true, force: true });
  return path;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What pi-durable itself still holds for a request id, read in ONE commit (so
 * it is consistent):
 *   { state: "unknown" }
 *     never admitted
 *   { state, where: "entry", content }
 *     placed/done/unanswered-with-entry: the pi.user entry
 *   { state, where: "inbox", content, mode }
 *     queued: the pi.inbox item
 *   { state, where: "nowhere" }
 *     withdrawn: pi-durable no longer has the content
 */
export function heldFor(conversation, requestId) {
  return conversation.commit(async (tx) => {
    const record = await tx.submissionByRequest(conversation.id, requestId);
    if (record === undefined) return { state: "unknown" };
    const state = record.status + (record.reason ? `/${record.reason}` : "");
    if (record.entry !== undefined) {
      const entry = await tx.entry(record.entry);
      return {
        state,
        where: "entry",
        kind: entry?.kind,
        content: entry?.model?.[0]?.content,
      };
    }
    const item = (await tx.doc(InboxDoc, conversation.id)).items.find(
      (candidate) => candidate.id === record.id,
    );
    // tx.doc() hands out a tracked proxy that throws "Cannot use a settled
    // overlay" once the commit ends, so a non-primitive (image content parts)
    // must be copied out INSIDE the commit. Set RAW_PROXY=1 to see the throw.
    const copy = (value) =>
      process.env.RAW_PROXY ? value : JSON.parse(JSON.stringify(value));
    if (item !== undefined)
      return {
        state,
        where: "inbox",
        mode: item.mode,
        content: copy(item.content ?? item.entry),
      };
    return { state, where: "nowhere" };
  }, context);
}
