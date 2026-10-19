import { beforeEach, expect, it, vi } from "vitest";
import { longHistory } from "../../fixtures/long-history";

const mocks = vi.hoisted(() => ({ worker: vi.fn(), executions: vi.fn() }));
vi.mock("../../../src/server/worker-link", async (original) => ({
  ...(await original<typeof import("../../../src/server/worker-link")>()),
  askWorker: mocks.worker,
}));
vi.mock("../../../src/server/operator-execution", async (original) => ({
  ...(await original<
    typeof import("../../../src/server/operator-execution")
  >()),
  listExecutions: mocks.executions,
}));
vi.mock("../../../src/server/applications", async (original) => ({
  ...(await original<typeof import("../../../src/server/applications")>()),
  loadChat: vi.fn(async (_app: string, chat: string) => ({
    application: { name: "Synthetic" },
    chat: { id: chat, kind: "main", createdAt: "2026-09-01T00:00:00.000Z" },
  })),
}));
vi.mock("../../../src/server/saved-information", () => ({
  listInformation: async () => [],
}));

import { chatSnapshot } from "../../../src/server/pi-conversation";
import { GET } from "../../../src/app/api/applications/[applicationId]/chats/[chatId]/calls/[callId]/route";
import {
  chatStreamBaseline,
  initialChatFrame,
} from "../../../src/server/chat-stream-baseline";

let history: ReturnType<typeof longHistory>;
beforeEach(() => {
  history = longHistory("chat", "app", 6);
  mocks.worker.mockImplementation(async (_action, body) =>
    body.scope.chatId === "chat"
      ? history.transcript
      : { status: "idle", messages: [], calls: {}, said: [] },
  );
  mocks.executions.mockImplementation(async () => history.executions);
});

it("sends compact rows, keeps visible labels/outcomes, and versions hidden-only changes for reconnects", async () => {
  const before = await chatSnapshot("app", "chat");
  expect(before.executions[0].output).toBe("");
  expect(before.executions[0].hasOutput).toBe(true);
  expect(before.piActivity[3].result).toBe("");
  expect(before.piActivity[3].hasResult).toBe(true);
  expect(before.piActivity[3].args).toContain("logs/stage-1.txt");
  expect(JSON.stringify(before)).not.toContain("END-3");
  const baseline = chatStreamBaseline("app", "chat", before);
  expect(
    initialChatFrame(
      "app",
      "chat",
      await chatSnapshot("app", "chat"),
      baseline,
    ),
  ).not.toHaveProperty("piActivity");
  history.transcript.calls["call:3"].result!.text = history.transcript.calls[
    "call:3"
  ].result!.text.replace("END-3", "NEW-3");
  const after = await chatSnapshot("app", "chat");
  expect(after.piActivity[3].detailVersion).not.toBe(
    before.piActivity[3].detailVersion,
  );
  expect(initialChatFrame("app", "chat", after, baseline)).toHaveProperty(
    "piActivity",
  );
});

it("reads one call's complete retained detail on demand, without another conversation's execution", async () => {
  const read = async (chatId: string, callId: string) =>
    GET(new Request("http://localhost/call"), {
      params: Promise.resolve({ applicationId: "app", chatId, callId }),
    });
  const file = await read("chat", "call:3");
  expect(file.headers.get("cache-control")).toBe("no-store");
  expect((await file.json()).activity.result).toContain("END-3");
  const command = await read("chat", "call:1");
  const body = await command.json();
  expect(body.activity.id).toBe("call:1");
  expect(body.execution.output).toContain("END-1");
  expect((await read("other-chat", history.executions[0].id)).status).toBe(404);
});
