import { setTimeout as delay } from "node:timers/promises";
import { duringApplicationOperation } from "./application-operations";
import { applicationDeployment } from "./deployment-store";
import { deploymentSsh, shellQuote } from "./deployment-ssh";
import {
  backupHostPaths,
  refreshScheduledBackups,
} from "./scheduled-backup-host";
import { installScheduledBackups } from "./scheduled-backup-install";
import { backupFailure, restoreFailure } from "./scheduled-backup-facts";
import { readBackupPolicy } from "./scheduled-backup-store";
import type { BackupPolicy } from "./scheduled-backup-types";

export async function performBackupAction(
  applicationId: string,
  action: "run-backup" | "test-restore" | "configure-backups",
  selection: {
    schedule: BackupPolicy["schedule"];
    keep: number;
    operationId?: string;
  } = {
    schedule: "daily",
    keep: 7,
  },
) {
  const record = applicationDeployment(applicationId);
  if (!record || (action !== "test-restore" && record.status !== "live"))
    throw new Error("Deploy and verify this application first.");
  return duringApplicationOperation(
    applicationId,
    async () => {
      if (action === "configure-backups")
        return installScheduledBackups(record, selection);
      if (!readBackupPolicy(record))
        throw new Error("Configure backup storage and a schedule first.");
      const before = await refreshScheduledBackups(record);
      if (!before.reachable)
        throw new Error(
          "Current host backup status is unavailable. Reconnect before starting work.",
        );
      if (before.cleanupPending)
        throw new Error(
          "Resolve the outstanding backup cleanup before starting another run.",
        );
      if (before.running)
        throw new Error(
          "A backup or restore test is already running on the host.",
        );
      const paths = backupHostPaths(record.id);
      const ids = new Set(before.runs.map((run) => run.id));
      const restoreFrom = before.runs.find(
        (run) =>
          run.outcome === "succeeded" &&
          !run.expiredAt &&
          run.revision === record.revision,
      );
      if (action === "test-restore" && !restoreFrom)
        throw new Error(
          "Create and verify an off-host backup of the deployed revision first.",
        );
      if (action === "run-backup")
        await deploymentSsh(
          record,
          `systemctl reset-failed ${paths.unit}.service 2>/dev/null || true; systemctl start --no-block ${paths.unit}.service`,
        );
      else
        await deploymentSsh(
          record,
          [
            "systemd-run",
            `--unit=server-guy-restore-${record.id}`,
            "--collect",
            "--service-type=oneshot",
            "--property=UMask=0077",
            "--property=TimeoutStartSec=20min",
            "--property=TimeoutStopSec=3min",
            `--property=ExecStopPost=${paths.python} ${paths.runner} ${paths.config} --recover`,
            paths.python,
            paths.runner,
            paths.config,
            "--test-restore",
            restoreFrom!.id,
          ]
            .map(shellQuote)
            .join(" "),
        );
      const started = Date.now();
      while (Date.now() - started < 21 * 60_000) {
        await delay(Date.now() - started < 15_000 ? 2000 : 10_000);
        const current = await refreshScheduledBackups(record);
        if (!current.reachable)
          throw new Error(
            "The host stopped responding. Its systemd service continues independently; refresh the recorded result before retrying.",
          );
        if (action === "run-backup") {
          const run = current.runs.find((run) => !ids.has(run.id));
          if (run && run.outcome !== "running" && !current.running) {
            // The recorded reason reaches the operation, and so Pi.
            if (run.outcome !== "succeeded")
              throw new Error(
                `The host recorded a failed backup: ${backupFailure(run)} Earlier successful copies remain recorded in Backups.`,
              );
            return {
              evidence: run.retention.failed
                ? "The downloaded backup matched by size and SHA-256. Retention cleanup needs attention."
                : "The host created an off-host backup and verified the downloaded archive by size and SHA-256.",
              runId: run.id,
            };
          }
        } else {
          const run = current.runs.find((run) => run.id === restoreFrom!.id);
          if (
            run?.restore &&
            run.restore.at !== restoreFrom?.restore?.at &&
            !current.running
          ) {
            if (run.restore.outcome !== "verified")
              throw new Error(
                `The isolated restore test failed: ${restoreFailure(run)}`,
              );
            return {
              evidence: run.restore.cleanupComplete
                ? "Restored the downloaded backup into an isolated destination and passed its recorded database/file checks. Application boot and production cutover were not tested."
                : "The isolated restore passed, but temporary resources need cleanup.",
              runId: run.id,
            };
          }
        }
        if (Date.now() - started > 15_000 && !current.running)
          throw new Error(
            "The service stopped without a new completed result. Check its status before retrying.",
          );
      }
      throw new Error(
        "The host operation exceeded its verification window. Refresh its durable status before retrying.",
      );
    },
    {
      command:
        action === "configure-backups"
          ? { type: action, deploymentId: record.id, ...selection }
          : { type: action, deploymentId: record.id },
      kind: "change",
      title:
        action === "configure-backups"
          ? "Configure scheduled backups"
          : action === "run-backup"
            ? "Back up application data"
            : "Test an isolated restore",
    },
  );
}
