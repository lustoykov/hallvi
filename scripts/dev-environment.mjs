// Where this development run keeps its state, decided once.
//
// Next, the studio and the worker each resolve these for themselves from
// defaults relative to a working directory. Started from the same directory
// they agree — until one of them is not, which is how a studio in another
// checkout ends up serving another checkout's rows. The launcher resolves them
// here and hands every child the same answers, so "the same database" is a
// fact about the run rather than a coincidence of where it was started.
//
// The precedence below is the application's own, and a test holds this file to
// it: `databasePath` in `src/server/db.ts`, `piConfigDir` and `piAccountDir` in
// `src/server/pi-configuration.ts`, `diagnosticLogPath` in
// `src/server/diagnostics.ts`. The Pi account directory is the one that
// matters most to get right: it is shared across checkouts on purpose, and a
// launcher that "helpfully" set a controller directory without it would
// isolate the owner's ChatGPT connection and ask them to sign in again.
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export function resolveEnvironment(env = process.env, cwd = process.cwd()) {
  const database = resolve(
    cwd,
    env.SERVER_GUY_DB_PATH ?? join(cwd, ".server-guy", "server-guy.db"),
  );
  const config = resolve(
    cwd,
    env.SERVER_GUY_CONFIG_DIR ?? join(cwd, ".server-guy"),
  );
  const piAccount = resolve(
    cwd,
    env.SERVER_GUY_PI_CONFIG_DIR?.trim() ||
      env.SERVER_GUY_CONFIG_DIR ||
      join(homedir(), ".config", "server-guy", "pi"),
  );
  const logs = resolve(
    cwd,
    env.SERVER_GUY_LOG_DIR?.trim() || join(dirname(database), "diagnostics"),
  );
  return { database, config, piAccount, logs };
}

/** The same values as the environment every child is given. */
export function environmentVariables(resolved) {
  return {
    SERVER_GUY_DB_PATH: resolved.database,
    SERVER_GUY_CONFIG_DIR: resolved.config,
    SERVER_GUY_PI_CONFIG_DIR: resolved.piAccount,
    SERVER_GUY_LOG_DIR: resolved.logs,
  };
}

/**
 * The worker exited because another worker already holds this database.
 * `WORKER_BUSY_EXIT` in `src/server/pi-worker.ts` is the same number, and a
 * test keeps the two in step.
 */
export const WORKER_BUSY_EXIT = 3;
