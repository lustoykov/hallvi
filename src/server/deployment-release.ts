import { createHash } from "node:crypto";
import type { DeploymentPlan, DeploymentRecord } from "./deployment-types";

type PrimaryCheck = DeploymentPlan["checks"][number];
type ServiceCheck = NonNullable<
  DeploymentPlan["services"]
>[number]["checks"][number];
/** A recorded behavior criterion, in the existing check dialects. */
export interface Criterion {
  healthPath: string;
  checks: PrimaryCheck[];
  services: {
    name: string;
    port: number;
    healthPath: string;
    checks: ServiceCheck[];
  }[];
}

/** Normalized Compose fields the controller reads; others pass through. */
export interface ResolvedService {
  image?: string;
  build?: Record<string, unknown>;
  command?: string[] | null;
  depends_on?: Record<string, unknown>;
  healthcheck?: { test?: string[]; disable?: boolean };
  labels?: Record<string, string>;
  ports?: {
    target: number;
    published?: string;
    protocol?: string;
    host_ip?: string;
  }[];
  volumes?: {
    type: string;
    source?: string;
    target: string;
    read_only?: boolean;
  }[];
  environment?: Record<string, string | null>;
  [key: string]: unknown;
}
export interface ResolvedCompose {
  name: string;
  services: Record<string, ResolvedService>;
  volumes?: Record<string, { name?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * The selected artifacts, the configuration the pinned resolver produced from
 * them, and the records native configuration cannot establish. Historical
 * comparisons read `resolved`; they never re-resolve old files. Private
 * values appear only as ${NAME} references.
 */
export interface NativeConfiguration {
  format: 1;
  resolver: string;
  compose: string[];
  files: { path: string; mode: number; sha256: string; content: string }[];
  resolved: ResolvedCompose;
  inputs: string[];
  data: {
    volume: string;
    kind: "database" | "files";
    sqlite: string | null;
    capture?: "quiesced-files";
  }[];
  database: { service: string; version: "16" | "17" | "18" } | null;
  httpAccess: "public" | "controller";
  criterion: Criterion | null;
  summary: string;
}

/** Approved source/configuration, independent of host and attempt outcome. */
export type DeploymentRelease = {
  id: string;
  repository: string;
  revision: string;
} & (
  | { plan: DeploymentPlan; native?: undefined }
  | { native: NativeConfiguration; plan?: undefined }
);
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
  record: Pick<DeploymentRecord, "repository" | "revision"> & {
    plan?: DeploymentPlan | null;
    native?: NativeConfiguration | null;
  },
): DeploymentRelease | null {
  if (!record.revision) return null;
  // Legacy identities keep their exact {repository, revision, plan} content.
  const content = record.native
    ? {
        repository: record.repository,
        revision: record.revision,
        native: record.native,
      }
    : record.plan
      ? {
          repository: record.repository,
          revision: record.revision,
          plan: record.plan,
        }
      : null;
  if (!content) return null;
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
