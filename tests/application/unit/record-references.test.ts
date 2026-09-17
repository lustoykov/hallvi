// Reply references: which reply a saved requirement sits under, so the
// transcript can point at it without a second set of controls.
import { describe, expect, it } from "vitest";

import { recordReferences } from "../../../src/components/haldur/record-references";
import type {
  ChatMessage,
  Decision,
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

function decision(id: string, sourceMessageId: string): Decision {
  return {
    id,
    applicationId: "app",
    sourceMessageId,
    kind: "launch-priority",
    label: "Requirement",
    value: "Data stays in the EU",
    supersededById: null,
    createdAt: at,
  };
}

function view(overrides: Partial<OperatorView>): OperatorView {
  return {
    application: null,
    chats: [],
    selectedChatId: null,
    messages: [],
    decisions: [],
    activity: [],
    ...overrides,
  };
}

describe("recordReferences", () => {
  it("places a saved requirement under the reply that followed its request", () => {
    const references = recordReferences(
      view({
        messages: [
          message("request-1", "user", "user"),
          message("reply-1", "assistant"),
          message("request-2", "user", "user"),
          message("reply-2", "assistant"),
        ],
        decisions: [decision("d1", "request-2")],
      }),
    );
    expect(references.get("reply-2")).toEqual([
      {
        key: "decision:d1",
        label: "Saved requirement",
        status: "current",
        tone: "current",
      },
    ]);
    expect(references.has("reply-1")).toBe(false);
    expect(references.has("request-2")).toBe(false);
  });

  it("ignores records whose request is not in this chat", () => {
    const references = recordReferences(
      view({
        messages: [message("reply-1", "assistant")],
        decisions: [decision("d1", "elsewhere")],
      }),
    );
    expect(references.size).toBe(0);
  });
});
