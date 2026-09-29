import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  notifyChange,
  subscribeChanges,
} from "../../../src/server/change-notifications";

let root: string;
let worker: ChildProcess | undefined;
let counts = { subscribers: 0, connections: 0, batches: [] as number[] };
const subscriptions: ReturnType<typeof subscribeChanges>[] = [];
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hv-notices-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", root);
  counts = { subscribers: 0, connections: 0, batches: [] };
});
afterEach(async () => {
  for (const subscription of subscriptions.splice(0)) subscription.close();
  if (worker) {
    const stopped = once(worker, "close");
    worker.kill("SIGTERM");
    await stopped;
    worker = undefined;
  }
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
async function start(config = root) {
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "tests/application/fixtures/change-owner.mjs"],
    {
      env: { ...process.env, HALLVI_CONFIG_DIR: config },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let errors = "";
  worker.stderr!.on("data", (chunk) => (errors += chunk));
  await new Promise<void>((resolve, reject) => {
    worker!.on("message", (message: { kind: string } & typeof counts) => {
      if (message.kind === "ready") resolve();
      else counts = message;
    });
    worker!.once("exit", (code) =>
      reject(new Error(`Notification owner exited (${code}): ${errors}`)),
    );
  });
}
function watch(applicationId: string, chatId: string, listener = vi.fn()) {
  const subscription = subscribeChanges({ applicationId, chatId }, listener);
  subscriptions.push(subscription);
  return { ...subscription, listener };
}

it("shares one upstream, scopes fanout, relays web writes once and detaches the last reader", async () => {
  await start();
  const app = randomUUID();
  const a = watch(app, randomUUID());
  const bChat = randomUUID();
  const b = watch(app, bChat);
  const other = watch(randomUUID(), randomUUID());
  await Promise.all([a.ready, b.ready, other.ready]);
  await vi.waitFor(() => expect(counts.connections).toBe(1));
  a.listener.mockClear();
  b.listener.mockClear();
  other.listener.mockClear();
  worker!.send({ kind: "chat", applicationId: app, chatId: bChat });
  await vi.waitFor(() => expect(b.listener).toHaveBeenCalledOnce());
  expect(a.listener).not.toHaveBeenCalled();
  expect(other.listener).not.toHaveBeenCalled();
  worker!.send({ kind: "information", applicationId: app });
  await vi.waitFor(() => expect(a.listener).toHaveBeenCalledOnce());
  expect(b.listener).toHaveBeenCalledTimes(2);
  expect(other.listener).not.toHaveBeenCalled();
  const broken = watch(
    app,
    bChat,
    vi.fn(() => {
      throw new Error("reader gone");
    }),
  );
  expect(() =>
    notifyChange({ kind: "application", applicationId: app }),
  ).not.toThrow();
  await vi.waitFor(() => expect(counts.batches).toEqual([1]));
  a.close();
  b.close();
  broken.close();
  expect(counts.subscribers).toBe(1);
  other.close();
  await vi.waitFor(() => expect(counts.subscribers).toBe(0));
});

it("relays more than one batch of coalesced scopes after the worker returns", async () => {
  const app = randomUUID();
  for (let index = 0; index < 300; index++)
    notifyChange({ kind: "chat", applicationId: app, chatId: randomUUID() });
  await start();
  await vi.waitFor(
    () =>
      expect(counts.batches.reduce((total, size) => total + size, 0)).toBe(300),
    { timeout: 5000 },
  );
  expect(Math.max(...counts.batches)).toBeLessThanOrEqual(256);
});

it("refuses a worker with the same database but different controller configuration", async () => {
  await start(join(root, "other-controller"));
  const subscription = watch(randomUUID(), randomUUID());
  await expect(subscription.ready).rejects.toThrow(
    "different controller storage",
  );
  expect(subscription.listener).toHaveBeenCalledWith({ kind: "error" });
});
