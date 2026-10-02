// Skeptic check of the two host-side controls from claim (2), past the first
// two requests the first probe showed: what the Codex request body looks like
// AFTER a reset() and AFTER a compaction, for
//   baseline (no control), A (beforeRequest collapse hook),
//   B (leading pi.system seeded at creation).
// No network: fetch/WebSocket throw; onPayload captures the body and throws.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { stream as codexStream } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { OPENAI_CODEX_MODELS } from "@earendil-works/pi-ai/providers/openai-codex.models";
import { collapseSystemMessages } from "@earendil-works/pi-ai/utils/transcript";
import {
  createRegistry,
  defineExtension,
  GenerationTask,
  Harness,
  hook,
  MemoryStorage,
  section,
  SystemEntry,
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
const sol = Object.values(OPENAI_CODEX_MODELS).find(
  (m) => m.id === "gpt-6.1-sol",
);
const fakeJwt = `x.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "probe" } })).toString("base64")}.x`;
const isSummary = (t) =>
  t.messages[0]?.role === "system" &&
  typeof t.messages[0].content === "string" &&
  t.messages[0].content.includes("summarization");

async function codexBody(messages) {
  let payload;
  const events = codexStream(
    sol,
    { messages: structuredClone(messages) },
    {
      apiKey: fakeJwt,
      onPayload: (body) => {
        payload = structuredClone(body);
        throw new Error("captured before sending");
      },
    },
  );
  await events.result();
  const developer = payload.input.filter(
    (m) => m.role === "developer" && typeof m.content === "string",
  ).length;
  return `instructions=${JSON.stringify(payload.instructions.slice(0, 40))} | developer prompt messages in input: ${developer} | first input item: ${payload.input[0].role}`;
}

async function scenario(label, { hooks, seed }) {
  hr(label);
  const chat = [];
  const faux = fauxProvider({
    models: [{ id: "tiny", contextWindow: 3000, maxTokens: 1000 }],
  });
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "hallvi",
      sections: [section("base", () => "HALLVI FIXED PROMPT", { tag: false })],
      hooks,
    }),
  );
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models,
      registry,
      settings: {
        compaction: {
          reserveTokens: 1000,
          keepRecentTokens: 400,
          backgroundTokens: 0,
        },
      },
    },
    context,
  );
  const root = await harness.root(context, {
    agent: { model: { provider: "faux", modelId: "tiny" } },
    init: seed
      ? async (tx, id) => {
          await tx.appendEntry(SystemEntry, id, {
            model: [
              {
                role: "system",
                content: "",
                sections: { base: "HALLVI FIXED PROMPT" },
                timestamp: Date.now(),
              },
            ],
          });
        }
      : undefined,
  });
  faux.setResponses(
    Array.from({ length: 40 }, () => (t) => {
      if (isSummary(t)) return fauxAssistantMessage("## Goal\nsummary");
      chat.push(structuredClone(t.messages));
      return fauxAssistantMessage(`answer ${"details ".repeat(200)}`);
    }),
  );
  const ask = async (q) =>
    (await root.submit({ type: "input", content: q }, context)).wait(context);
  await ask("q1");
  console.log(
    "request 1 (fresh conversation):      roles",
    JSON.stringify(chat.at(-1).map((m) => m.role)),
    "\n   codex:",
    await codexBody(chat.at(-1)),
  );
  await root.reset("Handoff: continue.", context);
  await harness.waitForIdle(context);
  await ask("q2");
  console.log(
    "first request after reset():         roles",
    JSON.stringify(chat.at(-1).map((m) => m.role)),
    "\n   codex:",
    await codexBody(chat.at(-1)),
  );
  for (const q of ["q3", "q4", "q5", "q6", "q7"]) await ask(q);
  const ctx = await root.context(context);
  console.log(
    `after 5 more long turns (head=${ctx.head?.kind}): roles`,
    JSON.stringify(chat.at(-1).map((m) => m.role)),
    "\n   codex:",
    await codexBody(chat.at(-1)),
  );
  await harness.close(context);
}

await scenario("baseline: no control", {});
await scenario("A. beforeRequest collapse hook", {
  hooks: [
    hook(GenerationTask, {
      beforeRequest: ({ messages }) => ({
        messages: collapseSystemMessages({ messages }).messages,
      }),
    }),
  ],
});
await scenario("B. leading pi.system seeded in root({ init })", { seed: true });
