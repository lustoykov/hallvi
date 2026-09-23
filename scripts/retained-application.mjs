// Owning one retained development application at a time, from any checkout.
//
//   retained-application.mjs status                 the four, and who has them
//   retained-application.mjs attach <name> [--accept-format] [--after-crash]
//   retained-application.mjs detach <name>
//   retained-application.mjs snapshot <directory> [name...]
//
// Each application's records live in `~/.local/share/hallvi-dev/applications/
// <name>/state`, outside every checkout, and stay there whoever is working on
// them. `attach` makes this checkout that application's runtime: it refuses an
// application somebody else has, checks that this program reads the formats
// on disk, takes a verified copy, writes down who is attaching, and starts
// `npm run dev` on that state with the application's own port. It stays in
// the foreground holding the ownership lock; Ctrl-C, or `detach` from
// anywhere, stops the interface, lets Pi finish, stops the worker and only
// then lets go. A `snapshot` is a copy for looking at, with nothing in it that
// could reach a host.
import Database from "better-sqlite3";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  DETACH_FORCED_EXIT,
  holdRuntime,
  MARK_FILE,
  readMark,
  readRuntime,
  runtimeHeld,
  RUNTIME_FILE,
} from "./retained-state.mjs";
import { piAccountLocation } from "./state-location.mjs";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = resolve(
  process.env.HALLVI_DEV_ROOT?.trim() ||
    join(homedir(), ".local", "share", "hallvi-dev"),
);
const APPLICATIONS = join(ROOT, "applications");
/** Attach copies kept per application; the tool removes its older ones. */
const KEEP_BACKUPS = 5;

class Refused extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

function git(args, cwd = checkout) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}

/** The retained applications on this machine, marked and in their place. */
export function listApplications() {
  if (!existsSync(APPLICATIONS)) return [];
  return readdirSync(APPLICATIONS)
    .sort()
    .flatMap((directory) => {
      const state = join(APPLICATIONS, directory, "state");
      const mark = readMark(state);
      if (!mark) return [];
      return [
        {
          directory,
          state,
          mark,
          runtime: readRuntime(state),
          attached: runtimeHeld(state),
          backups: join(APPLICATIONS, directory, "backups"),
        },
      ];
    });
}

function find(name) {
  const found = listApplications().find(
    (each) =>
      each.directory === name ||
      each.mark.application.name === name ||
      each.mark.application.id === name,
  );
  if (!found)
    throw new Refused(
      `No retained application called ${name} under ${APPLICATIONS}. Known: ${
        listApplications()
          .map((each) => each.directory)
          .join(", ") || "none"
      }.`,
    );
  return found;
}

/** What this program needs on disk: the schema and Pi's history format. */
function programFormat() {
  return {
    schema: readJson(join(checkout, "src", "server", "schema-version.json"))
      .version,
    pi: readJson(join(checkout, "package.json")).dependencies[
      "@earendil-works/pi-agent-core"
    ],
  };
}

function inspectDatabase(path) {
  const database = new Database(path, { readonly: true });
  try {
    const count = (table) =>
      database.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    return {
      schema: database.pragma("user_version", { simple: true }),
      intact: database.pragma("integrity_check", { simple: true }) === "ok",
      counts: {
        applications: count("applications"),
        conversations: count("conversations"),
        savedInformation: count("saved_information"),
      },
    };
  } finally {
    database.close();
  }
}

/** Who has the database open, as ` (pids …)`, where `lsof` can say; else "". */
function openedBy(state) {
  try {
    const pids = execFileSync(
      "lsof",
      ["-t", join(state, "hallvi.db"), join(state, "runtime.lock")],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\n")
      .map((line) => line.trim())
      .filter((pid) => pid && Number(pid) !== process.pid);
    return pids.length ? ` (pid ${[...new Set(pids)].join(", ")})` : "";
  } catch {
    // Nothing listed, or no lsof: the lock above is the answer that counts.
    return "";
  }
}

/** Whether a Pi worker — anyone's — is serving this database right now. */
function workerHeld(state) {
  const lock = new Database(
    `${join(realpathSync(state), "hallvi.db")}.worker-lock`,
    { timeout: 0 },
  );
  try {
    lock.exec("BEGIN EXCLUSIVE");
    return false;
  } catch {
    return true;
  } finally {
    lock.close();
  }
}

// Copies

/** Files that belong to a process, not to the records. */
const VOLATILE = new Set([
  RUNTIME_FILE,
  "runtime.lock",
  "worker.sock",
  "hallvi.db-wal",
  "hallvi.db-shm",
  "hallvi.db.worker-lock",
  "hallvi.db.worker-lock-journal",
]);

function walk(root, directory = root, found = []) {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const relativePath = path.slice(root.length + 1);
    if (directory === root && VOLATILE.has(name)) continue;
    if (relativePath === "pi-sessions/.locks") continue;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink())
      throw new Refused(`Refusing a symbolic link in retained state: ${path}`);
    if (stat.isDirectory()) walk(root, path, found);
    else if (stat.isFile()) found.push(relativePath);
  }
  return found;
}

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

/**
 * A copy of a state directory, verified file by file: the database through
 * SQLite's own backup and reopened, everything else compared by hash.
 */
export async function copyState(state, into) {
  mkdirSync(into, { recursive: true, mode: 0o700 });
  const files = walk(state);
  const copied = [];
  for (const relativePath of files) {
    const source = join(state, relativePath);
    const target = join(into, relativePath);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    if (relativePath === "hallvi.db") {
      const database = new Database(source, { readonly: true });
      try {
        await database.backup(target);
      } finally {
        database.close();
      }
      continue;
    }
    copyFileSync(source, target);
    const digest = sha256(source);
    if (digest !== sha256(target))
      throw new Error(`${relativePath} did not copy intact.`);
    copied.push({ path: relativePath, sha256: digest });
  }
  const before = inspectDatabase(join(state, "hallvi.db"));
  const after = inspectDatabase(join(into, "hallvi.db"));
  for (const companion of ["-wal", "-shm"])
    rmSync(join(into, `hallvi.db${companion}`), { force: true });
  if (
    !after.intact ||
    after.schema !== before.schema ||
    JSON.stringify(after.counts) !== JSON.stringify(before.counts)
  )
    throw new Error("The copied database did not verify.");
  const manifest = {
    takenAt: new Date().toISOString(),
    source: state,
    database: { path: "hallvi.db", ...after },
    files: copied,
  };
  writeJson(join(into, "manifest.json"), manifest);
  return manifest;
}

function pruneBackups(directory) {
  if (!existsSync(directory)) return;
  const mine = readdirSync(directory)
    .filter((name) => /-attach-/.test(name))
    .sort();
  for (const name of mine.slice(0, Math.max(0, mine.length - KEEP_BACKUPS)))
    rmSync(join(directory, name), { recursive: true, force: true });
}

// After a crash

function executionsStillRunning(state, applicationId) {
  const directory = join(
    state,
    "config",
    "operator",
    applicationId,
    "executions",
  );
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))
    .map((name) => readJson(join(directory, name)))
    .filter((record) =>
      ["running", "awaiting-approval"].includes(record.status),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * What the host has been running since the earliest interrupted command
 * began. The controller cannot know whether a command outlived its SSH
 * session; the host can be asked.
 */
function hostProcessesSince(state, since) {
  const database = new Database(join(state, "hallvi.db"), { readonly: true });
  let host;
  try {
    const row = database.prepare("SELECT host FROM applications").get();
    host = row?.host ? JSON.parse(row.host) : null;
  } finally {
    database.close();
  }
  if (!host?.address) return "The application has no host to ask.";
  try {
    const listed = execFileSync(
      "ssh",
      [
        "-F",
        "/dev/null",
        "-i",
        host.privateKeyPath,
        "-p",
        String(host.port ?? 22),
        "-o",
        `UserKnownHostsFile=${host.knownHostsPath}`,
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "ConnectTimeout=10",
        `${host.user}@${host.address}`,
        "ps -eo pid,etimes,args --no-headers",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 },
    );
    const now = Date.now();
    const lines = listed
      .split("\n")
      .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter(Boolean)
      .filter(
        ([, , elapsed, args]) =>
          now - Number(elapsed) * 1000 >= since - 5_000 &&
          !args.startsWith("[") &&
          !args.includes("ps -eo pid,etimes,args"),
      )
      .map(
        ([, pid, elapsed, args]) =>
          `  ${pid}  ${elapsed}s  ${args.slice(0, 120)}`,
      );
    return lines.length
      ? `Processes on ${host.address} started since then:\n${lines.join("\n")}`
      : `Nothing on ${host.address} has been running since then.`;
  } catch (error) {
    return `The host could not be asked: ${error instanceof Error ? error.message.split("\n")[0] : error}`;
  }
}

// Commands

export function status() {
  const applications = listApplications();
  if (!applications.length)
    return `No retained applications under ${APPLICATIONS}.`;
  return applications
    .map(({ directory, mark, runtime, attached, state }) => {
      const where = attached
        ? `attached from ${runtime?.worktree} on ${runtime?.branch ?? "a detached HEAD"} (pid ${runtime?.pid}, since ${runtime?.attachedAt}) — http://127.0.0.1:${runtime?.ports?.app ?? mark.port}`
        : runtime
          ? `free, but its last runtime ${runtime.outcome === "forced" ? "was stopped before Pi was known to be idle" : "did not detach"} (${runtime.worktree} on ${runtime.branch}, ${runtime.stoppedAt ?? runtime.attachedAt})`
          : "free";
      return `${directory.padEnd(13)} ${mark.application.name} · ${where}\n${"".padEnd(14)}schema ${mark.format.schema}, Pi ${mark.format.pi} · ${state}`;
    })
    .join("\n");
}

async function attach(name, flags) {
  const application = find(name);
  const { state, mark, directory } = application;
  // One runtime per checkout: `next dev` refuses a second server from the
  // same directory, and a checkout holding two applications would be two
  // things at once anyway.
  const here = realpathSync(checkout);
  const holding = listApplications().find(
    (each) => each.attached && each.runtime?.worktree === here,
  );
  if (holding && holding.directory !== directory)
    throw new Refused(
      `This checkout already holds ${holding.directory} (pid ${holding.runtime?.pid}, at http://127.0.0.1:${holding.runtime?.ports?.app}). One checkout runs one application; detach it first, or attach ${directory} from another worktree.`,
    );
  const held = holdRuntime(state);
  if (held.refused === "attached") {
    const owner = readRuntime(state);
    throw new Refused(
      `${directory} is attached from ${owner?.worktree ?? "another checkout"} on ${owner?.branch ?? "a detached HEAD"} (pid ${owner?.pid}, since ${owner?.attachedAt}), at http://127.0.0.1:${owner?.ports?.app ?? mark.port}. Detach it there first: node scripts/retained-application.mjs detach ${directory}`,
    );
  }
  if (held.refused === "open")
    throw new Refused(
      `An app or worker from an earlier runtime of ${directory} still has its records open${openedBy(state)}. Stop it before attaching; an old process must not keep writing under a new owner.`,
    );
  try {
    if (workerHeld(state))
      throw new Refused(
        `A Pi worker is still serving ${join(state, "hallvi.db")}, so no runtime can take it. Stop that worker first.`,
      );
    // A studio, or a shell, opens the database without passing through the
    // rule above. Where the system can list who has the file open, ask it.
    const others = openedBy(state);
    if (others)
      throw new Refused(
        `Something still has ${join(state, "hallvi.db")} open${others}. Stop it before attaching.`,
      );

    const previous = readRuntime(state);
    if (previous) {
      console.warn(
        `The last runtime of ${directory} — ${previous.worktree} on ${previous.branch}, attached ${previous.attachedAt} — ${previous.outcome === "forced" ? "was stopped before Pi was known to be idle" : "ended without detaching"}.`,
      );
      const running = executionsStillRunning(state, mark.application.id);
      if (running.length) {
        console.warn(
          `${running.length} command${running.length === 1 ? "" : "s"} still recorded as running:`,
        );
        for (const record of running)
          console.warn(
            `  ${record.createdAt}  ${record.tool} on ${record.target}: ${String(
              record.input?.command ??
                record.input?.description ??
                JSON.stringify(record.input),
            )
              .split("\n")[0]
              .slice(0, 100)}`,
          );
        console.warn(
          hostProcessesSince(state, Date.parse(running[0].createdAt)),
        );
        if (!flags.afterCrash)
          throw new Refused(
            "Look at what the host is still doing before deploying again. When you have, attach with --after-crash; the worker then records these commands as interrupted.",
            3,
          );
      }
    }

    const program = programFormat();
    const database = inspectDatabase(join(state, "hallvi.db"));
    if (!database.intact)
      throw new Refused(`${join(state, "hallvi.db")} does not check out.`, 3);
    if (database.schema !== program.schema)
      throw new Refused(
        `${directory} is at schema ${database.schema}; this checkout reads ${program.schema}. ${
          database.schema < program.schema
            ? `Migrate it deliberately first — node scripts/migrate-state.mjs --plan --data ${state}, then --apply — or attach from a checkout that reads schema ${database.schema}.`
            : `Attach from a checkout that reads schema ${database.schema}; an older program does not open a newer database.`
        }`,
        3,
      );
    if (mark.format.pi !== program.pi && !flags.acceptFormat)
      throw new Refused(
        `${directory}'s histories were written by Pi ${mark.format.pi}; this checkout bundles ${program.pi}. Pi's history format is a compatibility boundary: try this checkout on a snapshot first, then attach with --accept-format to record ${program.pi}.`,
        3,
      );

    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = (branch ?? "detached").replace(/[^A-Za-z0-9._-]+/g, "-");
    const into = join(application.backups, `${stamp}-attach-${slug}`);
    console.log(`Copying ${state} to ${into} …`);
    const manifest = await copyState(state, into);
    console.log(
      `Verified: schema ${manifest.database.schema}, ${manifest.database.counts.applications} application, ${manifest.database.counts.conversations} conversation(s), ${manifest.database.counts.savedInformation} saved record(s), ${manifest.files.length} other files.`,
    );
    pruneBackups(application.backups);
    if (mark.format.pi !== program.pi)
      writeJson(join(state, MARK_FILE), {
        ...mark,
        format: { ...mark.format, pi: program.pi },
      });

    const runtime = {
      runtimeId: randomUUID(),
      pid: process.pid,
      worktree: realpathSync(checkout),
      branch,
      revision: git(["rev-parse", "HEAD"]),
      ports: { app: mark.port },
      attachedAt: new Date().toISOString(),
      node: process.version,
    };
    writeJson(join(state, RUNTIME_FILE), runtime);
    console.log(
      `Attached ${directory} (${mark.application.name}) from ${branch ?? "a detached HEAD"}: http://127.0.0.1:${mark.port}. Ctrl-C detaches.`,
    );

    const child = spawn(
      process.execPath,
      [
        "--env-file-if-exists=.env",
        "--env-file-if-exists=.env.local",
        join(checkout, "scripts", "dev.mjs"),
      ],
      {
        cwd: checkout,
        stdio: "inherit",
        env: {
          ...process.env,
          HALLVI_DB_PATH: join(state, "hallvi.db"),
          HALLVI_CONFIG_DIR: join(state, "config"),
          HALLVI_PI_CONFIG_DIR:
            process.env.HALLVI_PI_CONFIG_DIR?.trim() ||
            piAccountLocation(homedir()),
          HALLVI_LOG_DIR: join(state, "diagnostics"),
          PORT: String(mark.port),
          HALLVI_RUNTIME_ID: runtime.runtimeId,
        },
      },
    );
    // Ctrl-C reaches the launcher directly; forwarding it too would read as
    // a second request there. A `detach` from elsewhere arrives as SIGTERM
    // to this process alone, and that one is passed on.
    process.on("SIGINT", () => {});
    process.on("SIGTERM", () => child.kill("SIGTERM"));
    const [code, signal] = await once(child, "exit");
    if (code === 0) {
      rmSync(join(state, RUNTIME_FILE), { force: true });
      console.log(`Detached ${directory}; its records are free.`);
      return;
    }
    const outcome = code === DETACH_FORCED_EXIT ? "forced" : "crashed";
    writeJson(join(state, RUNTIME_FILE), {
      ...runtime,
      stoppedAt: new Date().toISOString(),
      outcome,
      exit: code ?? signal,
    });
    console.warn(
      outcome === "forced"
        ? `Detached ${directory} before Pi was known to be idle. The next attach accounts for it.`
        : `The runtime of ${directory} stopped on its own (${code ?? signal}). The next attach accounts for it.`,
    );
    process.exitCode = 1;
  } finally {
    held.release();
  }
}

async function detach(name) {
  const { state, directory } = find(name);
  const runtime = readRuntime(state);
  if (!runtimeHeld(state)) {
    console.log(
      runtime
        ? `${directory} is not attached; its last runtime (${runtime.worktree} on ${runtime.branch}) ${runtime.outcome === "forced" ? "was stopped before Pi was known to be idle" : "ended without detaching"}.`
        : `${directory} is not attached.`,
    );
    return;
  }
  // Held, but the record is not yet this attach's own: it is still checking
  // and copying, and the pid on file, if any, belongs to a runtime that ended.
  if (!runtime || runtime.outcome)
    throw new Refused(
      `${directory} is being attached right now; detach it once it has started.`,
    );
  process.kill(runtime.pid, "SIGTERM");
  console.log(
    `Asked ${runtime.worktree} (pid ${runtime.pid}) to detach ${directory}; waiting for Pi to finish …`,
  );
  const deadline = Date.now() + 6 * 60_000;
  while (runtimeHeld(state)) {
    if (Date.now() > deadline)
      throw new Refused(
        `${directory} is still attached; look at that terminal.`,
      );
    await delay(500);
  }
  const after = readRuntime(state);
  console.log(
    after
      ? `Detached, but ${after.outcome === "forced" ? "before Pi was known to be idle" : "the runtime did not end cleanly"}; the next attach accounts for it.`
      : `Detached ${directory}; its records are free.`,
  );
}

/**
 * A copy for looking at several applications' real records in one
 * controller, made so that it cannot operate anything: no SSH keys, no
 * secrets, no connection requests, and an empty account directory to run it
 * with, so there is no ChatGPT login for a worker and no provider token for
 * the interface. The recorded key paths point inside the snapshot, where no
 * key is.
 */
export async function snapshot(into, names) {
  into = resolve(into);
  if (existsSync(into) && readdirSync(into).length)
    throw new Refused(`${into} is not empty.`);
  const chosen = names.length ? names.map(find) : listApplications();
  if (!chosen.length) throw new Refused("Nothing to snapshot.");
  const state = join(into, "state");
  const account = join(into, "account");
  for (const directory of [state, account, join(state, "config")])
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = join(state, "hallvi.db");
  for (const [index, application] of chosen.entries()) {
    const source = join(application.state, "hallvi.db");
    if (index === 0) {
      const database = new Database(source, { readonly: true });
      try {
        await database.backup(target);
      } finally {
        database.close();
      }
    } else {
      const database = new Database(target);
      try {
        database.exec(
          `ATTACH DATABASE '${source.replace(/'/g, "''")}' AS other`,
        );
        for (const table of [
          "applications",
          "conversations",
          "messages",
          "saved_information",
        ])
          database.exec(
            `INSERT OR IGNORE INTO ${table} SELECT * FROM other.${table}`,
          );
        database.exec("DETACH DATABASE other");
      } finally {
        database.close();
      }
    }
    const id = application.mark.application.id;
    for (const part of ["executions", "activity"]) {
      const from = join(application.state, "config", "operator", id, part);
      if (existsSync(from))
        cpRecursive(from, join(state, "config", "operator", id, part));
    }
    const sessions = join(application.state, "pi-sessions", id);
    if (existsSync(sessions))
      cpRecursive(
        sessions,
        join(state, "pi-sessions", id),
        (name) => name !== ".locks",
      );
    const workspaces = join(application.state, "pi-workspaces");
    if (existsSync(workspaces))
      cpRecursive(
        workspaces,
        join(state, "pi-workspaces"),
        (name) => name !== "workspace.tar",
      );
  }
  const database = new Database(target);
  try {
    for (const application of chosen)
      database
        .prepare(
          "UPDATE applications SET host = replace(host, ?, ?) WHERE id = ?",
        )
        .run(
          join(application.state, "config"),
          join(state, "config"),
          application.mark.application.id,
        );
  } finally {
    database.close();
  }
  for (const companion of ["-wal", "-shm"])
    rmSync(`${target}${companion}`, { force: true });
  return [
    `Snapshot of ${chosen.map((each) => each.directory).join(", ")} in ${into}: records only, no keys, no secrets, no logins.`,
    "Look at it with the pair, on ports of its own. Its worker can read the copied histories and nothing more: with no login it cannot start a turn, and with no connections it cannot reach a provider or the host.",
    `  HALLVI_DB_PATH=${target} HALLVI_CONFIG_DIR=${join(state, "config")} HALLVI_PI_CONFIG_DIR=${account} HALLVI_LOG_DIR=${join(state, "diagnostics")} npm run dev -- --port 3730`,
  ].join("\n");
}

function cpRecursive(from, to, keep = () => true) {
  for (const name of readdirSync(from)) {
    if (!keep(name)) continue;
    const source = join(from, name);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) cpRecursive(source, join(to, name), keep);
    else if (stat.isFile()) {
      mkdirSync(to, { recursive: true, mode: 0o700 });
      copyFileSync(source, join(to, name));
    }
  }
}

async function main(argv) {
  const flags = {
    acceptFormat: argv.includes("--accept-format"),
    afterCrash: argv.includes("--after-crash"),
  };
  const [command, ...rest] = argv.filter((arg) => !arg.startsWith("--"));
  switch (command) {
    case "status":
      console.log(status());
      return;
    case "attach":
      if (!rest[0]) throw new Refused("Say which application to attach.");
      await attach(rest[0], flags);
      return;
    case "detach":
      if (!rest[0]) throw new Refused("Say which application to detach.");
      await detach(rest[0]);
      return;
    case "snapshot":
      if (!rest[0]) throw new Refused("Say where to put the snapshot.");
      console.log(await snapshot(rest[0], rest.slice(1)));
      return;
    default:
      throw new Refused(
        "Usage: retained-application.mjs status | attach <name> [--accept-format] [--after-crash] | detach <name> | snapshot <directory> [name...]",
      );
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof Refused ? error.code : 1);
  });
