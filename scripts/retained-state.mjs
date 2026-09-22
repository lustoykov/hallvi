// A retained application's state, and who may open it.
//
// The four development applications each keep their records in a directory
// of their own, outside every checkout, marked by a `retained.json` that names
// the directory it protects. One runtime at a time — an app and its worker,
// started together by `retained-application.mjs attach` — owns such a
// directory. Ownership is a lock the operating system holds for the attaching
// process and releases when it ends, however it ends; the file beside it says
// who that was. A process opening the database checks here first: it opens a
// marked directory only when it was started by the runtime holding the lock.
//
// A copy of the state somewhere else carries the mark but not its path, and
// is not protected: copies are for looking and for trying things on.
import Database from "better-sqlite3";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const MARK_FILE = "retained.json";
export const RUNTIME_FILE = "runtime.json";
const LOCK_FILE = "runtime.lock";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** The mark of a retained state directory, if this is the one it protects. */
export function readMark(directory) {
  const mark = readJson(join(directory, MARK_FILE));
  if (!mark || typeof mark.state !== "string" || !mark.application) return null;
  try {
    if (realpathSync(directory) !== mark.state) return null;
  } catch {
    return null;
  }
  return mark;
}

/** Who attached this directory last; a clean detach removes it. */
export function readRuntime(directory) {
  return readJson(join(directory, RUNTIME_FILE));
}

function lockPath(directory) {
  return join(directory, LOCK_FILE);
}

/**
 * Become the runtime for this directory, or learn that there already is one.
 * The lock is a SQLite exclusive transaction, as the worker's is: held by
 * this process, released by the operating system when the process ends.
 */
export function holdRuntime(directory) {
  const lock = new Database(lockPath(directory), { timeout: 0 });
  try {
    lock.exec("BEGIN EXCLUSIVE");
  } catch {
    lock.close();
    return null;
  }
  return { release: () => lock.close() };
}

/** Whether some process holds this directory's runtime lock right now. */
export function runtimeHeld(directory) {
  if (!existsSync(lockPath(directory))) return false;
  const held = holdRuntime(directory);
  if (!held) return true;
  held.release();
  return false;
}

/**
 * Why this process may not open the database, or null when it may.
 *
 * An unmarked directory is anybody's. A marked one is opened by the runtime
 * that attached it — the process that holds the lock started the app and the
 * worker with its runtime id in their environment — and by nothing else, not
 * even for a look: a look that can write is a second writer.
 */
export function retainedRefusal(databasePath, env = process.env) {
  const directory = dirname(resolve(databasePath));
  const mark = readMark(directory);
  if (!mark) return null;
  const runtime = readRuntime(directory);
  const held = runtimeHeld(directory);
  if (
    held &&
    env.HALLVI_RUNTIME_ID &&
    runtime?.runtimeId === env.HALLVI_RUNTIME_ID
  )
    return null;
  const name = mark.application.name;
  const owner =
    held && runtime
      ? `It is attached from ${runtime.worktree} on ${runtime.branch ?? "a detached HEAD"}, at http://127.0.0.1:${runtime.ports?.app ?? mark.port}.`
      : "Nothing is attached to it right now.";
  return `${directory} holds the retained state of ${name}, which only its attached runtime opens: node scripts/retained-application.mjs attach ${mark.directory ?? name}. ${owner} To look at its records from elsewhere, take a snapshot: node scripts/retained-application.mjs snapshot <directory> ${mark.directory ?? name}.`;
}

/**
 * The launcher's exit code when a detach stopped the worker while Pi still
 * had work in hand. The next attach reads it as an unclean stop.
 */
export const DETACH_FORCED_EXIT = 4;
