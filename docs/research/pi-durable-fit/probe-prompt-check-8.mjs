// Check of a risk raised in review: session affinity. Pi 0.99.1's AgentHarness
// passes `sessionId` on every request (pi-agent-core
// dist/harness/runtime/drive/generation.js:136). Does pi-durable 1.0.0 pass
// one, and what does the Codex request body lose without it? No network:
// fetch/WebSocket throw; onPayload captures the body and throws.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { stream as codexStream } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { OPENAI_CODEX_MODELS } from "@earendil-works/pi-ai/providers/openai-codex.models";
import {
  createRegistry,
  Harness,
  MemoryStorage,
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
const sol = Object.values(OPENAI_CODEX_MODELS).find(
  (m) => m.id === "gpt-6.1-sol",
);
const fakeJwt = `x.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "probe" } })).toString("base64")}.x`;

async function optionsSeen(settings) {
  const seen = [];
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry: createRegistry(), settings },
    context,
  );
  const model = { provider: "faux", modelId: "faux-1" };
  const a = await harness.root(context, { agent: { model } });
  const b = await harness.createConversation(
    { ownership: { kind: "ownerless" }, agent: { model } },
    context,
  );
  faux.setResponses(
    Array.from({ length: 2 }, () => (_t, options) => {
      seen.push(
        Object.fromEntries(
          Object.entries(options ?? {}).filter(
            ([k, v]) => k !== "signal" && v !== undefined,
          ),
        ),
      );
      return fauxAssistantMessage("ok");
    }),
  );
  await (
    await a.submit({ type: "input", content: "from A" }, context)
  ).wait(context);
  await (
    await b.submit({ type: "input", content: "from B" }, context)
  ).wait(context);
  await harness.close(context);
  return seen;
}
console.log(
  "options pi-durable passes to the provider, default settings (conversation A, B):",
  JSON.stringify(await optionsSeen(undefined)),
);
console.log(
  "with settings.stream = { sessionId: 'host-wide' } (not a typed field; the object is spread through):",
  JSON.stringify(await optionsSeen({ stream: { sessionId: "host-wide" } })),
);

async function body(options) {
  let payload;
  const events = codexStream(
    sol,
    { messages: [{ role: "user", content: "hi", timestamp: 0 }] },
    {
      apiKey: fakeJwt,
      ...options,
      onPayload: (b) => {
        payload = structuredClone(b);
        throw new Error("captured before sending");
      },
    },
  );
  await events.result();
  return payload;
}
console.log(
  "codex body WITHOUT sessionId: prompt_cache_key =",
  JSON.stringify((await body({})).prompt_cache_key),
);
console.log(
  "codex body WITH sessionId 'conv-1': prompt_cache_key =",
  JSON.stringify((await body({ sessionId: "conv-1" })).prompt_cache_key),
);
