import { setTimeout as delay } from "node:timers/promises";
import { executeOperation } from "./application-operations";
import { getConformanceProposal } from "./db";
import { pendingOperations, recoverDeadOperations } from "./operation-store";
import type { StoredOperation } from "./operation-types";

async function dispatch(record: StoredOperation) {
  const command = record.command;
  if (!command || command.type === "deployment")
    throw new Error("No generic executor for this operation.");
  const id = record.applicationId;
  const phase = await import("./phase-three");
  const preparation = await import("./preparation");
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
          : undefined,
      );
    }
    case "recreate-deployment":
    case "collect-logs": {
      const { getDeployment, runDeploymentAttempt } =
        await import("./deployment-store");
      const executor = await import("./deployment-executor");
      const deployment = getDeployment(command.deploymentId);
      if (!deployment || deployment.applicationId !== id)
        throw new Error("Deployment no longer belongs to this application.");
      const signal = AbortSignal.timeout(10 * 60000);
      if (command.type === "recreate-deployment")
        return runDeploymentAttempt(deployment, "recreate", record.id, () =>
          executor.recreateDeployment(deployment, signal),
        );
      await executor.collectDeploymentLogs(deployment, signal);
      return {
        evidence: `Collected host logs at ${deployment.logsCollectedAt}.`,
        collectedAt: deployment.logsCollectedAt,
      };
    }
    case "start-preparation":
      return preparation.startPreparation(id);
    case "refresh-preparation":
      return preparation.refreshPreparation(id);
    case "publish-checkpoint": {
      const proposal = getConformanceProposal(command.proposalId);
      if (!proposal || proposal.applicationId !== id)
        throw new Error("Proposal no longer belongs to this application.");
      return preparation.publishPreparationCheckpoint(id, proposal);
    }
    case "publish-proposal":
      return phase.publishProposal(id, command.proposalId);
    case "refresh-candidate":
      return phase.refreshCandidate(id);
    case "return-change":
      return phase.returnExternalChange(id, command.reference);
    case "grant-publication":
      return phase.grantPublication(id);
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
