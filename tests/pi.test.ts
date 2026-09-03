import { Value } from "typebox/value";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createModelRuntime: vi.fn(),
}));

const configuredModel = {
  provider: "openai-codex",
  id: "gpt-5.6-sol",
  name: "GPT-5.6 Sol",
};

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: sdkMocks.createAgentSession,
  defineTool: <T>(tool: T) => tool,
  DefaultResourceLoader: class {
    async reload() {}
  },
  getAgentDir: () => "/tmp/pi-agent",
  ModelRuntime: {
    create: sdkMocks.createModelRuntime,
  },
  SessionManager: { inMemory: () => ({}) },
}));

import {
  askPi,
  collectPiDecisionProposal,
  describePiFailure,
  MAX_PI_DECISION_PROPOSALS,
  normalizePiAssistantMessage,
  proposeDecisionParameters,
} from "../src/server/pi";
import type { PiDecision } from "../src/server/types";

beforeEach(() => {
  sdkMocks.createAgentSession.mockReset();
  sdkMocks.createModelRuntime.mockReset();
  sdkMocks.createModelRuntime.mockResolvedValue({
    getModel: () => configuredModel,
    getAuth: async () => ({ auth: { apiKey: "test-token" }, source: "OAuth" }),
  });
});

describe("Pi assistant messages", () => {
  it("accepts normal conversational text", () => {
    expect(normalizePiAssistantMessage("  Looks good to me.  ")).toBe(
      "Looks good to me.",
    );
  });

  it("rejects empty and oversized messages", () => {
    expect(() => normalizePiAssistantMessage("   ")).toThrow(
      "no user-facing message",
    );
    expect(() => normalizePiAssistantMessage("x".repeat(10_001))).toThrow(
      "longer than 10,000 characters",
    );
  });
});

describe("Pi failures", () => {
  it("turns exhausted subscription usage into a retryable explanation", () => {
    expect(describePiFailure(new Error("Request failed with status 429: usage limit reached"))).toBe(
      "Pi cannot run because the connected ChatGPT account has reached its current usage limit. Wait for the limit to reset, then retry.",
    );
  });

  it("points missing or expired authentication back to setup", () => {
    expect(describePiFailure(new Error("Provider is not configured"))).toBe(
      "Pi authentication is missing or expired. Open Pi setup and connect ChatGPT again.",
    );
  });
});

describe("Pi Decision proposals", () => {
  it("accepts valid tool arguments through TypeBox", () => {
    expect(
      Value.Check(proposeDecisionParameters, {
        kind: "launch-priority",
        value: "Recover quickly",
        replaces: "18b38547-0f1b-4d78-a5a2-f0f0adab02d1",
      }),
    ).toBe(true);
  });

  it("normalizes a valid proposal before collecting it", () => {
    const replaces = "18b38547-0f1b-4d78-a5a2-f0f0adab02d1";
    const proposals: PiDecision[] = [];
    expect(
      collectPiDecisionProposal(proposals, {
        kind: "launch-priority",
        value: "  Prefer predictable cost  ",
        replaces,
      }),
    ).toEqual({
      kind: "launch-priority",
      value: "Prefer predictable cost",
      replaces,
    });
    expect(proposals).toEqual([
      {
        kind: "launch-priority",
        value: "Prefer predictable cost",
        replaces,
      },
    ]);
  });

  it.each([
    { kind: "paid-action-approved", value: "yes" },
    { kind: "target-environment", value: "staging" },
    { kind: "approval-mode", value: "full-autonomy" },
    { kind: ["launch-priority"], value: "bypass kind validation" },
    { kind: "launch-priority", value: "bad replacement", replaces: 42 },
    { kind: "launch-priority", value: "bad replacement", replaces: "invented" },
    { kind: "launch-priority", value: "Ready", approvedPaidAction: true },
    { kind: "launch-priority", value: "" },
    { kind: "launch-priority", value: "x".repeat(301) },
  ])("rejects malformed tool arguments through TypeBox %#", (proposal) => {
    expect(Value.Check(proposeDecisionParameters, proposal)).toBe(false);
  });

  it("caps successfully collected proposals per turn", () => {
    const proposals: PiDecision[] = Array.from(
      { length: MAX_PI_DECISION_PROPOSALS },
      (_, index) => ({
        kind: "launch-priority",
        value: `Priority ${index + 1}`,
      }),
    );

    expect(() =>
      collectPiDecisionProposal(proposals, {
        kind: "launch-priority",
        value: "One too many",
      }),
    ).toThrow("more than 20 Decisions");
    expect(proposals).toHaveLength(MAX_PI_DECISION_PROPOSALS);
  });

  it("does not collect a proposal that fails Server Guy validation", () => {
    const proposals: PiDecision[] = [];
    expect(() =>
      collectPiDecisionProposal(proposals, {
        kind: "launch-priority",
        value: "   ",
      }),
    ).toThrow("empty Decision value");
    expect(proposals).toEqual([]);
  });
});

describe("askPi", () => {
  it("combines normal assistant text with successful typed tool calls", async () => {
    let sessionOptions: {
      tools?: string[];
      customTools?: Array<{
        name: string;
        constrainedSampling?: unknown;
        execute: (id: string, params: unknown) => Promise<unknown>;
      }>;
    } = {};

    sdkMocks.createAgentSession.mockImplementation(async (options) => {
      sessionOptions = options;
      const session = {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "I recorded fast recovery." }],
            stopReason: "stop",
          },
        ],
        subscribe: () => () => {},
        async prompt() {
          const tool = sessionOptions.customTools?.[0];
          const rawProposal = {
            kind: "launch-priority",
            value: "  Recover quickly  ",
          };
          await tool?.execute("tool-call-1", rawProposal);
        },
        async abort() {},
        dispose() {},
      };
      return { session };
    });

    const result = await askPi({
      userMessage: "Recovery matters.",
      messages: [],
      decisions: [],
      viewSummary: "Application: Example",
    });

    expect(sessionOptions.tools).toEqual(["propose_decision"]);
    expect(sessionOptions).toEqual(
      expect.objectContaining({
        model: configuredModel,
        thinkingLevel: "high",
      }),
    );
    expect(sessionOptions.customTools).toHaveLength(1);
    expect(sessionOptions.customTools?.[0]).toEqual(
      expect.objectContaining({
        name: "propose_decision",
        constrainedSampling: { type: "json_schema", strict: "require" },
      }),
    );
    expect(result).toEqual({
      message: "I recorded fast recovery.",
      decisionProposals: [{ kind: "launch-priority", value: "Recover quickly" }],
    });
  });

  it("returns an empty proposal list when Pi only replies with text", async () => {
    sdkMocks.createAgentSession.mockResolvedValue({
      session: {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "Let us inspect the repository first." }],
            stopReason: "stop",
          },
        ],
        subscribe: () => () => {},
        async prompt() {},
        async abort() {},
        dispose() {},
      },
    });

    await expect(
      askPi({
        userMessage: "What should we inspect?",
        messages: [],
        decisions: [],
        viewSummary: "Application: Example",
      }),
    ).resolves.toEqual({
      message: "Let us inspect the repository first.",
      decisionProposals: [],
    });
  });
});
