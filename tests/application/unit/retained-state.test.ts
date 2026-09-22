// A retained application's records are opened by the runtime that attached
// them and by nothing else. The rule is one function, read by the database
// module, both launchers and the migration; this holds it to its three
// answers and checks that a second attach is refused at the command.
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  holdRuntime,
  retainedRefusal,
} from "../../../scripts/retained-state.mjs";

let root: string;
let state: string;
const runtimeId = "11111111-1111-4111-8111-111111111111";

function mark(directory: string, protectedState = directory) {
  writeFileSync(
    join(directory, "retained.json"),
    JSON.stringify({
      version: 1,
      state: realpathSync(protectedState),
      directory: "demo",
      application: { id: "app", name: "demo" },
      port: 5999,
      format: { schema: 18, pi: "0.85.1" },
      separatedAt: "2026-09-22T00:00:00Z",
    }),
  );
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
    expect(held).not.toBeNull();
    expect(
      retainedRefusal(database, { HALLVI_RUNTIME_ID: runtimeId }),
    ).toBeNull();
    expect(retainedRefusal(database, { HALLVI_RUNTIME_ID: "other" })).toMatch(
      /attached from \/w on b/,
    );
    expect(retainedRefusal(database, {})).toMatch(/attached from \/w on b/);
  } finally {
    held?.release();
  }

  // A copy elsewhere carries the mark of the directory it came from, which is
  // not this one: it is for looking at and trying things on.
  const copy = join(root, "copy");
  mkdirSync(copy);
  writeFileSync(join(copy, "hallvi.db"), "");
  mark(copy, state);
  expect(retainedRefusal(join(copy, "hallvi.db"), {})).toBeNull();
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
  const run = (...args: string[]) => {
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
  };
  try {
    expect(run("status").out).toMatch(
      /demo.*attached from \/elsewhere on theirs/,
    );
    const refused = run("attach", "demo");
    expect(refused.code).toBe(2);
    expect(refused.out).toMatch(/attached from \/elsewhere on theirs/);
  } finally {
    held?.release();
  }
});
