import { operationsFor } from "./operation-store";
// The applications list, derived from records: the deployment record and
// its stack, never a phase or a check count.
import type { ApplicationListItem } from "@/components/server-guy/applications-screen";

import type { BackupEvidenceFacts } from "./application-facts";
import { stackOf, type ApplicationStack } from "./application-stack";
import { backupEvidenceFor } from "./backup-evidence";
import { applicationOperations } from "./operation-record";
import { applicationDeployment } from "./deployment-store";
import { listApplications } from "./db";
import type { ApplicationRecord } from "./types";
import type { DeploymentRecord } from "./deployment-types";

function backupEvidenceSummary(facts: BackupEvidenceFacts) {
  if (facts.proofs.some((proof) => proof.cleanupNotes.length > 0))
    return "Restore cleanup needs attention";
  return facts.proofs.some((proof) => proof.outcome === "verified")
    ? "Restore proved · not scheduled"
    : facts.proofs.length
      ? "Restore proof did not succeed"
      : "No restore proof";
}

export function stackSummary(stack: ApplicationStack) {
  if (!stack.recorded) return "Not deployed yet";
  const workers = stack.processes.filter((item) => item.role === "worker");
  return [
    `${stack.processes.length - workers.length} web`,
    ...(workers.length
      ? [`${workers.length} worker${workers.length === 1 ? "" : "s"}`]
      : []),
    ...stack.databases.map((database) =>
      database.kind === "postgres"
        ? `PostgreSQL ${database.version ?? ""}`.trim()
        : "SQLite",
    ),
    ...stack.services.map((service) =>
      service.kind === "valkey" ? "Valkey" : "Redis",
    ),
    ...(stack.jobs.length
      ? [`${stack.jobs.length} job${stack.jobs.length === 1 ? "" : "s"}`]
      : []),
  ].join(" · ");
}

export function listItem(
  application: ApplicationRecord,
  deployment: DeploymentRecord | null,
  now = Date.now(),
  operations = applicationOperations(deployment),
  /** Manual restore proofs, when any were recorded for this deployment. */
  evidence: BackupEvidenceFacts | null = null,
): ApplicationListItem {
  const stack = stackOf(deployment);
  const attention = operations.filter(
    (operation) =>
      operation.state === "proposed" ||
      (operation.state === "failed" && !operation.resolvedById),
  ).length;
  const verifiedAt = deployment?.verifiedAt ?? null;
  const stale =
    !verifiedAt || now - new Date(verifiedAt).getTime() > 24 * 3_600_000;
  const condition: ApplicationListItem["condition"] =
    deployment?.status === "live"
      ? stale
        ? { tone: "muted", text: "Last verified over a day ago" }
        : { tone: "live", text: "Running · verified" }
      : deployment?.status === "failed"
        ? { tone: "bad", text: "Deployment needs attention" }
        : deployment?.status === "awaiting-approval"
          ? { tone: "warn", text: "Recommendation waiting for you" }
          : deployment
            ? { tone: "muted", text: "Deploying" }
            : { tone: "muted", text: "Not deployed" };
  return {
    id: application.id,
    name: application.name,
    source: `${application.repositoryOwner}/${application.repositoryName}`,
    condition,
    stack: stackSummary(stack),
    attention,
    // A recorded proof means a copy was made and restored at least once, so
    // the list may not say nothing exists. It still says nothing is running
    // on its own: no proof ever becomes a schedule here.
    protection: evidence
      ? backupEvidenceSummary(evidence)
      : stack.databases.length || stack.volumes.length
        ? "Not backed up"
        : stack.recorded
          ? "Nothing persistent"
          : "",
  };
}

export function listApplicationItems() {
  return listApplications().map((application) => {
    const deployment = applicationDeployment(application.id);
    return listItem(
      application,
      deployment,
      Date.now(),
      operationsFor(application.id),
      backupEvidenceFor(deployment),
    );
  });
}
