// Shared host for the restart probes. No real model: pi-ai's faux provider with
// a stateless script.
import { spawn } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@earendil-works/chord/context";
import { Type } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

export const context = BACKGROUND_CONTEXT;
export const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA = join(HERE, "data-restart");
export const MODEL = { provider: "faux", modelId: "faux-1" };
export const LONG_ANSWER = Array.from(
  { length: 60 },
  (_, i) => `sentence-${i} of the long answer.`,
).join(" ");

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const freshDir = (name) => {
  const dir = join(DATA, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};
const readLines = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];

const textOf = (content) =>
  typeof content === "string"
    ? content
    : content
        .map((block) =>
          block.type === "text"
            ? block.text
            : block.type === "toolCall"
              ? `<toolCall ${block.name}>`
              : `<${block.type}>`,
        )
        .join("");

/** One-line rendering of a model message: role, flags, text. */
export const brief = (message) => {
  const flags = [
    message.stopReason === undefined ? "" : ` stop=${message.stopReason}`,
    message.isError === undefined ? "" : ` isError=${message.isError}`,
  ].join("");
  return `${message.role}${flags}: ${JSON.stringify(textOf(message.content ?? "")).slice(0, 220)}`;
};

/**
 * A host: models (faux), registry (two slow tools), and logs in `dir`.
 * - effects.log: one line per real tool execution (the side effect a
 *   non-replay-safe tool must not repeat).
 * - model.log: one line per request that reached the "model", with the
 *   messages it received.
 * `holdMs`: how long a tool stays mid-call. `tokensPerSecond`: slows the faux
 * stream so it can be killed mid-answer.
 */
export function makeHost(
  dir,
  { holdMs = 0, tokensPerSecond, extensions = [] } = {},
) {
  const effects = join(dir, "effects.log");
  const modelLog = join(dir, "model.log");
  const faux = fauxProvider(
    tokensPerSecond === undefined ? {} : { tokensPerSecond },
  );
  const models = createModels();
  models.setProvider(faux.provider);
  // Stateless script, so a restarted process answers the same way: decided from
  // the last message.
  const script = (request) => {
    const messages = request.messages;
    // Positional pi.system entries (prompt, tool loadout) can follow the user
    // message; skip them.
    const last = messages.filter((message) => message.role !== "system").at(-1);
    appendFileSync(
      modelLog,
      `${JSON.stringify({ pid: process.pid, received: messages.filter((m) => m.role !== "system").map(brief) })}\n`,
    );
    if (last?.role === "user") {
      const text = textOf(last.content);
      if (text.startsWith("tool:"))
        return fauxAssistantMessage(
          fauxToolCall(text.slice(5), { label: text }),
          { stopReason: "toolUse" },
        );
      if (text === "long") return fauxAssistantMessage(LONG_ANSWER);
      return fauxAssistantMessage(`ok: ${text}`);
    }
    if (last?.role === "toolResult")
      return fauxAssistantMessage(
        `model saw tool result (isError=${last.isError})`,
      );
    return fauxAssistantMessage("ok");
  };
  faux.setResponses(Array.from({ length: 200 }, () => script));

  const started = new Set();
  const slow = (name, replay) =>
    defineTool({
      name,
      description: `${name}: appends to effects.log, then holds`,
      parameters: Type.Object({ label: Type.String() }),
      ...(replay === undefined ? {} : { replay }),
      execute: async (args, api, toolContext) => {
        appendFileSync(
          effects,
          `${JSON.stringify({ tool: name, pid: process.pid, conversation: api.conversationId })}\n`,
        );
        api.output(`${name} started in pid ${process.pid}\n`);
        started.add(api.conversationId);
        if (holdMs > 0) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, holdMs);
            toolContext.abortSignal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(toolContext.abortSignal.reason);
            });
          });
        }
        return {
          content: [
            { type: "text", text: `${name} finished in pid ${process.pid}` },
          ],
        };
      },
    });
  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "slow",
      tools: [slow("slow_unsafe"), slow("slow_safe", "safe")],
    }),
  );
  for (const extension of extensions) registry.install(extension);
  const reports = [];
  const open = async (file) =>
    Harness.open(
      await openNodeSqliteStorage(file),
      {
        models,
        registry,
        onReport: (error) => reports.push(String(error?.message ?? error)),
      },
      context,
    );
  return {
    open,
    faux,
    models,
    registry,
    reports,
    started,
    effects: () => readLines(effects),
    modelCalls: () => readLines(modelLog),
  };
}

/**
 * Context that cancels after `ms`; cancelling a wait never cancels the work.
 */
export const timeout = (ms) =>
  withAbortSignal(AbortSignal.timeout(ms), context);

/** Newest-last transcript of a conversation as short lines. */
export async function transcript(conversation) {
  const page = await conversation.entries({}, 100, undefined, context);
  return [...page.items].reverse().map((entry) => {
    const message = entry.model?.[0];
    return `#${entry.id} ${entry.kind}${message === undefined || message.role === "system" ? "" : ` ${brief(message)}`}`;
  });
}

/** What a reader sees of one conversation, without asking for progress. */
export async function look(harness, conversation) {
  const view = await conversation.viewState(context);
  const live = view.value.docs["pi.live"];
  const inbox = view.value.docs["pi.inbox"];
  const entries = view.value.entries.length;
  view.dispose();
  const inspection = await harness.inspect(context);
  const tasks = inspection.tasks
    .filter((task) => task.record.conversationId === conversation.id)
    .map(
      (task) =>
        `${task.record.kind}#${task.record.id} stored=${task.record.state.status} phase=${task.record.state.checkpoint?.phase} scheduler=${task.state.kind}${task.record.abortRequested ? " abortRequested" : ""}`,
    );
  const submissions = inspection.submissions
    .filter((submission) => submission.conversationId === conversation.id)
    .map(
      (submission) =>
        `submission#${submission.id} ${submission.type} ${submission.status}`,
    );
  return {
    scheduling: inspection.scheduling,
    entries,
    live,
    inbox,
    tasks,
    submissions,
  };
}

/**
 * Run the crasher child on `file` with `spec`
 * ("A=tool:slow_unsafe,B=idle,S=long"), wait until every conversation is in
 * its mid-state, then SIGKILL it. Returns what the child printed just before:
 * ids and its own live view.
 */
export async function crash(dir, file, spec) {
  const child = spawn(
    process.execPath,
    [join(HERE, "probe-restart-crash.mjs"), dir, file, spec],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  let out = "";
  const ready = await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const line = out.split("\n").find((each) => each.startsWith("READY "));
      if (line !== undefined) resolve(JSON.parse(line.slice(6)));
    });
    child.on("exit", (code, signal) =>
      reject(
        new Error(`crasher exited early code=${code} signal=${signal}\n${out}`),
      ),
    );
    setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`crasher never reached its mid-state\n${out}`));
    }, 30_000).unref();
  });
  child.removeAllListeners("exit");
  const exited = new Promise((resolve) =>
    child.on("exit", (code, signal) => resolve({ code, signal })),
  );
  child.kill("SIGKILL");
  const exit = await exited;
  return { ...ready, exit };
}

/** Copy a SQLite file with its WAL, as left behind by the killed process. */
export function copyDb(from, to) {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(from + suffix)) copyFileSync(from + suffix, to + suffix);
  }
}
