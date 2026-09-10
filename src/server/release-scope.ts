import type { DeploymentPlan, DeploymentRecord } from "./deployment-types";
import { releaseOf } from "./deployment-release";

/** One task, one existing host, one selected revision, no new spending. */
export interface ReleaseScope {
  id: string;
  deploymentId: string;
  hostId: string;
  serverId: number;
  address: string;
  repository: string;
  repositoryId: number;
  revision: string;
  baselineReleaseId: string;
  maxAttempts: 3;
}
export class ReleaseScopeError extends Error {}

export function assertReleaseScope(
  record: DeploymentRecord,
  scope: ReleaseScope,
  plan: DeploymentPlan,
) {
  if (
    record.id !== scope.deploymentId ||
    record.serverId !== scope.serverId ||
    record.address !== scope.address ||
    record.lifecycle?.host.id !== scope.hostId ||
    record.repository !== scope.repository ||
    record.repositoryId !== scope.repositoryId
  )
    throw new ReleaseScopeError(
      "The application, source or host changed. Review a new release scope.",
    );
  if (
    record.lifecycle.runtime.lastVerified?.releaseId !== scope.baselineReleaseId
  )
    throw new ReleaseScopeError(
      "A different release has been verified since this scope was proposed. Review the update again.",
    );
  const baseline = record.lifecycle.releases.find(
    (r) => r.id === scope.baselineReleaseId,
  );
  if (!baseline || releaseOf(baseline)?.id !== baseline.id)
    throw new ReleaseScopeError(
      "The baseline release is unavailable. Reconcile its identity first.",
    );
  if ((plan.httpAccess ?? "public") !== (baseline.plan.httpAccess ?? "public"))
    throw new ReleaseScopeError(
      "This release scope does not permit changing public network exposure.",
    );
  if (
    baseline.plan.postgres &&
    baseline.plan.postgres.version !== plan.postgres?.version
  )
    throw new ReleaseScopeError(
      "Removing or upgrading the managed database needs a separate data-change decision.",
    );
  const mounts = (p: DeploymentPlan) =>
    [{ name: "app", volumes: p.volumes ?? [] }, ...(p.services ?? [])].flatMap(
      (s) => s.volumes.map((v) => ({ service: s.name, ...v })),
    );
  const next = mounts(plan);
  for (const before of mounts(baseline.plan)) {
    if (
      !next.some(
        (after) =>
          after.name === before.name &&
          after.service === before.service &&
          after.target === before.target &&
          after.kind === before.kind &&
          after.sqlite === before.sqlite,
      )
    )
      throw new ReleaseScopeError(
        `Preserve volume ${before.name}, its owner, mount and recorded data path. Moving existing data needs a separate decision.`,
      );
  }
}
