import { createHash } from "node:crypto";
import type { DeploymentPlan, DeploymentRecord } from "./deployment-types";

/** Approved source/configuration, independent of host and attempt outcome. */
export interface DeploymentRelease {
  id: string;
  repository: string;
  revision: string;
  plan: DeploymentPlan;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
/** Project old releases from saved data without rewriting legacy rows. */
export function releaseOf(
  record: Pick<DeploymentRecord, "repository" | "revision" | "plan">,
): DeploymentRelease | null {
  if (!record.revision || !record.plan) return null;
  const content = {
    repository: record.repository,
    revision: record.revision,
    plan: record.plan,
  };
  const id = createHash("sha256")
    .update(JSON.stringify(canonical(content)))
    .digest("hex");
  return { id, ...content };
}
export function assertApprovedRelease(record: DeploymentRecord) {
  if (record.releaseId && record.releaseId !== releaseOf(record)?.id)
    throw new Error(
      "The release changed after recommendation. Inspect and approve a new recommendation before deploying.",
    );
}
