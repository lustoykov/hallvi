// Runs an installed Hallvi: the built interface and the bundled Pi worker,
// as one foreground process an operating-system service can own.
//
// `scripts/dev.mjs` is the development counterpart and the differences are the
// point. Nothing here compiles, watches or browses: no `next dev`, no `tsx`,
// no `drizzle-kit`, no studio. State lives under one data directory outside the
// program directory, so replacing or removing the program leaves records,
// credentials and conversations where they were.
//
// Restarting is the service manager's job, not this file's. When either child
// stops unexpectedly the launcher stops the other and exits non-zero, and
// launchd or systemd starts the pair again. The one exception is the worker
// stepping aside for a live one: something is reading the queue, so the
// interface stays up.
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  environmentVariables,
  resolveEnvironment,
  WORKER_BUSY_EXIT,
} from "./dev-environment.mjs";
import { supported } from "./migrations.mjs";
import { installedPorts } from "./installed-ports.mjs";
import {
  piAccountLocation,
  stateFiles,
  stateLocation,
} from "./state-location.mjs";

const program = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkingInstalled = process.argv.includes("--check-installed");
let state;
try {
  // A managed installation always supplies HALLVI_DATA_DIR. A foreground
  // `npm start` from a checkout stays with that checkout's development state
  // instead of silently opening the installed controller.
  const chosen = process.env.HALLVI_DATA_DIR?.trim();
  state = chosen
    ? stateFiles(resolve(chosen))
    : checkingInstalled
      ? stateLocation(join(homedir(), ".local", "share"))
      : stateLocation(program, { hidden: true });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const data = state.directory;
if (!checkingInstalled) mkdirSync(data, { recursive: true, mode: 0o700 });

// Settings an installation keeps for itself, such as the GitHub App's client
// ID. Values already in the environment win, as they do for `--env-file`.
if (existsSync(state.settings)) process.loadEnvFile(state.settings);
// A release can carry its distributor's public App identity. Local settings
// can deliberately replace it, but a partially configured local override is
// never mixed with the release's other value.
const releaseGithubApp = join(program, "dist", "github-app.json");
if (
  existsSync(releaseGithubApp) &&
  !process.env.HALLVI_GITHUB_CLIENT_ID &&
  !process.env.HALLVI_GITHUB_APP_SLUG
) {
  const app = JSON.parse(readFileSync(releaseGithubApp, "utf8"));
  if (app.clientId && app.slug) {
    process.env.HALLVI_GITHUB_CLIENT_ID = app.clientId;
    process.env.HALLVI_GITHUB_APP_SLUG = app.slug;
  }
}

// The model account stays where development keeps it, so a machine that
// already connected ChatGPT does not connect again. An owner who moves the
// configuration directory moves the account with it, as in development.
const moved =
  process.env.HALLVI_PI_CONFIG_DIR?.trim() || process.env.HALLVI_CONFIG_DIR;
const resolved = resolveEnvironment(
  {
    HALLVI_DB_PATH: state.database,
    HALLVI_CONFIG_DIR: join(data, "config"),
    ...(moved
      ? {}
      : {
          HALLVI_PI_CONFIG_DIR: piAccountLocation(homedir()),
        }),
    ...process.env,
  },
  data,
);
const ports = installedPorts(process.env);

/**
 * A new installation gets its tables from the schema the package was built
 * with. An existing database is never altered: one from another schema version
 * stops the service with the reason, and the file is left exactly as it was.
 */
class SchemaMismatchError extends Error {}

function prepareDatabase({ initialize = true, migratable = false } = {}) {
  const { version } = JSON.parse(
    readFileSync(join(program, "dist", "schema-version.json"), "utf8"),
  );
  if (!existsSync(resolved.database) && !initialize) return;
  mkdirSync(dirname(resolved.database), { recursive: true, mode: 0o700 });
  const database = new Database(
    resolved.database,
    initialize ? undefined : { readonly: true },
  );
  try {
    const populated = database
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
      )
      .get();
    if (!populated) {
      if (!initialize) return;
      database.exec(readFileSync(join(program, "dist", "schema.sql"), "utf8"));
      database.pragma(`user_version = ${version}`);
      return;
    }
    const current = database.pragma("user_version", { simple: true });
    if (current === version) return;
    // Asked whether this program could be installed over these records, a
    // migration it can carry out is a yes with a sentence. Asked to start on
    // them, it is still a no: starting is not the moment to rewrite anything,
    // and `install.sh` runs the migration before it gets here.
    if (migratable && supported(current, version)) {
      console.log(
        `${resolved.database} holds schema ${current}; this Hallvi needs ${version} and can migrate it during the upgrade.`,
      );
      return;
    }
    throw new SchemaMismatchError(
      `${resolved.database} holds schema ${current} and this Hallvi needs schema ${version}. Nothing was changed. Install the version that wrote it, or move the file aside to start fresh.`,
    );
  } finally {
    database.close();
  }
}

try {
  prepareDatabase({
    initialize: !checkingInstalled,
    migratable: checkingInstalled,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  // A schema mismatch is permanent until the owner chooses a version or a
  // database. A managed service must stop instead of filling its logs forever;
  // an interactive check still reports failure conventionally.
  process.exit(
    error instanceof SchemaMismatchError &&
      !checkingInstalled &&
      process.env.HALLVI_MANAGED_SERVICE === "1"
      ? 0
      : 1,
  );
}

if (checkingInstalled) {
  console.log("Hallvi can open this controller database.");
  process.exit(0);
}

const children = new Set();
let stopping = false;

function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: program,
    stdio: "inherit",
    env: {
      ...process.env,
      ...environmentVariables(resolved),
      NODE_ENV: "production",
      HALLVI_TERMINAL_PORT: String(ports.terminal),
      HALLVI_PRIVATE_PORTS: `${ports.privateFirst}-${ports.privateLast}`,
    },
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function stop(signal, code) {
  if (code !== undefined) process.exitCode ??= code;
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stop(signal, 0));
// However this process ends, it does not leave the pair behind holding the
// ports and the worker lock in front of the service manager's next attempt.
process.on("exit", () => {
  for (const child of children) child.kill("SIGKILL");
});

console.log(
  `Hallvi on http://127.0.0.1:${ports.web}, keeping its state in ${data}`,
);

const web = start([
  join(program, "node_modules", "next", "dist", "bin", "next"),
  "start",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(ports.web),
]);
web.on("exit", (code) => {
  if (!stopping) console.error(`The interface stopped with code ${code}.`);
  stop("SIGTERM", code || 1);
});

const worker = start([join(program, "dist", "worker.mjs")]);
worker.on("exit", (code, signal) => {
  if (stopping) return;
  if (code === WORKER_BUSY_EXIT) {
    console.warn(
      "Another Pi worker already serves this database; leaving it to that one.",
    );
    return;
  }
  console.error(
    `The Pi worker stopped ${signal ? `on ${signal}` : `with code ${code}`}. Stopping so the service manager starts both again.`,
  );
  stop("SIGTERM", code || 1);
});
