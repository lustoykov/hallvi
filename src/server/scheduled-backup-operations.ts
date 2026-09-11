import { z } from "zod";
import { backupCapturePlan } from "./backup-capture-plan";
import { applicationDeployment } from "./deployment-store";
import type { DeploymentRecord } from "./deployment-types";
import { currentFacts } from "./release-facts";
import { proposeOperation, publicOperation } from "./operation-store";
import { backupKind } from "./scheduled-backup-install";
import { readBackupPolicy } from "./scheduled-backup-store";
import { backupPolicySchema, scheduleLabel } from "./scheduled-backup-types";

/** What capture stops and keeps running, from the recorded capture plan. */
function capturePause(record: DeploymentRecord) {
  const facts = currentFacts(record);
  if (!facts)
    return "Capture pauses the application's services. Pause duration depends on shutdown and data size.";
  const plan = backupCapturePlan(facts);
  const kept = [
    ...new Set([
      ...(plan.postgres ? [plan.postgres] : []),
      ...(plan.dumps ?? []).map((dump) => dump.service),
    ]),
  ];
  return [
    plan.pauseServices.length
      ? `Capture stops ${plan.pauseServices.join(", ")}.`
      : "Capture stops no other service.",
    ...(kept.length
      ? [
          `${kept.join(", ")} ${kept.length === 1 ? "keeps" : "keep"} running to dump ${kept.length === 1 ? "its" : "their"} data.`,
        ]
      : []),
    "Pause duration depends on shutdown and data size.",
  ].join(" ");
}

export const backupSelectionSchema = z.object({
  schedule: backupPolicySchema.shape.schedule.default("daily"),
  keep: backupPolicySchema.shape.keep.default(7),
});
export function proposeBackupOperation(
  applicationId: string,
  action: "configure-backups" | "run-backup" | "test-restore",
  selection: unknown = {},
  chatId?: string,
) {
  const record = applicationDeployment(applicationId);
  if (!record) throw new Error("Deploy and verify this application first.");
  const installed = readBackupPolicy(record);
  if (action === "configure-backups") backupKind(record);
  const policy = backupSelectionSchema.parse(selection);
  if (action !== "configure-backups" && !installed)
    throw new Error("Configure a backup schedule and storage access first.");
  if (action === "run-backup" && record.status !== "live")
    throw new Error("A live deployment is required to capture a new backup.");
  const pause =
    action === "configure-backups" || installed?.kind === "stack"
      ? capturePause(record)
      : installed?.kind === "postgres"
        ? "The PostgreSQL dump runs online."
        : "SQLite/file capture pauses the application.";
  const summary =
    action === "configure-backups"
      ? `${scheduleLabel(policy)} Europe/Sofia. Keep the latest ${policy.keep} successful scheduled copies in the connected private storage. Existing manual proof archives are excluded. ${pause} The host continues while the controller sleeps.`
      : action === "run-backup"
        ? `Create a consistent copy, upload it to the connected private storage and verify the downloaded archive. ${pause} Apply the existing retention policy after successful verification.`
        : "Download a scheduled backup and restore its database/files into an isolated test destination. Live application data is not overwritten. This does not test application boot or production cutover.";
  return publicOperation(
    proposeOperation({
      applicationId,
      chatId,
      source: {
        type: action === "test-restore" ? "restore" : "backup",
        id: record.id,
      },
      target:
        action === "configure-backups"
          ? `${action}:${policy.schedule}:${policy.keep}`
          : action,
      kind: "change",
      title:
        action === "configure-backups"
          ? "Configure scheduled backups"
          : action === "run-backup"
            ? "Back up application data"
            : "Test an isolated restore",
      summary,
      destinations: ["backups", "history"],
      command:
        action === "configure-backups"
          ? { type: action, deploymentId: record.id, ...policy }
          : { type: action, deploymentId: record.id },
    }),
  );
}
