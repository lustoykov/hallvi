import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

// The worker against the installed SDK and a real database. Only the model is
// scripted, and the repository workspace, which needs Docker, is left out.
const synthetic = vi.hoisted(() => ({
  runtime: undefined as unknown,
  model: undefined as unknown,
}));
vi.mock("../../../src/server/pi-configuration", async (original) => ({
  ...(await original<object>()),
  configuredPiRuntime: async () => ({
    configuration: { reasoningEffort: "off" },
    modelRuntime: synthetic.runtime,
    model: synthetic.model,
  }),
}));
vi.mock("../../../src/server/pi-workspace", async (original) => ({
  ...(await original<object>()),
  PiWorkspace: class {
    async dispose() {}
  },
}));

import * as store from "../../../src/server/db";
import {
  chatSnapshot,
  sendChatMessage,
  stopConversation,
} from "../../../src/server/pi-conversation";
import {
  decideExecution,
  listExecutions,
  saveOperatorSettings,
} from "../../../src/server/operator-execution";
import { listActivity } from "../../../src/server/pi-activity";
import { openNativeChatSession } from "../../../src/server/pi-sessions";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/pi-agent-core";
import {
  converse,
  PiWorkerDrainError,
  route,
} from "../../../src/server/pi-worker";
import { pushTestDatabase } from "../../test-database";

let root: string;
/** What each model request ended with, in order: the scripted model's view. */
let requests: string[];
let live: Map<string, ReturnType<typeof converse>>;
let shutdown: AbortController;
/** What the scripted model says its context holds, to bring on compaction. */
let contextUsed = 10;

function assistant(
  model: Model<Api>,
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    content,
    stopReason,
    errorMessage,
    timestamp: Date.now(),
    usage: {
      input: contextUsed,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: contextUsed + 1,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}
const said = (content: unknown) =>
  typeof content === "string"
    ? content
    : (content as Array<{ type: string; text?: string }>)
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "hv-worker-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  vi.stubEnv("HALLVI_PI_CONFIG_DIR", join(root, "pi"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    modelsStorePath: join(root, "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  let calls = 0;
  const flaked = new Set<string>();
  runtime.registerProvider("hallvi-worker-test", {
    api: "hallvi-worker-test",
    apiKey: "SYNTHETIC-NO-NETWORK",
    baseUrl: "https://invalid.test",
    streamSimple: (model, context: Context, options?: SimpleStreamOptions) => {
      const stream = createAssistantMessageEventStream();
      const last = context.messages.at(-1)!;
      const text = last.role === "user" ? said(last.content) : "";
      requests.push(last.role === "user" ? text : `<${last.role}>`);
      // A provider mid-answer when Stop arrives, as a real one is.
      if (text.includes("[slow]") || text.includes("[stuck]")) {
        const partial = assistant(model, [{ type: "text", text: "" }], "stop");
        stream.push({ type: "start", partial });
        stream.push({ type: "text_start", contentIndex: 0, partial });
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: "Looking at the server",
          partial,
        });
        if (text.includes("[slow]"))
          options?.signal?.addEventListener("abort", () =>
            stream.push({
              type: "error",
              reason: "aborted",
              error: assistant(model, [], "aborted"),
            }),
          );
        return stream;
      }
      // Pi retries what a provider says is temporary, by itself.
      if (text.includes("[flaky]") && !flaked.has(text)) {
        flaked.add(text);
        const failed = assistant(model, [], "error", "overloaded_error");
        stream.push({ type: "start", partial: failed });
        stream.push({ type: "error", reason: "error", error: failed });
        return stream;
      }
      const message = text.includes("[fail]")
        ? assistant(model, [], "error", "invalid_grant: 401 unauthorized")
        : text.includes("[approve]")
          ? assistant(
              model,
              [
                {
                  type: "toolCall",
                  id: `call-${++calls}`,
                  name: "request_approval",
                  arguments: { action: "Restart the service" },
                },
              ],
              "toolUse",
            )
          : assistant(
              model,
              [
                {
                  type: "text",
                  text: last.role === "user" ? `reply: ${text}` : "finished",
                },
              ],
              "stop",
            );
      stream.push({ type: "start", partial: message });
      stream.push(
        message.stopReason === "error"
          ? { type: "error", reason: "error", error: message }
          : {
              type: "done",
              reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
              message,
            },
      );
      return stream;
    },
    models: [
      {
        id: "synthetic",
        name: "Synthetic",
        reasoning: false,
        input: ["text"],
        // Room for Hallvi's real system prompt, as a real model has.
        contextWindow: 272_000,
        maxTokens: 32_000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
  synthetic.runtime = runtime;
  synthetic.model = runtime.getModel("hallvi-worker-test", "synthetic");
});
beforeEach(() => {
  store.db().$client.exec("DELETE FROM applications");
  requests = [];
  contextUsed = 10;
  live = new Map();
  shutdown = new AbortController();
});
afterEach(async () => {
  shutdown.abort();
  await Promise.allSettled(
    [...live.values()].map((c) => c.stop().then(() => c.done)),
  );
});
afterAll(() => {
  globalThis.__hallviDb?.$client.close();
  delete globalThis.__hallviDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function application(name: string, address?: string) {
  const app = store.insertApplication({
    name,
    repositoryUrl: `https://github.com/test/${name}`,
    repositoryOwner: "test",
    repositoryName: name,
  });
  const chat = store.insertChat(app.id, "Main operator");
  if (address)
    saveOperatorSettings(app.id, {
      permissionMode: "pi-decides",
      host: {
        address,
        user: "root",
        port: 22,
        privateKeyPath: "/keys/id",
        knownHostsPath: "/keys/known_hosts",
      },
    });
  const send = (body: string, delivery?: "next" | "steer") =>
    sendChatMessage(app.id, chat.id, body, randomUUID(), delivery);
  /** The conversation as its page reads it: who, how it stands, what. */
  const transcript = () =>
    chatSnapshot(app.id, chat.id).messages.map(
      (m) =>
        `${m.role === "user" ? "you" : "pi"} [${m.status}] ${m.body || m.error || ""}`,
    );
  return { id: app.id, chat: chat.id, send, transcript };
}

/** The worker's loop, until the conversation's records say what is expected. */
async function until(
  check: () => unknown,
  { ticks = 400, ...options }: { ticks?: number; drainTimeoutMs?: number } = {},
) {
  for (let tick = 0; tick < ticks; tick++) {
    route(live, { signal: shutdown.signal, drainTimeoutMs: 300, ...options });
    try {
      return check();
    } catch (error) {
      if (tick === ticks - 1) throw error;
    }
    await delay(10);
  }
}
const status = (chatId: string) => store.getChat(chatId)?.status;
const approval = (applicationId: string) =>
  listExecutions(applicationId).find((e) => e.status === "awaiting-approval");

it("answers one application while another waits for its owner's approval", async () => {
  const a = application("shop");
  const b = application("blog");
  a.send("[approve] restart it");
  await until(() => expect(status(a.chat)).toBe("awaiting-approval"));

  b.send("how is it going?");
  await until(() => expect(status(b.chat)).toBe("idle"));
  expect(b.transcript()).toEqual([
    "you [delivered] how is it going?",
    "pi [completed] reply: how is it going?",
  ]);
  expect(status(a.chat)).toBe("awaiting-approval");

  decideExecution(a.id, approval(a.id)!.id, true);
  await until(() => expect(status(a.chat)).toBe("idle"));
  expect(a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    "pi [completed] finished",
  ]);
  // Evidence belongs to the reply it happened under, in its own application.
  const reply = chatSnapshot(a.id, a.chat).messages.at(-1)!;
  expect(listExecutions(a.id)).toMatchObject([
    { runId: reply.id, tool: "request_approval", status: "succeeded" },
  ]);
  expect(reply.blocks).toEqual([
    { type: "execution", id: listExecutions(a.id)[0].id },
  ]);
  expect(new Set(listActivity(a.id).map((r) => r.runId))).toEqual(
    new Set([reply.id]),
  );
  // Pi acknowledged the message and named the entry it keeps it under.
  const asked = store.getMessage(chatSnapshot(a.id, a.chat).messages[0].id)!;
  expect(asked.admittedAt).toBeTruthy();
  expect(asked.nativeEntryId).toBeTruthy();
  expect(listExecutions(b.id)).toEqual([]);
  expect(listActivity(b.id).every((r) => r.kind === "message")).toBe(true);
});

it("delivers a steer at Pi's next step and follow-ups after, as one readable transcript", async () => {
  const a = application("shop");
  a.send("[approve] restart it");
  await until(() => expect(status(a.chat)).toBe("awaiting-approval"));
  a.send("then tidy up");
  a.send("then tidy up");
  a.send("use port 8080", "steer");
  // Held by Pi, read by nobody: an approval wait is inside a tool call.
  await until(() => expect(live.get(a.chat)!.given.size).toBe(4));
  await delay(50);
  expect(a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    "pi [running] ",
    "you [waiting] then tidy up",
    "you [waiting] then tidy up",
    "you [waiting] use port 8080",
  ]);

  decideExecution(a.id, approval(a.id)!.id, true);
  await until(() => expect(status(a.chat)).toBe("idle"));
  expect(a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    // What Pi did before the steer stays under the reply it happened in.
    "pi [completed] ",
    "you [delivered] use port 8080",
    "pi [completed] reply: use port 8080",
    "you [delivered] then tidy up",
    "pi [completed] reply: then tidy up",
    "you [delivered] then tidy up",
    "pi [completed] reply: then tidy up",
  ]);
  // One native run for all of it: the steer replaced the call after the tool.
  expect(requests).toEqual([
    "[approve] restart it",
    "use port 8080",
    "then tidy up",
    "then tidy up",
  ]);
  const first = chatSnapshot(a.id, a.chat).messages[1];
  expect(listExecutions(a.id)[0].runId).toBe(first.id);
});

it("Stop ends the approval wait, never starts what waited, and leaves the conversation usable", async () => {
  const a = application("shop");
  a.send("[approve] restart it");
  await until(() => expect(status(a.chat)).toBe("awaiting-approval"));
  a.send("then publish it");
  a.send("skip the tests", "steer");
  await until(() => expect(live.get(a.chat)!.given.size).toBe(3));

  stopConversation(a.id, a.chat);
  await until(() => expect(live.size).toBe(0));
  expect(a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    "pi [cancelled] Stopped. Commands already started may have changed the server; check execution history.",
    "you [cancelled] then publish it",
    "you [cancelled] skip the tests",
  ]);
  expect(status(a.chat)).toBe("idle");
  expect(listExecutions(a.id)[0].status).toBe("interrupted");
  // The worker keeps looking and finds nothing to deliver.
  await until(() => undefined);
  await delay(50);
  await until(() => expect(live.size).toBe(0));
  expect(requests).toEqual(["[approve] restart it"]);

  // The native history was released: the next message is simply answered.
  a.send("what happened?");
  await until(() => expect(status(a.chat)).toBe("idle"));
  expect(a.transcript().slice(-2)).toEqual([
    "you [delivered] what happened?",
    "pi [completed] reply: what happened?",
  ]);
});

it("does not start a second application on a server where one is already working", async () => {
  const a = application("shop", "203.0.113.9");
  const c = application("wiki", "203.0.113.9");
  const elsewhere = application("blog", "203.0.113.10");
  a.send("[approve] restart it");
  await until(() => expect(status(a.chat)).toBe("awaiting-approval"));
  c.send("upgrade docker");
  elsewhere.send("hello");
  await until(() => expect(status(elsewhere.chat)).toBe("idle"));
  expect(c.transcript()).toEqual(["you [waiting] upgrade docker"]);
  expect(live.has(c.chat)).toBe(false);

  decideExecution(a.id, approval(a.id)!.id, true);
  await until(() => expect(status(c.chat)).toBe("idle"));
  expect(c.transcript()).toEqual([
    "you [delivered] upgrade docker",
    "pi [completed] reply: upgrade docker",
  ]);
});

it("streams a draft, and Stop mid-answer aborts the provider and keeps the draft", async () => {
  const a = application("shop");
  a.send("[slow] check the server");
  await until(() =>
    expect(a.transcript().at(-1)).toBe("pi [running] Looking at the server"),
  );
  stopConversation(a.id, a.chat);
  await until(() => expect(live.size).toBe(0));
  expect(a.transcript().at(-1)).toBe("pi [cancelled] Looking at the server");
  expect(status(a.chat)).toBe("idle");
});

it("records a model failure on the reply without leaking the provider's words", async () => {
  const a = application("shop");
  a.send("[fail] deploy");
  await until(() => expect(status(a.chat)).toBe("idle"));
  expect(a.transcript()).toEqual([
    "you [delivered] [fail] deploy",
    "pi [failed] Hallvi could not finish this attempt. Check Settings or retry. Your message is saved. Check execution history for any effects.",
  ]);
  expect(a.transcript().join()).not.toContain("invalid_grant");
});

/** A worker goes away mid-approval with a follow-up Pi already holds. */
async function workerGoesAway(a: ReturnType<typeof application>) {
  a.send("[approve] restart it");
  await until(() => expect(status(a.chat)).toBe("awaiting-approval"));
  const waiting = a.send("then publish it");
  await until(() =>
    expect(store.getMessage(waiting.id)?.nativeEntryId).toBeTruthy(),
  );
  const heldAs = store.getMessage(waiting.id)!.nativeEntryId;
  shutdown.abort();
  await Promise.all([...live.values()].map((c) => c.stop().then(() => c.done)));
  // A new worker process: nothing in memory, only the records and Pi's files.
  live = new Map();
  shutdown = new AbortController();
  return { waiting, heldAs };
}

it("a worker going away interrupts nothing in Pi, and a worker coming back runs nothing", async () => {
  const a = application("shop");
  const { waiting, heldAs } = await workerGoesAway(a);
  expect(status(a.chat)).toBe("interrupted");
  await until(() => undefined);
  await delay(150);
  await until(() => expect(live.size).toBe(0));
  expect(a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    expect.stringMatching(
      /^pi \[interrupted\] The worker stopped.*not known.*Nothing is run again by itself/,
    ),
    // Pi holds it under the same id, and it has not run.
    "you [waiting] then publish it",
  ]);
  expect(store.getMessage(waiting.id)?.nativeEntryId).toBe(heldAs);
  expect(requests).toEqual(["[approve] restart it"]);

  // The owner continues. Pi resumes what it had open: the interrupted call is
  // not made again, the model is told its outcome is unknown, and then what
  // waited runs, in order, before the message that continued it.
  a.send("carry on");
  await until(() => expect(status(a.chat)).toBe("idle"));
  expect(a.transcript().slice(2)).toEqual([
    "pi [completed] finished",
    "you [delivered] then publish it",
    "pi [completed] reply: then publish it",
    "you [delivered] carry on",
    "pi [completed] reply: carry on",
  ]);
  expect(listExecutions(a.id).map((e) => e.status)).toEqual(["interrupted"]);
  expect(requests).toEqual([
    "[approve] restart it",
    "<toolResult>",
    "then publish it",
    "carry on",
  ]);
});

it("Stop after a worker went away ends what Pi held instead of resuming it", async () => {
  const a = application("shop");
  await workerGoesAway(a);
  stopConversation(a.id, a.chat);
  expect(a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    "pi [cancelled] Stopped. Commands already started may have changed the server; check execution history.",
    "you [cancelled] then publish it",
  ]);
  // The next message is answered by itself: nothing resumes, nothing queued
  // comes back with it.
  a.send("what happened?");
  await until(() => expect(status(a.chat)).toBe("idle"));
  expect(a.transcript().slice(-2)).toEqual([
    "you [delivered] what happened?",
    "pi [completed] reply: what happened?",
  ]);
  expect(requests).toEqual(["[approve] restart it", "what happened?"]);
});

it("hands over once a message Pi took in the instant before Hallvi recorded it", async () => {
  const a = application("shop");
  const sent = a.send("deploy it");
  // Pi took it and the worker died before acknowledging: the record still
  // says Hallvi holds it.
  const lost = converse(
    { applicationId: a.id, chatId: a.chat },
    { id: sent.id, body: sent.body, delivery: "next" },
    { signal: shutdown.signal },
  );
  await lost.done;
  store
    .db()
    .$client.prepare(
      "UPDATE messages SET admitted_at = NULL, native_entry_id = NULL, status = 'waiting' WHERE id = ?",
    )
    .run(sent.id);
  store
    .db()
    .$client.prepare("DELETE FROM messages WHERE response_to = ?")
    .run(sent.id);
  requests.length = 0;
  await until(() => expect(store.getMessage(sent.id)?.admittedAt).toBeTruthy());
  await until(() => expect(live.size).toBe(0));
  // Pi had already read it, so it is acknowledged and not put to Pi again.
  expect(requests).toEqual([]);
  expect(store.getMessage(sent.id)?.status).toBe("delivered");
});

it("leaves retrying and compaction to Pi, and reports the conversation truthfully through both", async () => {
  const a = application("shop");
  a.send("[flaky] status?");
  await until(() => expect(status(a.chat)).toBe("idle"), { ticks: 1_500 });
  expect(a.transcript()).toEqual([
    "you [delivered] [flaky] status?",
    "pi [completed] reply: [flaky] status?",
  ]);
  // The model now reports a nearly full context. Pi compacts before the next
  // answer, through the same runtime, and the conversation simply continues.
  contextUsed = 265_000;
  a.send("and the logs?");
  await until(() => expect(status(a.chat)).toBe("idle"));
  contextUsed = 10;
  a.send("thanks");
  await until(() => expect(status(a.chat)).toBe("idle"));
  expect(a.transcript().slice(-2)).toEqual([
    "you [delivered] thanks",
    "pi [completed] reply: thanks",
  ]);
  const history = await openNativeChatSession(a.id, a.chat);
  const kinds = (await history.session.findEntries(undefined, ctx)).map(
    (entry) => entry.type,
  );
  await history.release();
  expect(kinds).toContain("compaction");
});

it("a session that will not stop poisons the worker instead of being overlapped", async () => {
  const a = application("shop");
  a.send("[stuck] check the server");
  await until(() =>
    expect(a.transcript().at(-1)).toBe("pi [running] Looking at the server"),
  );
  const conversation = live.get(a.chat)!;
  stopConversation(a.id, a.chat);
  route(live, { signal: shutdown.signal, drainTimeoutMs: 50 });
  await expect(conversation.done).rejects.toBeInstanceOf(PiWorkerDrainError);
  live.clear();
});
