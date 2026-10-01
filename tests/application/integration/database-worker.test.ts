import Database from "better-sqlite3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { holdRuntime } from "../../../scripts/retained-state.mjs";
import { DatabaseClient } from "../../../src/server/database-client";
import { askWorker, serveWorker } from "../../../src/server/worker-link";
import { pushTestDatabase } from "../../test-database";

let root: string;
let path: string;
const clients = new Set<DatabaseClient>();
function client() {
  const client = new DatabaseClient(path);
  clients.add(client);
  return client;
}
const input = (name: string) => ({
  name,
  repositoryUrl: `https://github.com/fixture/${name}`,
  repositoryOwner: "fixture",
  repositoryName: name,
});
async function writer(holdMs: number) {
  const thread = new Worker(resolve("tests/fixtures/database-lock.mjs"), {
    workerData: { path, holdMs },
  });
  const ended = once(thread, "exit");
  await once(thread, "message");
  return { ended };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-database-worker-"));
  path = join(root, "hallvi.db");
  pushTestDatabase(path);
});
afterEach(async () => {
  await Promise.all([...clients].map((client) => client.close()));
  clients.clear();
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

it("keeps timers and an unrelated HTTP request responsive during a real SQLite writer wait", async () => {
  const database = client();
  await database.call("createApplicationRecords", [
    input("contention"),
    "contention",
  ]);
  const holdMs = 800;
  async function measure(work: () => unknown) {
    const gaps: number[] = [];
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }, 10);
    try {
      await delay(30);
      // The lock holder runs in another thread, so it releases the lock even
      // when the baseline's synchronous .run() stalls this thread.
      const { ended } = await writer(holdMs);
      const start = performance.now();
      await work();
      const elapsed = performance.now() - start;
      await ended;
      await delay(30);
      return {
        elapsed: Math.round(elapsed),
        maxTimerGap: Math.round(Math.max(...gaps)),
      };
    } finally {
      clearInterval(timer);
    }
  }
  const server = createServer((_request, response) =>
    response.end("responsive"),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  let requestMs = 0;
  try {
    const baseline = await measure(() => {
      const direct = new Database(path);
      try {
        direct
          .prepare("UPDATE applications SET name = ? WHERE id = ?")
          .run("sync", "contention");
      } finally {
        direct.close();
      }
    });
    const asynchronous = await measure(async () => {
      let completed = false;
      const write = database
        .call("renameApplicationRow", ["contention", "async"])
        .then(() => {
          completed = true;
        });
      await delay(50);
      const start = performance.now();
      expect(
        await (await fetch(`http://127.0.0.1:${address.port}`)).text(),
      ).toBe("responsive");
      requestMs = Math.round(performance.now() - start);
      expect(completed).toBe(false);
      await write;
    });
    expect(baseline.maxTimerGap).toBeGreaterThan(holdMs / 2);
    expect(asynchronous.maxTimerGap).toBeLessThan(holdMs / 2);
    expect(requestMs).toBeLessThan(holdMs / 2);
    expect((await database.call("getApplication", ["contention"]))?.name).toBe(
      "async",
    );
    process.stdout.write(
      JSON.stringify({
        fixture: "800ms competing SQLite writer",
        baseline,
        asynchronous,
        requestMs,
      }) + "\n",
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

it("keeps application creation atomic, rolls back on an inner failure, and drains accepted work before close", async () => {
  const database = client();
  await database.call("listApplications", []);
  const fixture = new Database(path);
  fixture.exec(`CREATE TRIGGER refuse_fixture_chat BEFORE INSERT ON conversations
    WHEN NEW.application_id = 'rollback' BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END`);
  try {
    await expect(
      database.call("createApplicationRecords", [
        input("rollback"),
        "rollback",
      ]),
    ).rejects.toMatchObject({
      name: "SqliteError",
      code: "SQLITE_CONSTRAINT_TRIGGER",
    });
    expect(await database.call("getApplication", ["rollback"])).toBeNull();
    const simultaneous = await Promise.all(
      Array.from({ length: 4 }, () =>
        database.call("createApplicationRecords", [input("atomic"), "atomic"]),
      ),
    );
    expect(simultaneous.filter((result) => result.created)).toHaveLength(1);
    expect(
      await database.call("listApplicationChats", ["atomic"]),
    ).toHaveLength(1);
    const chats = await Promise.all(
      Array.from({ length: 3 }, () => database.call("insertChat", ["atomic"])),
    );
    expect(chats.map((chat) => chat.title)).toEqual([
      "Conversation 2",
      "Conversation 3",
      "Conversation 4",
    ]);
    const pending = database.call("renameApplicationRow", ["atomic", "kept"]);
    const closing = database.close();
    await expect(database.call("listApplications", [])).rejects.toThrow(
      "closing",
    );
    await pending;
    await closing;
    expect((await client().call("getApplication", ["atomic"]))?.name).toBe(
      "kept",
    );
  } finally {
    fixture.exec("DROP TRIGGER refuse_fixture_chat");
    fixture.close();
  }
});

it("finishes close in a process with no other referenced handles", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    `import { DatabaseClient } from "./src/server/database-client.ts";
const database = new DatabaseClient(process.argv[1]);
await database.call("listApplications", []);
await database.close();
console.log("closed");`,
    path,
  ]);
  expect(stdout.trim()).toBe("closed");
});

it("rejects pending and future calls on thread failure without replaying writes", async () => {
  const database = client();
  await database.call("listApplications", []);
  // Stop it while native SQLite is waiting. It may commit before termination
  // is observed; the caller must receive uncertainty and never replay it.
  const { ended } = await writer(400);
  const pending = database.call("renameApplicationRow", [
    "atomic",
    "acknowledgement lost",
  ]);
  const rejected = expect(pending).rejects.toThrow(/Database worker/);
  await delay(30);
  const stopped = database.worker.terminate();
  await rejected;
  await stopped;
  await ended;
  await expect(database.call("listApplications", [])).rejects.toThrow(
    /Database worker/,
  );
  await database.close();
  // A new owner can reopen the same file; the failed client never restarts.
  expect(await client().call("listApplications", [])).toBeInstanceOf(Array);
});

it("refuses unowned retained state and holds ownership until its connection closes", async () => {
  // A synthetic retained directory, never a registered application.
  writeFileSync(
    join(root, "retained.json"),
    JSON.stringify({
      state: realpathSync(root),
      application: { name: "fixture" },
    }),
  );
  const attached = holdRuntime(root);
  if ("refused" in attached) throw new Error("Fixture could not attach");
  writeFileSync(
    join(root, "runtime.json"),
    JSON.stringify({ runtimeId: "fixture-owner" }),
  );
  try {
    vi.stubEnv("HALLVI_RUNTIME_ID", "not-the-owner");
    const refused = client();
    await expect(refused.call("listApplications", [])).rejects.toThrow(
      "retained state",
    );
    await refused.close();

    vi.stubEnv("HALLVI_RUNTIME_ID", "fixture-owner");
    const owned = client();
    await owned.call("listApplications", []);
    attached.release();
    expect(holdRuntime(root)).toEqual({ refused: "open" });
    await owned.close();
    const reopened = holdRuntime(root);
    if ("refused" in reopened)
      throw new Error("Closed connection kept its ownership hold");
    reopened.release();
  } finally {
    attached.release();
    vi.unstubAllEnvs();
    rmSync(join(root, "retained.json"));
    rmSync(join(root, "runtime.json"));
  }
});

it("serves no Pi requests before asynchronous recovery and releases ownership when recovery fails", async () => {
  vi.stubEnv("HALLVI_DB_PATH", path);
  let fail!: (error: Error) => void;
  const recovery = new Promise<void>((_resolve, reject) => {
    fail = reject;
  });
  const starting = serveWorker(
    async () => ({ ready: true }),
    () => recovery,
  );
  const refused = expect(starting).rejects.toThrow("fixture recovery failed");
  try {
    await expect(askWorker("fixture", {})).rejects.toThrow(
      /worker is not running/,
    );
    fail(new Error("fixture recovery failed"));
    await refused;
    const restarted = await serveWorker(async () => ({ ready: true }));
    expect(restarted).not.toBeNull();
    try {
      expect(await askWorker("fixture", {})).toEqual({ ready: true });
    } finally {
      await new Promise<void>((done) => restarted!.server.close(() => done()));
      restarted!.release();
    }
  } finally {
    vi.unstubAllEnvs();
  }
});
