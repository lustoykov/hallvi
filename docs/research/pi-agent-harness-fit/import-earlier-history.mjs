import {
  JsonlSessionRepo,
  BACKGROUND_CONTEXT as ctx,
  AgentHarness,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/harness/env/nodejs";
import { createModels } from "@earendil-works/pi-ai";
import {
  fauxProvider,
  fauxAssistantMessage,
} from "@earendil-works/pi-ai/providers/faux";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
const path = process.argv[2];
const first = (p) => JSON.parse(readFileSync(p, "utf8").split("\n")[0]);
const header = first(path);
const repo = new JsonlSessionRepo({
  fileSystem: new NodeExecutionEnv({ cwd: dirname(path) }),
  sessionsRoot: dirname(path),
});
const session = await repo.open(
  {
    id: header.id,
    createdAt: Date.parse(header.timestamp),
    storageVersion: 1,
    cwd: header.cwd,
    path,
    modifiedAt: statSync(path).mtimeMs,
  },
  ctx,
);
const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);
let seen;
faux.setResponses([
  (context) => {
    seen = context.messages.length;
    return fauxAssistantMessage("ok");
  },
]);
const { harness, open } = await AgentHarness.create(
  { session, models, model: faux.getModel(), systemPrompt: "x", tools: [] },
  ctx,
);
const lane = await harness.lane("main", ctx);
const m = faux.getModel();
await lane.setModel({ provider: m.provider, modelId: m.id }, ctx);
const before = (await lane.findEntries(undefined, ctx)).length;
const result = await lane.prompt("what did we do?", undefined, ctx);
await harness.close(ctx);
await repo.close(ctx);
console.log({
  openOps: open.length,
  entriesBefore: before,
  run: result.ok ? result.value.status : result.error,
  error: result.ok ? result.value.error : undefined,
  priorMessagesTheModelSaw: seen,
  headerAfter: first(path),
  files: readdirSync(dirname(path)),
});
process.exit(0);
