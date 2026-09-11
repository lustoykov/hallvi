import { z } from "zod";

export const httpPathSchema = z
  .string()
  .regex(/^\/(?!\/)[^\s]*$/)
  .max(200);
export const primaryCheckSchema = z.strictObject({
  name: z.string().min(1).max(120),
  method: z.enum(["GET", "POST", "DELETE"]),
  waitSeconds: z.number().int().min(1).max(30).optional(),
  path: httpPathSchema,
  body: z.record(z.string(), z.unknown()).nullable(),
  expectedStatus: z.number().int().min(200).max(299),
  contains: z.string().max(300),
  captureId: z
    .string()
    .regex(/^[a-zA-Z0-9_.]+$/)
    .nullable(),
});
/** A private HTTP check of one service on its container port. */
export const serviceCheckSchema = z.strictObject({
  path: z
    .string()
    .regex(/^\/(?!\/)[^\s]*$/)
    .max(300),
  contains: z.string().min(1).max(300),
  jsonPath: z
    .string()
    .regex(/^[a-zA-Z0-9_.]+$/)
    .nullable(),
  equals: z.union([z.string(), z.number(), z.boolean()]).nullable(),
});
/**
 * A command run in a running service's container after the HTTP checks. It
 * passes when it exits 0 and its output contains `contains`. Named private
 * inputs reach its environment; their values never enter records or model
 * context. A command may change data: it runs under the release's authority.
 */
export const commandCheckSchema = z.strictObject({
  name: z.string().min(1).max(120),
  service: z.string().min(1).max(63),
  run: z.array(z.string().min(1).max(4000)).min(1).max(40),
  inputs: z
    .array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/))
    .max(10)
    .optional(),
  contains: z.string().max(300).optional(),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
});
type PrimaryCheck = z.infer<typeof primaryCheckSchema>;
/** A health route proves readiness, not behavior; created objects are owned. */
export function checkIssues(healthPath: string, checks: PrimaryCheck[]) {
  const issues: string[] = [];
  if (
    !checks.some(
      (c) =>
        c.method === "GET" &&
        c.path !== healthPath &&
        c.contains.trim().length > 0,
    )
  )
    issues.push(
      "Include a content assertion on an application route beyond the health endpoint.",
    );
  if (checks.some((c) => c.waitSeconds && c.method !== "GET"))
    issues.push("Only read checks may wait for an asynchronous result.");
  const mutations = checks.filter((c) => c.method !== "GET");
  if (mutations.length) {
    const create = mutations[0];
    const cleanup = mutations[1];
    if (
      mutations.length !== 2 ||
      create.method !== "POST" ||
      !create.captureId ||
      !JSON.stringify(create.body).includes("SG_VERIFY_TOKEN") ||
      !create.contains.includes("SG_VERIFY_TOKEN") ||
      cleanup?.method !== "DELETE" ||
      !cleanup.path.includes("{id}") ||
      checks.at(-1) !== cleanup ||
      checks.indexOf(create) >=
        checks.findIndex(
          (c) =>
            c.method === "GET" &&
            c.path.includes("{id}") &&
            c.contains.includes("SG_VERIFY_TOKEN"),
        )
    )
      issues.push(
        "Mutating verification must create one marked object, capture its ID, read that marked object, and finally delete only that ID.",
      );
  }
  return issues;
}
export interface HostOffer {
  serverType: string;
  location: string;
  cores: number;
  memory: number;
  monthly: number;
  hourly: number;
  currency: string;
}
export type DeploymentStatus =
  | "queued"
  | "planning"
  | "awaiting-approval"
  | "deploy-queued"
  | "deploying"
  | "live"
  | "failed";
export interface DeploymentRecord {
  /** Later release work owns its own receipt. */
  releaseOperationId?: string;
  /** Releases, attempts, host identity and runtime observations. */
  lifecycle?: import("./deployment-runtime").DeploymentLifecycle;
  operationId?: string;
  id: string;
  applicationId: string;
  chatId: string;
  status: DeploymentStatus;
  repository: string;
  /** The initiating user request, kept separate from repository evidence. */
  requirements?: string;
  requestedRef?: string;
  recommendationId?: string;
  verificationPending?: string | null;
  /** Candidate ID is verified against the unique marker before deletion. */
  verificationRecoveryId?: string | null;
  repositoryId?: number;
  githubConnectionId?: string;
  cleanup?: { path: string; expectedStatus: number; marker: string } | null;
  revision: string | null;
  /** The selected native release configuration. */
  native?: import("./deployment-release").NativeConfiguration | null;
  offer: HostOffer | null;
  authority: {
    acceptedAt: string;
    connectionId: string;
    maxMonthly: number;
    /** The approved release; corrections under it keep its effects. */
    releaseId?: string;
  } | null;
  serverId: number | null;
  serverCreateAttempted: boolean;
  address: string | null;
  imageId: string | null;
  /** Every service image observed on the host, keyed by service name. */
  serviceImages?: Record<string, string>;
  /** Historical readiness evidence, not continuous monitoring. */
  serviceReadiness?: Record<
    string,
    {
      checkedAt: string;
      /** A readiness command, an HTTP check, or a one-shot's exit 0. */
      kind: "command" | "http" | "completed";
      imageId: string | null;
    }
  >;
  /** Identity of the selected configuration's release. */
  releaseId?: string;
  bundleHashes?: Record<string, string>;
  /** Public HTTP is limited to this controller address when requested. */
  httpSourceIp?: string;
  url: string | null;
  verifiedAt: string | null;
  error: string | null;
  events: { at: string; message: string }[];
  logs: string;
  createdAt: string;
  updatedAt: string;
  /** The recorded reply this deployment's receipt sits under. */
  originMessageId?: string | null;
  /**
   * Replies in other conversations that referred to this deployment instead
   * of starting a second one.
   */
  mentions?: { chatId: string; messageId: string; at: string }[];
  /** When application logs were last collected from the host. */
  logsCollectedAt?: string | null;
  /**
   * Schedules and queue-library metadata recorded beside the configuration.
   * Recording such metadata does not install a schedule or verify a job.
   */
  stack?: RecordedStack;
}
export interface RecordedStack {
  queues?: {
    library: string;
    backend: "postgres" | "redis";
    /** Worker process names that consume it. */
    workers: string[];
  }[];
  jobs?: {
    name: string;
    command: string;
    schedule: string;
    timezone: string;
    /** The process whose image runs it. */
    runsIn: string;
    nextRunAt?: string | null;
    lastRun?: {
      at: string;
      outcome: "succeeded" | "failed" | "timed-out" | "missed" | "unknown";
      durationSeconds?: number | null;
    } | null;
    paused?: boolean;
  }[];
}
