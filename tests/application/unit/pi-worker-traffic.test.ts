// The worker looks after traffic history on a clock of its own. Its loop
// waits on the controller's copy, which can take minutes on a stalled
// upload; turning history off must still end the follow within seconds.

import { describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => ({
  ticks: 0,
  copying: 0,
  finishCopy: () => {},
}));
vi.mock("@earendil-works/pi-coding-agent", () => ({}));
vi.mock("@/server/pi-workspace", () => ({
  cleanupPiWorkspaces: async () => {},
}));
vi.mock("@/server/db", () => ({ databasePath: () => "/test/hallvi.db" }));
vi.mock("@/server/pi-owner", () => ({
  ownSessions: async () => ({
    owner: { conversations: {}, also: {}, live: () => 0 },
    close: async () => {},
  }),
}));
vi.mock("@/server/deployment-watch", () => ({
  deploymentWatch: () => ({ handle: {}, tick: async () => {} }),
}));
vi.mock("@/server/controller-protection", () => ({
  copyDue: () => true,
  // An upload that does not come back.
  protectController: () =>
    new Promise<void>((resolve) => {
      worker.copying += 1;
      worker.finishCopy = resolve;
    }),
}));
vi.mock("@/server/traffic/collector", () => ({
  TICK_MS: 20,
  trafficCollector: () => ({
    tick: async () => {
      worker.ticks += 1;
    },
    stop: async () => {},
  }),
}));

import { runPiWorker } from "@/server/pi-worker";

describe("the worker", () => {
  it("keeps looking after traffic history while the controller's copy waits", async () => {
    const stop = new AbortController();
    const running = runPiWorker(stop.signal);
    await vi.waitFor(() => expect(worker.copying).toBe(1));
    const before = worker.ticks;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(worker.copying).toBe(1);
    expect(worker.ticks - before).toBeGreaterThanOrEqual(5);
    stop.abort();
    worker.finishCopy();
    await running;
    // Stopped with the worker.
    const after = worker.ticks;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(worker.ticks).toBe(after);
  });
});
