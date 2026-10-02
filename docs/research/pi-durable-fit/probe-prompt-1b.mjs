// Part (1)/(2) follow-up: what pi-ai's REAL API modules would put on the wire
// for the transcript pi-durable produces.
// No network: `onPayload` captures the built request body and throws before any
// request is made; fetch and WebSocket are also replaced by functions that
// throw. The API keys are made-up strings.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { stream as anthropicStream } from "@earendil-works/pi-ai/api/anthropic-messages";
import { stream as codexStream } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { createModels } from "@earendil-works/pi-ai/models";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { OPENAI_CODEX_MODELS } from "@earendil-works/pi-ai/providers/openai-codex.models";
import { Type } from "@earendil-works/pi-ai";
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
  section,
} from "@earendil-works/pi-durable";

globalThis.fetch = () => {
  throw new Error("probe: network is disabled");
};
globalThis.WebSocket = class {
  constructor() {
    throw new Error("probe: network is disabled");
  }
};

const context = BACKGROUND_CONTEXT;
const hr = (title) => console.log(`\n===== ${title} =====`);

// 1. Produce a real pi-durable transcript with the faux provider: run 1 with
// prompt v1, run 2 with prompt v2.
const requests = [];
const faux = fauxProvider();
const capture = (text) => (transcript) => {
  requests.push(structuredClone(transcript.messages));
  return fauxAssistantMessage(text);
};
const models = createModels();
models.setProvider(faux.provider);
let release = "v1";
const registry = createRegistry();
registry.install(
  defineExtension({
    name: "hallvi",
    tools: [
      defineTool({
        name: "status",
        description: "Report status",
        parameters: Type.Object({}),
        execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
      }),
    ],
    sections: [
      section(
        "base",
        () => `FIXED PROMPT ${release}: you are Hallvi's operator.`,
        { tag: false },
      ),
      section("workspace", () => `state for ${release}`),
    ],
  }),
);
const harness = await Harness.open(
  new MemoryStorage(),
  { models, registry },
  context,
);
const root = await harness.root(context, {
  agent: { model: { provider: "faux", modelId: "faux-1" } },
});
faux.setResponses([capture("answer one"), capture("answer two")]);
await (
  await root.submit({ type: "input", content: "first question" }, context)
).wait(context);
release = "v2";
await (
  await root.submit({ type: "input", content: "second question" }, context)
).wait(context);
await harness.close(context);

const describe = (m) =>
  m.role === "system"
    ? `system sections=${JSON.stringify(Object.keys(m.sections ?? {}))} toolsAdded=${JSON.stringify((m.toolsAdded ?? []).map((t) => t.name))}`
    : m.role;
hr("transcript pi-durable hands the provider on request 1 and request 2");
console.log("request 1:", requests[0].map(describe));
console.log("request 2:", requests[1].map(describe));

// 2. Feed those exact transcripts to the real API modules and capture the
// request body.
class Captured extends Error {}
async function payloadOf(streamFn, model, messages, apiKey) {
  let payload;
  const events = streamFn(
    model,
    { messages: structuredClone(messages) },
    {
      apiKey,
      onPayload: (body) => {
        payload = structuredClone(body);
        throw new Captured("captured before sending");
      },
    },
  );
  const result = await events.result();
  if (payload === undefined)
    throw new Error(`no payload captured: ${result.errorMessage}`);
  return payload;
}
const short = (value) =>
  JSON.stringify(
    value,
    (_k, v) =>
      typeof v === "string" && v.length > 400 ? `${v.slice(0, 400)}…` : v,
    2,
  );

const fakeJwt = `x.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "probe" } })).toString("base64")}.x`;
const targets = [
  [
    "anthropic claude-opus-5-5 (supportsMidConvoSystemMessages: true)",
    anthropicStream,
    Object.values(ANTHROPIC_MODELS).find((m) => m.id === "claude-opus-5-5"),
    "sk-ant-api03-probe-not-a-key",
  ],
  [
    "anthropic claude-haiku (first model WITHOUT mid-conversation system support)",
    anthropicStream,
    Object.values(ANTHROPIC_MODELS).find(
      (m) => m.compat?.supportsMidConvoSystemMessages !== true,
    ),
    "sk-ant-api03-probe-not-a-key",
  ],
  [
    "openai-codex gpt-6.1-sol (supportsMidConvoSystemMessages: true)",
    codexStream,
    Object.values(OPENAI_CODEX_MODELS).find((m) => m.id === "gpt-6.1-sol"),
    fakeJwt,
  ],
];
for (const [label, fn, model, key] of targets) {
  if (model === undefined) {
    console.log(`\n${label}: model not found in catalog`);
    continue;
  }
  for (const [index, messages] of requests.entries()) {
    hr(`${label} [${model.id}] — wire body for request ${index + 1}`);
    const body = await payloadOf(fn, model, messages, key);
    if ("messages" in body) {
      console.log("system:", short(body.system));
      console.log(
        "tools:",
        (body.tools ?? []).map((t) => t.name),
      );
      console.log("messages:", short(body.messages));
    } else {
      console.log("instructions:", JSON.stringify(body.instructions));
      console.log(
        "tools:",
        (body.tools ?? []).map((t) => t.name ?? t.type),
      );
      console.log("input:", short(body.input));
    }
  }
}
