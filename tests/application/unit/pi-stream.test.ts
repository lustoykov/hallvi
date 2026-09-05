import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("../../../src/server/pi-runs", () => ({
  chatRunSnapshot: mocks.snapshot,
}));
import { GET } from "../../../src/app/api/applications/[applicationId]/chats/[chatId]/events/route";

afterEach(() => {
  vi.useRealTimers();
  mocks.snapshot.mockReset();
});
const context = {
  params: Promise.resolve({ applicationId: "app", chatId: "chat" }),
};
it("streams authoritative saved revisions, deduplicates unchanged frames and cleans up on disconnect", async () => {
  vi.useFakeTimers();
  mocks.snapshot.mockReturnValue({
    messages: [{ id: "answer", revision: 1 }],
    runs: [{ status: "running" }],
  });
  const controller = new AbortController();
  const response = await GET(
    new Request("http://localhost/events", { signal: controller.signal }),
    context,
  );
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    '"revision":1',
  );
  await vi.advanceTimersByTimeAsync(500);
  mocks.snapshot.mockReturnValue({
    messages: [{ id: "answer", revision: 3 }],
    runs: [{ status: "succeeded" }],
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    '"revision":3',
  );
  controller.abort();
  expect((await reader.read()).done).toBe(true);
  const calls = mocks.snapshot.mock.calls.length;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.snapshot).toHaveBeenCalledTimes(calls);
  expect(mocks.snapshot).toHaveBeenCalledWith("app", "chat");
});
it("rejects cross-origin streams before reading any Chat", async () => {
  const response = await GET(
    new Request("http://localhost/events", {
      headers: { Origin: "https://untrusted.example" },
    }),
    context,
  );
  expect(response.status).toBe(400);
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
