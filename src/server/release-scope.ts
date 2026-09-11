import type { DeploymentRecord } from "./deployment-types";
import { releaseIdentityHolds } from "./deployment-release";
import { establishedRuntime } from "./deployment-runtime";
import { releaseFacts, stateOwners, type ReleaseFacts } from "./release-facts";

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
  /**
   * An approved first deployment: its baseline is the approved release, not
   * yet established on the new host.
   */
  initial?: true;
  maxAttempts: 3;
  rollback?: {
    releaseId: string;
    attemptId: string;
    images: Record<string, string>;
    compatibilityEvidence: string;
  };
  /**
   * Image changes the owner approved for services that own persistent
   * data, with the compatibility assessment shown in that approval.
   */
  stateChange?: { services: string[]; evidence: string };
}
export class ReleaseScopeError extends Error {}

/**
 * Effects a release may not change without a separate decision. Ordinary
 * configuration, commands, builds and service additions are corrections.
 */
export function scopeDifferences(
  baseline: ReleaseFacts,
  next: ReleaseFacts,
  /** State owners whose image change the owner approved. */
  allowed: string[] = [],
) {
  const problems: string[] = [];
  const listener = (item: ReleaseFacts["exposure"][number]) =>
    `${item.service} ${item.hostIp || "*"}:${item.published || "(any)"}/${item.protocol}`;
  const before = new Set(baseline.exposure.map(listener));
  const after = new Set(next.exposure.map(listener));
  const added = [...after].filter((item) => !before.has(item));
  const removed = [...before].filter((item) => !after.has(item));
  if (added.length || removed.length || baseline.httpAccess !== next.httpAccess)
    problems.push(
      `This release scope does not permit changing public network exposure${[
        added.length ? ` (adds ${added.join(", ")})` : "",
        removed.length ? ` (removes ${removed.join(", ")})` : "",
        baseline.httpAccess !== next.httpAccess
          ? ` (HTTP access ${baseline.httpAccess} → ${next.httpAccess})`
          : "",
      ].join("")}.`,
    );
  const database = baseline.database;
  if (database && next.database?.service !== database.service)
    problems.push(
      `Removing or renaming the managed database service ${database.service} needs a separate data-change decision.`,
    );
  // A declared owner keeps its image: the data it wrote may not be readable
  // by another version. An approved state change permits one.
  for (const owner of stateOwners(baseline)) {
    if (allowed.includes(owner)) continue;
    const was = baseline.services.find((service) => service.name === owner);
    const now = next.services.find((service) => service.name === owner);
    if (was && (!now || now.image !== was.image || now.build !== was.build))
      problems.push(
        `Service ${owner} owns persistent data, so changing its image (${was.build ? "built" : was.image} → ${now ? (now.build ? "built" : now.image) : "removed"}) needs the owner's decision: propose it as a state change with its compatibility evidence.`,
      );
  }
  for (const volume of baseline.volumes) {
    const kept = next.volumes.find(
      (item) =>
        item.dockerName === volume.dockerName &&
        item.kind === volume.kind &&
        item.sqlite === volume.sqlite,
    );
    if (
      !kept ||
      volume.mounts.some(
        (mount) =>
          !kept.mounts.some(
            (item) =>
              item.service === mount.service &&
              item.target === mount.target &&
              item.readOnly === mount.readOnly,
          ),
      )
    )
      problems.push(
        `Preserve volume ${volume.name}, its existing consumers, access, mount and recorded data path. Moving existing data needs a separate decision.`,
      );
    // Its declared owner and capture stay through ordinary corrections: an
    // owner that vanished from the records would lose its image protection
    // and its data would lose its capture on the next release.
    if (
      kept &&
      volume.owner &&
      !allowed.includes(volume.owner) &&
      (kept.owner !== volume.owner || kept.capture !== volume.capture)
    )
      problems.push(
        `Volume ${volume.name} is owned by ${volume.owner}${volume.capture ? ` with capture "${volume.capture}"` : ""}; a correction keeps that declaration. Changing or removing it needs the owner's decision: propose it as a state change for ${volume.owner}.`,
      );
  }
  return problems;
}

export function assertReleaseScope(
  record: DeploymentRecord,
  scope: ReleaseScope,
  candidate: ReleaseFacts,
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
  // Retries under this authorization may replace their own observed runtime;
  // a first deployment starts from none.
  const established = establishedRuntime(record.lifecycle.runtime);
  if (
    !(scope.initial && !established) &&
    established?.releaseId !== scope.baselineReleaseId &&
    !record.lifecycle.attempts.some(
      (attempt) =>
        attempt.id === established?.attemptId &&
        attempt.authorizationId === scope.id,
    )
  )
    throw new ReleaseScopeError(
      "A different release has been established since this scope was proposed. Review the update again.",
    );
  const baseline = record.lifecycle.releases.find(
    (r) => r.id === scope.baselineReleaseId,
  );
  if (!baseline || !releaseIdentityHolds(baseline))
    throw new ReleaseScopeError(
      "The baseline release is unavailable. Reconcile its identity first.",
    );
  const problems = scopeDifferences(
    releaseFacts(baseline),
    candidate,
    scope.stateChange?.services,
  );
  if (problems.length) throw new ReleaseScopeError(problems.join(" "));
}
