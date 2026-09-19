import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createChat: vi.fn(),
  sendChatMessage: vi.fn(),
}));

vi.mock("../../../src/server/applications", () => ({
  ExistingApplicationConflictError: class extends Error {},
  NotFoundError: class NotFoundError extends Error {},
  createChat: mocks.createChat,
}));
vi.mock("../../../src/server/operator-view", () => ({
  getOperatorView: () => ({ selectedChatId: "chat-id" }),
}));
vi.mock("../../../src/server/pi-conversation", () => ({
  sendChatMessage: mocks.sendChatMessage,
}));

import { POST as createChat } from "../../../src/app/api/applications/[applicationId]/chats/route";
import { POST as sendMessage } from "../../../src/app/api/applications/[applicationId]/chats/[chatId]/messages/route";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const applicationContext = {
  params: Promise.resolve({ applicationId: "application-id" }),
};

const chatContext = {
  params: Promise.resolve({
    applicationId: "application-id",
    chatId: "chat-id",
  }),
};

describe("Chat request validation", () => {
  beforeEach(() => {
    mocks.createChat.mockReset();
    mocks.sendChatMessage.mockReset();
  });

  it("trims a valid Chat title before calling the domain", async () => {
    mocks.createChat.mockReturnValue({ id: "chat-id" });

    const response = await createChat(
      request("/api/applications/application-id/chats", {
        title: "  Cost questions  ",
      }),
      applicationContext,
    );

    expect(response.status).toBe(202);
    expect(mocks.createChat).toHaveBeenCalledWith(
      "application-id",
      "Cost questions",
    );
  });

  it("keeps the current untitled Chat request valid", async () => {
    mocks.createChat.mockReturnValue({ id: "chat-id" });

    const response = await createChat(
      request("/api/applications/application-id/chats", {}),
      applicationContext,
    );

    expect(response.status).toBe(202);
    expect(mocks.createChat).toHaveBeenCalledWith("application-id", undefined);
  });

  it.each([
    ["non-text title", { title: 42 }, "Chat title must be text."],
    ["oversized title", { title: "x".repeat(121) }, "under 120 characters"],
    ["unknown field", { title: "Costs", archived: true }, "Unrecognized key"],
  ])("rejects a %s", async (_label, body, message) => {
    const response = await createChat(
      request("/api/applications/application-id/chats", body),
      applicationContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining(message),
    });
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("trims a valid message before calling the domain", async () => {
    mocks.sendChatMessage.mockResolvedValue({ selectedChatId: "chat-id" });

    const response = await sendMessage(
      request("/api/applications/application-id/chats/chat-id/messages", {
        message: "  Recovery matters.  ",
        requestKey: "00000000-0000-4000-8000-000000000001",
      }),
      chatContext,
    );

    expect(response.status).toBe(202);
    expect(mocks.sendChatMessage).toHaveBeenCalledWith(
      "application-id",
      "chat-id",
      "Recovery matters.",
      "00000000-0000-4000-8000-000000000001",
      // Left to the domain, which sends it after Pi's current work.
      undefined,
    );
  });

  it.each([
    ["blank message", { message: "   " }, "Write a message first."],
    ["non-text message", { message: 42 }, "Write a message first."],
    [
      "oversized message",
      { message: "x".repeat(5_001) },
      "under 5,000 characters",
    ],
    [
      "unknown field",
      {
        message: "Ship it",
        requestKey: "00000000-0000-4000-8000-000000000001",
        approval: true,
      },
      "Unrecognized key",
    ],
  ])("rejects a %s", async (_label, body, message) => {
    const response = await sendMessage(
      request("/api/applications/application-id/chats/chat-id/messages", body),
      chatContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining(message),
    });
    expect(mocks.sendChatMessage).not.toHaveBeenCalled();
  });
});
