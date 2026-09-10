import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DeploymentRecord } from "./deployment-types";
import type { StoredOperation } from "./operation-types";
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

const receiptSchema = z.strictObject({
  attemptId: z.uuid(),
  releaseId: z.string().regex(/^[0-9a-f]{64}$/),
  revision: z.string().regex(/^[0-9a-f]{40}$/),
  phase: z.enum(["upload", "configuration", "build", "activate", "replace"]),
  exitCode: z.number().int().min(0).max(255),
});

/** Append reconciliation evidence without rewriting completed attempts. */
export async function reconcileRelease(
  record: DeploymentRecord,
  operation: StoredOperation,
  signal: AbortSignal,
) {
  if (operation.command?.type !== "release-deployment")
    throw new Error("Expected a release scope.");
  const scope = operation.command.scope;
  const prior = record
    .lifecycle!.attempts.filter(
      (a) => a.kind === "release" && a.authorizationId === scope.id,
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
    const result = await runDeploymentAttempt(
      record,
      "reconcile",
      operation.id,
      async () => {
        const active = record.lifecycle!.attempts.at(-1)!;
        active.authorizationId = scope.id;
        active.reconcilesAttemptId = prior.id;
        recordOperationRemoteEffect();
        invalidateDeploymentRuntime(record);
        saveDeployment(record);
        return verifyRelease(record, release, signal);
      },
      release,
    );
    return {
      ok: true,
      verified: true,
      plan: release.plan,
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
