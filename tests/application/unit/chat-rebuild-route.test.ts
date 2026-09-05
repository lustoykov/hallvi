import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadChat: vi.fn(),
  getView: vi.fn(),
  rebuild: vi.fn(),
  retry: vi.fn(),
  send: vi.fn(),
}));

vi.mock("../../../src/server/phase-one", () => ({
  ExistingApplicationConflictError: class extends Error {},
  NotFoundError: class extends Error {},
  loadChat: mocks.loadChat,
  getPhaseOneOperatorView: mocks.getView,
}));
vi.mock("../../../src/server/pi-sessions", () => ({
  NativeSessionError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  rebuildNativeChatSession: mocks.rebuild,
}));
vi.mock("../../../src/server/pi-runs", () => ({
  retryPiRun: mocks.retry,
  sendChatMessage: mocks.send,
}));

import { POST } from "../../../src/app/api/applications/[applicationId]/chats/[chatId]/rebuild/route";
import { NotFoundError } from "../../../src/server/phase-one";
import { NativeSessionError } from "../../../src/server/pi-sessions";

const context = {
  params: Promise.resolve({ applicationId: "app-one", chatId: "chat-one" }),
};
const request = (origin = "http://localhost") =>
  new Request(
    "http://localhost/api/applications/app-one/chats/chat-one/rebuild",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "{}",
    },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadChat.mockReturnValue({
    chat: { id: "chat-one", archivedAt: null },
  });
  mocks.getView.mockReturnValue({ selectedChatId: "chat-one", activity: [] });
  mocks.rebuild.mockResolvedValue(undefined);
});

describe("explicit conversation recovery", () => {
  it("rebuilds only the scoped Chat and refreshes its view without sending or retrying", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.loadChat).toHaveBeenCalledWith("app-one", "chat-one");
    expect(mocks.rebuild).toHaveBeenCalledWith("app-one", "chat-one");
    expect(mocks.getView).toHaveBeenCalledWith("app-one", "chat-one");
    await expect(response.json()).resolves.toEqual({
      selectedChatId: "chat-one",
      activity: [],
    });
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin request before touching Chat or session state", async () => {
    const response = await POST(request("https://foreign.example"), context);
    expect(response.status).toBe(400);
    expect(mocks.loadChat).not.toHaveBeenCalled();
    expect(mocks.rebuild).not.toHaveBeenCalled();
  });

  it("does not rebuild a missing or foreign Chat", async () => {
    mocks.loadChat.mockImplementation(() => {
      throw new NotFoundError("Chat not found.");
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.rebuild).not.toHaveBeenCalled();
  });

  it("keeps archived Chats read-only", async () => {
    mocks.loadChat.mockReturnValue({
      chat: { archivedAt: "2026-09-05T00:00:00.000Z" },
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(400);
    expect(mocks.rebuild).not.toHaveBeenCalled();
  });

  it.each(["busy", "history-unavailable"] as const)(
    "returns a visible conflict when recovery is %s",
    async (code) => {
      mocks.rebuild.mockRejectedValue(
        new NativeSessionError(code, "Conversation recovery is unavailable."),
      );
      const response = await POST(request(), context);
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "Conversation recovery is unavailable.",
      });
      expect(mocks.getView).not.toHaveBeenCalled();
    },
  );

  it("keeps unexpected filesystem details out of the response", async () => {
    mocks.rebuild.mockRejectedValue(new Error("secret filesystem details"));
    const response = await POST(request(), context);
    await expect(response.json()).resolves.toEqual({
      error: "Could not rebuild this conversation. Try again.",
    });
  });
});
