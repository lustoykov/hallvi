import { createHash } from "node:crypto";
import type { z } from "zod";
import type {
  commandCheckSchema,
  DeploymentRecord,
  primaryCheckSchema,
  serviceCheckSchema,
} from "./deployment-types";

/** A recorded behavior criterion, in the existing check dialects. */
export interface Criterion {
  healthPath: string;
  checks: z.infer<typeof primaryCheckSchema>[];
  services: {
    name: string;
    port: number;
    healthPath: string;
    checks: z.infer<typeof serviceCheckSchema>[];
  }[];
  /** Commands in the application's containers; absent in older releases. */
  commands?: z.infer<typeof commandCheckSchema>[];
}

/**
 * Commands, chosen from the application's documentation, that protect state
 * the core cannot copy as files: `dump` prints a consistent copy while the
 * state's writers are stopped, `restore` loads that copy from standard input
 * into a fresh instance, and `verify` prints a content fingerprint that must
 * be identical for the source and the restored copy.
 */
export interface StateProcedure {
  dump: string[];
  restore: string[];
  verify: string[];
}

/**
 * A private value that only needs to be random: the controller generates it
 * at approval and stores it with the owner's inputs. Pi and records see only
 * its name.
 */
export interface InputGenerator {
  bytes: number;
  encoding: "hex" | "base64" | "base64url";
  prefix?: string;
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
  /**
   * Set once by the schema v14 migration, which converted a retired Server
   * Guy plan into this configuration and validated the release's historical
   * identity. The release keeps that identity only while `digest` still
   * matches its repository, revision and this configuration.
   */
  converted?: { from: "deployment-plan"; schema: 14; digest: string };
  compose: string[];
  files: { path: string; mode: number; sha256: string; content: string }[];
  resolved: ResolvedCompose;
  inputs: string[];
  /** Why each private input declared at intake is needed, for the owner. */
  inputReasons?: Record<string, string>;
  /** Inputs the controller generates at approval instead of asking. */
  inputGenerators?: Record<string, InputGenerator>;
  data: {
    volume: string;
    kind: "database" | "files";
    sqlite: string | null;
    capture?: "quiesced-files" | "dump";
    /**
     * The service that owns this state: it keeps its image across
     * application releases and rollbacks, and its procedure runs in it.
     */
    owner?: string;
    /** For capture "dump": commands run in the owner's container. */
    procedure?: StateProcedure;
  }[];
  database: { service: string; version: "16" | "17" | "18" } | null;
  httpAccess: "public" | "controller";
  criterion: Criterion | null;
  summary: string;
}

/** Approved source/configuration, independent of host and attempt outcome. */
export interface DeploymentRelease {
  id: string;
  repository: string;
  revision: string;
  native: NativeConfiguration;
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
function contentIdentity(release: {
  repository: string;
  revision: string;
  native: unknown;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          repository: release.repository,
          revision: release.revision,
          native: release.native,
        }),
      ),
    )
    .digest("hex");
}
/** Whether converted content is exactly what the migration sealed. */
function sealed(content: Omit<DeploymentRelease, "id">) {
  const { digest, ...marker } = content.native.converted!;
  return (
    digest ===
    contentIdentity({
      ...content,
      native: { ...content.native, converted: marker },
    })
  );
}
/**
 * The release a record's selected configuration represents. Native content is
 * content-addressed; a converted configuration keeps the historical identity
 * the migration validated and recorded as the record's releaseId while its
 * seal holds. Changed afterwards, it is new content with a new identity.
 */
export function releaseOf(
  record: Pick<DeploymentRecord, "repository" | "revision" | "releaseId"> & {
    native?: NativeConfiguration | null;
  },
): DeploymentRelease | null {
  if (!record.revision || !record.native) return null;
  const content = {
    repository: record.repository,
    revision: record.revision,
    native: record.native,
  };
  const id =
    record.native.converted && sealed(content)
      ? record.releaseId
      : contentIdentity(content);
  return id ? { id, ...content } : null;
}
/** Whether a recorded release object still carries its own identity. */
export function releaseIdentityHolds(release: DeploymentRelease) {
  return release.native.converted
    ? /^[0-9a-f]{64}$/.test(release.id) && sealed(release)
    : contentIdentity(release) === release.id;
}
export function assertApprovedRelease(record: DeploymentRecord) {
  if (record.releaseId && record.releaseId !== releaseOf(record)?.id)
    throw new Error(
      "The release changed after recommendation. Inspect and approve a new recommendation before deploying.",
    );
}
