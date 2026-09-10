import { z } from "zod";
import {
  imageReferenceSchema,
  volumeMountSchema,
  configMountSchema,
  composeServiceSchema,
  dependencySchema,
  inputBindingSchema,
} from "./compose-plan";

const path = z.string().regex(/^(?!\/)(?!.*\.\.)(?!.*[\r\n])[A-Za-z0-9_./-]+$/);
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
/**
 * Legacy plans, read for historical releases and rollback. New deployments
 * are native Compose; plans were validated when they were authored.
 */
export const deploymentPlanSchema = z.strictObject({
  image: imageReferenceSchema.optional(),
  volumes: z.array(volumeMountSchema).max(8).optional(),
  configs: z.array(configMountSchema).max(8).optional(),
  services: z.array(composeServiceSchema).max(5).optional(),
  dependencies: z.array(dependencySchema).max(30).optional(),
  inputBindings: z.array(inputBindingSchema).max(60).optional(),
  healthCommand: z.array(z.string().min(1).max(500)).min(1).max(20).optional(),
  httpAccess: z.enum(["public", "controller"]).optional(),
  summary: z.string().min(20).max(1500),
  dockerfile: path,
  // Only deployment packaging may be generated; never patch application code.
  generatedDockerfile: z.string().max(12000).nullable(),
  context: path,
  port: z.number().int().min(1024).max(65535),
  command: z.array(z.string().min(1).max(500)).max(20).nullable(),
  environment: z
    .array(
      z.strictObject({
        name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
        value: z.string().max(1000),
      }),
    )
    .max(30),
  postgres: z
    .strictObject({
      version: z.enum(["16", "17", "18"]),
      variable: z
        .string()
        .regex(/^[A-Z_][A-Z0-9_]*$/)
        .nullable(),
      scheme: z.enum(["postgresql", "postgresql+psycopg", "postgres"]),
    })
    .nullable(),
  missingInputs: z
    .array(
      z.strictObject({
        name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
        reason: z.string().min(1).max(400),
      }),
    )
    .max(20),
  healthPath: httpPathSchema,
  checks: z.array(primaryCheckSchema).min(1).max(8),
});
export type DeploymentPlan = z.infer<typeof deploymentPlanSchema>;
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
  /** Lifecycle history alongside the legacy executor workspace. */
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
  inspectedRevision?: string | null;
  cleanup?: { path: string; expectedStatus: number; marker: string } | null;
  revision: string | null;
  /** Legacy custom plan; null once a native release is selected. */
  plan: DeploymentPlan | null;
  /** The selected native release configuration, when not a legacy plan. */
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
    { checkedAt: string; kind: "command" | "http"; imageId: string | null }
  >;
  /** Immutable recommendation identity; old records are projected on read. */
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
   * Stack facts beyond the web process and PostgreSQL that the executor
   * runs from the plan. Services in the plan are authoritative; this optional
   * legacy projection also carries schedules and queue-library metadata.
   * Recording such metadata does not install a schedule or verify a job.
   */
  stack?: RecordedStack;
}
export interface RecordedStack {
  processes?: {
    name: string;
    role: "web" | "worker";
    command: string | null;
    image?: string | null;
    /** The queue or broker a worker consumes. */
    consumes?: string | null;
  }[];
  databases?: { kind: "sqlite"; name: string; path: string }[];
  services?: {
    kind: "redis" | "valkey";
    name: string;
    version?: string | null;
    role: "cache" | "broker" | "cache and broker";
    persistence?: string | null;
  }[];
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
  volumes?: {
    name: string;
    usedBy: string;
    mount: string;
    kind: "database" | "files";
  }[];
}
