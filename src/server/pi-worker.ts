import { cleanupPiWorkspaces } from "./pi-workspace";
import { copyDue, protectController } from "./controller-protection";
import { setTimeout as delay } from "node:timers/promises";
import { sessionOwner } from "./pi-owner";
import { serveWorker } from "./worker-link";

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
async function keepControllerCopy(trigger: "after-change" | "daily") {
  try {
    if (copyDue(trigger)) await protectController(trigger);
  } catch (error) {
    console.warn(
      `Hallvi could not copy its own records: ${error instanceof Error ? error.message : "unknown reason"}`,
    );
  }
}

export async function runPiWorker(signal: AbortSignal) {
  const owner = sessionOwner({ signal });
  const server = await serveWorker(owner.handle);
  if (!server)
    throw new PiWorkerBusyError(
      "A Pi worker is already running for this database.",
    );
  try {
    await cleanupPiWorkspaces().catch(() => undefined);
    console.info("Pi worker ready.");
    let nextProtectionCheck = 0;
    let worked = false;
    while (!signal.aborted) {
      if (owner.live()) worked = true;
      else if (worked) {
        worked = false;
        await keepControllerCopy("after-change");
      } else if (Date.now() >= nextProtectionCheck) {
        // Rarely: the check reads one small file, and the copy itself decides
        // whether anything is owed.
        nextProtectionCheck = Date.now() + 60_000;
        await keepControllerCopy("daily");
      }
      await delay(250, undefined, { signal }).catch(() => undefined);
    }
  } finally {
    server.close();
    server.closeAllConnections();
    await owner.close();
  }
}
