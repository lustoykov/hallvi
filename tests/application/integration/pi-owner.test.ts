import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/pi-agent-core";
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
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

// The app and the worker as they run: the installed SDK, a real database, the
// real socket between them. Only the model is scripted, and the repository
// workspace, which needs Docker, is left out.
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
    async unavailable() {
      return "The repository workspace is not part of this test.";
    }
    prompt(reason: string) {
      return reason;
    }
    async dispose() {}
  },
}));

import * as store from "../../../src/server/db";
import {
  chatSnapshot,
  continueConversation,
  sendChatMessage,
  stopConversation,
} from "../../../src/server/pi-conversation";
import {
  decideExecution,
  listExecutions,
  saveOperatorSettings,
} from "../../../src/server/operator-execution";
import { openPiSession } from "../../../src/server/pi";
import { ownSessions } from "../../../src/server/pi-owner";
import { MESSAGE_TAG } from "../../../src/server/pi-transcript";
import {
  askWorker,
  WorkerRefusal,
  WorkerUnavailableError,
} from "../../../src/server/worker-link";
import { workerSocketPath } from "../../../scripts/worker-socket.mjs";
import { pushTestDatabase } from "../../test-database";

let root: string;
/** What each model request ended with, in order: the scripted model's view. */
let requests: string[];
let contextUsed = 10;
let worker: NonNullable<Awaited<ReturnType<typeof ownSessions>>> | null;

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
  root = mkdtempSync(join(tmpdir(), "hv-owner-"));
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
  runtime.registerProvider("hallvi-owner-test", {
    api: "hallvi-owner-test",
    apiKey: "SYNTHETIC-NO-NETWORK",
    baseUrl: "https://invalid.test",
    streamSimple: (model, context: Context, options?: SimpleStreamOptions) => {
      const stream = createAssistantMessageEventStream();
      const last = context.messages.at(-1)!;
      const text = last.role === "user" ? said(last.content) : "";
      requests.push(last.role === "user" ? text : `<${last.role}>`);
      // A provider mid-answer when Stop arrives, as a real one is.
      if (text.includes("[slow]")) {
        const partial = assistant(model, [{ type: "text", text: "" }], "stop");
        stream.push({ type: "start", partial });
        stream.push({ type: "text_start", contentIndex: 0, partial });
        // As a real provider does: the partial message carries the text so far.
        (partial.content[0] as { text: string }).text = "Looking at the server";
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: "Looking at the server",
          partial,
        });
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
                { type: "text", text: "I will ask first." },
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
  synthetic.model = runtime.getModel("hallvi-owner-test", "synthetic");
});

async function startWorker() {
  worker = await ownSessions({ stopTimeoutMs: 2_000 });
  if (!worker) throw new Error("A worker already answers.");
}
/** As a worker that dies: Pi is told nothing, and keeps what it had. */
async function loseWorker() {
  if (!worker) return;
  const closed = once(worker.server, "close");
  worker.server.close();
  worker.server.closeAllConnections();
  await worker.owner.close();
  // Ownership goes with the server: the next worker can only start after it.
  await closed;
  worker = null;
}

beforeEach(async () => {
  store.db().$client.exec("DELETE FROM applications");
  requests = [];
  contextUsed = 10;
  await startWorker();
});
afterEach(async () => {
  for (const { id } of store.listApplications())
    for (const chat of store.listApplicationChats(id))
      await stopConversation(id, chat.id).catch(() => undefined);
  await loseWorker();
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
  const main = store.insertChat(app.id, "Main operator");
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
  const conversation = (chatId: string) => ({
    chat: chatId,
    send: (body: string, delivery?: "next" | "steer", key = randomUUID()) =>
      sendChatMessage(app.id, chatId, body, key, delivery),
    snapshot: () => chatSnapshot(app.id, chatId),
    /** The conversation as its page reads it, without Hallvi's greeting. */
    transcript: async () =>
      (await chatSnapshot(app.id, chatId)).messages
        .slice(1)
        .map(
          (m) =>
            `${m.role === "user" ? "you" : "pi"} [${m.status}] ${m.body || ""}`,
        ),
    status: async () => (await chatSnapshot(app.id, chatId)).status,
    continue: () => continueConversation(app.id, chatId),
    stop: () => stopConversation(app.id, chatId),
  });
  return {
    id: app.id,
    ...conversation(main.id),
    side: () => conversation(store.insertChat(app.id, "Side").id),
  };
}

async function until(check: () => unknown, ticks = 400) {
  for (let tick = 0; ; tick++) {
    try {
      return await check();
    } catch (error) {
      if (tick === ticks - 1) throw error;
    }
    await delay(10);
  }
}
const approval = (applicationId: string) =>
  listExecutions(applicationId).find((e) => e.status === "awaiting-approval");

it("accepts nothing while no worker answers, and the same send succeeds once when one does", async () => {
  const a = application("shop");
  await loseWorker();
  const key = randomUUID();
  await expect(a.send("deploy it", "next", key)).rejects.toBeInstanceOf(
    WorkerUnavailableError,
  );
  expect((await a.snapshot()).worker).toEqual({ alive: false });

  await startWorker();
  expect(await a.transcript()).toEqual([]);
  expect(requests).toEqual([]);
  await a.send("deploy it", "next", key);
  await until(async () => expect(await a.status()).toBe("idle"));
  expect(await a.transcript()).toEqual([
    "you [delivered] deploy it",
    "pi [completed] reply: deploy it",
  ]);
});

it("a send repeated after a lost answer is one instruction, read once", async () => {
  const a = application("shop");
  const first = randomUUID();
  await a.send("[approve] restart it", "next", first);
  await a.send("[approve] restart it", "next", first);
  await until(() => expect(approval(a.id)).toBeTruthy());

  // The same for a message queued behind running work.
  const next = randomUUID();
  await a.send("and then check it", "next", next);
  await a.send("and then check it", "next", next);
  expect((await a.transcript()).at(-1)).toBe("you [waiting] and then check it");

  decideExecution(a.id, approval(a.id)!.id, true);
  await until(async () => expect(await a.status()).toBe("idle"));
  // And once it has been read: Pi's history still has it.
  await a.send("and then check it", "next", next);
  expect(await a.status()).toBe("idle");
  expect(requests).toEqual([
    "[approve] restart it",
    "<toolResult>",
    "and then check it",
  ]);
});

it("asks before it executes, places the evidence in Pi's transcript, and runs two applications on one server at once", async () => {
  const a = application("shop", "203.0.113.7");
  const b = application("blog", "203.0.113.7");
  await a.send("[approve] restart it");
  await until(() => expect(approval(a.id)).toBeTruthy());
  expect(await a.status()).toBe("working");

  // Another application on the same server, and a read-only conversation of
  // the same application, answer while the main one waits for its owner.
  await b.send("how is it going?");
  const side = a.side();
  await side.send("what is running?");
  await until(async () => expect(await b.status()).toBe("idle"));
  await until(async () => expect(await side.status()).toBe("idle"));
  expect(await b.transcript()).toEqual([
    "you [delivered] how is it going?",
    "pi [completed] reply: how is it going?",
  ]);
  expect(await side.transcript()).toEqual([
    "you [delivered] what is running?",
    "pi [completed] reply: what is running?",
  ]);
  expect(approval(a.id)).toMatchObject({ tool: "request_approval" });

  decideExecution(a.id, approval(a.id)!.id, true);
  await until(async () => expect(await a.status()).toBe("idle"));
  const snapshot = await a.snapshot();
  const reply = snapshot.messages.at(-1)!;
  expect(reply).toMatchObject({ status: "completed", body: "finished" });
  // Evidence is kept under Pi's tool-call id and shown where Pi's transcript
  // has that call: under this reply, between what Pi said.
  expect(snapshot.executions).toMatchObject([
    { runId: reply.id, tool: "request_approval", status: "succeeded" },
  ]);
  expect(reply.blocks).toEqual([
    { type: "execution", id: snapshot.executions![0].id },
  ]);
  expect(
    snapshot.piActivity!.map((r) => [
      r.runId,
      r.sequence,
      r.kind,
      r.text ?? r.tool,
    ]),
  ).toEqual([
    [reply.id, 1, "message", "I will ask first."],
    [reply.id, 2, "tool", "request_approval"],
    [reply.id, 3, "message", "finished"],
  ]);
  expect(listExecutions(b.id)).toEqual([]);
});

it("delivers a steer at Pi's next step and follow-ups after, in Pi's order", async () => {
  const a = application("shop");
  await a.send("[approve] restart it");
  await until(() => expect(approval(a.id)).toBeTruthy());
  await a.send("then check the logs");
  await a.send("use the staging server", "steer");
  expect((await a.snapshot()).messages.slice(-2)).toMatchObject([
    { status: "waiting", delivery: "next", body: "then check the logs" },
    { status: "waiting", delivery: "steer", body: "use the staging server" },
  ]);

  decideExecution(a.id, approval(a.id)!.id, true);
  await until(async () => expect(await a.status()).toBe("idle"));
  expect(await a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    "pi [completed] I will ask first.",
    "you [delivered] use the staging server",
    "pi [completed] reply: use the staging server",
    "you [delivered] then check the logs",
    "pi [completed] reply: then check the logs",
  ]);
});

it("Stop ends an approval wait and a streaming answer, drops what waited, and says what is true", async () => {
  const a = application("shop");
  await a.send("[approve] restart it");
  await until(() => expect(approval(a.id)).toBeTruthy());
  await a.send("then check the logs");
  await a.stop();
  await until(async () => expect(await a.status()).toBe("idle"));
  // Pi's last words were a finished message and a tool call; that the reply
  // was stopped is read from Pi's own record of the operation.
  expect(await a.transcript()).toEqual([
    "you [delivered] [approve] restart it",
    "pi [cancelled] I will ask first.",
  ]);
  // Nothing was approved, so nothing ran, and the record says it was cut.
  expect(listExecutions(a.id)).toMatchObject([{ status: "interrupted" }]);
  expect(requests).toEqual(["[approve] restart it"]);

  await a.send("[slow] look at it");
  await until(async () =>
    expect((await a.snapshot()).messages.at(-1)).toMatchObject({
      status: "running",
      body: "Looking at the server",
    }),
  );
  await a.stop();
  await until(async () => expect(await a.status()).toBe("idle"));
  expect((await a.snapshot()).messages.at(-1)).toMatchObject({
    status: "cancelled",
  });
  // The conversation is usable afterwards.
  await a.send("hello");
  await until(async () => expect(await a.status()).toBe("idle"));
  expect((await a.transcript()).at(-1)).toBe("pi [completed] reply: hello");
});

it("after a restart nothing runs; history and evidence stay; Continue carries on without repeating, and a new question is refused until then", async () => {
  const a = application("shop");
  await a.send("[approve] restart it");
  await until(() => expect(approval(a.id)).toBeTruthy());
  await a.send("then check the logs");
  await loseWorker();
  await startWorker();
  await delay(300);

  expect(requests).toEqual(["[approve] restart it"]);
  const interrupted = await a.snapshot();
  expect(interrupted.status).toBe("interrupted");
  expect(
    interrupted.messages.slice(1).map((m) => `${m.role} ${m.status}`),
  ).toEqual(["user delivered", "assistant interrupted", "user waiting"]);
  expect(interrupted.messages[2].error).toMatch(/not known/);
  // The evidence is still under the reply, and says it did not finish.
  expect(interrupted.executions).toMatchObject([
    {
      runId: interrupted.messages[2].id,
      tool: "request_approval",
      status: "interrupted",
    },
  ]);

  // An ordinary question does not quietly resume the old work.
  await expect(a.send("what time is it?")).rejects.toBeInstanceOf(
    WorkerRefusal,
  );
  expect(requests).toEqual(["[approve] restart it"]);

  await a.continue();
  await until(async () => expect(await a.status()).toBe("idle"));
  // The interrupted call was not made again: Pi told the model its outcome
  // is unknown, and then read what had waited.
  expect(listExecutions(a.id)).toHaveLength(1);
  expect(requests).toEqual([
    "[approve] restart it",
    "<toolResult>",
    "then check the logs",
  ]);
  expect((await a.transcript()).slice(-2)).toEqual([
    "you [delivered] then check the logs",
    "pi [completed] reply: then check the logs",
  ]);
});

it("after a restart Stop is there with nothing queued, and ends what Pi held", async () => {
  const a = application("shop");
  await a.send("[approve] restart it");
  await until(() => expect(approval(a.id)).toBeTruthy());
  await loseWorker();
  await startWorker();
  expect(await a.status()).toBe("interrupted");

  await a.stop();
  expect(await a.status()).toBe("idle");
  expect((await a.transcript()).at(-1)).toBe(
    "pi [cancelled] I will ask first.",
  );
  expect(requests).toEqual(["[approve] restart it"]);
  await a.send("hello");
  await until(async () => expect(await a.status()).toBe("idle"));
  expect((await a.transcript()).at(-1)).toBe("pi [completed] reply: hello");
});

it("a message Pi queued on an idle lane is read from Pi's queue, once, when its owner continues", async () => {
  const a = application("shop");
  await a.send("hello");
  await until(async () => expect(await a.status()).toBe("idle"));
  // What a worker leaves when it dies in the instant after Pi finished and
  // took one more message: an idle lane with a queue.
  await loseWorker();
  const direct = await openPiSession({ applicationId: a.id, chatId: a.chat });
  const queued = await direct.lane.followUp(
    {
      role: "user",
      content: [{ type: "text", text: "one more thing" }],
      timestamp: Date.now(),
      [MESSAGE_TAG]: "late-message",
    } as never,
    undefined,
    ctx,
  );
  expect(queued.ok).toBe(true);
  await direct.close();
  await startWorker();

  expect(await a.status()).toBe("interrupted");
  expect((await a.transcript()).at(-1)).toBe("you [waiting] one more thing");
  await delay(200);
  expect(requests).toEqual(["hello"]);

  await a.continue();
  await until(async () => expect(await a.status()).toBe("idle"));
  expect(requests).toEqual(["hello", "one more thing"]);
  expect((await a.snapshot()).messages.at(-2)).toMatchObject({
    id: "late-message",
    status: "delivered",
  });
});

it("leaves retrying, compaction and failure to Pi, and gives the page advice instead of the provider's words", async () => {
  const a = application("shop");
  await a.send("[flaky] first");
  await until(async () => expect(await a.status()).toBe("idle"));
  expect((await a.transcript()).at(-1)).toBe(
    "pi [completed] reply: [flaky] first",
  );

  contextUsed = 260_000;
  await a.send("second");
  await until(async () => expect(await a.status()).toBe("idle"));
  contextUsed = 10;
  await a.send("third");
  await until(async () => expect(await a.status()).toBe("idle"));
  // Compaction changed what the model is sent, not what the page shows.
  expect(
    (await a.transcript()).filter((line) => line.startsWith("you")),
  ).toEqual([
    "you [delivered] [flaky] first",
    "you [delivered] second",
    "you [delivered] third",
  ]);

  await a.send("[fail] fourth");
  await until(async () => expect(await a.status()).toBe("idle"));
  const failed = (await a.snapshot()).messages.at(-1)!;
  expect(failed.status).toBe("failed");
  expect(failed.error).toMatch(/Open Settings and reconnect/);
  expect(JSON.stringify(await a.snapshot())).not.toContain("invalid_grant");
});

it("Stop after continuing an idle lane's queue says stopped, from the result of the operation Pi read the queue in", async () => {
  const a = application("shop");
  await a.send("hello");
  await until(async () => expect(await a.status()).toBe("idle"));
  await loseWorker();
  const direct = await openPiSession({ applicationId: a.id, chatId: a.chat });
  await direct.lane.followUp(
    {
      role: "user",
      content: [{ type: "text", text: "[approve] restart it" }],
      timestamp: Date.now(),
      [MESSAGE_TAG]: "late-approval",
    } as never,
    undefined,
    ctx,
  );
  await direct.close();
  await startWorker();

  await a.continue();
  await until(() => expect(approval(a.id)).toBeTruthy());
  await a.stop();
  expect(await a.status()).toBe("idle");
  expect((await a.transcript()).slice(-2)).toEqual([
    "you [delivered] [approve] restart it",
    "pi [cancelled] I will ask first.",
  ]);
  expect(listExecutions(a.id)).toMatchObject([{ status: "interrupted" }]);
});

it("a second worker steps aside without touching what the first is doing", async () => {
  const a = application("shop");
  await a.send("[approve] restart it");
  await until(() => expect(approval(a.id)).toBeTruthy());
  const waiting = approval(a.id)!.id;

  // Everything a starting worker does, while another one owns the sessions.
  expect(await ownSessions()).toBeNull();
  expect(approval(a.id)?.id).toBe(waiting);
  expect((await a.snapshot()).worker).toEqual({ alive: true });

  decideExecution(a.id, waiting, true);
  await until(async () => expect(await a.status()).toBe("idle"));
  expect((await a.transcript()).at(-1)).toBe("pi [completed] finished");
});

it("of workers starting in the same instant over a dead worker's socket, exactly one becomes the owner", async () => {
  await loseWorker();
  // A worker that was killed leaves its socket path behind, unanswered.
  const path = workerSocketPath(process.env.HALLVI_DB_PATH!);
  const dead = spawn(process.execPath, [
    "-e",
    "require('net').createServer().listen(process.argv[1], () => process.stdout.write('up'))",
    path,
  ]);
  await once(dead.stdout, "data");
  dead.kill("SIGKILL");
  await once(dead, "exit");
  expect(existsSync(path)).toBe(true);

  // Separate processes, as workers are: each tries to become the owner, says
  // whether it did, and an owner keeps serving until it is stopped, so a slow
  // starter cannot become a second owner honestly, after the first has gone.
  const starters = Array.from({ length: 6 }, () =>
    spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `import("./src/server/worker-link.ts").then(async ({ serveWorker }) => {
          const server = await serveWorker(async () => ({ pid: process.pid }));
          process.stdout.write(server ? "owner" : "busy");
        })`,
      ],
      { env: process.env, stdio: ["ignore", "pipe", "inherit"] },
    ),
  );
  const said = await Promise.all(
    starters.map(
      (starter) =>
        new Promise<string>((resolve, reject) => {
          starter.stdout.once("data", (data) => resolve(String(data)));
          starter.once("exit", (code) =>
            reject(new Error(`A starter exited (${code}) without saying.`)),
          );
        }),
    ),
  );
  expect(said.filter((each) => each === "owner")).toHaveLength(1);
  expect(said.filter((each) => each === "busy")).toHaveLength(5);
  // The owner is the one that answers at the path.
  const owner = starters[said.indexOf("owner")];
  expect(await askWorker<{ pid: number }>("anything", {})).toEqual({
    pid: owner.pid,
  });
  owner.kill("SIGTERM");
  await Promise.all(
    starters.map(
      (starter) => starter.exitCode !== null || once(starter, "exit"),
    ),
  );
}, 120_000);
