import { AgentHarness, BACKGROUND_CONTEXT as ctx, JsonlSessionRepo, reduceLaneSnapshot } from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { createModels } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai/providers/faux";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "own-"));
const text = (m) => typeof m.content === "string" ? m.content : m.content.map((p) => p.type === "text" ? p.text : "").join("");
function scripted() {
  const faux = fauxProvider();
  faux.setResponses(Array.from({ length: 50 }, () => (c) => fauxAssistantMessage(fauxText(`reply: ${text(c.messages.at(-1))}`))));
  const models = createModels(); models.setProvider(faux.provider);
  return { models, model: faux.getModel() };
}
const repo = new JsonlSessionRepo({ fileSystem: new NodeExecutionEnv({ cwd: root }), sessionsRoot: join(root, "s") });
let id;
async function open() {
  const session = id ? await repo.open((await repo.list({ cwd: root }, ctx)).find((s) => s.id === id) ?? id, ctx) : await repo.create({ cwd: root }, ctx);
  const m = scripted();
  const made = await AgentHarness.create({ session, ...m, systemPrompt: "x", tools: [], followUpMode: "one-at-a-time", steeringMode: "one-at-a-time" }, ctx);
  return { ...made, lane: await made.harness.lane("main", ctx), session };
}
const user = (body, tag) => ({ role: "user", content: [{ type: "text", text: body }], timestamp: Date.now(), hallviMessageId: tag });
const brief = (s) => ({ transcript: s.transcript.map((e) => `${e.type}:${e.id.slice(0, 6)}:${e.message ? e.message.role + ":" + text(e.message).slice(0, 30) + ":" + (e.message.hallviMessageId ?? "") : ""}`), operation: s.operation && { id: s.operation.id, status: s.operation.status }, queues: s.queues.map((q) => `${q.kind}:${q.entryId.slice(0, 6)}:${text(q.message)}`) });

// 1. accept without drive, then "restart"
let h = await open();
console.log("session keys", Object.keys(h.session), h.session.id ?? h.session.metadata);
const s0 = await repo.list({ cwd: root }, ctx); console.log("list", JSON.stringify(s0).slice(0, 300));
id = s0[0].id;
console.log("accept", JSON.stringify(await h.lane.accept({ kind: "prompt", operationId: "m1", prompt: user("first", "m1") }, ctx)));
let w = await h.lane.watch(ctx); console.log("after accept", brief(w.snapshot)); w.unsubscribe();
await h.harness.close(ctx);
h = await open();
console.log("open ops", h.open);
w = await h.lane.watch(ctx); console.log("restored", JSON.stringify(brief(w.snapshot))); 
// does re-accept with same id duplicate?
console.log("re-accept", JSON.stringify(await h.lane.accept({ kind: "prompt", operationId: "m1", prompt: user("first", "m1") }, ctx)).slice(0, 200));
// queue a follow-up on the open (undriven) operation
console.log("followUp on open op", JSON.stringify(await h.lane.followUp(user("second", "m2"), undefined, ctx)));
w.start((e) => { const r = reduceLaneSnapshot(w.snapshot, e); if (r) console.log("reduction", r); });
const r = await h.lane.resume(ctx); console.log("resume", r.ok && r.value.status);
console.log("after resume (reduced)", JSON.stringify(brief(w.snapshot)));
console.log("fresh", JSON.stringify(brief(await w.resnapshot(ctx))));
// 2. idle lane follow-up then empty prompt
const q = await h.lane.followUp(user("third", "m3"), undefined, ctx); console.log("idle followUp", JSON.stringify(q));
console.log("idle state", JSON.stringify(brief(await w.resnapshot(ctx))));
console.log("empty accept", JSON.stringify(await h.lane.accept({ kind: "prompt", operationId: "sweep-1", prompt: [] }, ctx)).slice(0, 200));
console.log("drive", JSON.stringify(await h.lane.drive({ operationId: "sweep-1", waitForRetry: true }, ctx)).slice(0, 200));
console.log("after sweep", JSON.stringify(brief(await w.resnapshot(ctx))));
// 3. idle abort with queue
await h.lane.followUp(user("fourth", "m4"), undefined, ctx);
console.log("abort idle", JSON.stringify(await h.lane.abort(ctx)).slice(0, 300));
console.log("after abort", JSON.stringify(brief(await w.resnapshot(ctx))));
// 4. accept, restart, abort without driving
await h.lane.accept({ kind: "prompt", operationId: "m5", prompt: user("fifth", "m5") }, ctx);
await h.harness.close(ctx); h = await open();
console.log("abort open op", JSON.stringify(await h.lane.abort(ctx)).slice(0, 300));
w = await h.lane.watch(ctx); console.log("after abort open", JSON.stringify(brief(w.snapshot)));
console.log("result m5", JSON.stringify(await h.lane.getResult("m5", ctx)), "result m1", JSON.stringify(await h.lane.getResult("m1", ctx)).slice(0,200));
await h.harness.close(ctx);
