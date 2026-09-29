import { afterEach, expect, it, vi } from "vitest";
import type { ChatSnapshot } from "../../../src/server/types";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("../../../src/server/pi-conversation", () => ({
  chatSnapshot: mocks.snapshot,
}));
import {
  invalidateSnapshotRead,
  refreshSnapshot,
} from "../../../src/server/chat-snapshot-reads";

const value = (status: ChatSnapshot["status"] = "idle"): ChatSnapshot => ({
  status,
  worker: { alive: true },
  messages: [],
  executions: [],
  piActivity: [],
  information: [],
});
function held() {
  let resolve!: (snapshot: ChatSnapshot) => void;
  const promise = new Promise<ChatSnapshot>((done) => (resolve = done));
  return { promise, resolve };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it("shares one pending refresh among ten readers and retains no settled value", async () => {
  const first = held();
  mocks.snapshot.mockReturnValueOnce(first.promise).mockResolvedValue(value());
  const readers = Array.from({ length: 10 }, () =>
    refreshSnapshot("app", "chat"),
  );
  expect(mocks.snapshot).toHaveBeenCalledOnce();
  const complete = value();
  first.resolve(complete);
  expect(
    (await Promise.all(readers)).every((snapshot) => snapshot === complete),
  ).toBe(true);
  await refreshSnapshot("app", "chat");
  expect(mocks.snapshot).toHaveBeenCalledTimes(2);
});

it("a notice prevents a new reader joining an older read, whose cleanup cannot discard the new read", async () => {
  const old = held(),
    latest = held();
  mocks.snapshot
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(latest.promise);
  const a = refreshSnapshot("app", "chat");
  invalidateSnapshotRead("app", "chat");
  const b = refreshSnapshot("app", "chat");
  old.resolve(value());
  await a;
  const c = refreshSnapshot("app", "chat");
  expect(mocks.snapshot).toHaveBeenCalledTimes(2);
  const current = value("working");
  latest.resolve(current);
  expect(await b).toBe(current);
  expect(await c).toBe(current);
});

it("isolates controller, application and chat scopes", async () => {
  const read = held();
  mocks.snapshot.mockReturnValue(read.promise);
  vi.stubEnv("HALLVI_DB_PATH", "/tmp/hallvi-snapshot-scope-one.db");
  const a = refreshSnapshot("app", "main");
  const b = refreshSnapshot("app", "side");
  const c = refreshSnapshot("other", "main");
  vi.stubEnv("HALLVI_DB_PATH", "/tmp/hallvi-snapshot-scope-two.db");
  const d = refreshSnapshot("app", "main");
  expect(mocks.snapshot).toHaveBeenCalledTimes(4);
  read.resolve(value());
  await Promise.all([a, b, c, d]);
});

it("releases a failed refresh so the next read can recover", async () => {
  mocks.snapshot
    .mockRejectedValueOnce(new Error("worker lost"))
    .mockResolvedValueOnce(value());
  await expect(refreshSnapshot("app", "chat")).rejects.toThrow("worker lost");
  expect((await refreshSnapshot("app", "chat")).worker.alive).toBe(true);
  expect(mocks.snapshot).toHaveBeenCalledTimes(2);
});
