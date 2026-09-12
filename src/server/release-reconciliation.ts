import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DeploymentRecord } from "./deployment-types";
import { deploymentLock, deploymentSsh } from "./deployment-ssh";
import {
  saveDeployment,
  runDeploymentAttempt,
  deploymentEvent,
  DeploymentConflictError,
} from "./deployment-store";
import { releaseOf } from "./deployment-release";
import { verifyRelease, releaseSecrets } from "./release-executor";
import { invalidateDeploymentRuntime } from "./deployment-lifecycle";
import { recordOperationRemoteEffect } from "./application-operations";
import { recordCheck, resolvePendingCommand } from "./command-checks";
import type { CheckResult } from "./deployment-runtime";

const receiptSchema = z.strictObject({
  attemptId: z.uuid(),
  releaseId: z.string().regex(/^[0-9a-f]{64}$/),
  revision: z.string().regex(/^[0-9a-f]{40}$/),
  phase: z.enum(["upload", "configuration", "build", "activate", "replace"]),
  exitCode: z.number().int().min(0).max(255),
});

/**
 * Append reconciliation evidence without rewriting completed attempts. The
 * authorization is a release scope or an approved first deployment.
 */
export async function reconcileRelease(
  record: DeploymentRecord,
  authorization: { id: string; operationId: string },
  signal: AbortSignal,
) {
  // A held command names the attempt that ran it, whichever authorization
  // continues the work; otherwise the last remote attempt under this one.
  const pending = record.commandPending;
  const prior = pending
    ? record.lifecycle!.attempts.find((a) => a.id === pending.attemptId)
    : record
        .lifecycle!.attempts.filter(
          (a) =>
            (a.kind === "release" || a.kind === "deploy") &&
            a.authorizationId === authorization.id,
        )
        .at(-1);
  if (!prior?.remoteStartedAt)
    return {
      ok: false,
      message: "No remote release attempt needs reconciliation.",
      retryable: false,
    };
  const release = record.lifecycle!.releases.find(
    (r) => r.id === prior.releaseId,
  );
  if (!release || release.id !== releaseOf(record)?.id)
    return {
      ok: false,
      message:
        "The recorded release changed. Reconcile its identity before continuing.",
      retryable: false,
    };
  if (record.verificationPending || record.cleanup)
    return {
      ok: false,
      message:
        "Resolve the outstanding verification test object before repeating behavior checks.",
      retryable: false,
    };
  const redact = releaseSecrets(record).redact;
  try {
    z.uuid().parse(record.id);
    z.uuid().parse(prior.id);
    const raw = await deploymentSsh(
      record,
      deploymentLock(
        record.id,
        `cat /opt/server-guy/${record.id}/releases/${prior.id}/result.json`,
      ),
      { signal },
    );
    const receipt = receiptSchema.parse(JSON.parse(raw));
    if (
      receipt.attemptId !== prior.id ||
      receipt.releaseId !== release.id ||
      receipt.revision !== release.revision
    )
      throw new Error("The host result belongs to another attempt or release.");
    if (receipt.exitCode === 0 && receipt.phase !== "replace")
      throw new Error(
        "The host result does not establish a completed replacement.",
      );
    if (
      !record.lifecycle!.reconciliations?.some((r) => r.attemptId === prior.id)
    ) {
      (record.lifecycle!.reconciliations ??= []).push({
        id: randomUUID(),
        attemptId: prior.id,
        releaseId: release.id,
        phase: receipt.phase,
        exitCode: receipt.exitCode,
        observedAt: new Date().toISOString(),
      });
      saveDeployment(record);
    }
    if (receipt.exitCode !== 0) {
      deploymentEvent(
        record,
        `Reconciled ${prior.id}: ${receipt.phase} finished with exit ${receipt.exitCode}.`,
      );
      return {
        ok: true,
        retryable: true,
        message: `The host command finished unsuccessfully during ${receipt.phase} (exit ${receipt.exitCode}). Inspect diagnostics and correct the configuration within the existing scope.`,
      };
    }
    // A command check whose reply was lost may have changed data. The host's
    // record of it decides: never started, still running, lost, or done.
    let resolved: CheckResult | undefined;
    if (pending) {
      const outcome = await resolvePendingCommand(record, signal);
      if (outcome.kind === "running")
        return {
          ok: false,
          retryable: false,
          message: `Command check ${pending.name} is still running on the host (started ${pending.startedAt}, limit ${pending.timeoutSeconds} s). Call reconcile_release again once that limit has passed; nothing runs again before then.`,
        };
      if (outcome.kind === "lost" && !pending.acceptedAt)
        return {
          ok: false,
          retryable: false,
          message: `Command check ${pending.name} started on the host at ${pending.startedAt}, but no result was recorded within its limit: whether it completed, and what it changed, is unknown. Inspect the container with inspect_runtime and report it; nothing runs again under any operation. Only the owner's Retry of this work, or an approval whose text names this unknown, accepts that the command may run again.`,
        };
      record.commandPending = null;
      if (outcome.kind === "lost") {
        deploymentEvent(
          record,
          `Command check ${pending.name} left no result on the host; the owner's decision (${pending.acceptedBy}) accepted that it may run again.`,
        );
        return {
          ok: true,
          retryable: true,
          message: `Command check ${pending.name} left no result on the host, and the owner's decision accepted that it may run again. Verification can run again under this scope.`,
        };
      }
      if (outcome.kind === "never-started") {
        deploymentEvent(
          record,
          `Reconciled command check ${pending.name}: it never started on the host, so nothing changed.`,
        );
        return {
          ok: true,
          retryable: true,
          message: `Command check ${pending.name} never started on the host, so nothing changed. Verification can run again under this scope.`,
        };
      }
      resolved = outcome.result;
      deploymentEvent(
        record,
        `Reconciled command check ${pending.name} from the host's record: exit ${resolved.status}, ${resolved.passed ? "passed" : "failed"}.`,
      );
      if (!resolved.passed)
        return {
          ok: true,
          retryable: true,
          message: `Command check ${pending.name} finished with exit ${resolved.status} (resolved from the host's record). Output: ${resolved.output?.slice(-1200) || "none"}. Correct the configuration within the existing scope.`,
        };
    }
    // Verification resumes from the reconciled attempt's receipts: checks it
    // recorded passed, and the resolved command, are consumed, not rerun.
    const resume = resolved
      ? {
          completed: [
            ...(prior.checks ?? []).filter((item) => item.passed),
            resolved,
          ],
        }
      : undefined;
    const result = await runDeploymentAttempt(
      record,
      "reconcile",
      authorization.operationId,
      async () => {
        const active = record.lifecycle!.attempts.at(-1)!;
        active.authorizationId = authorization.id;
        active.reconcilesAttemptId = prior.id;
        recordOperationRemoteEffect();
        invalidateDeploymentRuntime(record);
        saveDeployment(record);
        // The resolved receipt is this attempt's first check; verification
        // carries it and the earlier receipts instead of running them.
        if (resolved) recordCheck(record, resolved);
        return verifyRelease(record, release, signal, resume);
      },
      release,
    );
    return {
      ok: true,
      completed: true,
      behavior: result.behavior,
      message: `${result.evidence} Reconciled the completed host command without rebuilding or restarting containers.`,
    };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof DeploymentConflictError) throw error;
    const message = redact(
      error instanceof Error ? error.message : "Host result unavailable.",
    );
    return {
      ok: false,
      retryable: false,
      message: `Reconciliation did not establish a verified release: ${message}. A busy lock, missing result or mismatched identity does not authorize repetition.`,
    };
  }
}
