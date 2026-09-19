import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { liveOperator, type AcceptedMessage } from "@/server/pi-operator";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-operator-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function text(content: unknown): string {
  if (typeof content === "string") return content;
  return (content as Array<{ type: string; text?: string }>)
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function assistant(
  model: Model<Api>,
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
  return {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    content,
    stopReason,
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

/**
 * The installed SDK with a scripted provider and one tool the test holds open,
 * which is what a running server command or an approval wait is to Pi.
 * "[tool]" in a user message makes the model call it once, "[two]" twice in
 * one assistant turn; anything else is answered with "reply: <that text>".
 */
async function rig(sessionFile = join(root, "chat.jsonl"), compact = false) {
  const requests: string[] = [];
  const holds: Array<{ release: () => void; aborted: boolean }> = [];
  const waiters: Array<() => void> = [];
  const held = async (count: number) => {
    while (holds.length < count)
      await new Promise<void>((resolve) => waiters.push(resolve));
  };
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    modelsStorePath: join(root, "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  let calls = 0;
  modelRuntime.registerProvider("hallvi-operator-test", {
    api: "hallvi-operator-test",
    apiKey: "SYNTHETIC-NO-NETWORK",
    baseUrl: "https://invalid.test",
    streamSimple: (model, context: Context) => {
      const stream = createAssistantMessageEventStream();
      const last = context.messages.at(-1)!;
      const said = last.role === "user" ? text(last.content) : "";
      requests.push(last.role === "user" ? said : `<${last.role}>`);
      const call = () => ({
        type: "toolCall" as const,
        id: `call-${++calls}`,
        name: "hold",
        arguments: {},
      });
      const message = said.includes("[two]")
        ? assistant(model, [call(), call()], "toolUse")
        : said.includes("[tool]")
          ? assistant(model, [call()], "toolUse")
          : assistant(
              model,
              [
                {
                  type: "text",
                  text: last.role === "user" ? `reply: ${said}` : "finished",
                },
              ],
              "stop",
            );
      stream.push({ type: "start", partial: message });
      stream.push({
        type: "done",
        reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
        message,
      });
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
  const model = modelRuntime.getModel("hallvi-operator-test", "synthetic")!;
  if (sessionFile === join(root, "chat.jsonl"))
    writeFileSync(sessionFile, "", { mode: 0o600 });
  const manager = SessionManager.open(sessionFile, root, root);
  const settingsManager = SettingsManager.inMemory({
    compaction: compact
      ? { enabled: true, reserveTokens: 2_048, keepRecentTokens: 1_024 }
      : { enabled: false },
  });
  if (compact)
    // A long history whose last answer nearly filled the context window.
    for (let index = 0; index < 12; index++) {
      manager.appendMessage({
        role: "user",
        content: `Older question ${index} ${"historical text ".repeat(180)}`,
        timestamp: index + 1,
      });
      manager.appendMessage({
        ...assistant(model, [{ type: "text", text: `Older ${index}` }], "stop"),
        usage: {
          ...assistant(model, [], "stop").usage,
          input: index === 11 ? 7_900 : 10,
          totalTokens: index === 11 ? 7_901 : 11,
        },
      });
    }
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    settingsManager,
    systemPromptOverride: () => "Stable test instructions",
    appendSystemPromptOverride: () => [],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    noContextFiles: true,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: root,
    agentDir: root,
    model,
    modelRuntime,
    sessionManager: manager,
    settingsManager,
    resourceLoader: loader,
    noTools: "all",
    tools: ["hold"],
    customTools: [
      {
        name: "hold",
        label: "Hold",
        description: "Runs until the test lets it finish.",
        executionMode: "sequential" as const,
        parameters: Type.Object({}),
        execute: (_id: string, _args: unknown, signal?: AbortSignal) =>
          new Promise((resolve, reject) => {
            const hold = {
              aborted: false,
              release: () =>
                resolve({
                  content: [{ type: "text" as const, text: "ok" }],
                  details: {},
                }),
            };
            signal?.addEventListener("abort", () => {
              hold.aborted = true;
              reject(new Error("aborted"));
            });
            holds.push(hold);
            waiters.splice(0).forEach((wake) => wake());
          }),
      },
    ],
  });
  // What the conversation page would show: the owner's messages where Pi read
  // them, and what Pi said, in one order.
  const transcript: string[] = [];
  const bodies = new Map<string, string>();
  const message = (
    id: string,
    body: string,
    delivery: AcceptedMessage["delivery"] = "next",
  ) => {
    bodies.set(id, body);
    return { id, body, delivery };
  };
  const records = {
    seen: (id: string) => transcript.push(`${id} seen: ${bodies.get(id)}`),
    said: (said: string) => transcript.push(`pi: ${said}`),
    persisted: () => {},
    errored: () => {},
  };
  /** Pi itself now holds this many waiting messages. */
  const queued = (count: number) =>
    vi.waitFor(() => expect(session.pendingMessageCount).toBe(count));
  return {
    session,
    manager,
    requests,
    holds,
    held,
    queued,
    transcript,
    message,
    records,
  };
}

it("runs follow-ups in order in one native run, telling identical messages apart", async () => {
  const {
    session,
    requests,
    holds,
    held,
    queued,
    transcript,
    message,
    records,
  } = await rig();
  const operator = liveOperator(
    session,
    message("m1", "[tool] deploy"),
    records,
  );
  // Same tick as the prompt: before the session reports itself busy.
  expect(operator.deliver(message("m2", "continue"))).toBe(true);
  await held(1);
  expect(operator.deliver(message("m3", "continue"))).toBe(true);
  await queued(2);
  expect(transcript).toEqual(["m1 seen: [tool] deploy"]);
  holds[0].release();
  expect(await operator.done).toEqual({ status: "idle" });
  expect(transcript).toEqual([
    "m1 seen: [tool] deploy",
    "pi: finished",
    "m2 seen: continue",
    "pi: reply: continue",
    "m3 seen: continue",
    "pi: reply: continue",
  ]);
  expect(requests).toEqual([
    "[tool] deploy",
    "<toolResult>",
    "continue",
    "continue",
  ]);
  expect(operator.deliver(message("m4", "late"))).toBe(false);
  session.dispose();
});

it("delivers a steer after the whole tool batch, before the next model call and before waiting follow-ups", async () => {
  const {
    session,
    requests,
    holds,
    held,
    queued,
    transcript,
    message,
    records,
  } = await rig();
  const operator = liveOperator(
    session,
    message("m1", "[two] deploy"),
    records,
  );
  await held(1);
  operator.deliver(message("m2", "then tidy up"));
  operator.deliver(message("m3", "use port 8080", "steer"));
  await queued(2);
  // Not while a command runs, and not between two calls of one turn.
  holds[0].release();
  await held(2);
  expect(transcript).toEqual(["m1 seen: [two] deploy"]);
  holds[1].release();
  expect(await operator.done).toEqual({ status: "idle" });
  expect(transcript).toEqual([
    "m1 seen: [two] deploy",
    "m3 seen: use port 8080",
    "pi: reply: use port 8080",
    "m2 seen: then tidy up",
    "pi: reply: then tidy up",
  ]);
  // The steer replaced the model call that would have followed the tools.
  expect(requests).toEqual(["[two] deploy", "use port 8080", "then tidy up"]);
  session.dispose();
});

it("tells an identical steer and follow-up apart the way Pi drains them", async () => {
  const { session, holds, held, queued, transcript, message, records } =
    await rig();
  const operator = liveOperator(
    session,
    message("m1", "[tool] deploy"),
    records,
  );
  await held(1);
  operator.deliver(message("m2", "continue"));
  operator.deliver(message("m3", "continue", "steer"));
  await queued(2);
  holds[0].release();
  expect(await operator.done).toEqual({ status: "idle" });
  expect(transcript.filter((line) => line.includes("seen"))).toEqual([
    "m1 seen: [tool] deploy",
    "m3 seen: continue",
    "m2 seen: continue",
  ]);
  session.dispose();
});

it("keeps a message sent in the same instant as the first, on a session with history", async () => {
  const { session, requests, transcript, message, records } = await rig();
  // The session outlives one stretch; its preflight now has history to check.
  await liveOperator(session, message("m0", "hello"), records).done;
  const operator = liveOperator(session, message("m1", "status?"), records);
  expect(operator.deliver(message("m2", "and the logs?"))).toBe(true);
  expect(await operator.done).toEqual({ status: "idle" });
  expect(transcript.slice(2)).toEqual([
    "m1 seen: status?",
    "pi: reply: status?",
    "m2 seen: and the logs?",
    "pi: reply: and the logs?",
  ]);
  expect(requests).toEqual(["hello", "status?", "and the logs?"]);
  session.dispose();
});

it("hands over a message sent while Pi compacts before its first answer", async () => {
  const { session, manager, transcript, message, records } = await rig(
    undefined,
    true,
  );
  let compacting = false;
  let deliveredDuringCompaction = false;
  session.subscribe((event) => {
    if (event.type !== "compaction_start") return;
    compacting = true;
    // Pi refuses a prompt outright while it compacts. The adapter holds this
    // until Pi is running and hands it over then.
    queueMicrotask(() => {
      deliveredDuringCompaction = operator.deliver(
        message("m2", "and the logs?"),
      );
    });
  });
  const operator = liveOperator(session, message("m1", "status?"), records);
  expect(await operator.done).toEqual({ status: "idle" });
  expect(compacting && deliveredDuringCompaction).toBe(true);
  expect(manager.getEntries().some((e) => e.type === "compaction")).toBe(true);
  expect(transcript.filter((line) => line.includes("seen"))).toEqual([
    "m1 seen: status?",
    "m2 seen: and the logs?",
  ]);
  session.dispose();
});

it("stops the running work and never starts what was waiting", async () => {
  const {
    session,
    requests,
    holds,
    held,
    queued,
    transcript,
    message,
    records,
  } = await rig();
  const operator = liveOperator(
    session,
    message("m1", "[tool] deploy"),
    records,
  );
  await held(1);
  operator.deliver(message("m2", "then publish it"));
  operator.deliver(message("m3", "skip the tests", "steer"));
  await queued(2);
  expect(await operator.stop()).toEqual({ status: "stopped" });
  expect(holds[0].aborted).toBe(true);
  // What runs next is not the adapter's to say: Pi holds nothing, read
  // nothing more, and the durable messages already say they never started.
  expect(session.pendingMessageCount).toBe(0);
  expect(transcript).toEqual(["m1 seen: [tool] deploy"]);
  expect(requests).toEqual(["[tool] deploy"]);
  expect(operator.deliver(message("m4", "late"))).toBe(false);
  session.dispose();
});

it("SDK contract: abort alone continues into queued follow-ups", async () => {
  const { session, requests, held } = await rig();
  const run = session.prompt("[tool] deploy", {
    expandPromptTemplates: false,
    source: "rpc",
  });
  await held(1);
  await session.followUp("then publish it");
  await session.abort();
  await run;
  expect(requests).toEqual(["[tool] deploy", "then publish it"]);
  session.dispose();
});

it("learns the id Pi keeps each message under, before any model call is made for it", async () => {
  const { session, manager, requests, holds, held, message, records } =
    await rig();
  const file = manager.getSessionFile()!;
  const ids = (path: string) =>
    readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).id as string);
  const order: string[] = [];
  const entry: Record<string, string> = {};
  const crashed = join(root, "crashed.jsonl");
  const operator = liveOperator(session, message("m1", "[tool] deploy"), {
    ...records,
    seen(id) {
      order.push(`${id} seen, ${requests.length} model calls so far`);
      // The process dies here: Hallvi has recorded m2 as handed to Pi, and
      // Pi has not written it.
      if (id === "m2")
        writeFileSync(crashed, readFileSync(file, "utf8"), { mode: 0o600 });
    },
    persisted(id, entryId) {
      order.push(`${id} persisted, ${requests.length} model calls so far`);
      entry[id] = entryId;
    },
  });
  await held(1);
  operator.deliver(message("m2", "[tool] deploy"));
  holds[0].release();
  await held(2);
  holds[1].release();
  await operator.done;
  session.dispose();
  // Seen, then named by Pi, then and only then sent to the model. A message
  // with no entry id was therefore never put to the model.
  expect(order).toEqual([
    "m1 seen, 0 model calls so far",
    "m1 persisted, 0 model calls so far",
    "m2 seen, 2 model calls so far",
    "m2 persisted, 2 model calls so far",
  ]);
  // The ids are Pi's own, so identical text in the same millisecond is two
  // entries, and both are in its file once it has answered.
  expect(entry.m1).not.toBe(entry.m2);
  expect(ids(file)).toEqual(expect.arrayContaining([entry.m1, entry.m2]));
  expect(ids(crashed)).toContain(entry.m1);
  expect(ids(crashed)).not.toContain(entry.m2);

  // After the restart nothing routes m2 again, and Pi's history never held
  // it: the next message is answered without it having run.
  const restarted = await rig(crashed);
  const next = liveOperator(
    restarted.session,
    restarted.message("m5", "what happened?"),
    restarted.records,
  );
  expect(await next.done).toEqual({ status: "idle" });
  expect(restarted.requests).toEqual(["what happened?"]);
  expect(restarted.transcript).toEqual([
    "m5 seen: what happened?",
    "pi: reply: what happened?",
  ]);
  restarted.session.dispose();
});
