import { realpathSync } from "node:fs";
import Database from "better-sqlite3";
import { setTimeout as delay } from "node:timers/promises";
import { databasePath } from "./db";
import {
  DeploymentConflictError,
  deploymentMessage,
  interruptDeployments,
  pendingDeployments,
  saveDeployment,
} from "./deployment-store";
import { inspectDeployment } from "./deployment-planner";
import { executeDeployment } from "./deployment-executor";
import { redactSecrets } from "./secrets";

export async function runDeploymentWorker(signal: AbortSignal) {
  // A second controller process cannot execute the same intent concurrently.
  // SQLite releases this separate process lock on crash, without PID guessing.
  const lock = new Database(`${realpathSync(databasePath())}.deployment-lock`, {
    timeout: 0,
  });
  try {
    lock.exec("BEGIN EXCLUSIVE");
  } catch {
    lock.close();
    throw new Error("A deployment worker already owns this database.");
  }
  try {
    interruptDeployments();
    while (!signal.aborted) {
      const record = pendingDeployments()[0];
      if (!record) {
        await delay(1000, undefined, { signal }).catch(() => undefined);
        continue;
      }
      try {
        const bounded = AbortSignal.any([
          signal,
          AbortSignal.timeout(30 * 60000),
        ]);
        if (record.status === "queued")
          await inspectDeployment(record, bounded);
        else await executeDeployment(record, bounded);
      } catch (error) {
        if (error instanceof DeploymentConflictError) continue;
        if (record.status === "awaiting-approval") continue;
        record.status = "failed";
        record.error = signal.aborted
          ? "Deployment interrupted. Retry to reconcile the existing request."
          : redactSecrets(
              error instanceof Error ? error.message : "Deployment failed.",
            ).text;
        saveDeployment(record);
        deploymentMessage(
          record,
          `I stopped before claiming success: ${record.error}`,
        );
      }
    }
  } finally {
    lock.close();
  }
}
