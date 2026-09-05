import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  type Api,
  type AssistantMessage,
  type Context,
  type Message,
  type Model,
} from "@earendil-works/pi-ai";
import { transformMessages } from "@earendil-works/pi-ai/api/transform-messages";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "server-guy-sdk-regression-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function answer(model: Model<Api>, text: string, input = 10): AssistantMessage {
  return {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [{ type: "text", text }],
    stopReason: "stop",
    timestamp: Date.now(),
    usage: {
      input,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: input + 1,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

async function syntheticSession(compact: boolean) {
  const requests: Array<{
    systemPrompt: string | undefined;
    messages: Message[];
  }> = [];
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    modelsStorePath: join(root, "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  modelRuntime.registerProvider("server-guy-sdk-test", {
    api: "server-guy-sdk-test",
    apiKey: "SYNTHETIC-NO-NETWORK",
    baseUrl: "https://invalid.test",
    streamSimple: (model, context: Context) => {
      const stream = createAssistantMessageEventStream();
      // Exercise the same installed conversion used by the real provider
      // adapters, then produce deterministic output without a network request.
      requests.push({
        systemPrompt: context.systemPrompt,
        messages: transformMessages(context.messages, model),
      });
      const message = answer(
        model,
        context.systemPrompt?.includes("Stable test instructions")
          ? "No historical tool was executed."
          : "Earlier proposals were pending and were not saved.",
      );
      stream.push({ type: "start", partial: message });
      stream.push({ type: "done", reason: "stop", message });
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
  const model = modelRuntime.getModel("server-guy-sdk-test", "synthetic")!;
  const sessionPath = join(root, "chat.jsonl");
  writeFileSync(sessionPath, "", { mode: 0o600 });
  const manager = SessionManager.open(sessionPath, root, root);
  const settingsManager = SettingsManager.inMemory({
    compaction: {
      enabled: compact,
      reserveTokens: 2_048,
      keepRecentTokens: 1_024,
    },
  });
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    settingsManager,
    systemPromptOverride: () => "Stable test instructions",
    appendSystemPromptOverride: () => [],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    noContextFiles: true,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  const execute = vi.fn(async () => ({
    content: [{ type: "text" as const, text: "pending" }],
    details: {},
  }));
  const create = () =>
    createAgentSession({
      cwd: root,
      agentDir: root,
      model,
      modelRuntime,
      sessionManager: manager,
      settingsManager,
      resourceLoader: loader,
      noTools: "all",
      tools: ["propose_decision"],
      customTools: [
        {
          name: "propose_decision",
          label: "Proposal",
          description: "Synthetic scoped tool",
          parameters: Type.Object({ value: Type.String() }),
          execute,
        },
      ],
    });
  return { manager, model, requests, execute, create };
}

it("restores orphaned tool calls and aborted messages through actual SDK/provider conversion without replaying effects", async () => {
  const { manager, model, requests, execute, create } =
    await syntheticSession(false);
  manager.appendMessage({
    role: "user",
    content: "Remember the attempted proposal",
    timestamp: 1,
  });
  manager.appendMessage({
    ...answer(model, ""),
    stopReason: "toolUse",
    content: [
      {
        type: "toolCall",
        id: "orphaned-call",
        name: "propose_decision",
        arguments: { value: "Never replay this" },
      },
    ],
  });
  manager.appendMessage({
    ...answer(model, "Aborted answer must not be replayed"),
    stopReason: "aborted",
  });
  manager.appendMessage({
    ...answer(model, "Errored answer must not be replayed"),
    stopReason: "error",
  });
  manager.appendCustomMessageEntry(
    "server-guy-run",
    "Previous attempt: interrupted. Its proposals were pending, not saved; none were committed.",
    false,
  );
  const { session } = await create();
  try {
    await session.prompt("What was saved?", {
      expandPromptTemplates: false,
      source: "rpc",
    });
    await session.waitForIdle();
    expect(requests).toHaveLength(1);
    const restored = requests[0].messages;
    expect(restored).toContainEqual(
      expect.objectContaining({
        role: "toolResult",
        toolCallId: "orphaned-call",
        toolName: "propose_decision",
        isError: true,
      }),
    );
    const text = JSON.stringify(restored);
    expect(text).not.toContain("Aborted answer must not be replayed");
    expect(text).not.toContain("Errored answer must not be replayed");
    expect(text).toContain("none were committed");
    expect(execute).not.toHaveBeenCalled();
    expect(
      manager
        .getEntries()
        .filter(
          (entry) =>
            entry.type === "message" && entry.message.role === "toolResult",
        ),
    ).toEqual([]);
  } finally {
    session.dispose();
  }
});

it("persists custom Run context before real auto-compaction and keeps updated outcome data in the following model request", async () => {
  const { manager, model, requests, create } = await syntheticSession(true);
  manager.appendCustomMessageEntry(
    "earlier-attempt",
    "Earlier proposal: pending, not saved. The attempt was cancelled.",
    false,
  );
  for (let index = 0; index < 12; index++) {
    manager.appendMessage({
      role: "user",
      content: `Older question ${index} ${"historical text ".repeat(180)}`,
      timestamp: index + 1,
    });
    manager.appendMessage(
      answer(model, `Older answer ${index}`, index === 11 ? 7_900 : 10),
    );
  }
  const { session } = await create();
  const latest =
    "Observed now: previous attempt cancelled; none of its proposals were committed. Current checks changed.";
  let customWasPresentAtCompaction = false;
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "compaction_start")
      customWasPresentAtCompaction = manager
        .getEntries()
        .some(
          (entry) =>
            entry.type === "custom_message" && entry.content === latest,
        );
  });
  try {
    await session.sendCustomMessage(
      { customType: "server-guy-run", content: latest, display: false },
      { triggerTurn: false },
    );
    expect(requests).toHaveLength(0);
    await session.prompt("What is saved after compaction?", {
      expandPromptTemplates: false,
      source: "rpc",
    });
    await session.waitForIdle();
    expect(customWasPresentAtCompaction).toBe(true);
    expect(
      manager.getEntries().some((entry) => entry.type === "compaction"),
    ).toBe(true);
    expect(requests.length).toBeGreaterThanOrEqual(2);
    const regular = requests.findLast((request) =>
      request.systemPrompt?.includes("Stable test instructions"),
    )!;
    expect(JSON.stringify(regular.messages)).toContain(latest);
    expect(JSON.stringify(regular.messages)).toContain(
      "Earlier proposals were pending and were not saved",
    );
    const reopened = SessionManager.open(manager.getSessionFile()!, root, root);
    expect(reopened.getSessionId()).toBe(manager.getSessionId());
    expect(
      reopened.getEntries().some((entry) => entry.type === "compaction"),
    ).toBe(true);
  } finally {
    unsubscribe();
    session.dispose();
  }
});
