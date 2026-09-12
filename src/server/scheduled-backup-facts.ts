import type { ProtectionFacts } from "./application-facts";
import { persistentState, stackOf } from "./application-stack";
import type { DeploymentRecord } from "./deployment-types";
import {
  scheduleLabel,
  type BackupPolicy,
  type BackupSnapshot,
  type ProcedureDetail,
  type ScheduledRun,
} from "./scheduled-backup-types";

/** An owner's own dump, verify or restore command and what it printed. */
function procedureFailure(detail: ProcedureDetail) {
  const what =
    detail.step === "start"
      ? `starting ${detail.service} in isolation`
      : `the ${detail.step} procedure declared for ${detail.service}`;
  const result =
    detail.exitCode === null ? "gave no result" : `exited ${detail.exitCode}`;
  return `${what} ${result}${detail.output ? `: ${detail.output}` : ""}`;
}

export function backupFailure(run: ScheduledRun) {
  if (run.errorCode === "source-stop-failed")
    return `${run.detail ? `Service ${run.detail.service} ${run.detail.output}` : "A service failed to stop cleanly or exceeded the two-minute grace period"}. Check its exit status and shutdown handling before retrying; source restart is recorded separately.`;
  if (run.errorCode === "credentials-rejected")
    return "Backup storage rejected the credential. Reconnect storage access, then retry.";
  if (run.errorCode === "interrupted")
    return "The backup was interrupted. Source recovery and cleanup are recorded separately.";
  if (run.errorCode === "source-identity-mismatch")
    return "The deployment no longer matches the recorded backup configuration. Reconfigure the schedule for the current deployment.";
  if (run.detail)
    return `A consistent copy could not be created: ${procedureFailure(run.detail)}.`;
  const labels: Record<string, string> = {
    credentials:
      "Backup storage access could not be verified. Reconnect the scoped storage credential.",
    preflight: "The source or backup configuration could not be verified.",
    capture:
      "A consistent copy could not be created. Check the source application.",
    upload:
      "The off-host upload failed. The local copy does not count as a backup.",
    download: "The off-host copy could not be downloaded and verified.",
    verify: "The downloaded copy did not match the source archive.",
    retention: "The copy was verified, but old-copy cleanup needs attention.",
    interrupted: "The backup was interrupted. Its outcome needs checking.",
  };
  return (
    labels[run.phase] ??
    "The backup did not complete. Inspect the host backup service."
  );
}

export function restoreFailure(run: ScheduledRun) {
  if (run.restore?.detail)
    return `The restored copy failed: ${procedureFailure(run.restore.detail)}.`;
  const reasons: Record<string, string> = {
    "restore-image-unavailable":
      "The isolated restore could not start because its database image is unavailable.",
    "database-check-failed": "The isolated database checks failed.",
    "boot-failed":
      "The restored data loaded, but the application did not come up on it in isolation.",
    "manifest-mismatch":
      "The restored contents did not match the recorded capture manifest.",
    "verify-mismatch":
      "The downloaded archive did not match its recorded size and checksum.",
    "download-failed":
      "The archive could not be downloaded for its restore test.",
    "credentials-rejected":
      "Storage rejected the credential during the restore test.",
    interrupted: "The isolated restore test was interrupted.",
  };
  return (
    reasons[run.restore?.errorCode ?? ""] ??
    "The isolated restore test failed; this copy has no successful restore result."
  );
}

export function scheduledProtection(
  deployment: DeploymentRecord,
  policy: BackupPolicy,
  snapshot: BackupSnapshot | null,
  now: number,
): ProtectionFacts {
  const matches = (run: ScheduledRun) =>
    run.applicationId === deployment.applicationId &&
    run.deploymentId === deployment.id;
  const runs = (snapshot?.runs ?? [])
    .filter(matches)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const latest = runs[0];
  const good = runs.find(
    (run) =>
      run.outcome === "succeeded" &&
      !run.expiredAt &&
      run.capturedAt &&
      run.finishedAt &&
      run.sha256 &&
      run.bytes !== null &&
      run.bytes > 0 &&
      run.revision === deployment.revision,
  );
  const restored = runs.find(
    (run) =>
      run.outcome === "succeeded" &&
      !run.expiredAt &&
      run.restore?.outcome === "verified" &&
      run.restore.recoveryPointAt &&
      run.restore.checks.includes("archive-hash") &&
      run.restore.checks.includes("backup-identity") &&
      (policy.kind === "stack"
        ? Boolean(policy.data) &&
          run.restore.checks.includes("file-inventory") &&
          (!policy.data!.postgres ||
            run.restore.checks.includes("database-restored")) &&
          // Every dump must load; only a compared one must also match.
          (!policy.data!.dumps ||
            run.restore.checks.includes("database-restored")) &&
          (!(policy.data!.comparedDumps ?? policy.data!.dumps) ||
            run.restore.checks.includes("database-content")) &&
          (!policy.data!.sqlite ||
            (run.restore.checks.includes("database-integrity") &&
              run.restore.checks.includes("database-rows")))
        : policy.kind === "postgres"
          ? run.restore.checks.includes("database-restored")
          : run.restore.checks.includes("database-integrity") &&
            run.restore.checks.includes("database-rows") &&
            run.restore.checks.includes("file-inventory")) &&
      run.revision === deployment.revision,
  );
  const measurements = restored?.restore?.measurements;
  const measured = (["files", "tables", "rows"] as const)
    .filter((key) => measurements?.[key] !== undefined)
    .map(
      (key) =>
        `${measurements![key]} ${measurements![key] === 1 ? key.slice(0, -1) : key}`,
    )
    .join(", ");
  const maxAge = (policy.schedule === "daily" ? 26 : 8) * 3_600_000;
  const stale =
    !snapshot ||
    !snapshot.reachable ||
    now - Date.parse(snapshot.observedAt) > 120_000;
  const behind = Boolean(
    good?.capturedAt && now - Date.parse(good.capturedAt) > maxAge,
  );
  const cleanupPending = Boolean(
    snapshot?.cleanupPending ||
    runs.some((run) => run.restore && !run.restore.cleanupComplete),
  );
  const retentionFailed = Boolean(latest?.retention.failed);
  const size =
    good?.bytes != null ? `${(good.bytes / 1024 / 1024).toFixed(1)} MB` : null;
  return {
    observation: {
      at: snapshot?.observedAt ?? null,
      reachable: !stale,
      timerActive: snapshot?.timerActive ?? false,
      nextAt: snapshot?.nextAt ?? null,
      running: Boolean(
        snapshot?.running || runs.some((run) => run.restoreInProgress),
      ),
      cleanupPending,
      retentionFailed,
    },
    destination: {
      provider: policy.provider,
      bucket: policy.bucket,
      region: policy.region,
      connectedAt: policy.configuredAt,
      access: "Storage access configured on the application host",
    },
    policy: {
      schedule: scheduleLabel(policy),
      timezone: policy.timezone,
      retention: `the latest ${policy.keep} successful scheduled copies`,
      operationId: policy.operationId,
    },
    coverage: persistentState(stackOf(deployment)).map((item) => ({
      key: item.key,
      label: item.label,
      method: item.method,
      state: stale
        ? "unknown"
        : latest?.outcome === "failed"
          ? "failed"
          : !good
            ? "unprotected"
            : behind || !snapshot?.timerActive
              ? "behind"
              : "protected",
      lastSuccessfulAt: good?.capturedAt ?? null,
      size,
      note: good
        ? stale && behind
          ? "The last recorded copy is older than the agreed policy. Refresh status to check for newer verified copies."
          : "Downloaded from off-host storage and matched by size and SHA-256. Restore tests are recorded separately."
        : stale
          ? "No verified off-host copy is recorded for the deployed revision. Current coverage is unknown."
          : "No verified off-host copy for the deployed revision.",
    })),
    lastAttempt: latest
      ? {
          at: latest.finishedAt ?? latest.startedAt,
          outcome:
            latest.outcome === "succeeded"
              ? "succeeded"
              : latest.outcome === "running"
                ? "partial"
                : "failed",
          reason:
            latest.outcome === "running"
              ? "A backup is running on the host."
              : latest.outcome === "failed"
                ? backupFailure(latest)
                : retentionFailed
                  ? "The copy is verified; retention cleanup needs attention."
                  : null,
          size,
        }
      : null,
    restoreTest: restored?.restore
      ? {
          at: restored.restore.at,
          recoveryPointAt: restored.restore.recoveryPointAt!,
          verified:
            policy.kind === "stack"
              ? `Downloaded archive verified separately${measured ? `: ${measured}` : ""}. File hashes and all recorded restore checks passed.${restored.restore.checks.includes("database-content") ? " Each database dump loaded into a fresh isolated instance and matched its content fingerprint." : restored.restore.checks.includes("database-restored") ? " Each database dump loaded into a fresh isolated instance; taken online, its content is proven by that loading, not by a live comparison." : ""}${policy.data?.fileDatabases ? " File-captured databases received file-hash checks only." : ""}${restored.restore.checks.includes("application-boot") ? ` The restored application booted in isolation${restored.restore.boot ? ` in ${restored.restore.boot.seconds} s (${Object.keys(restored.restore.boot.services).length} services)` : ""}; its behavior checks are recorded on the restore operation.` : " Application boot was not tested."}`
              : policy.kind === "postgres"
                ? `Downloaded archive restored into isolated PostgreSQL${measured ? `: ${measured}` : ""}. Application boot was not tested.`
                : `Downloaded archive extracted separately${measured ? `: ${measured}` : ""}. SQLite integrity, recorded data hashes and file hashes matched. Application boot was not tested.`,
        }
      : null,
    history: runs
      .flatMap((run) => [
        {
          id: run.id,
          at: run.capturedAt ?? run.startedAt,
          kind: "backup" as const,
          outcome:
            run.outcome === "succeeded"
              ? ("succeeded" as const)
              : run.outcome === "running"
                ? ("partial" as const)
                : ("failed" as const),
          detail:
            run.outcome === "succeeded"
              ? run.expiredAt
                ? "This verified copy was removed by the retention policy. Its receipt remains as history."
                : "Created a consistent copy, uploaded it and verified the downloaded archive by size and SHA-256."
              : run.outcome === "running"
                ? "Backup in progress on the application host."
                : backupFailure(run),
        },
        ...(run.restore
          ? [
              {
                id: `${run.id}-restore`,
                at: run.restore.at,
                kind: "restore-test" as const,
                outcome:
                  run.restore.outcome === "verified"
                    ? ("succeeded" as const)
                    : ("failed" as const),
                detail:
                  run.restore.outcome === "verified"
                    ? "Restored the downloaded scheduled copy into an isolated test destination."
                    : restoreFailure(run),
              },
            ]
          : []),
      ])
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
  };
}
