import { rememberVerifiedImages } from "./rollback";
import { randomUUID } from "node:crypto";
import {
  assertApprovedRelease,
  releaseOf,
  type DeploymentRelease,
} from "./deployment-release";
import type { DeploymentRecord } from "./deployment-types";
import type {
  DeploymentLifecycle,
  DeploymentAttempt,
} from "./deployment-runtime";

/** Import saved evidence without inventing earlier retries. */
export function ensureDeploymentLifecycle(
  record: DeploymentRecord,
): DeploymentLifecycle {
  if (record.lifecycle) return record.lifecycle;
  const release = releaseOf(record);
  const verified =
    record.status === "live" && record.verifiedAt && release && record.serverId;
  const attemptId = `legacy:${record.id}`;
  record.lifecycle = {
    host: {
      id: `host:${record.id}`,
      provider: "hetzner",
      connectionId: record.authority?.connectionId ?? null,
      serverId: record.serverId,
      address: record.address,
    },
    releases: release ? [structuredClone(release)] : [],
    attempts: verified
      ? [
          {
            id: attemptId,
            operationId: record.operationId ?? `deployment:${record.id}`,
            releaseId: release.id,
            hostId: `host:${record.id}`,
            kind: "legacy",
            startedAt: record.createdAt,
            finishedAt: record.verifiedAt,
            outcome: "verified",
            remoteStartedAt: null,
            error: null,
            eventOffset: 0,
          },
        ]
      : [],
    runtime: {
      state: verified
        ? "verified"
        : record.serverId || record.serverCreateAttempted
          ? "unknown"
          : "not-observed",
      lastVerified: verified
        ? {
            attemptId,
            releaseId: release.id,
            hostId: `host:${record.id}`,
            revision: release.revision,
            checkedAt: record.verifiedAt!,
            images: structuredClone(
              record.serviceImages ??
                (record.imageId ? { app: record.imageId } : {}),
            ),
          }
        : null,
    },
  };
  return record.lifecycle;
}

/** Retrying cannot reassign an established host. */
export function syncDeploymentHost(record: DeploymentRecord) {
  const host = record.lifecycle?.host;
  if (!host) return;
  if (
    (host.serverId !== null && host.serverId !== record.serverId) ||
    ((host.serverId !== null || record.serverCreateAttempted) &&
      host.connectionId &&
      record.authority &&
      host.connectionId !== record.authority.connectionId)
  )
    throw new Error(
      "The deployment host changed. A retry cannot adopt another server or provider project.",
    );
  host.serverId = record.serverId;
  host.address = record.address;
  if (!host.connectionId || !record.serverId)
    host.connectionId = record.authority?.connectionId ?? host.connectionId;
}

export function beginDeploymentAttempt(
  record: DeploymentRecord,
  kind: "deploy" | "recreate" | "release" | "reconcile",
  operationId: string,
  selectedRelease?: DeploymentRelease,
): DeploymentAttempt {
  assertApprovedRelease(record);
  const release = selectedRelease ?? releaseOf(record);
  if (release && releaseOf(release)?.id !== release.id)
    throw new Error("Release content does not match its identity.");
  if (!release)
    throw new Error("A selected release is required before execution.");
  const lifecycle = ensureDeploymentLifecycle(record);
  rememberVerifiedImages(record);
  if (lifecycle.attempts.some((attempt) => attempt.outcome === "working"))
    throw new Error(
      "Reconcile the unfinished deployment attempt before retrying.",
    );
  syncDeploymentHost(record);
  if (!lifecycle.releases.some((saved) => saved.id === release.id))
    lifecycle.releases.push(structuredClone(release));
  const attempt: DeploymentAttempt = {
    id: randomUUID(),
    operationId,
    releaseId: release.id,
    hostId: lifecycle.host.id,
    kind,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    outcome: "working",
    remoteStartedAt: null,
    error: null,
    eventOffset: record.events.length,
  };
  lifecycle.attempts.push(attempt);
  return attempt;
}

/** Persist before a command that may change the host or runtime. */
export function invalidateDeploymentRuntime(record: DeploymentRecord) {
  const lifecycle = record.lifecycle;
  const attempt = lifecycle?.attempts.at(-1);
  if (!lifecycle || attempt?.outcome !== "working") return;
  attempt.remoteStartedAt ??= new Date().toISOString();
  lifecycle.runtime.state = "unknown";
}

export function finishDeploymentAttempt(
  record: DeploymentRecord,
  id: string,
  outcome: "verified" | "failed" | "interrupted",
  error: string | null = null,
) {
  const lifecycle = record.lifecycle;
  const attempt = lifecycle?.attempts.at(-1);
  if (!lifecycle || attempt?.id !== id || attempt.outcome !== "working")
    throw new Error("This deployment attempt is no longer active.");
  syncDeploymentHost(record);
  if (outcome === "verified") {
    const release = lifecycle.releases.find(
      (item) => item.id === attempt.releaseId,
    )!;
    if (
      !record.serverId ||
      !record.verifiedAt ||
      releaseOf(record)?.id !== release.id
    )
      throw new Error(
        "The verified runtime must match this attempt's release and host.",
      );
    lifecycle.runtime = {
      state: "verified",
      lastVerified: {
        attemptId: id,
        releaseId: release.id,
        hostId: attempt.hostId,
        revision: release.revision,
        checkedAt: record.verifiedAt,
        images: structuredClone(
          record.serviceImages ??
            (record.imageId ? { app: record.imageId } : {}),
        ),
      },
    };
  }
  rememberVerifiedImages(record);
  // A preflight failure preserves the previous observation. Once a remote
  // effect was possible, only a fresh successful verification restores it.
  attempt.outcome = outcome;
  attempt.finishedAt = new Date().toISOString();
  attempt.error = error;
}
