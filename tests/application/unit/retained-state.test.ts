// A retained application's records are opened by the runtime that attached
// them and by nothing else, and stay that runtime's until it has let go of
// them properly. The rule is a few functions, read by the database module,
// both launchers, the migration and the attach command; this holds them to
// their answers and reproduces the ways a hand-off could go wrong: an old
// process still holding the records, one Ctrl-C read as two, a worker whose
// status is unknown read as idle, and a snapshot whose histories nothing
// could read.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import { pushTestDatabase } from "../../test-database";

import {
  drainWorker,
  holdRuntime,
  keepRuntimeOpen,
  retainedRefusal,
  stopRequest,
} from "../../../scripts/retained-state.mjs";
import {
  holdWorker,
  workerSocketPath,
} from "../../../scripts/worker-socket.mjs";

let root: string;
let state: string;
const runtimeId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";

function mark(directory: string, protectedState = directory) {
  writeFileSync(
    join(directory, "retained.json"),
    JSON.stringify({
      version: 1,
      state: realpathSync(protectedState),
      directory: "demo",
      application: { id: applicationId, name: "demo" },
      port: 5999,
      format: { schema: 18, pi: "0.85.1" },
      separatedAt: "2026-09-22T00:00:00Z",
    }),
  );
}

/** The attach command against this test's root. */
function command(...args: string[]) {
  try {
    return {
      code: 0,
      out: execFileSync(
        process.execPath,
        ["scripts/retained-application.mjs", ...args],
        {
          encoding: "utf8",
          env: { ...process.env, HALLVI_DEV_ROOT: root },
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    };
  } catch (error) {
    const failed = error as { status: number; stderr: string };
    return { code: failed.status, out: failed.stderr };
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-retained-"));
  state = join(root, "applications", "demo", "state");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "hallvi.db"), "");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("opens unmarked state and copies freely, and marked state only for its runtime", () => {
  const database = join(state, "hallvi.db");
  expect(retainedRefusal(database, {})).toBeNull();

  mark(state);
  expect(retainedRefusal(database, {})).toMatch(/only its attached runtime/);
  // The right id without the lock is a leftover from a runtime that ended.
  writeFileSync(
    join(state, "runtime.json"),
    JSON.stringify({ runtimeId, worktree: "/w", branch: "b", pid: 1 }),
  );
  expect(retainedRefusal(database, { HALLVI_RUNTIME_ID: runtimeId })).toMatch(
    /Nothing is attached/,
  );
  const held = holdRuntime(state);
  try {
    expect(held.refused).toBeUndefined();
    expect(
      retainedRefusal(database, { HALLVI_RUNTIME_ID: runtimeId }),
    ).toBeNull();
    expect(retainedRefusal(database, { HALLVI_RUNTIME_ID: "other" })).toMatch(
      /attached from \/w on b/,
    );
    expect(retainedRefusal(database, {})).toMatch(/attached from \/w on b/);
  } finally {
    held.release?.();
  }

  // A copy elsewhere carries the mark of the directory it came from, which is
  // not this one: it is for looking at and trying things on.
  const copy = join(root, "copy");
  mkdirSync(copy);
  writeFileSync(join(copy, "hallvi.db"), "");
  mark(copy, state);
  expect(retainedRefusal(join(copy, "hallvi.db"), {})).toBeNull();
});

// Ownership was checked only when the database was opened, and the
// connection then cached: an app that outlived its runtime kept writing under
// the next owner. Now every process that was let in keeps the directory open
// for as long as it lives, and no attach can begin past it.
it("refuses a new runtime while a process from the old one still has the records open", () => {
  mark(state);
  const runtime = holdRuntime(state);
  expect(runtime.refused).toBeUndefined();
  // The runtime's own app and worker sit beside its hold.
  const app = keepRuntimeOpen(state);
  const worker = keepRuntimeOpen(state);
  runtime.release?.();
  // The runtime is gone; its children are not.
  const next = holdRuntime(state);
  expect(next.refused).toBe("open");
  const refused = command("attach", "demo");
  expect(refused.code).toBe(2);
  expect(refused.out).toMatch(/still has its records open/);
  worker.release();
  expect(holdRuntime(state).refused).toBe("open");
  app.release();
  const free = holdRuntime(state);
  expect(free.refused).toBeUndefined();
  free.release?.();
});

it("refuses a second attach while a runtime holds the application", () => {
  mark(state);
  writeFileSync(
    join(state, "runtime.json"),
    JSON.stringify({
      runtimeId,
      worktree: "/elsewhere",
      branch: "theirs",
      pid: process.pid,
      ports: { app: 5999 },
      attachedAt: "2026-09-22T10:00:00Z",
    }),
  );
  const held = holdRuntime(state);
  try {
    expect(command("status").out).toMatch(
      /demo.*attached from \/elsewhere on theirs/,
    );
    const refused = command("attach", "demo");
    expect(refused.code).toBe(2);
    expect(refused.out).toMatch(/attached from \/elsewhere on theirs/);
  } finally {
    held.release?.();
  }
});

// Ctrl-C reaches the attach command and the launcher together, and the attach
// command forwarded a SIGTERM on top: the launcher read its own first request
// twice and stopped the worker mid-turn. Only the terminal's second Ctrl-C is
// a second request.
it("reads a forwarded copy of the first stop as the same request, and a second Ctrl-C as force", () => {
  expect(stopRequest(false, "SIGINT")).toBe("detach");
  expect(stopRequest(false, "SIGTERM")).toBe("detach");
  expect(stopRequest(true, "SIGTERM")).toBe("ignore");
  expect(stopRequest(true, "SIGINT")).toBe("force");
});

// A worker that answered badly was read as no worker, so a detach that could
// not learn the worker's status stopped it and called the stop clean.
it("never calls a stop clean when the worker's status is unknown or work is still going on", async () => {
  const wait = async () => {};
  const say: string[] = [];
  const options = {
    limitMs: 60_000,
    wait,
    say: (line: string) => say.push(line),
  };
  expect(await drainWorker(async () => null, options)).toBe("idle");
  let asked = 0;
  expect(
    await drainWorker(async () => ({ busy: asked++ < 2 ? 1 : 0 }), options),
  ).toBe("idle");
  expect(
    await drainWorker(async () => {
      throw new Error("The worker answered 500");
    }, options),
  ).toBe("unknown");
  expect(say.at(-1)).toMatch(/could not be read/);
  // Still busy when the second Ctrl-C comes, or when the limit is reached.
  let forced = false;
  expect(
    await drainWorker(async () => ((forced = true), { busy: 1 }), {
      ...options,
      forced: () => forced,
    }),
  ).toBe("busy");
  expect(
    await drainWorker(async () => ({ busy: 3 }), { ...options, limitMs: 0 }),
  ).toBe("busy");
});

it("tells a worker that answers badly apart from no worker at all", async () => {
  const database = join(state, "hallvi.db");
  expect(await holdWorker(database)).toBeNull();
  let status = 500;
  const server = createServer((_request, response) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(status === 200 ? '{"held":true,"busy":2}' : '{"error":"x"}');
  });
  await new Promise<void>((resolve) =>
    server.listen(workerSocketPath(database), resolve),
  );
  try {
    await expect(holdWorker(database)).rejects.toThrow(/answered 500/);
    status = 200;
    expect(await holdWorker(database)).toMatchObject({ busy: 2 });
  } finally {
    server.close();
  }
});

// A snapshot's histories are read through a worker, so a snapshot run without
// one showed "worker unavailable" over the very histories it had copied.
it("copies the histories into a snapshot and says to run the pair on it, with no login", () => {
  pushTestDatabase(join(state, "hallvi.db"));
  mark(state);
  const history = join(state, "pi-sessions", applicationId, "chat", "x");
  mkdirSync(history, { recursive: true });
  writeFileSync(join(history, "2026-09-22_s.jsonl"), '{"kind":"header"}\n');
  mkdirSync(join(state, "config", "operator", applicationId, "ssh"), {
    recursive: true,
  });
  writeFileSync(
    join(state, "config", "operator", applicationId, "ssh", "id_ed25519"),
    "secret",
  );
  const into = join(root, "snap");
  const made = command("snapshot", into, "demo");
  expect(made.code).toBe(0);
  expect(
    existsSync(
      join(
        into,
        "state",
        "pi-sessions",
        applicationId,
        "chat",
        "x",
        "2026-09-22_s.jsonl",
      ),
    ),
  ).toBe(true);
  expect(
    existsSync(join(into, "state", "config", "operator", applicationId, "ssh")),
  ).toBe(false);
  expect(readdirSync(join(into, "account"))).toEqual([]);
  expect(made.out).toMatch(/npm run dev/);
  expect(made.out).toMatch(
    new RegExp(`HALLVI_PI_CONFIG_DIR=${join(into, "account")}`),
  );
});
