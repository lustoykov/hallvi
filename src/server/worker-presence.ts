// Whether a Pi worker is actually alive for this database.
//
// The worker's lock is an exclusive SQLite transaction on `<db>.worker-lock`.
// It is the right thing to hold and the wrong thing to ask: the file exists
// after any worker has ever run, and a reader that took its presence for a
// live worker would tell the owner their message is being worked on while
// nothing is reading the queue. Asking the lock itself means trying to take
// it, which is a write, and a page must never compete with the worker for it.
//
// So the worker says so out loud. It writes its pid, its machine and the time
// beside the lock, and refreshes that time while it runs. A reader believes a
// live worker when the machine is this one, the process still exists, and the
// last beat is recent. Any of those failing means nobody is reading the queue,
// which is exactly what the conversation needs to say.
import { hostname } from "node:os";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

import { databasePath } from "./db";

/** Written every beat; a reader treats an older file as nobody there. */
const BEAT_MS = 5_000;
/** Three missed beats. A busy machine may skip one; it will not skip three. */
const STALE_MS = 20_000;

export interface WorkerPresence {
  /** A worker process is running against this database, right now. */
  alive: boolean;
  /** The last beat it wrote, whether or not that is recent enough. */
  lastSeenAt: string | null;
}

function presencePath() {
  return `${databasePath()}.worker-status`;
}

interface Beat {
  pid: number;
  host: string;
  startedAt: string;
  heartbeatAt: string;
}

function readBeat(): Beat | null {
  try {
    const value = JSON.parse(readFileSync(presencePath(), "utf8")) as Beat;
    return typeof value?.pid === "number" && typeof value.host === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Whether this machine still has that process. */
function running(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Someone else's process: it exists, and it is not ours to judge.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function workerPresence(now = Date.now()): WorkerPresence {
  const beat = readBeat();
  if (!beat) return { alive: false, lastSeenAt: null };
  const beatAt = Date.parse(beat.heartbeatAt);
  const fresh = Number.isFinite(beatAt) && now - beatAt < STALE_MS;
  return {
    // The pid belongs to the machine that wrote it. A database reached over a
    // shared volume would otherwise match some unrelated local process.
    alive: fresh && beat.host === hostname() && running(beat.pid),
    lastSeenAt: beat.heartbeatAt,
  };
}

/**
 * Beat while the worker runs, and stop beating when it stops.
 *
 * The interval is unrefed: this must never be the reason a process stays up.
 */
export function announceWorker() {
  const startedAt = new Date().toISOString();
  const write = () => {
    try {
      writeFileSync(
        presencePath(),
        JSON.stringify({
          pid: process.pid,
          host: hostname(),
          startedAt,
          heartbeatAt: new Date().toISOString(),
        }),
      );
    } catch {
      // A worker that cannot write its beat still works. The conversation
      // will say no worker is running, which is wrong but not dangerous;
      // failing the worker over a status file would be.
    }
  };
  write();
  const timer = setInterval(write, BEAT_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    // Only ours. A second worker that exited on the lock must not erase the
    // beat of the one holding it.
    if (readBeat()?.pid === process.pid)
      try {
        rmSync(presencePath(), { force: true });
      } catch {
        // Left behind, it goes stale within one beat window.
      }
  };
}
