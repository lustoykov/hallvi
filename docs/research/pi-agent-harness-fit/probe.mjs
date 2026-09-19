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

const user = (textValue, id) => ({
  role: "user",
  content: [{ type: "text", text: textValue }],
  timestamp: Date.now(),
  hallviMessageId: id,
});
// A. followUp on an idle lane
{
  const a = await open(repo);
  const q = ok(
    await a.lane.followUp(user("idle follow-up", "row-a"), undefined, ctx),
  );
  await new Promise((r) => setTimeout(r, 200));
  const snap = (await a.lane.watch(ctx)).snapshot;
  note("A. followUp on an idle lane", {
    queued: snap.queues.map((x) => x.kind),
    ranByItself: a.requests,
    operation: snap.operation,
  });
  const cancelled = ok(await a.lane.cancelQueued(q.entryId, ctx));
  const p = await a.lane.prompt("hello", undefined, ctx);
  note("A2. after cancelQueued + prompt", { cancelled, requests: a.requests });
  // B. nextRun semantics
  ok(await a.lane.followUp(user("stranded", "row-b"), undefined, ctx));
  await a.lane.prompt("next prompt", undefined, ctx);
  note("B. a stranded follow-up and the next prompt", { requests: a.requests });
}
// C. accept with caller operation id + tagged prompt; message_end entry id;
// LaneBusy; streaming updates
{
  const c = await open(repo);
  const seen = [];
  c.harness.events.on("message_start", (e) => {
    if (e.message.role === "user")
      seen.push({
        start: e.message.hallviMessageId ?? null,
        requestsSoFar: c.requests.length,
      });
  });
  c.harness.events.on("message_end", (e) => {
    if (e.message.role === "user")
      seen.push({
        end: e.message.hallviMessageId ?? null,
        entryId: e.entryId,
        requestsSoFar: c.requests.length,
      });
  });
  let updates = 0;
  c.harness.events.on("message_update", () => updates++);
  const opId = "11111111-2222-4333-8444-555555555555";
  const admitted = await c.lane.accept(
    {
      kind: "prompt",
      operationId: opId,
      prompt: user("[tool] deploy", "row-c"),
    },
    ctx,
  );
  const again = await c.lane.accept(
    {
      kind: "prompt",
      operationId: opId,
      prompt: user("[tool] deploy", "row-c"),
    },
    ctx,
  );
  const busy = await c.lane.accept(
    { kind: "prompt", prompt: user("other", "row-d") },
    ctx,
  );
  const beforeDrive = {
    requests: [...c.requests],
    op: (await c.lane.inspectExecution(ctx)).current,
  };
  const driving = c.lane.drive({ operationId: opId }, ctx);
  await held(c.holds, 1);
  c.holds[0].release();
  const driven = await driving;
  note("C. accept/drive", {
    admitted: admitted.ok ? admitted.value : admitted.error,
    sameIdAgain: again.ok ? again.value : again.error,
    whileBusy: busy.ok ? busy.value : busy.error,
    beforeDrive,
    driven: driven.ok ? driven.value.kind : driven.error,
    seen,
    streamingUpdates: updates,
  });
}
process.exit(0);
