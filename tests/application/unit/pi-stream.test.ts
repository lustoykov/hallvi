import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  invalidate: vi.fn(),
  close: vi.fn(),
  ready: Promise.resolve(),
  notify: (() => {}) as (notice: { kind: string }) => void,
}));
vi.mock("../../../src/server/pi-conversation", () => ({
  chatSnapshot: mocks.snapshot,
}));
vi.mock("../../../src/server/applications", async (original) => ({
  ...(await original<typeof import("../../../src/server/applications")>()),
  loadChat: vi.fn(),
}));
vi.mock("../../../src/server/operator-execution", async (original) => ({
  ...(await original<
    typeof import("../../../src/server/operator-execution")
  >()),
  invalidateExecutionReads: mocks.invalidate,
}));
vi.mock("../../../src/server/change-notifications", () => ({
  subscribeChanges: (_scope: unknown, listener: typeof mocks.notify) => {
    mocks.notify = listener;
    return { ready: mocks.ready, close: mocks.close };
  },
}));
import { GET } from "../../../src/app/api/applications/[applicationId]/chats/[chatId]/events/route";

const context = {
  params: Promise.resolve({ applicationId: "app", chatId: "chat" }),
};
const snapshot = (revision: number) => ({
  messages: [{ id: "answer", revision }],
});
const frame = async (reader: ReadableStreamDefaultReader<Uint8Array>) =>
  new TextDecoder().decode((await reader.read()).value);
let controller: AbortController;
async function open() {
  return GET(
    new Request("http://localhost/events", { signal: controller.signal }),
    context,
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  controller = new AbortController();
  mocks.ready = Promise.resolve();
  mocks.snapshot.mockResolvedValue(snapshot(1));
});
afterEach(() => {
  controller.abort();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("does no idle reads, coalesces active bursts at 500ms, and cleans up on disconnect", async () => {
  const response = await open();
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  const reader = response.body!.getReader();
  expect(await frame(reader)).toContain('"revision":1');
  await vi.advanceTimersByTimeAsync(16_000);
  expect(await frame(reader)).toBe(": keep-alive\n\n");
  expect(mocks.snapshot).toHaveBeenCalledTimes(1);
  // 100 token events in one second produce two current-state reads.
  for (let event = 0; event < 100; event++) {
    mocks.notify({ kind: "chat" });
    await vi.advanceTimersByTimeAsync(10);
  }
  expect(mocks.snapshot).toHaveBeenCalledTimes(3);
  // Invalidate for the initial read, never for idle time or tokens.
  expect(mocks.invalidate).toHaveBeenCalledOnce();
  controller.abort();
  expect((await reader.read()).done).toBe(true);
  expect(mocks.close).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.snapshot).toHaveBeenCalledTimes(3);
});

it("keeps a notification arriving during the initial snapshot", async () => {
  let release!: (value: unknown) => void;
  mocks.snapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const opening = open();
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.snapshot).toHaveBeenCalledOnce();
  mocks.notify({ kind: "execution" });
  mocks.snapshot.mockResolvedValue(snapshot(2));
  release(snapshot(1));
  const reader = (await opening).body!.getReader();
  expect(await frame(reader)).toContain('"revision":1');
  await vi.advanceTimersByTimeAsync(500);
  expect(await frame(reader)).toContain('"revision":2');
  expect(mocks.invalidate).toHaveBeenCalledWith("app");
});

it("keeps changes arriving during an async refresh and never overlaps reads", async () => {
  const reader = (await open()).body!.getReader();
  await frame(reader);
  let release!: (value: unknown) => void;
  mocks.snapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  mocks.notify({ kind: "chat" });
  await vi.advanceTimersByTimeAsync(500);
  mocks.notify({ kind: "information" });
  await vi.advanceTimersByTimeAsync(2000);
  expect(mocks.snapshot).toHaveBeenCalledTimes(2);
  mocks.snapshot.mockResolvedValue(snapshot(3));
  release(snapshot(2));
  expect(await frame(reader)).toContain('"revision":2');
  await vi.advanceTimersByTimeAsync(100);
  expect(await frame(reader)).toContain('"revision":3');
});

it("closes a stalled reader instead of queuing more full snapshots", async () => {
  const reader = (await open()).body!.getReader();
  mocks.snapshot.mockResolvedValue(snapshot(2));
  mocks.notify({ kind: "chat" });
  await vi.advanceTimersByTimeAsync(500);
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(await frame(reader)).toContain('"revision":1');
  expect((await reader.read()).done).toBe(true);
});

it("rejects cross-origin streams before reading any chat", async () => {
  const response = await GET(
    new Request("http://localhost/events", {
      headers: { Origin: "https://untrusted.example" },
    }),
    context,
  );
  expect(response.status).toBe(400);
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
