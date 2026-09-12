import { setTimeout as delay } from "node:timers/promises";
import { executeOperation } from "./application-operations";
import { pendingOperations, recoverDeadOperations } from "./operation-store";
import type { StoredOperation } from "./operation-types";

async function dispatch(record: StoredOperation) {
  const command = record.command;
  if (!command || command.type === "deployment")
    throw new Error("No generic executor for this operation.");
  const id = record.applicationId;
  switch (command.type) {
    case "release-deployment": {
      const { runApplicationRelease } = await import("./application-releases");
      return runApplicationRelease(record, AbortSignal.timeout(30 * 60000));
    }
    case "configure-backups":
    case "run-backup":
    case "test-restore": {
      const { applicationDeployment } = await import("./deployment-store");
      if (applicationDeployment(id)?.id !== command.deploymentId)
        throw new Error(
          "The deployment changed. Review the backup operation before retrying.",
        );
      const { performBackupAction } =
        await import("./scheduled-backup-actions");
      return performBackupAction(
        id,
        command.type,
        command.type === "configure-backups"
          ? {
              schedule: command.schedule,
              keep: command.keep,
              operationId: record.id,
            }
          : command.type === "test-restore" && command.checks
            ? { schedule: "daily", keep: 7, checks: command.checks }
            : undefined,
      );
    }
    case "recreate-deployment":
    case "collect-logs": {
      const { getDeployment, runDeploymentAttempt } =
        await import("./deployment-store");
      const deployment = getDeployment(command.deploymentId);
      if (!deployment || deployment.applicationId !== id)
        throw new Error("Deployment no longer belongs to this application.");
      const signal = AbortSignal.timeout(10 * 60000);
      if (command.type === "collect-logs") {
        // The inspection's content is its result, never only its time.
        const { inspectRuntime } = await import("./release-diagnostics");
        return inspectRuntime(deployment, signal, {
          service: command.service,
          lines: command.lines,
        });
      }
      const executor = await import("./deployment-executor");
      return runDeploymentAttempt(deployment, "recreate", record.id, () =>
        executor.recreateDeployment(deployment, signal),
      );
    }
    default:
      throw new Error(
        "This operation's capability was retired; it cannot run again.",
      );
  }
}
export async function runOperationWorker(signal: AbortSignal) {
  const running = new Map<string, Promise<unknown>>();
  while (!signal.aborted) {
    recoverDeadOperations();
    for (const record of pendingOperations()) {
      if (running.has(record.id)) continue;
      const task = executeOperation(record, () => dispatch(record))
        .catch(() => undefined)
        .finally(() => running.delete(record.id));
      running.set(record.id, task);
    }
    await delay(500, undefined, { signal }).catch(() => undefined);
  }
  await Promise.allSettled(running.values());
}
