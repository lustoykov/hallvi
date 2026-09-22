// Taking a controller's records from the schema they are in to the schema this
// program needs, and being able to put them back.
//
//   migrate-state.mjs --plan          says what would happen, changes nothing
//   migrate-state.mjs --apply         backs up, then migrates
//   migrate-state.mjs --restore <dir> puts a backup back
//
// This is the only thing that migrates anything. `npm run db:upgrade` runs it
// for a development checkout; `install.sh` runs it from the new archive during
// an upgrade, after the service has stopped and before the program is
// replaced, which is also the path the in-app updater takes.
//
// Restoring the old program is not a rollback once its database has been
// changed under it: the old program refuses a schema it does not know, which
// is the correct refusal and not a recovery. That is what `--restore` is for,
// and why `--apply` prints where the backup went before it touches anything.
import Database from "better-sqlite3";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  changedStores,
  plan,
  STORES,
  UnsupportedMigration,
} from "./migrations.mjs";
import { holdRuntime, readMark } from "./retained-state.mjs";
import { stateFiles, stateLocation } from "./state-location.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

/**
 * The same state an installation or a checkout would open, decided the same
 * way `serve.mjs` decides it, so this can never migrate a different database
 * from the one that is about to be started.
 */
function resolveState() {
  const data = flag("data") ?? process.env.HALLVI_DATA_DIR?.trim();
  if (data) return stateFiles(resolve(data));
  const explicit = process.env.HALLVI_DB_PATH?.trim();
  if (explicit)
    return {
      ...stateFiles(dirname(resolve(explicit))),
      database: resolve(explicit),
    };
  return stateLocation(process.cwd(), { hidden: true });
}

/**
 * The schema this program needs. A checkout's source is the truth and comes
 * first: a `dist/` left over from an older build would otherwise answer for
 * it, and this very check found one claiming 15 while the source said 18. An
 * installed archive has no source and answers from `dist/`, which is the same
 * file, copied at build time.
 */
function targetVersion() {
  for (const candidate of [
    join(here, "..", "src", "server", "schema-version.json"),
    join(here, "..", "dist", "schema-version.json"),
  ])
    if (existsSync(candidate))
      return JSON.parse(readFileSync(candidate, "utf8")).version;
  throw new Error("This program does not say which schema it needs.");
}

function currentVersion(database) {
  const open = new Database(database, { readonly: true });
  try {
    return open.pragma("user_version", { simple: true });
  } finally {
    open.close();
  }
}

/**
 * A running worker holds this; migrating under it would race its writes. The
 * installed flow stops the service first, so this is the second gate rather
 * than the first.
 */
async function withoutWriters(database, work) {
  // A retained development application is written by the runtime attached to
  // it, whose worker may be between two writes; its owner detaches first.
  const mark = readMark(dirname(database));
  if (mark?.recovery)
    throw new Error(
      "This is an inactive recovery copy, not a working controller. Nothing was changed.",
    );
  if (mark) {
    const hold = holdRuntime(dirname(database));
    if (hold.refused === "attached")
      throw new Error(
        "This retained state is attached to a runtime. Detach it first; nothing was changed.",
      );
    if (hold.refused === "open")
      throw new Error(
        "An app or worker from an earlier runtime still has this retained state open. Stop it first; nothing was changed.",
      );
    hold.release();
  }
  // The lock is named from the canonical directory rather than the database,
  // because restoring is also what you do when the database is not there any
  // more, and resolving a file that is gone would refuse exactly then.
  const lock = new Database(
    `${join(realpathSync(dirname(database)), basename(database))}.worker-lock`,
    { timeout: 0 },
  );
  try {
    lock.exec("BEGIN EXCLUSIVE");
  } catch {
    lock.close();
    throw new Error(
      "A Pi worker is holding this database. Stop Hallvi first; nothing was changed.",
    );
  }
  try {
    return await work();
  } finally {
    lock.close();
  }
}

/** Where each store a transition can name actually lives. */
function storePaths(state) {
  return {
    [STORES.database]: [state.database],
    [STORES.sessions]: [join(dirname(state.database), "pi-sessions")],
    [STORES.configuration]: [join(dirname(state.database), "config")],
  };
}

function describe(steps, from, to) {
  if (!steps.length) return `Already at schema ${to}. Nothing to do.`;
  return [
    `Schema ${from} to ${to}, in ${steps.length} step${steps.length === 1 ? "" : "s"}:`,
    ...steps.map((step) => `  ${step.from} to ${step.to}. ${step.summary}`),
    `Changes: ${changedStores(steps).join(", ")}.`,
    "Everything else is left alone.",
  ].join("\n");
}

/**
 * A copy of exactly the stores this migration rewrites, verified by reopening
 * it. Stores it does not touch are not copied: an unchanged file needs no
 * rollback, and copying conversation histories and credentials that nothing
 * is going to write would be a second place for them to leak from.
 */
async function backup(state, steps, from, to) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const into = join(
    dirname(state.database),
    "migrations",
    `${stamp}-${from}-to-${to}`,
  );
  mkdirSync(into, { recursive: true, mode: 0o700 });
  try {
    return await fill(into, state, steps, from, to);
  } catch (error) {
    // A half-made backup is worse than none: it looks like somewhere to go
    // back to. Nothing has been migrated at this point either way.
    rmSync(into, { recursive: true, force: true });
    throw error;
  }
}

async function fill(into, state, steps, from, to) {
  const paths = storePaths(state);
  const copied = [];
  for (const store of changedStores(steps))
    for (const path of paths[store] ?? []) {
      if (!existsSync(path)) continue;
      const name =
        path === state.database ? "hallvi.db" : path.split("/").pop();
      copied.push({ name, target: path });
      if (path === state.database) {
        // Through SQLite's own backup, so a write-ahead log in front of the
        // file goes with it instead of being left behind.
        // `backup` is asynchronous; a copy that has not finished cannot be
        // verified, and an unverified copy is not a backup.
        const source = new Database(path, { readonly: true });
        await source.backup(join(into, name));
        source.close();
      } else {
        cpSync(path, join(into, name), {
          recursive: true,
          preserveTimestamps: true,
        });
      }
    }

  if (copied.some((each) => each.name === "hallvi.db")) {
    const check = new Database(join(into, "hallvi.db"), { readonly: true });
    const intact =
      check.pragma("integrity_check", { simple: true }) === "ok" &&
      check.pragma("user_version", { simple: true }) === from;
    check.close();
    if (!intact)
      throw new Error(
        "The backup did not verify. Nothing was migrated and the records are as they were.",
      );
    // Opening it to check it leaves a write-ahead log and a shared-memory
    // file beside it. They hold nothing, and a copy that contains more than
    // its manifest lists invites someone to restore the wrong thing.
    for (const companion of ["-wal", "-shm"])
      rmSync(join(into, `hallvi.db${companion}`), { force: true });
  }

  writeFileSync(
    join(into, "manifest.json"),
    `${JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        from,
        to,
        changes: changedStores(steps),
        copied,
        state: dirname(state.database),
        // The exact file, not a directory and a convention: a controller
        // whose database is somewhere else must be restored to where it is,
        // and never over a different database that happens to sit beside it.
        database: state.database,
        restore: `node scripts/migrate-state.mjs --restore ${into}`,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  return into;
}

function apply(state, steps, to) {
  const database = new Database(state.database);
  try {
    // One transaction for the whole plan: a step that throws leaves the
    // records at the version they were already at, rather than between two.
    database.exec("BEGIN IMMEDIATE");
    for (const step of steps) {
      step.apply(database);
      database.pragma(`user_version = ${step.to}`);
    }
    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Already rolled back.
    }
    throw error;
  } finally {
    database.close();
  }
  const check = new Database(state.database, { readonly: true });
  const landed = check.pragma("user_version", { simple: true });
  const intact = check.pragma("integrity_check", { simple: true }) === "ok";
  check.close();
  if (landed !== to || !intact)
    throw new Error(
      `The migration finished at schema ${landed}${intact ? "" : " and the database does not check out"}, not ${to}.`,
    );
}

/** Everything a backup says it holds, checked before anything is replaced. */
function inspectBackup(from) {
  const manifest = JSON.parse(
    readFileSync(join(from, "manifest.json"), "utf8"),
  );
  if (!manifest.database || !Array.isArray(manifest.copied))
    throw new Error(`${from} is not a backup this can restore.`);
  for (const entry of manifest.copied) {
    if (!entry?.name || !entry?.target)
      throw new Error(
        `${from} does not say where one of its copies came from.`,
      );
    if (!existsSync(join(from, entry.name)))
      throw new Error(
        `${from} is missing ${entry.name}. Nothing was changed; the records are as they are.`,
      );
  }
  const database = manifest.copied.find((each) => each.name === "hallvi.db");
  if (database) {
    let version;
    let intact;
    try {
      const check = new Database(join(from, "hallvi.db"), { readonly: true });
      version = check.pragma("user_version", { simple: true });
      intact = check.pragma("integrity_check", { simple: true }) === "ok";
      check.close();
    } catch (cause) {
      throw new Error(
        `The copy in ${from} could not be opened (${cause instanceof Error ? cause.message : cause}). Nothing was changed; the records are as they are.`,
      );
    }
    for (const companion of ["-wal", "-shm"])
      rmSync(join(from, `hallvi.db${companion}`), { force: true });
    if (!intact || version !== manifest.from)
      throw new Error(
        `The copy in ${from} is schema ${version}${intact ? "" : " and does not check out"}, not the schema ${manifest.from} it claims. Nothing was changed.`,
      );
  }
  return manifest;
}

/**
 * Putting a backup back, in an order that cannot leave less than there was.
 *
 * The copy is opened and checked first, then staged beside each target, and
 * only then moved into place. Deleting the live records before reading the
 * copy would turn a damaged backup into no records at all, which is the one
 * outcome a restore must never produce.
 */
async function restore(from) {
  const manifest = inspectBackup(from);
  return await withoutWriters(manifest.database, () => {
    const staged = [];
    try {
      for (const entry of manifest.copied) {
        const staging = `${entry.target}.restoring`;
        rmSync(staging, { recursive: true, force: true });
        cpSync(join(from, entry.name), staging, {
          recursive: true,
          preserveTimestamps: true,
        });
        staged.push({ ...entry, staging });
      }
      const database = staged.find((each) => each.name === "hallvi.db");
      if (database) {
        const check = new Database(database.staging, { readonly: true });
        const version = check.pragma("user_version", { simple: true });
        check.close();
        for (const companion of ["-wal", "-shm"])
          rmSync(`${database.staging}${companion}`, { force: true });
        if (version !== manifest.from)
          throw new Error("The staged copy did not survive being copied.");
      }
    } catch (error) {
      for (const each of staged)
        rmSync(each.staging, { recursive: true, force: true });
      throw error;
    }

    // Nothing below can fail on its own terms: each target is replaced by a
    // rename of something already there and already checked.
    for (const entry of staged) {
      if (entry.name === "hallvi.db")
        // The write-ahead log and shared-memory file belong to the database
        // being replaced; leaving them would put the copy behind newer pages
        // that are no longer its own.
        for (const companion of ["-wal", "-shm"])
          rmSync(`${entry.target}${companion}`, { force: true });
      rmSync(entry.target, { recursive: true, force: true });
      renameSync(entry.staging, entry.target);
    }
    return `Restored ${manifest.copied
      .map((each) => each.target)
      .join(", ")} to schema ${manifest.from} from ${from}.`;
  });
}

const state = resolveState();
try {
  if (has("restore")) {
    console.log(await restore(resolve(flag("restore"))));
  } else {
    if (!existsSync(state.database)) {
      console.log(`No database at ${state.database}. Nothing to migrate.`);
      process.exit(0);
    }
    const to = targetVersion();
    const from = currentVersion(state.database);
    const steps = plan(from, to);
    console.log(describe(steps, from, to));
    if (has("plan") || !steps.length) process.exit(0);
    if (!has("apply"))
      throw new Error(
        "Say what to do: --plan, --apply or --restore <directory>.",
      );
    const copy = await withoutWriters(state.database, async () => {
      const made = await backup(state, steps, from, to);
      console.log(`Backed up to ${made}`);
      apply(state, steps, to);
      return made;
    });
    console.log(
      `Migrated ${state.database} from schema ${from} to ${to}. To put it back:\n  node scripts/migrate-state.mjs --restore ${copy}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(error instanceof UnsupportedMigration ? 2 : 1);
}
