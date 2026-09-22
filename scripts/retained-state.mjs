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

/**
 * The mark of a retained state directory, if this is the one it protects. A
 * mark with `recovery` set is on the inactive copy the separation left
 * behind, which no program opens.
 */
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
 * Become the runtime for this directory, or learn why not.
 *
 * Two things can stand in the way, and they are told apart. Another attach
 * holds the reserved lock — `refused: "attached"`. Or an app or worker from
 * an earlier runtime still has the records open: each of them keeps a shared
 * read on this file for as long as it lives (`keepRuntimeOpen`), and a write
 * cannot commit past a reader — `refused: "open"`. The lock this returns is
 * reserved, not exclusive, so that the runtime's own children can take their
 * shared read beside it; it is held by this process and released by the
 * operating system when the process ends, however it ends.
 */
export function holdRuntime(directory) {
  const lock = new Database(lockPath(directory), { timeout: 0 });
  const reserve = () => {
    try {
      lock.exec("BEGIN IMMEDIATE");
      return true;
    } catch {
      return false;
    }
  };
  if (!reserve()) {
    lock.close();
    return { refused: "attached" };
  }
  try {
    lock.exec("CREATE TABLE IF NOT EXISTS runtime (attached_at TEXT)");
    lock.exec("DELETE FROM runtime");
    lock
      .prepare("INSERT INTO runtime VALUES (?)")
      .run(new Date().toISOString());
    lock.exec("COMMIT");
  } catch {
    try {
      lock.exec("ROLLBACK");
    } catch {
      // Nothing was committed either way.
    }
    lock.close();
    return { refused: "open" };
  }
  if (!reserve()) {
    lock.close();
    return { refused: "attached" };
  }
  return { release: () => lock.close() };
}

/**
 * Keep this directory's records marked as open for as long as this process
 * lives: a shared read on the lock file that no later attach can commit past.
 * The app and the worker take it once their ownership check has passed, so an
 * old one that outlived its runtime blocks the next attach instead of writing
 * under it.
 */
export function keepRuntimeOpen(directory) {
  const lock = new Database(lockPath(directory), { timeout: 5_000 });
  lock.exec("BEGIN");
  lock.prepare("SELECT count(*) FROM sqlite_master").get();
  return { release: () => lock.close() };
}

/** Whether some process holds this directory's runtime lock right now. */
export function runtimeHeld(directory) {
  if (!existsSync(lockPath(directory))) return false;
  let lock;
  try {
    lock = new Database(lockPath(directory), { timeout: 0 });
    lock.exec("BEGIN IMMEDIATE");
    lock.exec("ROLLBACK");
    return false;
  } catch (error) {
    // Reserved by an attach. Anything else — a read-only copy — is nobody's.
    return error?.code === "SQLITE_BUSY";
  } finally {
    lock?.close();
  }
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
  if (mark.recovery)
    return `${directory} is the inactive recovery copy of ${mark.application.name}, kept from before their state was separated on ${mark.separatedAt}. It is not a working controller: the applications live under ${mark.applications ?? "the applications directory beside it"}.`;
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

/**
 * Wait for the worker to have nothing in hand, asking it to hold in the
 * meantime. `ask` answers `{ busy }` from the worker, `null` when there is no
 * worker to ask, and throws when the worker could not be asked properly. The
 * answer is one of three: `idle` — safe to stop; `busy` — work was still
 * going on when the wait ended (the limit, or `forced()`); `unknown` — the
 * worker's status could not be read. Only `idle` is a clean stop.
 */
export async function drainWorker(
  ask,
  { limitMs, forced = () => false, say = () => {}, wait, intervalMs = 2_000 },
) {
  const started = Date.now();
  let failures = 0;
  let said = 0;
  while (!forced()) {
    let held;
    try {
      held = await ask();
      failures = 0;
    } catch (error) {
      if (++failures >= 3) {
        say(
          `The worker's status could not be read (${error instanceof Error ? error.message : error}); stopping it without knowing.`,
        );
        return "unknown";
      }
      await wait(intervalMs);
      continue;
    }
    if (!held || held.busy === 0) return "idle";
    if (Date.now() - started > limitMs) {
      say(
        `Still ${held.busy} conversation${held.busy === 1 ? "" : "s"} working after ${Math.round(limitMs / 60_000)} minutes; stopping the worker anyway.`,
      );
      return "busy";
    }
    if (Date.now() - said > 10_000) {
      said = Date.now();
      say(
        `Detaching: waiting for ${held.busy} conversation${held.busy === 1 ? "" : "s"} still working. Ctrl-C again stops without waiting.`,
      );
    }
    await wait(intervalMs);
  }
  return "busy";
}

/**
 * What a signal to an attached launcher means. The first is a detach. While
 * one is under way, only the terminal's own Ctrl-C (SIGINT) is the second
 * request that forces the worker to stop: the attach command forwards a
 * SIGTERM for the same Ctrl-C, and a forwarded copy of the first request is
 * not a second one.
 */
export function stopRequest(detaching, signal) {
  if (!detaching) return "detach";
  return signal === "SIGINT" ? "force" : "ignore";
}
