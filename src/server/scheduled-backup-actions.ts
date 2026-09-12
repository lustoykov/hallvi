import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { duringApplicationOperation } from "./application-operations";
import {
  runCommandCheck,
  type CheckTarget,
  type CommandCheck,
} from "./command-checks";
import type { CheckResult } from "./deployment-runtime";
import { applicationDeployment } from "./deployment-store";
import { deploymentSsh, shellQuote } from "./deployment-ssh";
import type { DeploymentRecord } from "./deployment-types";
import { composeProject, currentFacts } from "./release-facts";
import {
  backupHostPaths,
  refreshScheduledBackups,
} from "./scheduled-backup-host";
import { installScheduledBackups } from "./scheduled-backup-install";
import { backupFailure, restoreFailure } from "./scheduled-backup-facts";
import { readBackupPolicy } from "./scheduled-backup-store";
import type { BackupPolicy, ScheduledRun } from "./scheduled-backup-types";

/**
 * Where the restored copy of one backup runs: the runner's own staging
 * directory for that run and a project that can never be the application's.
 * Derived here from the run id, never read from a host receipt, so a check
 * cannot be pointed at production by anything the host reports.
 */
export function restoreCheckTarget(
  record: DeploymentRecord,
  runId: string,
): CheckTarget {
  z.uuid().parse(record.id);
  z.uuid().parse(runId);
  const cwd = `/var/lib/server-guy/backups/${record.id}/staging/restore-${runId}`;
  const project = `sg-restore-${runId.slice(0, 8)}`;
  if (project === composeProject(record.id))
    throw new Error(
      "The restore project would coincide with the application's.",
    );
  return { cwd, project, results: `${cwd}/checks`, hold: false };
}

/** A restored copy is booted: its services, states and boot time. */
function bootSummary(run: ScheduledRun) {
  const boot = run.restore?.boot;
  if (!boot) return "";
  const services = Object.entries(boot.services);
  const running = services.filter(([, s]) => s.state === "running").length;
  const finished = services.filter(
    ([, s]) => s.state === "exited" && s.exitCode === 0,
  ).length;
  return `The restored application booted in isolation in ${boot.seconds} s: ${running} running${finished ? `, ${finished} finished` : ""} of ${services.length} services.`;
}

/** Restoration evidence, kept apart from behavior. */
function restorationSummary(run: ScheduledRun) {
  const restore = run.restore!;
  const measured = restore.measurements;
  const parts = [
    `Archive downloaded and matched its recorded size and SHA-256 (capture at ${restore.recoveryPointAt}).`,
    measured.files !== undefined
      ? `${measured.files} files matched the inventory.`
      : null,
    restore.checks.includes("database-content")
      ? "Each database dump loaded into a fresh instance of its owner and matched the source's content fingerprint."
      : restore.checks.includes("database-restored")
        ? "Each database dump loaded into a fresh instance of its owner; taken online, its content is proven by that restoration, not by a live comparison."
        : null,
    restore.checks.includes("database-integrity")
      ? "SQLite integrity and recorded rows matched."
      : null,
    bootSummary(run),
  ];
  return parts.filter(Boolean).join(" ");
}

/** The host's own recovery: it closes interrupted runs and removes kept
 * restore copies. Its outcome is read from the host's status, never from
 * this call. */
async function recoverBackupHost(record: DeploymentRecord) {
  const paths = backupHostPaths(record.id);
  try {
    await deploymentSsh(
      record,
      `${shellQuote(paths.python)} ${shellQuote(paths.runner)} ${shellQuote(paths.config)} --recover`,
      { timeout: 5 * 60_000 },
    );
  } catch {
    /* Reported from the host's status, not from this call. */
  }
}

export async function performBackupAction(
  applicationId: string,
  action: "run-backup" | "test-restore" | "configure-backups",
  selection: {
    schedule: BackupPolicy["schedule"];
    keep: number;
    operationId?: string;
    /** Commands Pi chose for this restore, run inside the restored copy. */
    checks?: CommandCheck[];
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
      let before = await refreshScheduledBackups(record);
      if (!before.reachable)
        throw new Error(
          "Current host backup status is unavailable. Reconnect before starting work.",
        );
      if (before.cleanupPending) {
        // Cleanup is the host's own job: ask it once before refusing.
        await recoverBackupHost(record);
        before = await refreshScheduledBackups(record);
        if (before.cleanupPending)
          throw new Error(
            "Resolve the outstanding backup cleanup before starting another run.",
          );
      }
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
        // The restored copy stays up for the checks below; the runner's own
        // recovery removes it afterwards, so no ExecStopPost tears it down.
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
            paths.python,
            paths.runner,
            paths.config,
            "--test-restore",
            restoreFrom!.id,
            "--keep",
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
          )
            return restoredCopy(record, run, selection.checks ?? []);
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
          : action === "test-restore"
            ? {
                type: action,
                deploymentId: record.id,
                ...(selection.checks?.length
                  ? { checks: selection.checks }
                  : {}),
              }
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

/**
 * The restored copy is up: run the recorded command checks and Pi's chosen
 * ones inside it, then let the host's recovery remove it. Capture, transfer,
 * restoration, boot and behavior stay separate in the evidence; a failed
 * check fails the operation while the restoration itself stays recorded.
 */
async function restoredCopy(
  record: DeploymentRecord,
  run: ScheduledRun,
  chosen: CommandCheck[],
) {
  const restore = run.restore!;
  const recorded = currentFacts(record)?.criterion?.commands ?? [];
  const checks: CheckResult[] = [];
  let failure: string | null = null;
  try {
    if (restore.outcome !== "verified")
      throw new Error(
        `The isolated restore test failed: ${restoreFailure(run)}`,
      );
    if (!restore.boot)
      return {
        evidence: `${restorationSummary(run)} This archive predates application boot in restore tests, so no checks ran inside a restored copy.`,
        runId: run.id,
      };
    const target = restoreCheckTarget(record, run.id);
    for (const check of [...recorded, ...chosen]) {
      const result = await runCommandCheck(
        record,
        check,
        AbortSignal.timeout(((check.timeoutSeconds ?? 60) + 60) * 1000),
        target,
      );
      checks.push(result);
      if (!result.passed) {
        failure = `Command check ${check.name} ${result.status === null ? "has an unknown outcome" : `failed (exit ${result.status}${result.status === 0 && check.contains ? `; output lacks "${check.contains}"` : ""})`} in the restored copy. Output: ${result.output?.slice(-1200) || "none"}`;
        break;
      }
    }
  } finally {
    // Whatever happened above, the copy comes down and its cleanup is
    // recorded on the host; the next backup's recovery is the safety net.
    await recoverBackupHost(record);
  }
  const after = await refreshScheduledBackups(record);
  const cleanup = after.cleanupPending
    ? " The restored copy's cleanup is still pending on the host."
    : " The restored copy was removed.";
  const passed = checks.filter((c) => c.passed).map((c) => c.name);
  if (failure)
    throw Object.assign(
      new Error(
        `${restorationSummary(run)}${passed.length ? ` Passed in the restored copy: ${passed.join(", ")}.` : ""} ${failure}${cleanup}`,
      ),
      { checks },
    );
  return {
    evidence: `${restorationSummary(run)}${checks.length ? ` Behavior in the restored copy: ${passed.length} command check${passed.length === 1 ? "" : "s"} passed (${passed.join(", ")}).` : " No command check is recorded or was chosen, so the copy's behavior is unverified beyond readiness."} HTTP checks were not run against the copy, which publishes no port.${cleanup}`,
    runId: run.id,
    checks,
  };
}
