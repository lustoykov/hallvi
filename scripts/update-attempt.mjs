// The one file an update writes about itself.
//
// It exists because the program that asked for the update is stopped halfway
// through it. When Hallvi comes back, the only way it can say what happened is
// to read what the helper wrote while it was away. So this is deliberately
// small: one attempt at a time, a phase, a sentence, and the two versions
// involved. No queue, no history, no second copy of what the release manifest
// already says.
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Phases in order. The last three are where an attempt ends. */
export const PHASES = [
  "checking",
  "downloading",
  "verifying",
  "installing",
  "reconnecting",
  "completed",
  "failed",
  "blocked",
];

export const FINISHED = ["completed", "failed", "blocked"];

export const attemptFile = (data) => join(data, "update-attempt.json");
const claimLock = (data) => join(data, "update-attempt.claiming");
const STARTING_GRACE_MS = 2 * 60 * 1000;

/** An attempt is already under way, and a second one would fight it. */
export class UpdateInProgressError extends Error {}

export function readAttempt(data) {
  try {
    const value = JSON.parse(readFileSync(attemptFile(data), "utf8"));
    return PHASES.includes(value?.phase) ? value : null;
  } catch {
    return null;
  }
}

function write(data, attempt) {
  const file = attemptFile(data);
  mkdirSync(data, { recursive: true, mode: 0o700 });
  const temporary = `${file}.writing`;
  writeFileSync(temporary, `${JSON.stringify(attempt, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, file);
  return attempt;
}

/**
 * What the attempt says now, corrected for the helper having died.
 *
 * A phase on its own can lie: a helper killed between two writes leaves
 * "installing" behind for ever. `alive` answers whether the helper's own
 * service is still there, and an unfinished attempt without one is reported
 * as the failure it is, rather than as work still going on.
 */
export function attemptStatus(data, alive) {
  const attempt = readAttempt(data);
  if (!attempt) return null;
  if (FINISHED.includes(attempt.phase)) return { ...attempt, running: false };
  if (
    alive(attempt) ||
    (attempt.phase === "checking" &&
      Date.now() - Date.parse(attempt.startedAt) < STARTING_GRACE_MS)
  )
    return { ...attempt, running: true };
  return {
    ...attempt,
    phase: "failed",
    running: false,
    message:
      "The update stopped without finishing. Check hallvi status and the update log to see which version is running before trying again.",
    finishedAt: new Date().toISOString(),
  };
}

/**
 * Takes the one attempt slot, or refuses because something else has it.
 * The refusal is the whole concurrency story: two updates cannot run because
 * the second one is told the first is running and does nothing.
 */
export function claimAttempt(data, alive, attempt) {
  mkdirSync(data, { recursive: true, mode: 0o700 });
  const lock = claimLock(data);
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    // A process that died while claiming cannot hold the slot forever.
    if (Date.now() - statSync(lock).mtimeMs <= STARTING_GRACE_MS)
      throw new UpdateInProgressError("An update is already being prepared.");
    rmSync(lock, { recursive: true, force: true });
    mkdirSync(lock, { mode: 0o700 });
  }
  try {
    const current = attemptStatus(data, alive);
    if (current?.running)
      throw new UpdateInProgressError(
        `An update to ${current.to?.version ?? "a new version"} is already ${current.phase}.`,
      );
    return write(data, {
      ...attempt,
      phase: "checking",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      message: "Preparing the update.",
    });
  } finally {
    rmdirSync(lock);
  }
}

/** Moves the running attempt to a phase, keeping everything else it holds. */
export function recordPhase(data, phase, message, extra = {}) {
  const attempt = readAttempt(data);
  if (!attempt) return null;
  return write(data, {
    ...attempt,
    ...extra,
    phase,
    message,
    ...(FINISHED.includes(phase)
      ? { finishedAt: new Date().toISOString() }
      : { updatedAt: new Date().toISOString() }),
  });
}

/** Forgets the attempt entirely; only the owner dismissing it does this. */
export function clearAttempt(data) {
  rmSync(attemptFile(data), { force: true });
}
