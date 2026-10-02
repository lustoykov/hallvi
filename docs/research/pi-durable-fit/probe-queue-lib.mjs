// Shared helpers for the probe-queue-*.mjs scripts. No real model is ever
// called: only pi-ai's faux provider.
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import {
  createRegistry,
  Harness,
  InboxDoc,
  LiveDoc,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

export const context = BACKGROUND_CONTEXT;
export const FAUX_MODEL = { provider: "faux", modelId: "faux-1" };
export const DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "data-queue",
);

export {
  fauxAssistantMessage,
  Harness,
  InboxDoc,
  LiveDoc,
  MemoryStorage,
  createRegistry,
  openNodeSqliteStorage,
};

/** A fresh, empty path under data-queue/. */
export async function freshPath(name) {
  await mkdir(DATA_DIR, { recursive: true });
  const path = join(DATA_DIR, name);
  for (const suffix of ["", "-wal", "-shm"])
    await rm(path + suffix, { recursive: true, force: true });
  return path;
}

/** A gate: a faux response step that waits until `release()`. */
export function gate(text) {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const seen = [];
  // Like a real provider, the held request ends when its abort signal fires
  // (close() and abort() both signal it); the faux stream then reports an
  // aborted message.
  const step = async (transcript, options) => {
    seen.push(lastUserTexts(transcript));
    const signal = options?.signal;
    const aborted = new Promise((resolve) => {
      if (signal?.aborted) resolve();
      else signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    await Promise.race([held, aborted]);
    return fauxAssistantMessage(text);
  };
  return { step, release, seen };
}

/** A faux step that records what the model was shown and answers at once. */
export function recording(text, seen) {
  return (transcript) => {
    seen.push(lastUserTexts(transcript));
    return fauxAssistantMessage(text);
  };
}

function lastUserTexts(transcript) {
  return (transcript.messages ?? [])
    .filter((m) => m.role === "user")
    .map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    );
}

/** Open a harness over `storage` with a scripted faux provider. */
export async function open(storage, responses, settings, extra = {}) {
  const faux = fauxProvider();
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = extra.registry ?? createRegistry();
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      ...(settings === undefined ? {} : { settings }),
      ...(extra.options ?? {}),
    },
    context,
  );
  return { harness, faux, registry };
}

/** Oldest-first transcript rows of a conversation: `id kind text`. */
export async function transcript(conversation) {
  const page = await conversation.entries({}, 200, undefined, context);
  return [...page.items].reverse().map((entry) => {
    const message = entry.model?.[0];
    let text = "";
    if (message !== undefined) {
      text =
        typeof message.content === "string"
          ? message.content
          : (message.content ?? [])
              .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
              .join(" | ");
    }
    return `${entry.id} ${entry.kind}${message ? ` <${message.role}>` : ""} ${JSON.stringify(text)}${entry.data === undefined ? "" : ` data=${JSON.stringify(entry.data)}`}`;
  });
}

export function show(label, value) {
  console.log(
    `${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
  );
}

/**
 * Wait until `predicate()` is true (polling; only used to wait for the faux
 * model to be called).
 */
export async function until(predicate, label = "condition", timeoutMs = 5000) {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
