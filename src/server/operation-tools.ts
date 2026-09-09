import { getChat, getConformanceProposal } from "./db";
import { requestDeployment, applicationDeployment } from "./deployment-store";
import {
  claimOperation,
  currentOperationFacts,
  operationsFor,
  proposeOperation,
  publicOperation,
  settleOperation,
} from "./operation-store";
import type { OperationCommand } from "./operation-types";
import { proposeBackupOperation } from "./scheduled-backup-operations";

export function operationContext(applicationId: string) {
  return operationsFor(applicationId)
    .filter(
      (item) =>
        ["working", "queued", "proposed", "failed"].includes(item.state) &&
        !item.resolvedById,
    )
    .map((item) => ({
      id: item.id,
      state: item.state,
      title: item.title,
      source: item.source,
      conversation: item.origin
        ? (getChat(item.origin.chatId)?.title ?? "Earlier conversation")
        : "automatic",
      step: item.steps?.find((step) => step.state === "active")?.label ?? null,
      waitingFor: item.waitingForTitle ?? null,
      next: item.next ?? null,
    }));
}
export function proposeAgentChange(
  applicationId: string,
  chatId: string,
  action:
    | "deployment"
    | "start-preparation"
    | "publish-proposal"
    | "recreate-deployment"
    | "collect-logs"
    | "configure-backups"
    | "run-backup"
    | "test-restore",
  proposalId?: string,
  backupPolicy?: { schedule: "daily" | "six-hourly"; keep: number },
) {
  if (
    action === "configure-backups" ||
    action === "run-backup" ||
    action === "test-restore"
  )
    return proposeBackupOperation(applicationId, action, backupPolicy, chatId);
  if (action === "deployment") {
    requestDeployment(applicationId, chatId, "server-guy");
    return operationContext(applicationId);
  }
  if (action === "recreate-deployment" || action === "collect-logs") {
    const deployment = applicationDeployment(applicationId);
    if (!deployment || deployment.status !== "live")
      throw new Error("Deploy and verify this application first.");
    const logs = action === "collect-logs";
    return publicOperation(
      proposeOperation({
        applicationId,
        chatId,
        source: { type: logs ? "logs" : "release", id: deployment.id },
        target: action,
        kind: logs ? "inspection" : "change",
        title: logs
          ? "Collect application logs"
          : "Recreate application containers",
        summary: logs
          ? "Read current container logs from the application host."
          : "Recreate all containers from their accepted images on the existing host. Expect brief downtime. Persistent volumes are retained; no images are rebuilt or pulled.",
        destinations: logs
          ? ["logs", "history"]
          : ["deployment", "processes", "database", "storage", "history"],
        command: { type: action, deploymentId: deployment.id },
      }),
    );
  }
  let command: OperationCommand;
  let title: string;
  if (action === "publish-proposal") {
    const proposal = proposalId ? getConformanceProposal(proposalId) : null;
    if (
      !proposal ||
      proposal.applicationId !== applicationId ||
      proposal.status !== "approved"
    )
      throw new Error(
        "Choose this application's approved source proposal; operation approval cannot authorize new source changes.",
      );
    command = { type: action, proposalId: proposal.id };
    title = "Publish the approved source proposal";
  } else {
    command = { type: action };
    title = "Prepare a source branch";
  }
  const key = JSON.stringify(command);
  return publicOperation(
    proposeOperation({
      applicationId,
      chatId,
      source: { type: "preparation", id: key },
      target: key,
      kind: "change",
      title,
      summary: `${title}. Existing source permissions and the selected revision are checked again before execution.`,
      destinations: ["deployment", "history"],
      command,
    }),
  );
}
export function recordLocalInspection(applicationId: string, chatId: string) {
  const facts = currentOperationFacts(applicationId);
  const record = proposeOperation({
    applicationId,
    chatId,
    source: { type: "inspection", id: "application-records" },
    target: "application-records",
    kind: "inspection",
    title: "Inspect application records",
    summary:
      "Reading saved application records. This does not probe the host or verify current health.",
    destinations: ["overview", "history"],
    command: null,
  });
  const claimed = claimOperation(record.id);
  if (!claimed) return publicOperation(record);
  return publicOperation(
    settleOperation(
      claimed.id,
      claimed.executionId!,
      "inspected",
      `Read local records at ${new Date().toISOString()}. No remote check performed. ${JSON.stringify(facts)}`,
    ),
  );
}
