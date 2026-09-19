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
import { nativeEntryIds } from "../../../src/server/pi-sessions";
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
      input: 10,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 11,
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
        contextWindow: 8_192,
        maxTokens: 2_048,
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
async function until(check: () => unknown, options = {}) {
  for (let tick = 0; tick < 400; tick++) {
    route(live, { signal: shutdown.signal, drainTimeoutMs: 300, ...options });
    try {
      return check();
    } catch (error) {
      if (tick === 399) throw error;
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
  // Each delivered message carries the id Pi's own history keeps it under.
  const asked = chatSnapshot(a.id, a.chat).messages[0];
  expect(nativeEntryIds(a.id, a.chat)).toContain(
    store.getMessage(asked.id)?.nativeEntryId,
  );
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

it("a worker shutting down leaves its conversations interrupted, not finished", async () => {
  const a = application("shop");
  a.send("[approve] restart it");
  a.send("then publish it");
  await until(() => expect(status(a.chat)).toBe("awaiting-approval"));
  await until(() => expect(live.get(a.chat)!.given.size).toBe(2));
  shutdown.abort();
  await Promise.all([...live.values()].map((c) => c.stop().then(() => c.done)));
  expect(status(a.chat)).toBe("interrupted");
  expect(a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    expect.stringMatching(/^pi \[interrupted\] The worker stopped/),
    // Pi never read it. It still waits for the next worker.
    "you [waiting] then publish it",
  ]);
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
