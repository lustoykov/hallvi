import { z } from "zod";
import { backupCapturePlan } from "./backup-capture-plan";
import { applicationDeployment } from "./deployment-store";
import { commandCheckSchema, type DeploymentRecord } from "./deployment-types";
import { currentFacts } from "./release-facts";
import { proposeOperation, publicOperation } from "./operation-store";
import { backupKind } from "./scheduled-backup-install";
import { readBackupPolicy } from "./scheduled-backup-store";
import { backupPolicySchema, scheduleLabel } from "./scheduled-backup-types";
import { redactSecrets } from "./secrets";

/** What capture stops and keeps running, from the recorded capture plan. */
function capturePause(record: DeploymentRecord) {
  const facts = currentFacts(record);
  if (!facts)
    return "Capture pauses the application's services. Pause duration depends on shutdown and data size.";
  const plan = backupCapturePlan(facts);
  const kept = [...new Set((plan.dumps ?? []).map((dump) => dump.service))];
  const online = (plan.dumps ?? []).filter((dump) => !dump.quiescent);
  return [
    plan.pauseServices.length
      ? `Capture stops ${plan.pauseServices.join(", ")}.`
      : "Capture stops no service.",
    ...(kept.length
      ? [
          `${kept.join(", ")} ${kept.length === 1 ? "keeps" : "keep"} running to dump ${kept.length === 1 ? "its" : "their"} data.`,
        ]
      : []),
    ...(online.length
      ? [
          `${online.map((dump) => dump.volume).join(", ")} ${online.length === 1 ? "is" : "are"} dumped online, with no writers declared: the copy is proven by restoring it, not compared live, and files captured beside it may be from another moment.`,
        ]
      : []),
    "Pause duration depends on shutdown and data size.",
  ].join(" ");
}

export const backupSelectionSchema = z.object({
  schedule: backupPolicySchema.shape.schedule.default("daily"),
  keep: backupPolicySchema.shape.keep.default(7),
  /** Commands for the restored copy, in the recorded check shape. */
  checks: z.array(commandCheckSchema).max(8).optional(),
});
/** Checks Pi chose for a restore: recorded services and inputs only. */
function restoreChecks(record: DeploymentRecord, checks: unknown[]) {
  const facts = currentFacts(record);
  const chosen = z.array(commandCheckSchema).max(8).parse(checks);
  for (const check of chosen) {
    if (!facts?.services.some((service) => service.name === check.service))
      throw new Error(
        `Restore check ${check.name}: ${check.service} is not a recorded service.`,
      );
    const unknown = (check.inputs ?? []).filter(
      (name) => !facts.inputs.includes(name),
    );
    if (unknown.length)
      throw new Error(
        `Restore check ${check.name}: ${unknown.join(", ")} is not a recorded private input.`,
      );
  }
  if (redactSecrets(JSON.stringify(chosen)).count)
    throw new Error("Credentials cannot appear in restore checks.");
  return chosen;
}
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
  const chosen =
    action === "test-restore" ? restoreChecks(record, policy.checks ?? []) : [];
  const recorded = currentFacts(record)?.criterion?.commands ?? [];
  const pause =
    action === "test-restore"
      ? ""
      : action === "configure-backups" || installed?.kind === "stack"
        ? capturePause(record)
        : installed?.kind === "postgres"
          ? "The PostgreSQL dump runs online."
          : "SQLite/file capture pauses the application.";
  const summary =
    action === "configure-backups"
      ? `${scheduleLabel(policy)} Europe/Sofia. Keep the latest ${policy.keep} successful scheduled copies in the connected private storage. Existing manual proof archives are excluded. ${pause} The host continues while the controller sleeps.`
      : action === "run-backup"
        ? `Create a consistent copy, upload it to the connected private storage and verify the downloaded archive. ${pause} Apply the existing retention policy after successful verification.`
        : `Download the latest verified backup of this revision and restore it as an isolated copy of the application on this host: its files and databases loaded into fresh volumes, no published ports, no network beyond the copy. Start it, then run inside it ${recorded.length ? `the recorded command checks (${recorded.map((check) => check.name).join(", ")})` : "no recorded command checks"}${chosen.length ? ` and the checks chosen for this restore (${chosen.map((check) => check.name).join(", ")})` : ""}. Live data is never touched; the copy is removed afterwards. HTTP checks are not run against the copy.`;
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
          ? {
              type: action,
              deploymentId: record.id,
              schedule: policy.schedule,
              keep: policy.keep,
            }
          : action === "test-restore" && chosen.length
            ? { type: action, deploymentId: record.id, checks: chosen }
            : { type: action, deploymentId: record.id },
    }),
  );
}
