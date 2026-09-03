import { Value } from "typebox/value";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: sdkMocks.createAgentSession,
  defineTool: <T>(tool: T) => tool,
  DefaultResourceLoader: class {
    async reload() {}
  },
  getAgentDir: () => "/tmp/pi-agent",
  SessionManager: { inMemory: () => ({}) },
}));

import {
  askPi,
  collectPiDecisionProposal,
  MAX_PI_DECISION_PROPOSALS,
  proposeDecisionParameters,
} from "../src/server/pi";
import {
  parsePiAssistantMessageValue,
  parsePiDecisionValue,
} from "../src/server/schemas";
import type { PiDecision } from "../src/server/types";

beforeEach(() => {
  sdkMocks.createAgentSession.mockReset();
});

describe("Pi assistant messages", () => {
  it("accepts normal conversational text", () => {
    expect(parsePiAssistantMessageValue("  Looks good to me.  ")).toBe(
      "Looks good to me.",
    );
  });

  it("rejects empty and oversized messages", () => {
    expect(() => parsePiAssistantMessageValue("   ")).toThrow(
      "no user-facing message",
    );
    expect(() => parsePiAssistantMessageValue("x".repeat(10_001))).toThrow(
      "longer than 10,000 characters",
    );
  });
});

describe("Pi Decision proposals", () => {
  it("accepts the supported Decision kind and an exact replacement UUID", () => {
    const replaces = "18b38547-0f1b-4d78-a5a2-f0f0adab02d1";
    expect(
      parsePiDecisionValue({
        kind: "launch-priority",
        value: "  Prefer predictable cost  ",
        replaces,
      }),
    ).toEqual({
      kind: "launch-priority",
      value: "Prefer predictable cost",
      replaces,
    });
  });

  it.each([
    [{ kind: "paid-action-approved", value: "yes" }, "unsupported Decision kind"],
    [{ kind: "target-environment", value: "staging" }, "unsupported Decision kind"],
    [{ kind: "approval-mode", value: "full-autonomy" }, "unsupported Decision kind"],
    [{ kind: ["launch-priority"], value: "bypass kind validation" }, "unsupported Decision kind"],
    [{ kind: "launch-priority", value: "bad replacement", replaces: 42 }, "replacement ID"],
    [
      { kind: "launch-priority", value: "bad replacement", replaces: "invented" },
      "replacement ID",
    ],
    [
      { kind: "launch-priority", value: "Ready", approvedPaidAction: true },
      "Unrecognized key",
    ],
  ])("rejects a malformed or unsupported proposal %#", (proposal, message) => {
    expect(() => parsePiDecisionValue(proposal)).toThrow(message);
  });

  it("rejects an oversized value instead of truncating it", () => {
    expect(() =>
      parsePiDecisionValue({
        kind: "launch-priority",
        value: "x".repeat(301),
      }),
    ).toThrow("longer than 300 characters");
  });

  it("exposes the same narrow contract to Pi through TypeBox", () => {
    expect(
      Value.Check(proposeDecisionParameters, {
        kind: "launch-priority",
        value: "Recover quickly",
      }),
    ).toBe(true);
    expect(
      Value.Check(proposeDecisionParameters, {
        kind: "launch-priority",
        value: "Recover quickly",
        approvedPaidAction: true,
      }),
    ).toBe(false);
    expect(
      Value.Check(proposeDecisionParameters, {
        kind: "paid-action-approved",
        value: "yes",
      }),
    ).toBe(false);
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
        prepareArguments?: (args: unknown) => unknown;
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
          const proposal = tool?.prepareArguments?.(rawProposal) ?? rawProposal;
          await tool?.execute("tool-call-1", proposal);
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
