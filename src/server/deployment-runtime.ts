import type { DeploymentRelease } from "./deployment-release";
import type { DeploymentRecord } from "./deployment-types";

export interface DeploymentAttempt {
  id: string;
  operationId: string;
  releaseId: string;
  hostId: string;
  kind: "deploy" | "recreate" | "release" | "reconcile" | "legacy";
  authorizationId?: string;
  reconcilesAttemptId?: string;
  remoteResult?: { phase: string; exitCode: number; at: string };
  startedAt: string;
  finishedAt: string | null;
  outcome: "working" | "verified" | "failed" | "interrupted";
  remoteStartedAt: string | null;
  error: string | null;
  /** Offset in the action log; the next attempt bounds the end. */
  eventOffset: number;
}
export interface DeploymentLifecycle {
  host: {
    id: string;
    provider: "hetzner";
    connectionId: string | null;
    serverId: number | null;
    address: string | null;
  };
  releases: DeploymentRelease[];
  attempts: DeploymentAttempt[];
  reconciliations?: {
    id: string;
    attemptId: string;
    releaseId: string;
    phase: string;
    exitCode: number;
    observedAt: string;
  }[];
  runtime: {
    /** Verification is timestamped evidence, never continuous health. */
    state: "not-observed" | "verified" | "unknown";
    lastVerified: {
      attemptId: string;
      releaseId: string;
      hostId: string;
      revision: string;
      checkedAt: string;
      images: Record<string, string>;
    } | null;
  };
}

/** Browser-safe projection; it never imports or rewrites legacy storage. */
export function deploymentRuntime(record: DeploymentRecord | null) {
  if (record?.lifecycle) return record.lifecycle.runtime;
  return {
    state: !record
      ? ("not-observed" as const)
      : record.status === "live" && record.verifiedAt
        ? ("verified" as const)
        : record.serverId || record.serverCreateAttempted
          ? ("unknown" as const)
          : ("not-observed" as const),
    lastVerified: null,
  };
}
