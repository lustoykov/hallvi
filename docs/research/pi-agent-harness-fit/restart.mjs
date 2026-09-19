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

const crash = JSON.parse(
  readFileSync(new URL("./crash.json", import.meta.url), "utf8"),
);
const root = crash.root;
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
    requests.push(
      last.role === "user"
        ? said
        : `<${last.role} isError=${last.isError}: ${text(last).slice(0, 160)}>`,
    );
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

// 5. A new process opens the same session after the crash.
const e = await open(repo, crash.metadata);
const before = (await e.lane.watch(ctx)).snapshot;
note("4b. after restart, before doing anything", {
  openOperationsReportedByCreate: e.openOperations,
  operation: before.operation && {
    kind: before.operation.kind,
    status: before.operation.status,
  },
  queuesRestored: before.queues.map((q) => `${q.kind}:${q.entryId}`),
  queuedIdSurvived: before.queues.some((q) => q.entryId === crash.queued),
  toolRunsInThisProcessSoFar: e.ran.length,
  modelRequestsSoFar: e.requests,
});
// Does anything run by itself? Give it a moment.
await new Promise((r) => setTimeout(r, 300));
note("4c. left alone for 300ms", {
  toolRunsInThisProcess: e.ran.length,
  modelRequests: e.requests,
});
const mode = process.argv[2];
if (mode === "resume") {
  const resumed = await e.lane.resume(ctx);
  note("4d. resume()", {
    resumed: resumed.ok ? resumed.value.status : resumed.error,
    toolRunsInThisProcess: e.ran.length,
    toolRanBeforeCrash: crash.ranBefore,
    whatTheModelWasShown: e.requests,
  });
} else {
  const aborted = await e.lane.abort(ctx);
  await e.lane.waitForIdle(ctx);
  const after = (await e.lane.watch(ctx)).snapshot;
  const cancelAfter = await e.lane.cancelQueued(crash.queued, ctx);
  note("4e. abort the restored operation instead", {
    abortOk: aborted.ok,
    error: aborted.ok ? undefined : aborted.error,
    returned: aborted.ok && {
      steer: aborted.value.steer.map(text),
      followUp: aborted.value.followUp.map(text),
    },
    operationAfter: after.operation,
    lastResult: after.lastResult?.status,
    queuesAfter: after.queues.map((q) => q.kind),
    toolRunsInThisProcess: e.ran.length,
    modelRequests: e.requests,
    cancelQueuedAfterwards: cancelAfter.ok
      ? cancelAfter.value
      : cancelAfter.error,
  });
  // The lane is usable again.
  const next = await e.lane.prompt("what happened?", undefined, ctx);
  note("4f. next prompt after aborting the restored operation", {
    status: next.ok ? next.value.status : next.error,
    whatTheModelWasShown: e.requests,
  });
}
process.exit(0);
