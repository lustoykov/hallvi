import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PiDecision, PiRun } from "../../../src/server/types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  configure: vi.fn(),
  loader: vi.fn(),
  open: vi.fn(),
  collect: vi.fn(),
  search: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: mocks.create,
  defineTool: <T>(tool: T) => tool,
  DefaultResourceLoader: class {
    constructor(options: unknown) {
      mocks.loader(options);
    }
    async reload() {}
  },
  SettingsManager: { inMemory: () => ({ isolated: true }) },
}));
vi.mock("../../../src/server/operation-tools", () => ({
  operationContext: () => [],
  proposeAgentChange: vi.fn(),
  recordLocalInspection: vi.fn(),
}));
vi.mock("../../../src/server/pi-configuration", () => ({
  configuredPiRuntime: mocks.configure,
}));
vi.mock("../../../src/server/pi-sessions", () => ({
  openNativeChatSession: mocks.open,
}));
vi.mock("../../../src/server/pi-decisions", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi-decisions")>()),
  collectPiDecisionProposal: mocks.collect,
  searchPiDecisions: mocks.search,
}));
vi.mock("../../../src/server/pi-status", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi-status")>()),
  readPiApplicationStatus: mocks.status,
}));

import {
  askPi,
  describePiFailure,
  normalizePiAssistantMessage,
  SYSTEM_PROMPT,
} from "../../../src/server/pi";
import {
  proposeDecisionParameters,
  searchDecisionParameters,
} from "../../../src/server/pi-decisions";
import { applicationStatusParameters } from "../../../src/server/pi-status";

const model = {
  provider: "openai-codex",
  id: "gpt-5.6-sol",
  name: "GPT-5.6 Sol",
};
const run: PiRun = {
  id: "run-a",
  applicationId: "app-a",
  workspaceId: "workspace-a",
  chatId: "chat-a",
  userMessageId: "user-a",
  assistantMessageId: "answer-a",
  requestKey: "request-a",
  retryOfId: null,
  status: "running",
  revision: 1,
  error: null,
  piCalls: 0,
  createdAt: "2026-09-05",
  startedAt: "2026-09-05",
  finishedAt: null,
};
const input = {
  run,
  userMessage: "Hello",
  runContext: '{"runId":"run-a","previousAttempt":null}',
};
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function fakeSession(text = "Done.") {
  let listener: ((event: AgentSessionEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const messages = [
    {
      role: "assistant",
      content: [{ type: "text", text }],
      stopReason: "stop",
    },
  ];
  const finish = (message = messages[0]) =>
    listener?.({ type: "message_end", message } as AgentSessionEvent);
  return {
    messages,
    finish,
    subscribe: vi.fn((callback: (event: AgentSessionEvent) => void) => {
      listener = callback;
      return unsubscribe;
    }),
    emit: (event: AgentSessionEvent) => listener?.(event),
    unsubscribe,
    sendCustomMessage: vi.fn().mockResolvedValue(undefined),
    prompt: vi.fn(async () => finish()),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    abortCompaction: vi.fn(),
    dispose: vi.fn(),
  };
}
type Tool = {
  name: string;
  parameters: unknown;
  constrainedSampling?: unknown;
  execute: (
    id: string,
    params: unknown,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
};
type Options = {
  tools: string[];
  customTools: Tool[];
  sessionManager: unknown;
  model: unknown;
  thinkingLevel: string;
};
let session: ReturnType<typeof fakeSession>;
let handles: Array<{
  sessionManager: { getSessionFile: () => string };
  release: ReturnType<typeof vi.fn>;
}>;
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  handles = [];
  session = fakeSession();
  mocks.open.mockImplementation(
    async (_applicationId: string, chatId: string) => {
      const handle = {
        sessionManager: {
          getSessionFile: () =>
            `/private/server-guy/pi-sessions/app/${chatId}.jsonl`,
        },
        release: vi.fn(),
      };
      handles.push(handle);
      return handle;
    },
  );
  mocks.configure.mockResolvedValue({
    configuration: { reasoningEffort: "high" },
    model,
    modelRuntime: {},
  });
  mocks.create.mockResolvedValue({ session });
  mocks.collect.mockImplementation(
    (_app: string, proposals: PiDecision[], proposal: PiDecision) => {
      const normalized = { ...proposal, value: proposal.value.trim() };
      proposals.push(normalized);
      return normalized;
    },
  );
  mocks.search.mockImplementation((_app: string, proposals: PiDecision[]) => ({
    records: [],
    nextOffset: null,
    activeCount: 0,
    pendingCount: proposals.length,
  }));
  mocks.status.mockImplementation((applicationId: string, chatId: string) => {
    const status = {
      retrievedAt: "2026-09-06T12:00:00.000Z",
      application: { id: applicationId },
      chatId,
    };
    return { status, text: JSON.stringify(status) };
  });
});

describe("assistant output and errors", () => {
  it("balances built-in goals without requiring users to choose priorities", () => {
    expect(SYSTEM_PROMPT).toContain("Balance these goals by default");
    expect(SYSTEM_PROMPT).toContain("do not ask the engineer to rank them");
    expect(SYSTEM_PROMPT).toContain("They are optional");
    expect(SYSTEM_PROMPT).toContain("Recommend one sensible course of action");
    expect(SYSTEM_PROMPT).toContain(
      "Do not turn onboarding into a questionnaire",
    );
    expect(SYSTEM_PROMPT).toContain("Do not save the default goals themselves");
    expect(SYSTEM_PROMPT).toContain("at most €30/month");
    expect(SYSTEM_PROMPT).toContain("Customer data must stay in the EU");
    expect(SYSTEM_PROMPT).not.toContain("durable launch priority");
  });

  it("confirms successful saves without leaking persistence mechanics or hiding failed proposals", () => {
    expect(SYSTEM_PROMPT).toContain(
      "Write the final answer for successful completion",
    );
    expect(SYSTEM_PROMPT).toContain(
      "Saved: your hosting budget is at most €30 per month.",
    );
    expect(SYSTEM_PROMPT).toContain(
      "Do not expose Runs, staged proposals, pending saves",
    );
    expect(SYSTEM_PROMPT).toContain("Do not ask for another confirmation");
    expect(SYSTEM_PROMPT).toContain(
      "never claim a rejected proposal was saved",
    );
    expect(SYSTEM_PROMPT).toContain(
      "Never claim a failed or cancelled request saved a requirement",
    );
  });

  it("reads current application state through the scoped tool instead of an injected summary", () => {
    expect(SYSTEM_PROMPT).toContain("it carries no application state");
    expect(SYSTEM_PROMPT).toContain(
      "call get_application_status in the current request",
    );
    expect(SYSTEM_PROMPT).toContain("historical and may be outdated");
    expect(SYSTEM_PROMPT).toContain("need no status lookup");
    expect(SYSTEM_PROMPT).toContain("some questions need both");
    expect(SYSTEM_PROMPT).toContain(
      "say that current status could not be retrieved",
    );
    expect(SYSTEM_PROMPT).not.toContain("supplies current application checks");
  });

  it("separates reading records from observing GitHub and readiness from deployment", () => {
    expect(SYSTEM_PROMPT).toContain("reads local records at retrievedAt");
    expect(SYSTEM_PROMPT).toContain("observed at its own observedAt");
    expect(SYSTEM_PROMPT).toContain(
      "Reading does not recheck GitHub, renew evidence or verify anything",
    );
    expect(SYSTEM_PROMPT).toContain("Re-run repository check");
    expect(SYSTEM_PROMPT).toContain(
      "not code review, passing tests, deployability or continuing access",
    );
    expect(SYSTEM_PROMPT).toContain(
      "say deployment has not been verified here",
    );
    expect(SYSTEM_PROMPT).toContain(
      "product rules for later phases, not observations",
    );
  });

  it("normalizes conversational text and rejects empty or oversized output", () => {
    expect(normalizePiAssistantMessage("  Looks good.  ")).toBe("Looks good.");
    expect(() => normalizePiAssistantMessage("   ")).toThrow(
      "no user-facing message",
    );
    expect(() => normalizePiAssistantMessage("x".repeat(10_001))).toThrow(
      "longer than 10,000",
    );
  });
  it("explains limits and authentication without exposing provider payloads", () => {
    expect(describePiFailure(new Error("status 429: usage limit"))).toContain(
      "usage or rate limit",
    );
    expect(
      describePiFailure(new Error("Provider is not configured")),
    ).toContain("ChatGPT authentication");
    expect(
      describePiFailure(new Error("Secret bearer token: do-not-publish")),
    ).not.toContain("do-not-publish");
  });
  it.each(["error", "aborted", "toolUse"])(
    "does not accept an assistant with stopReason %s",
    async (reason) => {
      session.messages[0].stopReason = reason;
      await expect(askPi(input)).rejects.toThrow("could not reach");
      expect(handles[0].release).toHaveBeenCalledOnce();
    },
  );
  it.each([false, true])(
    "never accepts an old successful answer after current overflow recovery ends without a new answer (compaction failure: %s)",
    async (compactionFails) => {
      session.messages[0].content[0].text = "Old successful answer";
      session.prompt.mockImplementation(async () => {
        session.finish({
          role: "assistant",
          content: [{ type: "text", text: "" }],
          stopReason: "error",
        });
        // The SDK removes this failed assistant from session.messages before
        // trying overflow compaction. It can resolve without retrying when no
        // compaction is possible, or when summarization fails.
        if (compactionFails) {
          session.emit({
            type: "compaction_start",
            reason: "overflow",
          } as AgentSessionEvent);
          session.emit({
            type: "compaction_end",
            reason: "overflow",
            result: undefined,
            aborted: false,
            willRetry: false,
            errorMessage: "Context overflow recovery failed",
          } as AgentSessionEvent);
        }
      });
      await expect(askPi(input)).rejects.toThrow("could not reach");
      expect(handles[0].release).toHaveBeenCalledOnce();
    },
  );
  it("requires a current completion event even when history ends in success", async () => {
    session.prompt.mockResolvedValue(undefined);
    await expect(askPi(input)).rejects.toThrow("could not reach");
  });
  it("uses the current successful retry after a failed assistant event", async () => {
    session.prompt.mockImplementation(async () => {
      session.finish({
        role: "assistant",
        content: [{ type: "text", text: "Failed response" }],
        stopReason: "error",
      });
      session.finish({
        role: "assistant",
        content: [{ type: "text", text: "Recovered current answer" }],
        stopReason: "stop",
      });
    });
    await expect(askPi(input)).resolves.toMatchObject({
      message: "Recovered current answer",
    });
  });
  it.each(["overflow", "compaction-start", "turn-start"] as const)(
    "rejects the actual SDK's unsuccessful current Run after %s without accepting historical success",
    async (scenario) => {
      const sdk = await vi.importActual<
        typeof import("@earendil-works/pi-coding-agent")
      >("@earendil-works/pi-coding-agent");
      const runtime = await sdk.ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsStore: new InMemoryModelsStore(),
        modelsPath: null,
        refreshOnCreate: false,
        allowModelNetwork: false,
      });
      const provider = "server-guy-outcome-test";
      const previous: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "Old successful answer" }],
        api: provider,
        provider,
        model: "synthetic",
        stopReason: "stop",
        timestamp: Date.now() - 1000,
        usage: {
          input: 10,
          output: 10,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 20,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const providerAbortStates: boolean[] = [];
      const stream = vi.fn((_model, _context, options) => {
        providerAbortStates.push(options?.signal?.aborted ?? false);
        const result = createAssistantMessageEventStream();
        const error: AssistantMessage = {
          ...previous,
          content: [],
          stopReason: options?.signal?.aborted ? "aborted" : "error",
          errorMessage:
            scenario === "overflow"
              ? "Your input exceeds the context window of this model"
              : "Synthetic response ended",
          timestamp: Date.now(),
        };
        queueMicrotask(() =>
          result.push({
            type: "error",
            reason: error.stopReason as "error" | "aborted",
            error,
          }),
        );
        return result;
      });
      runtime.registerProvider(provider, {
        api: provider,
        apiKey: "NO-NETWORK",
        baseUrl: "https://synthetic.invalid",
        streamSimple: stream,
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
      const manager = sdk.SessionManager.inMemory(process.cwd());
      const historyLength = scenario === "compaction-start" ? 12 : 1;
      for (let index = 0; index < historyLength; index++) {
        manager.appendMessage({
          role: "user",
          content: `Previous question ${index} ${
            scenario === "compaction-start"
              ? "historical text ".repeat(180)
              : ""
          }`,
          timestamp: Date.now() - 2000,
        });
        manager.appendMessage({
          ...previous,
          usage: {
            ...previous.usage,
            input:
              scenario === "compaction-start" && index === historyLength - 1
                ? 7_900
                : 10,
            totalTokens:
              scenario === "compaction-start" && index === historyLength - 1
                ? 7_910
                : 20,
          },
        });
      }
      // Supply path metadata without changing in-memory persistence.
      vi.spyOn(manager, "getSessionFile").mockReturnValue(
        "/private/server-guy-outcome-test/chat.jsonl",
      );
      mocks.open.mockResolvedValue({
        sessionManager: manager,
        release: vi.fn(),
      });
      mocks.configure.mockResolvedValue({
        configuration: { reasoningEffort: "off" },
        modelRuntime: runtime,
        model: runtime.getModel(provider, "synthetic"),
      });
      let actualSession: AgentSession | undefined;
      const phases: string[] = [];
      mocks.create.mockImplementation(async (options) => {
        const settingsManager = sdk.SettingsManager.inMemory({
          retry: { enabled: false },
          compaction: {
            enabled: true,
            reserveTokens: 2_048,
            keepRecentTokens: 1_024,
          },
        });
        const resourceLoader = new sdk.DefaultResourceLoader({
          ...mocks.loader.mock.calls.at(-1)![0],
          settingsManager,
        });
        await resourceLoader.reload();
        const created = await sdk.createAgentSession({
          ...options,
          settingsManager,
          resourceLoader,
        });
        actualSession = created.session;
        actualSession.subscribe((event) => {
          if (event.type === "compaction_start" || event.type === "turn_start")
            phases.push(event.type);
        });
        return created;
      });
      const controller = new AbortController();
      await expect(
        askPi(input, {
          signal: controller.signal,
          onModelCall: () => {
            if (scenario !== "overflow") controller.abort();
          },
        }),
      ).rejects.toThrow();
      if (scenario === "overflow") {
        expect(stream).toHaveBeenCalledOnce();
        // The SDK removed the current error before finding too little older
        // content to compact. History alone looks successful.
        expect(
          actualSession!.messages.findLast(
            (message) => message.role === "assistant",
          ),
        ).toEqual(previous);
      } else {
        expect(controller.signal.aborted).toBe(true);
        expect(phases[0]).toBe(
          scenario === "compaction-start" ? "compaction_start" : "turn_start",
        );
        // The runtime can reject before calling the provider at all; otherwise
        // its signal must be aborted, including the following normal turn.
        expect(providerAbortStates.every(Boolean)).toBe(true);
        expect(actualSession!.isIdle).toBe(true);
      }
    },
  );
});

describe("scoped Decision tool shapes", () => {
  it("accepts a typed priority and keeps application identity out of model parameters", () => {
    expect(
      Value.Check(proposeDecisionParameters, {
        kind: "launch-priority",
        value: "Recover quickly",
        replaces: "18b38547-0f1b-4d78-a5a2-f0f0adab02d1",
      }),
    ).toBe(true);
    expect(
      Value.Check(searchDecisionParameters, { query: "recovery", offset: 0 }),
    ).toBe(true);
    expect(
      Value.Check(searchDecisionParameters, { applicationId: "other" }),
    ).toBe(false);
  });
  it("accepts only an empty status lookup: no application choice, filters or refresh", () => {
    expect(Value.Check(applicationStatusParameters, {})).toBe(true);
    for (const attempt of [
      { applicationId: "other" },
      { chatId: "other" },
      { refresh: true },
      { query: "repository" },
      null,
      "{}",
    ])
      expect(Value.Check(applicationStatusParameters, attempt)).toBe(false);
  });
  it.each([
    { kind: "paid-action-approved", value: "yes" },
    { kind: "approval-mode", value: "full-autonomy" },
    { kind: ["launch-priority"], value: "wrong type" },
    { kind: "launch-priority", value: "invalid replacement", replaces: 42 },
    {
      kind: "launch-priority",
      value: "invalid replacement",
      replaces: "invented",
    },
    { kind: "launch-priority", value: "Ready", approvedPaidAction: true },
    { kind: "launch-priority", value: "" },
    { kind: "launch-priority", value: "x".repeat(301) },
  ])("rejects invalid tool arguments %#", (proposal) => {
    expect(Value.Check(proposeDecisionParameters, proposal)).toBe(false);
  });
});

describe("native Pi adapter", () => {
  it("appends operational context before only the new user prompt with stable instructions and no automatic Decision dump", async () => {
    const current = {
      ...input,
      userMessage: "Can we lower backup costs?",
      runContext: '{"checks":"current checks","previousAttempt":"cancelled"}',
    };
    await askPi(current);
    expect(mocks.open).toHaveBeenCalledWith(run.applicationId, run.chatId);
    const options = mocks.create.mock.calls[0][0] as Options;
    expect(options).toMatchObject({
      noTools: "all",
      tools: [
        "propose_decision",
        "search_decisions",
        "get_application_status",
        "prepare_deployment",
        "list_operations",
        "propose_change",
        "record_inspection",
      ],
      sessionManager: handles[0].sessionManager,
      settingsManager: { isolated: true },
    });
    expect(options.customTools.map((tool) => tool.name)).toEqual([
      "propose_decision",
      "search_decisions",
      "get_application_status",
      "prepare_deployment",
      "list_operations",
      "propose_change",
      "record_inspection",
    ]);
    expect(mocks.search).not.toHaveBeenCalled();
    // Nothing is read on the model's behalf before it asks.
    expect(mocks.status).not.toHaveBeenCalled();
    expect(session.sendCustomMessage).toHaveBeenCalledWith(
      {
        customType: "server-guy-run",
        content: current.runContext,
        display: false,
        details: { runId: run.id },
      },
      { triggerTurn: false },
    );
    expect(session.prompt).toHaveBeenCalledWith(current.userMessage, {
      expandPromptTemplates: false,
      source: "rpc",
    });
    expect(session.sendCustomMessage.mock.invocationCallOrder[0]).toBeLessThan(
      session.prompt.mock.invocationCallOrder[0],
    );
    const loader = mocks.loader.mock.calls[0][0];
    expect(loader).toMatchObject({
      noContextFiles: true,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
    });
    expect(loader.systemPromptOverride()).toContain(SYSTEM_PROMPT);
    expect(loader.systemPromptOverride()).toContain("prepare_deployment");
    expect(loader.systemPromptOverride()).not.toContain(current.runContext);
    expect(loader.systemPromptOverride()).not.toContain("CURRENT DECISIONS");
    expect(loader.agentsFilesOverride()).toEqual({ agentsFiles: [] });
    expect(loader.appendSystemPromptOverride().join("\n")).toContain(
      "operation",
    );
    expect(handles[0].release.mock.invocationCallOrder[0]).toBeGreaterThan(
      session.dispose.mock.invocationCallOrder[0],
    );
  });
  it("opens distinct Chat handles and applies new preferences only to later sessions", async () => {
    const first = fakeSession();
    const pending = deferred();
    first.prompt.mockReturnValue(pending.promise);
    mocks.create.mockResolvedValueOnce({ session: first });
    const work = askPi(input);
    await vi.waitFor(() => expect(first.prompt).toHaveBeenCalled());
    const alternate = { ...model, id: "gpt-5.6-luna" };
    mocks.configure.mockResolvedValue({
      configuration: { reasoningEffort: "max" },
      model: alternate,
      modelRuntime: {},
    });
    await askPi({
      ...input,
      run: { ...run, id: "run-b", chatId: "chat-b" },
      runContext: "Different observed checks",
    });
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      model,
      thinkingLevel: "high",
      sessionManager: handles[0].sessionManager,
    });
    expect(mocks.create.mock.calls[1][0]).toMatchObject({
      model: alternate,
      thinkingLevel: "max",
      sessionManager: handles[1].sessionManager,
    });
    expect(handles[0].sessionManager).not.toBe(handles[1].sessionManager);
    expect(mocks.loader.mock.calls[0][0].systemPromptOverride()).toBe(
      mocks.loader.mock.calls[1][0].systemPromptOverride(),
    );
    expect(handles[0].release).not.toHaveBeenCalled();
    first.finish();
    pending.resolve();
    await work;
  });
  it("binds lookup/proposals to the Run application and labels successful proposals pending", async () => {
    let pendingResult: unknown;
    session.prompt.mockImplementation(async () => {
      const options = mocks.create.mock.calls[0][0] as Options;
      pendingResult = await options.customTools[0].execute("proposal", {
        kind: "launch-priority",
        value: "  Recover quickly  ",
      });
      await options.customTools[1].execute("lookup", {
        query: "recovery",
        offset: 0,
      });
      session.finish();
    });
    const result = await askPi(input);
    expect(mocks.collect).toHaveBeenCalledWith(
      run.applicationId,
      expect.any(Array),
      { kind: "launch-priority", value: "  Recover quickly  " },
    );
    expect(mocks.search).toHaveBeenCalledWith(
      run.applicationId,
      [{ kind: "launch-priority", value: "Recover quickly" }],
      { query: "recovery", offset: 0 },
    );
    expect(pendingResult).toMatchObject({
      content: [
        { text: expect.stringContaining('"status":"pending, not saved"') },
      ],
    });
    expect(result).toEqual({
      message: "Done.",
      decisionProposals: [
        { kind: "launch-priority", value: "Recover quickly" },
      ],
      contractProposal: null,
      sourceProposal: null,
      acceptanceProposal: null,
    });
    expect(
      (mocks.create.mock.calls[0][0] as Options).customTools[0]
        .constrainedSampling,
    ).toEqual({ type: "json_schema", strict: "require" });
  });
  it("reads status only for the Run's application and Chat and returns the projection as tool content", async () => {
    let result: unknown;
    session.prompt.mockImplementation(async () => {
      const tool = (mocks.create.mock.calls[0][0] as Options).customTools[2];
      expect(tool).toMatchObject({
        name: "get_application_status",
        label: "Look up application status",
      });
      result = await tool.execute("status", {});
      session.finish();
    });
    await askPi(input);
    expect(mocks.status).toHaveBeenCalledExactlyOnceWith(
      run.applicationId,
      run.chatId,
    );
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            retrievedAt: "2026-09-06T12:00:00.000Z",
            application: { id: run.applicationId },
            chatId: run.chatId,
          }),
        },
      ],
      details: {
        retrievedAt: "2026-09-06T12:00:00.000Z",
        application: { id: run.applicationId },
        chatId: run.chatId,
      },
    });
  });
  it("returns a failed status lookup to the tool loop as an error, never as an empty result", async () => {
    mocks.status.mockImplementationOnce(() => {
      throw new Error("Status storage unavailable");
    });
    session.prompt.mockImplementation(async () => {
      const tool = (mocks.create.mock.calls[0][0] as Options).customTools[2];
      await expect(tool.execute("status", {})).rejects.toThrow(
        "Status storage unavailable",
      );
      session.finish();
    });
    await expect(askPi(input)).resolves.toMatchObject({ message: "Done." });
  });
  it("returns proposal-time failures to the SDK tool loop so a corrected call can continue", async () => {
    mocks.collect.mockImplementationOnce(() => {
      throw new Error("Replacement is no longer active");
    });
    session.prompt.mockImplementation(async () => {
      const tool = (mocks.create.mock.calls[0][0] as Options).customTools[0];
      await expect(
        tool.execute("bad", {
          kind: "launch-priority",
          value: "Wrong target",
          replaces: "old-id",
        }),
      ).rejects.toThrow("no longer active");
      await tool.execute("corrected", {
        kind: "launch-priority",
        value: "Add recovery",
      });
      session.finish();
    });
    await expect(askPi(input)).resolves.toMatchObject({
      decisionProposals: [{ value: "Add recovery" }],
    });
  });
  it("counts normal turns and compaction calls and resets streamed text for each assistant message", async () => {
    const onModelCall = vi.fn();
    const onText = vi.fn();
    session.prompt.mockImplementation(async () => {
      session.emit({
        type: "compaction_start",
        reason: "threshold",
      } as AgentSessionEvent);
      for (const text of ["Earlier turn", "Final answer"]) {
        session.emit({ type: "turn_start" } as AgentSessionEvent);
        session.emit({
          type: "message_start",
          message: { role: "assistant" },
        } as AgentSessionEvent);
        session.emit({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: text },
        } as AgentSessionEvent);
        session.finish({
          role: "assistant",
          content: [{ type: "text", text }],
          stopReason: text === "Final answer" ? "stop" : "toolUse",
        });
      }
    });
    await expect(askPi(input, { onModelCall, onText })).resolves.toMatchObject({
      message: "Final answer",
    });
    expect(onModelCall).toHaveBeenCalledTimes(3);
    expect(onText.mock.calls).toEqual([["Earlier turn"], ["Final answer"]]);
  });
  it("preserves native recovery errors and does not start auth/model setup for unavailable history", async () => {
    const error = new Error(
      "Conversation history unavailable. Start a new chat.",
    );
    mocks.open.mockRejectedValue(error);
    await expect(askPi(input)).rejects.toBe(error);
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("releases the history handle if authentication/setup fails", async () => {
    mocks.configure.mockRejectedValue(
      new Error("Choose a Pi setup first: private details"),
    );
    await expect(askPi(input)).rejects.toThrow("Settings");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(handles[0].release).toHaveBeenCalledOnce();
  });
  it("does no work for an already aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(askPi(input, { signal: controller.signal })).rejects.toThrow();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it.each(["generation", "tool", "compaction"])(
    "keeps the handle until prompt, abort and idle settlement after cancellation during %s",
    async (phase) => {
      const controller = new AbortController();
      const prompt = deferred();
      const abort = deferred();
      const idle = deferred();
      session.prompt.mockImplementation(async () => {
        if (phase === "compaction")
          session.emit({
            type: "compaction_start",
            reason: "threshold",
          } as AgentSessionEvent);
        await prompt.promise;
      });
      session.abort.mockReturnValue(abort.promise);
      session.waitForIdle.mockReturnValue(idle.promise);
      const work = askPi(input, { signal: controller.signal });
      const rejected = expect(work).rejects.toThrow();
      await vi.waitFor(() => expect(session.prompt).toHaveBeenCalled());
      controller.abort();
      expect(session.abortCompaction).toHaveBeenCalled();
      expect(session.abort).toHaveBeenCalledOnce();
      if (phase === "tool") {
        const tools = (mocks.create.mock.calls[0][0] as Options).customTools;
        await expect(
          tools[0].execute("late", {
            kind: "launch-priority",
            value: "Too late",
          }),
        ).rejects.toThrow();
        expect(mocks.collect).not.toHaveBeenCalled();
        await expect(tools[2].execute("late-status", {})).rejects.toThrow();
        expect(mocks.status).not.toHaveBeenCalled();
      }
      expect(handles[0].release).not.toHaveBeenCalled();
      prompt.resolve();
      await vi.waitFor(() => expect(session.waitForIdle).toHaveBeenCalled());
      expect(session.dispose).not.toHaveBeenCalled();
      idle.resolve();
      await Promise.resolve();
      expect(handles[0].release).not.toHaveBeenCalled();
      abort.resolve();
      await rejected;
      expect(session.dispose).toHaveBeenCalledOnce();
      expect(handles[0].release).toHaveBeenCalledOnce();
    },
  );
  it("still waits for idle persistence when abort rejects", async () => {
    const controller = new AbortController();
    const prompt = deferred();
    const idle = deferred();
    session.prompt.mockReturnValue(prompt.promise);
    session.abort.mockRejectedValue(new Error("Abort failed"));
    session.waitForIdle.mockReturnValue(idle.promise);
    const work = askPi(input, { signal: controller.signal });
    const rejected = expect(work).rejects.toThrow();
    await vi.waitFor(() => expect(session.prompt).toHaveBeenCalled());
    controller.abort();
    prompt.reject(new Error("Prompt stopped"));
    await vi.waitFor(() => expect(session.waitForIdle).toHaveBeenCalled());
    expect(handles[0].release).not.toHaveBeenCalled();
    expect(session.dispose).not.toHaveBeenCalled();
    idle.resolve();
    await rejected;
    expect(handles[0].release).toHaveBeenCalledOnce();
  });
});
