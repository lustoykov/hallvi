import { beforeEach, expect, it, vi } from "vitest";

import {
  acceptedDraftCanClear,
  clearPendingSubmission,
  readConversationDraft,
  readPendingSubmission,
  writeConversationDraft,
  writePendingSubmission,
} from "../../../src/components/hallvi/conversation-continuity";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } satisfies Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
});

it("scopes durable drafts and pending request keys by application and chat", () => {
  writeConversationDraft("app-a", "chat", "draft for A");
  writeConversationDraft("app-b", "chat", "draft for B");
  writePendingSubmission("app-a", "chat", {
    message: "send once",
    key: "request-a",
  });

  expect(readConversationDraft("app-a", "chat")).toBe("draft for A");
  expect(readConversationDraft("app-b", "chat")).toBe("draft for B");
  expect(readPendingSubmission("app-a", "chat")).toEqual({
    message: "send once",
    key: "request-a",
  });
  expect(readPendingSubmission("app-b", "chat")).toBeNull();

  clearPendingSubmission("app-a", "chat");
  expect(readPendingSubmission("app-a", "chat")).toBeNull();
  expect(readConversationDraft("app-a", "chat")).toBe("draft for A");
});

it("does not clear identical text typed after a submission", () => {
  expect(acceptedDraftCanClear("same words", "same words", false)).toBe(true);
  expect(acceptedDraftCanClear("same words", "same words", true)).toBe(false);
  expect(acceptedDraftCanClear("new follow-up", "sent words", true)).toBe(
    false,
  );
});
