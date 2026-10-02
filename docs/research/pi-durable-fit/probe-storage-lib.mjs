// Shared helpers for probe-storage-*.mjs. No real model is ever called: only
// pi-ai's faux provider.
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Type } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
} from "@earendil-works/pi-durable";

export const context = BACKGROUND_CONTEXT;
export const MODEL = { provider: "faux", modelId: "faux-1" };
export const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA = join(HERE, "data-storage");

export { fauxAssistantMessage, fauxText, fauxToolCall, Harness };

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const mode = (m) => `0${(m & 0o777).toString(8)}`;

/**
 * A fresh, empty path under data-storage/ (file or directory, plus sqlite
 * sidecars).
 */
export async function fresh(name) {
  await mkdir(DATA, { recursive: true });
  const path = join(DATA, name);
  for (const suffix of ["", "-wal", "-shm", "-journal"])
    await rm(path + suffix, { recursive: true, force: true });
  return path;
}

/**
 * `name mode size` of a sqlite file and its sidecars, or of every file in a
 * directory.
 */
export async function listing(path) {
  const rows = [];
  const one = async (p, label) => {
    try {
      const s = await stat(p);
      rows.push({
        name: label,
        mode: mode(s.mode),
        bytes: s.size,
        dir: s.isDirectory(),
      });
      return s;
    } catch {
      return undefined;
    }
  };
  const s = await one(path, path.split("/").pop());
  if (s?.isDirectory()) {
    for (const name of (await readdir(path)).sort())
      await one(join(path, name), `  ${name}`);
  } else {
    for (const suffix of ["-wal", "-shm", "-journal"])
      await one(path + suffix, (path + suffix).split("/").pop());
  }
  return rows;
}

export function printListing(label, rows) {
  console.log(`${label}:`);
  if (rows.length === 0) console.log("  (nothing on disk)");
  for (const r of rows)
    console.log(
      `  ${r.name.padEnd(28)} mode=${r.mode} bytes=${r.bytes}${r.dir ? " (dir)" : ""}`,
    );
}

export const totalBytes = (rows) =>
  rows.filter((r) => !r.dir).reduce((sum, r) => sum + r.bytes, 0);

/** A tool that streams `lines` lines of output, optionally slowly. */
export const noisyTool = defineTool({
  name: "noisy",
  description: "Print n lines of output",
  parameters: Type.Object({
    lines: Type.Number(),
    delayMs: Type.Optional(Type.Number()),
  }),
  execute: async (args, api) => {
    for (let i = 1; i <= args.lines; i++) {
      api.output(`line ${String(i).padStart(4, "0")} ${"x".repeat(60)}\n`);
      if (args.delayMs) await sleep(args.delayMs);
    }
    return {};
  },
});

/**
 * Open a Harness over `storage` with a faux model. `fauxOptions` e.g. {
 * tokensPerSecond: 200 }.
 */
export async function open(
  storage,
  { responses = [], fauxOptions, tools = [noisyTool], settings } = {},
) {
  const faux = fauxProvider(fauxOptions);
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  registry.install(defineExtension({ name: "probe", tools }));
  const reports = [];
  const harness = await Harness.open(
    storage,
    { models, registry, settings, onReport: (error) => reports.push(error) },
    context,
  );
  return { harness, faux, registry, reports };
}

export const say = (text) => fauxAssistantMessage([fauxText(text)]);
export const call = (name, args, id) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });

/** Oldest-first `id kind` rows of a conversation. */
export async function kinds(conversation, limit = 500) {
  const page = await conversation.entries({}, limit, undefined, context);
  return [...page.items].reverse().map((entry) => `${entry.id}:${entry.kind}`);
}

export async function texts(conversation, limit = 500) {
  const page = await conversation.entries({}, limit, undefined, context);
  return [...page.items].reverse().map((entry) => {
    const message = entry.model?.[0];
    const text =
      message === undefined
        ? ""
        : typeof message.content === "string"
          ? message.content
          : (message.content ?? [])
              .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
              .join("|");
    return `${entry.id}:${entry.kind}:${text.length > 40 ? `${text.slice(0, 40)}…` : text}`;
  });
}

export const errText = (error) =>
  error instanceof Error
    ? `${error.name}: ${error.message}${error.code ? ` [code=${error.code}]` : ""}`
    : String(error);
