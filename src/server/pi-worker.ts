import { cleanupPiWorkspaces } from "./pi-workspace";
import { copyDue, protectController } from "./controller-protection";
import { databasePath } from "./db";
import { deploymentWatch } from "./deployment-watch";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ownSessions } from "./pi-owner";

/**
 * Another worker already serves this database. Not a failure: it answers the
 * app, and this process is not needed. The exit code says so to whatever
 * started it, so a launcher can leave the running one alone.
 */
export class PiWorkerBusyError extends Error {}
export const WORKER_BUSY_EXIT = 3;

/**
 * Hallvi's own records are copied off this machine by the worker, not by
 * Pi and not by the owner remembering to. A copy that cannot be taken is
 * recorded where the Backups view reads it; it never stops the worker.
 */
async function keepControllerCopy(
  trigger: "after-change" | "daily",
  changeRunning: boolean,
) {
  try {
    if (copyDue(trigger)) await protectController(trigger, { changeRunning });
  } catch (error) {
    console.warn(
      `Hallvi could not copy its own records: ${error instanceof Error ? error.message : "unknown reason"}`,
    );
  }
}

/**
 * The hourly look for a newer Hallvi, which is a look and nothing else:
 * installing stays something the owner presses. A source that cannot be
 * reached is recorded where the interface reads it and never stops the
 * worker, exactly like the copy above.
 */
async function lookForRelease() {
  try {
    const { checkForReleaseIfDue } = await import(
      /* webpackIgnore: true */ "../../scripts/update-start.mjs"
    );
    await checkForReleaseIfDue({ data: dirname(databasePath()) });
  } catch (error) {
    console.warn(
      `Hallvi could not look for a newer release: ${error instanceof Error ? error.message : "unknown reason"}`,
    );
  }
}

export async function runPiWorker(signal: AbortSignal) {
  const owned = await ownSessions({ signal });
  if (!owned)
    throw new PiWorkerBusyError(
      "A Pi worker is already running for this database.",
    );
  const { owner } = owned;
  try {
    // A send is answered once Pi has the message, so the first one should
    // not also wait for the SDK to load.
    void import("@earendil-works/pi-coding-agent").catch(() => undefined);
    await cleanupPiWorkspaces().catch(() => undefined);
    const watch = deploymentWatch(owner.conversations, signal);
    owner.also.deployment = watch.handle;
    console.info("Pi worker ready.");
    let nextProtectionCheck = 0;
    // Deliberately not another branch of the chain below: a controller with
    // Pi working in it would never reach a fourth `else if`, and "hourly"
    // would quietly mean "hourly while idle".
    let nextReleaseCheck = Date.now() + 60_000;
    let worked = false;
    // Looking at GitHub waits on the network, so it never holds this loop:
    // one round at a time, started again a few seconds after it ends. Each
    // application decides inside whether its own minute has passed.
    let watching = false;
    let nextWatch = 0;
    while (!signal.aborted) {
      if (!watching && Date.now() >= nextWatch) {
        watching = true;
        void watch.tick().finally(() => {
          watching = false;
          nextWatch = Date.now() + 5_000;
        });
      }
      if (owner.live()) worked = true;
      else if (worked) {
        worked = false;
        await keepControllerCopy("after-change", owner.live() > 0);
      } else if (Date.now() >= nextProtectionCheck) {
        // Rarely: the check reads one small file, and the copy itself decides
        // whether anything is owed.
        nextProtectionCheck = Date.now() + 60_000;
        await keepControllerCopy("daily", owner.live() > 0);
      }
      if (Date.now() >= nextReleaseCheck) {
        // A minute after starting, then every minute: the file's own hour
        // decides whether this actually reaches the network, so starting is
        // never delayed and a restart loop never becomes a poll.
        nextReleaseCheck = Date.now() + 60_000;
        await lookForRelease();
      }
      await delay(250, undefined, { signal }).catch(() => undefined);
    }
  } finally {
    // Ownership is held until every session is let go, or the process ends.
    await owned.close();
  }
}
