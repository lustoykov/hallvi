// Can published Pi 0.85.1 exports be composed with AgentHarness so that tools,
// authentication and compaction stay Pi's? Nothing here is Hallvi code.
import {
  createGrepToolDefinition,
  createReadToolDefinition,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The copy of agent-core and pi-ai that coding-agent itself ships with
// (it is ESM-only, so it is addressed by path rather than require.resolve).
const nestedRoot = new URL(
  "./node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/",
  import.meta.url,
);
const core = await import(new URL("pi-agent-core/dist/index.js", nestedRoot));
const coreNode = await import(
  new URL("pi-agent-core/dist/harness/env/nodejs.js", nestedRoot)
);
const ai = await import(new URL("pi-ai/dist/index.js", nestedRoot));
const { AgentHarness, JsonlSessionRepo, BACKGROUND_CONTEXT: ctx } = core;

const root = mkdtempSync(join(tmpdir(), "hallvi-compose-"));
const note = (key, value) =>
  console.log(`\n## ${key}\n${JSON.stringify(value, null, 2)}`);
const text = (m) =>
  typeof m.content === "string"
    ? m.content
    : m.content.map((p) => (p.type === "text" ? p.text : "")).join("");

// ---- Authentication: coding-agent's ModelRuntime, as Hallvi builds it today,
// over a credential file holding an expired OAuth token.
const authPath = join(root, "auth.json");
writeFileSync(
  authPath,
  JSON.stringify({
    "compose-test": {
      type: "oauth",
      access: "access-1",
      refresh: "refresh-1",
      expires: Date.now() - 1_000,
    },
  }),
  { mode: 0o600 },
);
const refreshes = [];
const keysSeenByProvider = [];
const requests = [];
let bigReply = false;
const modelRuntime = await ModelRuntime.create({
  authPath,
  modelsPath: null,
  modelsStorePath: join(root, "models.json"),
  refreshOnCreate: false,
  allowModelNetwork: false,
});
const usage = (input) => ({
  input,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input + 1,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});
modelRuntime.registerProvider("compose-test", {
  api: "compose-test",
  baseUrl: "https://invalid.test",
  oauth: {
    name: "Compose",
    isSubscription: true,
    login: async () => {
      throw new Error("not used");
    },
    async refreshToken(credentials) {
      refreshes.push(credentials.refresh);
      return {
        access: "access-2",
        refresh: "refresh-2",
        expires: Date.now() + 3_600_000,
      };
    },
    getApiKey: (credentials) => credentials.access,
  },
  streamSimple: (model, context, options) => {
    keysSeenByProvider.push(options?.apiKey);
    const stream = ai.createAssistantMessageEventStream();
    const last = context.messages.at(-1);
    const said = last.role === "user" ? text(last) : "";
    requests.push(
      context.systemPrompt?.includes("summar") || said.includes("summar")
        ? "<compaction request>"
        : last.role === "user"
          ? said
          : `<${last.role}: ${text(last).slice(0, 60)}>`,
    );
    const call = (name, args) => ({
      type: "toolCall",
      id: `call-${requests.length}`,
      name,
      arguments: args,
    });
    const content = said.includes("[read]")
      ? [call("read", { path: "notes.txt" })]
      : said.includes("[grep]")
        ? [call("grep", { pattern: "needle" })]
        : [
            {
              type: "text",
              text: last.role === "user" ? `reply: ${said}` : "finished",
            },
          ];
    const message = {
      role: "assistant",
      api: model.api,
      provider: model.provider,
      model: model.id,
      content,
      stopReason: content[0].type === "toolCall" ? "toolUse" : "stop",
      timestamp: Date.now(),
      usage: usage(bigReply ? 7_900 : 10),
    };
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: message.stopReason, message });
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
const model = modelRuntime.getModel("compose-test", "synthetic");

// ---- Tools. (a) agent-core's own read tool over an ExecutionEnv that is not
// the local disk: what a container-backed workspace would implement.
class RecordingEnv extends coreNode.NodeExecutionEnv {
  calls = [];
  async readTextFile(path, context) {
    this.calls.push(`readTextFile ${path}`);
    return super.readTextFile(path, context);
  }
  async readTextLines(path, options, context) {
    this.calls.push(`readTextLines ${path}`);
    return super.readTextLines(path, options, context);
  }
  async readBinaryFile(path, context) {
    this.calls.push(`readBinaryFile ${path}`);
    return super.readBinaryFile(path, context);
  }
}
writeFileSync(join(root, "notes.txt"), "the needle is here\n");
const env = new RecordingEnv({ cwd: root });

// (b) a coding-agent tool definition Hallvi uses today and agent-core does not
// ship (grep), with its execute replaced the way piWorkspaceTools already does.
const grepDefinition = createGrepToolDefinition(root);
const delegated = [];
const grepForHarness = {
  name: grepDefinition.name,
  label: grepDefinition.label,
  description: grepDefinition.description,
  parameters: grepDefinition.parameters,
  async execute(
    toolCallId,
    params,
    onUpdate,
    _toolContext,
    _invocation,
    context,
  ) {
    delegated.push({
      toolCallId,
      params,
      hasAbortSignal: Boolean(context.abortSignal),
    });
    // Hallvi: workspace.execute("grep", toolCallId, params, context.abortSignal, onUpdate)
    return {
      content: [{ type: "text", text: "notes.txt:1: the needle is here" }],
      details: {},
    };
  },
};
const readDefinition = createReadToolDefinition(root);

const repo = new JsonlSessionRepo({
  fileSystem: new coreNode.NodeExecutionEnv({ cwd: root }),
  sessionsRoot: join(root, "sessions"),
});
const session = await repo.create({ cwd: root }, ctx);
const { harness } = await AgentHarness.create(
  {
    session,
    models: modelRuntime,
    model,
    systemPrompt: "Stable test instructions",
    tools: [core.createReadTool(), grepForHarness],
    toolContext: { env },
    compaction: {
      enabled: true,
      reserveTokens: 2_048,
      keepRecentTokens: 1_024,
    },
  },
  ctx,
);
const lane = await harness.lane("main", ctx);
const compactions = [];
harness.events.on("compaction_end", (e) =>
  compactions.push({ reason: e.reason, status: e.status }),
);

const first = await lane.prompt("[read] the notes", undefined, ctx);
note("authentication through ModelRuntime passed as `models`", {
  runStatus: first.ok ? first.value.status : first.error,
  refreshTokenCalls: refreshes,
  apiKeyTheProviderReceived: [...new Set(keysSeenByProvider)],
  credentialFileNow: JSON.parse(readFileSync(authPath, "utf8"))["compose-test"]
    .refresh,
});
note("agent-core read tool over a custom ExecutionEnv", {
  envCalls: env.calls,
  whatTheModelSawNext: requests[1],
});
const second = await lane.prompt("[grep] for it", undefined, ctx);
note("coding-agent grep definition with a delegated execute", {
  runStatus: second.ok ? second.value.status : second.error,
  delegated,
  whatTheModelSawNext: requests.at(-1),
  definitionFieldsHarnessHasNoSlotFor: Object.keys(readDefinition).filter(
    (key) =>
      !["name", "label", "description", "parameters", "execute"].includes(key),
  ),
});

// ---- Compaction: fill the context, then prompt again.
bigReply = true;
for (let i = 0; i < 3; i++)
  await lane.prompt(
    `question ${i} ${"historical text ".repeat(300)}`,
    undefined,
    ctx,
  );
bigReply = false;
const after = await lane.prompt("and now?", undefined, ctx);
const entries = await lane.findEntries(undefined, ctx);
note("compaction owned by the harness", {
  runStatus: after.ok ? after.value.status : after.error,
  compactions,
  compactionEntriesInHistory: entries.filter((e) => e.type === "compaction")
    .length,
  compactionRequestsWentThroughTheSameAuth: requests.includes(
    "<compaction request>",
  ),
});
await harness.close(ctx);
process.exit(0);
