import { z } from "zod";
import { applicationDeployment } from "./deployment-store";
import { proposeOperation, publicOperation } from "./operation-store";
import { backupKind } from "./scheduled-backup-install";
import { readBackupPolicy } from "./scheduled-backup-store";
import { backupPolicySchema, scheduleLabel } from "./scheduled-backup-types";

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
  backupKind(record);
  const policy = backupSelectionSchema.parse(selection);
  if (action !== "configure-backups" && !readBackupPolicy(record))
    throw new Error("Configure a backup schedule and storage access first.");
  const summary =
    action === "configure-backups"
      ? `${scheduleLabel(policy)} Europe/Sofia. Keep the latest ${policy.keep} successful scheduled copies in the connected private storage. Existing manual proof archives are excluded. SQLite/file capture briefly pauses the application; PostgreSQL dumps run online. The host continues while the controller sleeps.`
      : action === "run-backup"
        ? "Create a consistent copy, upload it to the connected private storage and verify the downloaded archive. SQLite/file capture briefly pauses the application. Apply the existing retention policy after successful verification."
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
