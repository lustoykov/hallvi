// Proof of fit: published pi-agent-core 0.85.1 AgentHarness/AgentLane against
// the behaviours Hallvi's AgentSession adapter currently reconstructs.
import {
  AgentHarness,
  BACKGROUND_CONTEXT as ctx,
  JsonlSessionRepo,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/harness/env/nodejs";
import { createModels } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

const root = mkdtempSync(join(tmpdir(), "hallvi-harness-fit-"));
const findings = {};
const note = (key, value) => {
  findings[key] = value;
  console.log(`\n## ${key}\n${JSON.stringify(value, null, 2)}`);
};
const ok = (result) => {
  if (!result.ok) throw new Error(`not ok: ${JSON.stringify(result.error)}`);
  return result.value;
};
const text = (message) =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");

/** Scripted like Hallvi's tests: "[tool]" holds a tool open; else it echoes. */
function scripted(requests) {
  const faux = fauxProvider();
  const respond = (context) => {
    const last = context.messages.at(-1);
    const said = last.role === "user" ? text(last) : "";
    requests.push(last.role === "user" ? said : `<${last.role}>`);
    return said.includes("[tool]")
      ? fauxAssistantMessage(fauxToolCall("hold", {}), {
          stopReason: "toolUse",
        })
      : fauxAssistantMessage(
          fauxText(last.role === "user" ? `reply: ${said}` : "finished"),
        );
  };
  faux.setResponses(Array.from({ length: 50 }, () => respond));
  const models = createModels();
  models.setProvider(faux.provider);
  return { models, model: faux.getModel() };
}

function holdTool(holds, ran) {
  return {
    name: "hold",
    label: "Hold",
    description: "Runs until released.",
    parameters: Type.Object({}),
    execute: (
      toolCallId,
      _params,
      _onUpdate,
      _toolContext,
      invocation,
      context,
    ) =>
      new Promise((resolve, reject) => {
        ran.push({ toolCallId, invocationId: invocation.invocationId });
        const hold = {
          aborted: false,
          release: () =>
            resolve({ content: [{ type: "text", text: "ok" }], details: {} }),
        };
        context.abortSignal?.addEventListener("abort", () => {
          hold.aborted = true;
          reject(new Error("aborted"));
        });
        holds.push(hold);
      }),
  };
}

async function open(repo, metadata, extra = {}) {
  const requests = [];
  const holds = [];
  const ran = [];
  const { models, model } = scripted(requests);
  const session = metadata
    ? await repo.open(metadata, ctx)
    : await repo.create({ cwd: root }, ctx);
  const { harness, open: openOperations } = await AgentHarness.create(
    {
      session,
      models,
      model,
      systemPrompt: "Stable test instructions",
      tools: [holdTool(holds, ran)],
      toolExecution: "sequential",
      ...extra,
    },
    ctx,
  );
  const lane = await harness.lane("main", ctx);
  const events = [];
  for (const type of [
    "message_end",
    "queue_update",
    "operation_abort",
    "run_end",
  ])
    harness.events.on(type, (event) => {
      if (type === "message_end" && event.message.role === "user")
        events.push(
          `user read: "${text(event.message)}" entry=${event.entryId}`,
        );
      if (type === "queue_update")
        events.push(
          `queue: [${event.queues.map((q) => `${q.kind}:${q.entryId}`)}]`,
        );
      if (type === "operation_abort")
        events.push(
          `abort returned steer=${event.steer.length} followUp=${event.followUp.length}`,
        );
      if (type === "run_end") events.push(`run_end ${event.status}`);
    });
  return {
    session,
    harness,
    lane,
    requests,
    holds,
    ran,
    events,
    openOperations,
  };
}
const held = async (holds, count) => {
  while (holds.length < count) await new Promise((r) => setTimeout(r, 5));
};

const repo = new JsonlSessionRepo({
  fileSystem: new NodeExecutionEnv({ cwd: root }),
  sessionsRoot: join(root, "sessions"),
});

// 1. Queue identity: identical text, steer + follow-up, ids at queue time.
{
  const a = await open(repo);
  const running = a.lane.prompt("[tool] deploy", undefined, ctx);
  await held(a.holds, 1);
  const f1 = ok(await a.lane.followUp("continue", undefined, ctx)).entryId;
  const f2 = ok(await a.lane.followUp("continue", undefined, ctx)).entryId;
  const s1 = ok(await a.lane.steer("continue", undefined, ctx)).entryId;
  const snapshot = (await a.lane.watch(ctx)).snapshot;
  a.holds[0].release();
  const result = ok(await running);
  const readIds = a.events
    .filter((e) => e.startsWith("user read"))
    .map((e) => e.split("entry=")[1]);
  note("1. queued ids vs history ids (identical text x3)", {
    idsReturnedWhenQueued: { followUp1: f1, followUp2: f2, steer: s1 },
    queueSnapshotWhileHeld: snapshot.queues.map(
      (q) => `${q.kind}:${q.entryId}`,
    ),
    historyEntryIdsInReadOrder: readIds,
    queuedIdEqualsHistoryId:
      readIds.includes(f1) && readIds.includes(f2) && readIds.includes(s1),
    readOrder: readIds.map((id) =>
      id === s1
        ? "steer"
        : id === f1
          ? "followUp1"
          : id === f2
            ? "followUp2"
            : "prompt",
    ),
    modelRequests: a.requests,
    resultStatus: result.status ?? result,
  });

  // 2. Cancel one queued entry by id; the rest stay and run in order.
  const b = await open(repo);
  const run2 = b.lane.prompt("[tool] deploy", undefined, ctx);
  await held(b.holds, 1);
  const keep1 = ok(await b.lane.followUp("first", undefined, ctx)).entryId;
  const drop = ok(
    await b.lane.followUp("delete the volume", undefined, ctx),
  ).entryId;
  const keep2 = ok(await b.lane.followUp("third", undefined, ctx)).entryId;
  const cancelled = ok(await b.lane.cancelQueued(drop, ctx));
  const again = ok(await b.lane.cancelQueued(drop, ctx));
  b.holds[0].release();
  await run2;
  const late = ok(await b.lane.cancelQueued(keep1, ctx));
  note("2. cancelQueued by id", {
    cancelled,
    cancelledTwice: again,
    afterItRan: late,
    modelRequests: b.requests,
    keptIds: [keep1, keep2],
  });

  // 3. Stop: what does abort do to queued work?
  const c = await open(repo);
  const run3 = c.lane.prompt("[tool] deploy", undefined, ctx);
  await held(c.holds, 1);
  ok(await c.lane.followUp("then publish it", undefined, ctx));
  ok(await c.lane.steer("skip the tests", undefined, ctx));
  const aborted = await c.lane.abort(ctx);
  const settled = await run3;
  await c.lane.waitForIdle(ctx);
  const after = (await c.lane.watch(ctx)).snapshot;
  note("3. abort with queued work", {
    abortOk: aborted.ok,
    abortReturned: aborted.ok && {
      steer: aborted.value.steer.map(text),
      followUp: aborted.value.followUp.map(text),
    },
    runResult: settled.ok ? settled.value.status : settled.error,
    toolSawAbort: c.holds[0].aborted,
    queuesAfterAbort: after.queues.map((q) => q.kind),
    modelRequestsAfterAbort: c.requests,
    events: c.events,
  });
  await Promise.all([a, b, c].map((each) => each.harness.close(ctx)));
}

// 4. Restart with queued work and an interrupted tool call.
{
  const d = await open(repo);
  const metadata = d.session.metadata;
  void d.lane.prompt("[tool] deploy", undefined, ctx);
  await held(d.holds, 1);
  const queued = ok(
    await d.lane.followUp("then publish it", undefined, ctx),
  ).entryId;
  const files = readdirSync(join(root, "sessions"), { recursive: true }).filter(
    (f) => String(f).endsWith(".jsonl"),
  );
  // "Crash": abandon this harness without closing it, as a dead process would.
  note("4a. durable state at crash", {
    queuedEntryId: queued,
    sessionFiles: files.length,
    queuedTextOnDisk: files.some((f) =>
      readFileSync(join(root, "sessions", String(f)), "utf8").includes(
        "then publish it",
      ),
    ),
    metadataKeys: Object.keys(metadata ?? {}),
  });
  findings.crash = { metadata, queued, ranBefore: d.ran.length };
}
writeFileSync(
  new URL("./crash.json", import.meta.url),
  JSON.stringify({ root, ...findings.crash }),
);
process.exit(0);
