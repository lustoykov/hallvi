// One development command means one resolved environment: it decides which
// database and which ChatGPT connection three processes use.
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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

const keys = [
  "HALLVI_DB_PATH",
  "HALLVI_CONFIG_DIR",
  "HALLVI_PI_CONFIG_DIR",
  "HALLVI_LOG_DIR",
] as const;
let saved: Record<string, string | undefined>;
let root: string;

beforeEach(() => {
  saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  root = mkdtempSync(join(tmpdir(), "hallvi-dev-start-"));
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
  // `.hallvi` and ~/.config/hallvi/pi.
  expect(plain.database).toBe(
    stateLocation(process.cwd(), { hidden: true }).database,
  );
  expect(plain.piAccount).not.toBe(plain.config);
  expect(plain.piAccount).toBe(piAccountLocation(homedir()));

  const moved = asChild({
    HALLVI_DB_PATH: join(root, "moved.db"),
    HALLVI_CONFIG_DIR: join(root, "state"),
  });
  expect(moved.database).toBe(join(root, "moved.db"));
  expect(moved.config).toBe(join(root, "state"));
  // An explicit controller directory isolates Pi too; the launcher must pass
  // that on rather than quietly resolve a shared account behind it.
  expect(moved.piAccount).toBe(join(root, "state"));

  const split = asChild({
    HALLVI_CONFIG_DIR: join(root, "state"),
    HALLVI_PI_CONFIG_DIR: join(root, "account"),
    HALLVI_LOG_DIR: join(root, "logs"),
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
