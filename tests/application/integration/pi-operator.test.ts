import {
  AgentHarness,
  BACKGROUND_CONTEXT as ctx,
  JsonlSessionRepo,
  type AgentHarnessTool,
  type JsonlSessionMetadata,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { createModels, type Context } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  heldByPi,
  liveOperator,
  type AcceptedMessage,
} from "@/server/pi-operator";

// Published pi-agent-core 0.85.1 AgentHarness/AgentLane with pi-ai's scripted
// provider. These pin what Hallvi relies on Pi to own: identity from the
// moment a message is queued, order, cancellation, abort and restoration.

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-operator-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const text = (content: unknown): string =>
  typeof content === "string"
    ? content
    : (content as Array<{ type: string; text?: string }>)
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");

/** A message as Hallvi hands it to Pi: its text, tagged with its record id. */
const tagged = (message: AcceptedMessage) =>
  ({
    role: "user",
    content: [{ type: "text", text: message.body }],
    timestamp: Date.now(),
    hallviMessageId: message.id,
  }) as never;

/**
 * One owner of one session, as a worker process is. "[tool]" in a message makes
 * the model call a tool the test holds open, "[two]" twice in one turn;
 * anything else is answered "reply: <that text>".
 */
async function rig(metadata?: JsonlSessionMetadata) {
  const requests: string[] = [];
  const effects: string[] = [];
  const holds: Array<{ release: () => void; aborted: boolean }> = [];
  const faux = fauxProvider();
  const respond = (context: Context) => {
    const last = context.messages.at(-1)!;
    const asked = last.role === "user" ? text(last.content) : "";
    requests.push(
      last.role === "user" ? asked : `<${last.role}: ${text(last.content)}>`,
    );
    return asked.includes("[two]")
      ? fauxAssistantMessage(
          [fauxToolCall("hold", { n: "1" }), fauxToolCall("hold", { n: 2 })],
          { stopReason: "toolUse" },
        )
      : asked.includes("[tool]")
        ? fauxAssistantMessage(fauxToolCall("hold", { n: "1" }), {
            stopReason: "toolUse",
          })
        : fauxAssistantMessage(
            fauxText(last.role === "user" ? `reply: ${asked}` : "finished"),
          );
  };
  faux.setResponses(Array.from({ length: 40 }, () => respond));
  const models = createModels();
  models.setProvider(faux.provider);
  const hold: AgentHarnessTool<undefined> = {
    name: "hold",
    label: "Hold",
    description: "Changes something, and runs until the test lets it finish.",
    parameters: Type.Object({ n: Type.Number() }),
    // The model wrote "1"; the definition's own shim makes it a number.
    prepareArguments: (args) => ({ n: Number((args as { n: unknown }).n) }),
    execute: (_id, params, _onUpdate, _toolContext, _invocation, context) =>
      new Promise((resolve, reject) => {
        const n = (params as { n: number }).n;
        effects.push(`effect ${typeof n} ${n}`);
        const held = {
          aborted: false,
          release: () =>
            resolve({ content: [{ type: "text", text: "ok" }], details: {} }),
        };
        context.abortSignal?.addEventListener("abort", () => {
          held.aborted = true;
          reject(new Error("aborted"));
        });
        holds.push(held);
      }),
  };
  const repo = new JsonlSessionRepo({
    fileSystem: new NodeExecutionEnv({ cwd: root }),
    sessionsRoot: join(root, "sessions"),
  });
  const session = metadata
    ? await repo.open(metadata, ctx)
    : await repo.create({ cwd: root }, ctx);
  const { harness, open } = await AgentHarness.create(
    {
      session,
      models,
      model: faux.getModel(),
      systemPrompt: "Stable test instructions",
      tools: [hold],
      toolExecution: "sequential",
      steeringMode: "one-at-a-time",
      followUpMode: "one-at-a-time",
    },
    ctx,
  );
  const lane = await harness.lane("main", ctx);
  const log: string[] = [];
  const entryIds = new Map<string, string>();
  const records = {
    admitted(id: string, entryId: string | null) {
      if (entryId) entryIds.set(id, entryId);
      log.push(`${id} admitted${entryId ? "" : " (prompt)"}`);
    },
    seen: (id: string) =>
      log.push(`${id} read after ${requests.length} model calls`),
    said: (said: string) => log.push(`pi: ${said}`),
    errored: () => {},
  };
  const held = (count: number) =>
    vi.waitFor(() => expect(holds.length).toBeGreaterThanOrEqual(count));
  const message = (
    id: string,
    body: string,
    delivery: AcceptedMessage["delivery"] = "next",
  ) => ({ id: `00000000-0000-4000-8000-0000000000${id}`, body, delivery });
  return {
    session,
    harness,
    lane,
    open,
    requests,
    effects,
    holds,
    held,
    log,
    entryIds,
    records,
    message,
  };
}
const short = (log: string[]) =>
  log.map((line) => line.replace(/^0{8}-0000-4000-8000-0{10}/, "m"));

it("names each message when Pi takes it, keeps that name in its history, and reads a steer first", async () => {
  const r = await rig();
  const operator = liveOperator(
    r.harness,
    r.lane,
    r.message("01", "[tool] deploy"),
    r.records,
  );
  await r.held(1);
  operator.deliver(r.message("02", "continue"));
  operator.deliver(r.message("03", "continue"));
  operator.deliver(r.message("04", "continue", "steer"));
  await vi.waitFor(() => expect(r.entryIds.size).toBe(4));
  r.holds[0].release();
  expect(await operator.done).toEqual({ status: "idle" });
  // All three were Pi's before it read any of them, and identical text is
  // three messages: the steer first, then the follow-ups as they were sent.
  expect(short(r.log).slice(0, 6)).toEqual([
    // Accepting a prompt writes it to Pi's history before anything else.
    "m01 read after 0 model calls",
    "m01 admitted",
    "m01 admitted (prompt)",
    "m02 admitted",
    "m03 admitted",
    "m04 admitted",
  ]);
  expect(short(r.log).filter((line) => !line.includes("admitted"))).toEqual([
    "m01 read after 0 model calls",
    "m04 read after 1 model calls",
    "pi: reply: continue",
    "m02 read after 2 model calls",
    "pi: reply: continue",
    "m03 read after 3 model calls",
    "pi: reply: continue",
  ]);
  // The id given when it was queued is the id of its history entry.
  const history = await r.lane.findEntries(undefined, ctx);
  expect(new Set(r.entryIds.values()).size).toBe(4);
  for (const entryId of r.entryIds.values())
    expect(history.map((entry) => entry.id)).toContain(entryId);
  expect(operator.deliver(r.message("05", "late"))).toBe(false);
  await r.harness.close(ctx);
});

it("runs a turn's tool calls one at a time, with the definition's own argument shim", async () => {
  const r = await rig();
  const operator = liveOperator(
    r.harness,
    r.lane,
    r.message("01", "[two] deploy"),
    r.records,
  );
  await r.held(1);
  // The second call has not begun while the first is still running.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(r.effects).toEqual(["effect number 1"]);
  r.holds[0].release();
  await r.held(2);
  r.holds[1].release();
  await operator.done;
  expect(r.effects).toEqual(["effect number 1", "effect number 2"]);
  await r.harness.close(ctx);
});

it("Stop during a running tool ends it and empties Pi's queues by itself", async () => {
  const r = await rig();
  const operator = liveOperator(
    r.harness,
    r.lane,
    r.message("01", "[tool] deploy"),
    r.records,
  );
  await r.held(1);
  operator.deliver(r.message("02", "then publish it"));
  operator.deliver(r.message("03", "skip the tests", "steer"));
  await vi.waitFor(() => expect(r.entryIds.size).toBe(3));
  expect(await operator.stop()).toEqual({ status: "stopped" });
  expect(r.holds[0].aborted).toBe(true);
  expect(r.requests).toEqual(["[tool] deploy"]);
  expect((await heldByPi(r.lane, [])).queued).toEqual([]);
  // And the lane is usable: nothing that waited comes back with it.
  const next = liveOperator(
    r.harness,
    r.lane,
    r.message("04", "what happened?"),
    r.records,
  );
  expect(await next.done).toEqual({ status: "idle" });
  expect(r.requests.at(-1)).toBe("what happened?");
  expect(r.requests).not.toContain("then publish it");
  await r.harness.close(ctx);
});

it("does not lose or repeat a message in the instant between Pi taking it and Hallvi recording that", async () => {
  const r = await rig();
  // Pi took both durably, and Hallvi died before writing either down: one
  // admitted as the prompt of an idle lane, one queued behind it.
  const taken = r.message("01", "deploy");
  const queued = r.message("02", "then publish it");
  await r.lane.accept(
    { kind: "prompt", operationId: taken.id, prompt: tagged(taken) },
    ctx,
  );
  await r.lane.followUp(tagged(queued), undefined, ctx);
  // The next worker asks Pi what it holds before handing anything over.
  const held = await heldByPi(r.lane, [taken.id, queued.id]);
  expect(held.openOperationId).toBe(taken.id);
  expect(held.queued.map((item) => item.messageId)).toEqual([queued.id]);
  // Both run once, in order, and nothing was handed over twice.
  const operator = liveOperator(r.harness, r.lane, "resume", r.records);
  expect(await operator.done).toEqual({ status: "idle" });
  expect(r.requests).toEqual(["deploy", "then publish it"]);
  await r.harness.close(ctx);
});

it("puts a message queued on an idle lane as the prompt, by its id", async () => {
  const r = await rig();
  await r.lane.followUp(
    tagged(r.message("01", "then publish it")),
    undefined,
    ctx,
  );
  // Pi does not run what is queued on an idle lane.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(r.requests).toEqual([]);
  const operator = liveOperator(r.harness, r.lane, "sweep", r.records);
  expect(await operator.done).toEqual({ status: "idle" });
  expect(r.requests).toEqual(["then publish it"]);
  await r.harness.close(ctx);
});

it("after a dead worker, restores the operation and the queue, runs nothing, and never repeats the interrupted effect", async () => {
  const dead = await rig();
  void liveOperator(
    dead.harness,
    dead.lane,
    dead.message("01", "[tool] deploy"),
    dead.records,
  );
  await dead.held(1);
  const waiting = dead.message("02", "then publish it");
  await dead.lane.followUp(tagged(waiting), undefined, ctx);
  const queuedAs = (await heldByPi(dead.lane, [])).queued[0].entryId;
  expect(dead.effects).toEqual(["effect number 1"]);
  // The process is gone: nothing is closed, aborted or released.

  const next = await rig(dead.session.metadata);
  expect(next.open.map((operation) => operation.operationId)).toEqual([
    dead.message("01", "").id,
  ]);
  // Same message, same id, and nothing has run because a worker came back.
  expect((await heldByPi(next.lane, [])).queued).toEqual([
    { messageId: waiting.id, entryId: queuedAs },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(next.requests).toEqual([]);

  // The owner continues. Pi resumes: the tool is not run again, the model is
  // told its outcome is unknown, and what waited runs after it.
  const operator = liveOperator(
    next.harness,
    next.lane,
    "resume",
    next.records,
  );
  expect(await operator.done).toEqual({ status: "idle" });
  expect(next.effects).toEqual([]);
  expect(next.requests).toEqual([
    expect.stringMatching(
      /^<toolResult: \[Tool execution was interrupted\..*the external outcome is unknown/s,
    ),
    "then publish it",
  ]);
  await next.harness.close(ctx);
});

it("does not itself stop a second owner of one history, which is why Hallvi's locks stay", async () => {
  const first = await rig();
  const second = await rig(first.session.metadata);
  const queued = await second.lane.followUp(
    "from another owner",
    undefined,
    ctx,
  );
  expect(queued.ok).toBe(true);
  expect((await heldByPi(first.lane, [])).queued).toEqual([]);
});
