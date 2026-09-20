// The persistent Hallvi development environment: one controller, one state
// directory, and a few applications that are really deployed and stay that way
// between tasks.
//
// Fixtures that are recreated every task can only ever prove that a fresh
// database works. What this environment is for is the other half: an
// application whose identity, conversation and data are older than the code
// currently running, so an upgrade that quietly loses one of them is visible.
//
// Everything lives under one directory, `~/.local/share/hallvi-dev` unless
// HALLVI_DEV_ROOT says otherwise:
//
//   program/   a checkout pinned to the revision the controller runs
//   state/     HALLVI_DATA_DIR: database, conversations, credentials
//   backups/   verified copies, taken before anything rewrites state
//   run/       the running controller's process id and log
//   instance.json  what this environment is, and which fixtures belong to it
//   claims.json    who is currently changing what
//
// It is deliberately not a service. The installed Hallvi on this account owns
// launchd's `com.hallvi`, and a second copy that starts or stops "its" service
// would replace the owner's installation; this one is an ordinary background
// process this command starts and stops.
import Database from "better-sqlite3";
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const root =
  process.env.HALLVI_DEV_ROOT?.trim() ||
  join(homedir(), ".local", "share", "hallvi-dev");
const program = join(root, "program");
const state = join(root, "state");
const backups = join(root, "backups");
const run = join(root, "run");
const registerPath = join(root, "instance.json");
const claimsPath = join(root, "claims.json");
const pidPath = join(run, "dev-instance.pid");
const logPath = join(run, "dev-instance.log");
const configuration = join(state, "config");
const database = join(state, "hallvi.db");
const settings = join(state, "hallvi.env");

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

/** The controller runs on Node 22, whatever this command was started with. */
function node22() {
  const candidates = [
    process.env.HALLVI_DEV_NODE?.trim(),
    process.execPath,
    "/opt/homebrew/opt/node@22/bin/node",
    "/usr/local/opt/node@22/bin/node",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const printed = execFileSync(candidate, ["--version"], {
        encoding: "utf8",
      });
      if (printed.startsWith("v22.")) return candidate;
    } catch {
      // Not a usable Node; try the next one.
    }
  }
  return fail(
    "No Node.js 22 found. Set HALLVI_DEV_NODE to one, as the checked-in CI baseline requires.",
  );
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

/** Written whole and renamed, so a crash never leaves half a register. */
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.writing`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}

const register = () =>
  readJson(registerPath) ??
  fail(
    `No environment at ${root}. Its register, ${registerPath}, is what says which applications belong to it; see docs/development-environment.md.`,
  );

const port = () => Number(register().port);
const url = () => `http://127.0.0.1:${port()}`;

/**
 * The revision the controller is running, and which tracked files differ from
 * it. `next build` rewrites `next-env.d.ts`, so a built program is never quite
 * clean; naming the files is more use than calling the whole thing edited.
 */
function revision() {
  if (!existsSync(join(program, ".git"))) return { sha: null, edited: [] };
  const git = (...args) =>
    execFileSync("git", ["-C", program, ...args], { encoding: "utf8" }).trim();
  return {
    sha: git("rev-parse", "HEAD"),
    edited: git("status", "--porcelain", "-uno")
      .split("\n")
      .filter(Boolean)
      // Porcelain is "XY <path>", and the leading space of the first line
      // is gone: git() trims what it reads.
      .map((line) => line.replace(/^\s*\S+\s+/, "")),
  };
}

function schema() {
  if (!existsSync(database)) return { database: null, program: null };
  const open = new Database(database, { readonly: true });
  try {
    return {
      database: open.pragma("user_version", { simple: true }),
      program:
        readJson(join(program, "dist", "schema-version.json"))?.version ?? null,
    };
  } finally {
    open.close();
  }
}

/** The applications the controller actually holds, by id. */
function applications() {
  if (!existsSync(database)) return [];
  const open = new Database(database, { readonly: true });
  try {
    return open.prepare("SELECT id, name, host FROM applications").all();
  } finally {
    open.close();
  }
}

async function answering(target = url()) {
  try {
    const response = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    return response.status;
  } catch {
    return null;
  }
}

/** The controller this command started, if it is still there. */
function running() {
  if (!existsSync(pidPath)) return null;
  const recorded = Number(readFileSync(pidPath, "utf8").trim());
  if (!Number.isInteger(recorded)) return null;
  try {
    process.kill(recorded, 0);
    return recorded;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- claims

const claims = () => readJson(claimsPath, []);

/**
 * Who is asking. A task sets HALLVI_DEV_HOLDER to its own id; otherwise it is
 * the person at the keyboard. Stable across invocations on purpose, so
 * releasing your own claim is ordinary and releasing somebody else's is not.
 */
const holder = () =>
  process.env.HALLVI_DEV_HOLDER?.trim() || process.env.USER || "someone";

/**
 * Inspection needs no claim; a change does. `environment` covers the
 * controller, its schema and the shared host, so it conflicts with everything.
 * An application claim conflicts only with itself and the environment.
 */
function conflicting(scope, held) {
  return held.filter(
    (claim) =>
      claim.scope === scope ||
      claim.scope === "environment" ||
      scope === "environment",
  );
}

function claim([scope, ...rest]) {
  if (!scope)
    return fail(
      "Name what you are claiming: environment, or an application id or name.",
    );
  const reason = rest.join(" ").trim();
  if (!reason)
    return fail("Say why, in a few words: dev-instance claim <scope> <reason>");
  const held = claims();
  const blocked = conflicting(scope, held);
  if (blocked.length) {
    console.error("Held by someone else:");
    for (const claim of blocked)
      console.error(
        `  ${claim.scope}  ${claim.holder}  since ${claim.at}\n    ${claim.reason}`,
      );
    console.error(
      "\nWait, or — if that task is gone — release it deliberately:\n  dev-instance release <scope> --force",
    );
    process.exit(1);
  }
  const mine = holder();
  writeJson(claimsPath, [
    ...held,
    { scope, holder: mine, reason, at: new Date().toISOString() },
  ]);
  console.log(
    `Claimed ${scope} as ${mine}. Release it when you are done:\n  dev-instance release ${scope}`,
  );
}

function release([scope, ...rest]) {
  if (!scope) return fail("Name what you are releasing.");
  const forced = rest.includes("--force");
  const held = claims();
  const mine = holder();
  const remaining = held.filter(
    (claim) => claim.scope !== scope || !(forced || claim.holder === mine),
  );
  if (remaining.length === held.length)
    return fail(
      held.some((claim) => claim.scope === scope)
        ? `${scope} is held by someone else. Use --force only when you know that task has stopped.`
        : `Nothing claims ${scope}.`,
    );
  writeJson(claimsPath, remaining);
  console.log(`Released ${scope}.`);
}

// ------------------------------------------------------------- lifecycle

async function start() {
  const existing = await answering();
  if (existing !== null)
    return fail(
      `Something already answers ${url()}. If that is this environment, it is already running; if not, move one of them before starting.`,
    );
  if (!existsSync(join(program, "dist", "worker.mjs")))
    return fail(
      `${program} is not built. Run: npm ci && npm run build, in that directory.`,
    );
  const { database: held, program: needed } = schema();
  if (held !== null && held !== needed)
    return fail(
      `The state is schema ${held} and ${program} needs ${needed}. Nothing was started. Either check out the revision that wrote it, or back up and upgrade:\n  dev-instance backup\n  npm run db:upgrade   (with HALLVI_DB_PATH=${database})`,
    );
  mkdirSync(run, { recursive: true, mode: 0o700 });
  const log = openSync(logPath, "a", 0o600);
  const node = node22();
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("HALLVI_")),
  );
  const child = spawn(node, [join(program, "scripts", "serve.mjs")], {
    cwd: program,
    detached: true,
    stdio: ["ignore", log, log],
    env: {
      ...environment,
      PATH: [
        dirname(node),
        environment.PATH,
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
      ]
        .filter(Boolean)
        .join(":"),
      HALLVI_DATA_DIR: state,
      NODE_ENV: "production",
    },
  });
  child.unref();
  closeSync(log);
  writeFileSync(pidPath, `${child.pid}\n`, { mode: 0o600 });
  for (let waited = 0; waited < 90; waited++) {
    if ((await answering()) !== null) {
      console.log(
        `Hallvi development environment on ${url()}, state in ${state}.`,
      );
      return;
    }
    await new Promise((wake) => setTimeout(wake, 1000));
  }
  fail(`It did not answer ${url()} within 90 seconds. The log is ${logPath}.`);
}

/**
 * `start` detaches the launcher, which makes it a process group leader, so the
 * signal goes to the group: the interface and the worker are its children, and
 * signalling the launcher alone leaves them holding the port and the worker
 * lock while it waits for them.
 */
function signal(pid, sig) {
  try {
    process.kill(-pid, sig);
  } catch {
    process.kill(pid, sig);
  }
}

/** The launcher's children, named, so stopping can say what is holding on. */
function children(pid) {
  const printed = execFileSync("ps", ["-eo", "pid=,ppid=,command="], {
    encoding: "utf8",
  });
  return printed
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter((found) => found && Number(found[2]) === pid)
    .map((found) => ({
      pid: Number(found[1]),
      what: /worker\.mjs/.test(found[3])
        ? "the Pi worker"
        : /next-server|next/.test(found[3])
          ? "the interface"
          : found[3].slice(0, 40),
    }));
}

async function stop() {
  const pid = running();
  if (!pid) {
    rmSync(pidPath, { force: true });
    return console.log("Not running.");
  }
  signal(pid, "SIGTERM");
  let left = [];
  for (let waited = 0; waited < 60; waited++) {
    left = running() ? children(pid) : [];
    if (!running() && !left.length) break;
    await new Promise((wake) => setTimeout(wake, 500));
  }
  if (running()) {
    // The worker is the one that must not be interrupted, and it goes first
    // and quickly. The interface can outlast this: Next.js waits for requests
    // in flight, and an open Hallvi tab holds a live event stream open.
    const worker = left.some((child) => child.what === "the Pi worker");
    console.log(
      `Still there after 30 seconds: ${left.map((child) => child.what).join(", ") || "the launcher"}.` +
        (worker
          ? " The Pi worker is among them, so something may be mid-write."
          : " The Pi worker already stopped cleanly; an open Hallvi tab keeps the interface waiting on its event stream.") +
        " Killed.",
    );
    signal(pid, "SIGKILL");
  }
  rmSync(pidPath, { force: true });
  console.log("Stopped.");
}

// ---------------------------------------------------------------- backup

/**
 * A copy that can actually be restored: SQLite through its own backup, so a
 * checkpoint mid-write cannot tear it, and the conversations, credentials and
 * configuration beside it, which restoring the database alone would not bring
 * back. The controller must be stopped; a backup taken under a running worker
 * would not agree with the sessions it is writing.
 */
async function backup(label = "manual") {
  if (running() || (await answering()) !== null)
    return fail("Stop the controller first: dev-instance stop");
  if (!existsSync(database)) return fail(`No state at ${database}.`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const into = join(backups, `${stamp}-${label}`);
  mkdirSync(into, { recursive: true, mode: 0o700 });
  const source = new Database(database, { readonly: true });
  const version = source.pragma("user_version", { simple: true });
  await source.backup(join(into, "hallvi.db"));
  source.close();

  const copied = [];
  for (const name of [
    "config",
    "pi-sessions",
    "pi-workspaces",
    "diagnostics",
    "hallvi.env",
  ]) {
    const from = join(state, name);
    if (!existsSync(from)) continue;
    cpSync(from, join(into, name), {
      recursive: true,
      preserveTimestamps: true,
    });
    copied.push(name);
  }

  const check = new Database(join(into, "hallvi.db"), { readonly: true });
  const intact =
    check.pragma("integrity_check", { simple: true }) === "ok" &&
    check.pragma("user_version", { simple: true }) === version;
  const rows = check
    .prepare("SELECT COUNT(*) AS count FROM applications")
    .get().count;
  check.close();
  if (!intact) {
    rmSync(into, { recursive: true, force: true });
    return fail(
      "The copy did not verify. Nothing was kept, and the state is untouched.",
    );
  }
  writeJson(join(into, "manifest.json"), {
    takenAt: new Date().toISOString(),
    label,
    schema: version,
    applications: rows,
    revision: revision().sha,
    copied,
    restore: `dev-instance stop, then replace ${state} with this directory's contents.`,
  });
  console.log(
    `Backed up to ${into}: schema ${version}, ${rows} applications, plus ${copied.join(", ")}.`,
  );
  console.log(
    `To restore: dev-instance stop, then copy this directory's contents back over ${state}.`,
  );
}

// ------------------------------------------------------------- bootstrap

/**
 * Makes the environment usable again from whatever is left of it, and says
 * what it cannot restore. It never creates an application: a fixture that is
 * gone was either deleted on purpose or lost, and both deserve a sentence
 * rather than a silent redeployment.
 */
function bootstrap() {
  const held = register();
  for (const directory of [state, configuration, backups, run])
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  const wanted = `HALLVI_PORT=${held.port}`;
  const lines = existsSync(settings)
    ? readFileSync(settings, "utf8")
        .split("\n")
        .filter((line) => line && !line.startsWith("HALLVI_PORT="))
    : [];
  writeFileSync(settings, `${[...lines, wanted].join("\n")}\n`, {
    mode: 0o600,
  });

  const repaired = repairKeyPaths();
  for (const message of repaired) console.log(message);

  const present = new Map(applications().map((row) => [row.id, row]));
  const missing = held.applications.filter(
    (application) => !present.has(application.id),
  );
  console.log(
    `State ${state}, port ${held.port}, ${present.size} applications in the database.`,
  );
  if (!existsSync(join(program, "dist", "worker.mjs")))
    console.log(
      `${program} is not built yet: npm ci && npm run build, in that directory.`,
    );
  if (missing.length) {
    console.log("\nRegistered fixtures that are not in the database:");
    for (const application of missing)
      console.log(
        `  ${application.name} (${application.id}) — ${application.exercises}`,
      );
    console.log(
      "\nNothing was recreated. Deploy one again through a conversation in this\nenvironment, restore a backup, or drop it from the register:\n  dev-instance forget <id>",
    );
  }
}

/**
 * The managed SSH key and known-hosts file are recorded in the database as
 * absolute paths. State that has been moved here still names where it came
 * from — often a worktree that is about to be removed — and a key this
 * environment does not own is a key that can disappear under it. The copy
 * under its own configuration directory is the same key; anything else is
 * reported rather than guessed at.
 */
function repairKeyPaths() {
  if (!existsSync(database)) return [];
  const open = new Database(database);
  const said = [];
  try {
    for (const row of open
      .prepare("SELECT id, name, host FROM applications")
      .all()) {
      if (!row.host) continue;
      const host = JSON.parse(row.host);
      let changed = false;
      for (const field of ["privateKeyPath", "knownHostsPath"]) {
        const path = host[field];
        if (!path || path.startsWith(`${configuration}/`)) continue;
        const index = path.indexOf("/operator/");
        const here =
          index === -1 ? null : join(configuration, path.slice(index + 1));
        if (here && existsSync(here)) {
          host[field] = here;
          changed = true;
        } else {
          said.push(
            `${row.name}: ${field} is ${path}, which is not there and has no copy under ${configuration}.`,
          );
        }
      }
      if (changed) {
        open
          .prepare("UPDATE applications SET host = ? WHERE id = ?")
          .run(JSON.stringify(host), row.id);
        said.push(
          `${row.name}: its connection now points at the key under ${configuration}.`,
        );
      }
    }
  } finally {
    open.close();
  }
  return said;
}

function forget([id]) {
  const held = register();
  const kept = held.applications.filter((application) => application.id !== id);
  if (kept.length === held.applications.length)
    return fail(`The register has no application ${id}.`);
  writeJson(registerPath, { ...held, applications: kept });
  console.log(
    `Dropped ${id} from the register. Nothing on the host or in the database was touched.`,
  );
}

// ------------------------------------------------------------ status/smoke

async function status() {
  const held = register();
  const { sha, edited } = revision();
  const { database: schemaHeld, program: schemaNeeded } = schema();
  const live = await answering();
  const present = new Map(applications().map((row) => [row.id, row]));

  console.log(
    `${held.name} — ${url()}${live === null ? "  (not answering)" : ""}`,
  );
  console.log(`  state     ${state}`);
  console.log(`  program   ${program}`);
  console.log(
    `  revision  ${sha ?? "unknown"}${sha === held.baseline ? "  = baseline" : `  is not the baseline ${held.baseline}`}`,
  );
  if (edited.length) console.log(`  edited    ${edited.join(", ")}`);
  console.log(
    `  schema    ${schemaHeld ?? "no database"}${schemaNeeded && schemaHeld !== schemaNeeded ? `  (the program needs ${schemaNeeded})` : ""}`,
  );
  console.log(`  process   ${running() ?? "not started by this command"}`);
  console.log(
    `  host      ${held.host.address} — ${held.host.provider} ${held.host.serverId}, ${held.host.cost}`,
  );

  console.log("\n  applications");
  for (const application of held.applications) {
    const row = present.get(application.id);
    console.log(
      `    ${row ? "·" : "!"} ${application.name}  ${application.id}`,
    );
    console.log(`        ${application.exercises}`);
    console.log(
      `        ${application.url}${row ? "" : "   MISSING from the database"}`,
    );
  }

  const active = claims();
  console.log(
    `\n  claims    ${active.length ? "" : "none; inspection needs none"}`,
  );
  for (const claim of active)
    console.log(
      `    ${claim.scope}  ${claim.holder}  since ${claim.at}\n        ${claim.reason}`,
    );
  console.log(
    `\n  Last checked by this command: now. "Persistent" means retained until retired, not monitored.`,
  );
}

async function smoke() {
  const held = register();
  const results = [];
  const controller = await answering();
  results.push([
    controller !== null && controller < 500,
    `controller answers ${url()}`,
    String(controller),
  ]);
  const present = new Map(applications().map((row) => [row.id, row]));
  for (const application of held.applications) {
    results.push([
      present.has(application.id),
      `${application.name} is application ${application.id}`,
      present.has(application.id) ? "present" : "absent",
    ]);
    const status = await answering(application.url);
    results.push([
      status !== null && status < 500,
      `${application.name} answers ${application.url}`,
      String(status),
    ]);
  }
  for (const [ok, what, detail] of results)
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}  (${detail})`);
  const failed = results.filter(([ok]) => !ok).length;
  console.log(
    failed
      ? `\n${failed} of ${results.length} checks failed.`
      : `\nAll ${results.length} checks passed.`,
  );
  process.exitCode = failed ? 1 : 0;
}

const [command, ...rest] = process.argv.slice(2);
const commands = {
  status,
  start,
  stop,
  bootstrap,
  backup: () => backup(rest[0]),
  smoke,
  claim: () => claim(rest),
  release: () => release(rest),
  forget: () => forget(rest),
};
if (!commands[command])
  fail(
    `Usage: node scripts/dev-instance.mjs <command>

  status                     where it is, what it holds, who is changing it
  start | stop               the controller, as a plain background process
  smoke                      the small check: controller and applications answer
  claim <scope> <reason>     before changing something: environment, or an application
  release <scope> [--force]  afterwards
  backup [label]             a verified copy of state, before anything rewrites it
  bootstrap                  make it usable again, and say what is missing
  forget <id>                drop a fixture from the register, deliberately

Described in docs/development-environment.md.`,
  );
await commands[command]();
