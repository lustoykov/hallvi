// Reply references: which reply a saved record sits under, and the status a
// replaced proposal shows so an old reply cannot look approvable.
import { describe, expect, it } from "vitest";

import { recordReferences } from "../../../src/components/server-guy/record-references";
import type {
  ChatMessage,
  ConformanceProposalRecord,
  OperatorView,
} from "../../../src/server/types";

const at = "2026-09-07T10:00:00.000Z";

function message(
  id: string,
  role: ChatMessage["role"],
  source: ChatMessage["source"] = "pi",
): ChatMessage {
  return {
    id,
    chatId: "chat",
    role,
    body: id,
    source,
    createdAt: at,
    status: "completed",
    revision: 0,
  };
}

function proposal(
  id: string,
  sourceMessageId: string,
  status: ConformanceProposalRecord["status"] = "proposed",
): ConformanceProposalRecord {
  return {
    id,
    applicationId: "app",
    workspaceId: "ws",
    origin: "server-guy",
    status,
    baseSha: "a".repeat(40),
    contractId: "contract-1",
    contractVersion: 1,
    summary: "Add /health.",
    changes: [{ path: "app/main.py", content: "…", baseObservationId: null }],
    filesDigest: `digest-${id}`,
    mapping: [],
    requestApproval: true,
    sourceMessageId,
    piRunId: null,
    approval: null,
    publication: null,
    publicationError: null,
    external: null,
    candidate: null,
    verification: null,
    supersededById: null,
    createdAt: at,
  };
}

function view(overrides: Partial<OperatorView>): OperatorView {
  return {
    application: null,
    workspace: null,
    workspaces: [],
    chats: [],
    selectedChatId: null,
    messages: [],
    checks: [],
    decisions: [],
    observations: [],
    upcomingRequirements: [],
    activity: [],
    inspection: null,
    contract: null,
    conformance: null,
    ...overrides,
  };
}

describe("recordReferences", () => {
  it("places a record under the reply that followed its request", () => {
    const first = proposal("p1", "request-1", "superseded");
    const second = proposal("p2", "request-2");
    const references = recordReferences(
      view({
        messages: [
          message("request-1", "user", "server-guy"),
          message("reply-1", "assistant"),
          message("request-2", "user", "user"),
          message("reply-2", "assistant"),
        ],
        conformance: {
          retained: null,
          brief: null,
          proposal: second,
          proposals: [first, second],
          acceptance: null,
          proposedAcceptance: null,
          runs: [],
          latestPreview: null,
          latestCandidateRun: null,
          environment: null,
          grant: null,
          contractBlocked: null,
        },
      }),
    );
    expect(references.get("reply-1")).toEqual([
      expect.objectContaining({
        label: "Proposed change",
        status: "replaced",
        tone: "replaced",
        section: "change",
      }),
    ]);
    expect(references.get("reply-2")).toEqual([
      expect.objectContaining({
        label: "Proposed change",
        status: "waiting for your approval",
        tone: "waiting",
      }),
    ]);
    expect(references.has("request-1")).toBe(false);
  });

  it("ignores records whose request is not in this chat", () => {
    const references = recordReferences(
      view({
        messages: [message("reply-1", "assistant")],
        decisions: [
          {
            id: "d1",
            applicationId: "app",
            sourceMessageId: "elsewhere",
            kind: "launch-priority",
            label: "Requirement",
            value: "Data stays in the EU",
            supersededById: null,
            createdAt: at,
          },
        ],
      }),
    );
    expect(references.size).toBe(0);
  });
});
