import { getChat } from "./db";
import { requestDeployment, applicationDeployment } from "./deployment-store";
import {
  activeOperationId,
  duringApplicationOperation,
} from "./application-operations";
import {
  claimOperation,
  currentOperationFacts,
  operationsFor,
  proposeOperation,
  publicOperation,
  settleOperation,
} from "./operation-store";
import {
  inspectRuntime,
  type RuntimeInspectionOptions,
} from "./release-diagnostics";
import { currentFacts } from "./release-facts";
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
/** Settled work, newest first; read_operation returns any one in full. */
export function recentOperations(applicationId: string, limit = 15) {
  return operationsFor(applicationId)
    .filter(
      (item) =>
        !["working", "queued", "proposed"].includes(item.state) &&
        !(item.state === "failed" && !item.resolvedById),
    )
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      state: item.state,
      updatedAt: item.updatedAt,
    }));
}
export function proposeAgentChange(
  applicationId: string,
  chatId: string,
  action:
    | "deployment"
    | "recreate-deployment"
    | "configure-backups"
    | "run-backup"
    | "test-restore",
  backupPolicy?: { schedule: "daily" | "six-hourly"; keep: number },
  restoreChecks?: unknown[],
) {
  if (
    action === "configure-backups" ||
    action === "run-backup" ||
    action === "test-restore"
  )
    return proposeBackupOperation(
      applicationId,
      action,
      action === "test-restore" && restoreChecks
        ? { ...backupPolicy, checks: restoreChecks }
        : backupPolicy,
      chatId,
    );
  if (action === "deployment") {
    requestDeployment(applicationId, chatId, "server-guy");
    return operationContext(applicationId);
  }
  const deployment = applicationDeployment(applicationId);
  if (!deployment || deployment.status !== "live")
    throw new Error("Deploy and verify this application first.");
  return publicOperation(
    proposeOperation({
      applicationId,
      chatId,
      source: { type: "release", id: deployment.id },
      target: action,
      kind: "change",
      title: "Recreate application containers",
      summary:
        "Recreate all containers from their accepted images on the existing host. Expect brief downtime. Persistent volumes are retained; no images are rebuilt or pulled.",
      destinations: [
        "deployment",
        "processes",
        "database",
        "storage",
        "history",
      ],
      command: { type: action, deploymentId: deployment.id },
    }),
  );
}
/**
 * Fresh, read-only evidence from the host, collected now and recorded as an
 * inspection so History and other conversations see what was observed and
 * when. Nothing on the host changes, so it needs no approval.
 */
export async function inspectRuntimeNow(
  applicationId: string,
  options: RuntimeInspectionOptions,
  signal: AbortSignal,
) {
  const deployment = applicationDeployment(applicationId);
  if (!deployment?.serverId || !deployment.address || !currentFacts(deployment))
    throw new Error("No deployed host is recorded for this application.");
  const recorded: { id: string | null } = { id: null };
  const result = await duringApplicationOperation(
    applicationId,
    async () => {
      recorded.id = activeOperationId();
      return inspectRuntime(deployment, signal, options);
    },
    {
      command: {
        type: "collect-logs",
        deploymentId: deployment.id,
        ...(options.service ? { service: options.service } : {}),
        ...(options.lines ? { lines: options.lines } : {}),
      },
      kind: "inspection",
      title: options.service
        ? `Inspect ${options.service} container and logs`
        : "Inspect containers and logs",
      source: { type: "logs", id: deployment.id },
      summary:
        "Reading container state and recent logs from the application host. Nothing on the host is changed.",
      destinations: ["logs", "history"],
    },
  );
  return { status: "completed", operationId: recorded.id, ...result };
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
