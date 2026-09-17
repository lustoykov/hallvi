// One development command means one resolved environment, and a queue whose
// reader can be shown to exist. Both of those are claims a reader acts on:
// the first decides which database and which ChatGPT connection three
// processes use, and the second decides whether a waiting message is being
// worked on or sitting there.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  environmentVariables,
  resolveEnvironment,
  WORKER_BUSY_EXIT,
} from "../../../scripts/dev-environment.mjs";
import {
  piAccountLocation,
  stateLocation,
} from "../../../scripts/state-location.mjs";
import { databasePath } from "../../../src/server/db";
import { diagnosticLogPath } from "../../../src/server/diagnostics";
import {
  piAccountDir,
  piConfigDir,
} from "../../../src/server/pi-configuration";
import { WORKER_BUSY_EXIT as workerBusyExit } from "../../../src/server/pi-worker";
import { workerPresence } from "../../../src/server/worker-presence";

const keys = [
  "HALDUR_DB_PATH",
  "HALDUR_CONFIG_DIR",
  "HALDUR_PI_CONFIG_DIR",
  "HALDUR_LOG_DIR",
] as const;
let saved: Record<string, string | undefined>;
let root: string;

beforeEach(() => {
  saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  root = mkdtempSync(join(tmpdir(), "haldur-dev-start-"));
});
afterEach(() => {
  for (const key of keys)
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  rmSync(root, { recursive: true, force: true });
});

/** Apply what the launcher would hand a child, then ask the application. */
function asChild(environment: Record<string, string> = {}) {
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, environment);
  const resolved = resolveEnvironment(process.env, process.cwd());
  Object.assign(process.env, environmentVariables(resolved));
  return {
    database: databasePath(),
    config: piConfigDir(),
    piAccount: piAccountDir(),
    logs: join(diagnosticLogPath(), ".."),
  };
}

// The Pi account directory is the dangerous one. It is shared across checkouts
// on purpose, and a launcher that set a controller directory without it would
// isolate the owner's ChatGPT connection and ask them to sign in again.
it("hands every child the directories the application would have chosen", () => {
  const plain = asChild();
  // `.haldur` and ~/.config/haldur/pi.
  expect(plain.database).toBe(
    stateLocation(process.cwd(), { hidden: true }).database,
  );
  expect(plain.piAccount).not.toBe(plain.config);
  expect(plain.piAccount).toBe(piAccountLocation(homedir()));

  const moved = asChild({
    HALDUR_DB_PATH: join(root, "moved.db"),
    HALDUR_CONFIG_DIR: join(root, "state"),
  });
  expect(moved.database).toBe(join(root, "moved.db"));
  expect(moved.config).toBe(join(root, "state"));
  // An explicit controller directory isolates Pi too; the launcher must pass
  // that on rather than quietly resolve a shared account behind it.
  expect(moved.piAccount).toBe(join(root, "state"));

  const split = asChild({
    HALDUR_CONFIG_DIR: join(root, "state"),
    HALDUR_PI_CONFIG_DIR: join(root, "account"),
    HALDUR_LOG_DIR: join(root, "logs"),
  });
  expect(split.piAccount).toBe(join(root, "account"));
  expect(split.logs).toBe(join(root, "logs"));
});

it("says which exit code means another worker already holds the database", () => {
  expect(WORKER_BUSY_EXIT).toBe(workerBusyExit);
});

// A lock file exists after any worker has ever run. Reading it as a live
// worker is exactly the mistake that leaves a queued message looking like a
// reply being written.
it("believes a live worker only on evidence a worker is alive", () => {
  const database = join(root, "presence.db");
  process.env.HALDUR_DB_PATH = database;
  const beat = (value: Record<string, unknown>) =>
    writeFileSync(`${database}.worker-status`, JSON.stringify(value));

  expect(workerPresence().alive).toBe(false);

  beat({
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  });
  expect(workerPresence().alive).toBe(true);

  // Stopped beating: a crashed worker whose pid has been reused would
  // otherwise report itself alive forever.
  const old = new Date(Date.now() - 60_000).toISOString();
  beat({
    pid: process.pid,
    host: hostname(),
    startedAt: old,
    heartbeatAt: old,
  });
  expect(workerPresence().alive).toBe(false);

  // A process id that is no longer running, and one belonging to another
  // machine that reached the same database over a share.
  const now = new Date().toISOString();
  beat({ pid: 2 ** 30, host: hostname(), startedAt: now, heartbeatAt: now });
  expect(workerPresence().alive).toBe(false);
  beat({
    pid: process.pid,
    host: "another-machine",
    startedAt: now,
    heartbeatAt: now,
  });
  expect(workerPresence().alive).toBe(false);
});
