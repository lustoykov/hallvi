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
  /** Observed: the exact runtime is known, without a behavior criterion. */
  outcome: "working" | "verified" | "observed" | "failed" | "interrupted";
  remoteStartedAt: string | null;
  error: string | null;
  /** Offset in the action log; the next attempt bounds the end. */
  eventOffset: number;
}
/** What an execution or reconciliation established on the host. */
export interface RuntimeSnapshot {
  attemptId: string;
  releaseId: string;
  hostId: string;
  revision: string;
  checkedAt: string;
  images: Record<string, string>;
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
  verifiedImages?: {
    attemptId: string;
    releaseId: string;
    hostId: string;
    checkedAt: string;
    images: Record<string, string>;
  }[];
  reconciliations?: {
    id: string;
    attemptId: string;
    releaseId: string;
    phase: string;
    exitCode: number;
    observedAt: string;
  }[];
  runtime: {
    /**
     * Verification is timestamped evidence, never continuous health. Observed
     * means the running release and images are known but its behavior was not
     * verified; it can baseline a corrective update, never a rollback.
     */
    state: "not-observed" | "verified" | "observed" | "unknown";
    lastVerified: RuntimeSnapshot | null;
    /** The latest runtime established by execution, whatever its behavior. */
    observed?:
      | (RuntimeSnapshot & { behavior: "passed" | "failed" | "unverified" })
      | null;
  };
}

/** The attributable runtime a new scope may bind: observed or verified. */
export function establishedRuntime(runtime: DeploymentLifecycle["runtime"]) {
  return runtime.observed ?? runtime.lastVerified;
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
    observed: null,
  };
}
