import { z } from "zod";

const path = z.string().regex(/^(?!\/)(?!.*\.\.)(?!.*[\r\n])[A-Za-z0-9_./-]+$/);
export const deploymentPlanSchema = z
  .strictObject({
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
        variable: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
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
    healthPath: z
      .string()
      .regex(/^\/(?!\/)[^\s]*$/)
      .max(200),
    checks: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(120),
          method: z.enum(["GET", "POST", "DELETE"]),
          path: z
            .string()
            .regex(/^\/(?!\/)[^\s]*$/)
            .max(200),
          body: z.record(z.string(), z.unknown()).nullable(),
          expectedStatus: z.number().int().min(200).max(299),
          contains: z.string().max(300),
          captureId: z
            .string()
            .regex(/^[a-zA-Z0-9_.]+$/)
            .nullable(),
        }),
      )
      .min(1)
      .max(8),
  })
  .superRefine((plan, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      !plan.checks.some(
        (c) =>
          c.method === "GET" &&
          c.path !== plan.healthPath &&
          c.contains.trim().length > 0,
      )
    )
      fail(
        "Include a content assertion on an application route beyond the health endpoint.",
      );
    const mutations = plan.checks.filter((c) => c.method !== "GET");
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
        plan.checks.at(-1) !== cleanup ||
        plan.checks.indexOf(create) >=
          plan.checks.findIndex(
            (c) =>
              c.method === "GET" &&
              c.path.includes("{id}") &&
              c.contains.includes("SG_VERIFY_TOKEN"),
          )
      )
        fail(
          "Mutating verification must create one marked object, capture its ID, read that marked object, and finally delete only that ID.",
        );
    }
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
  id: string;
  applicationId: string;
  chatId: string;
  status: DeploymentStatus;
  repository: string;
  recommendationId?: string;
  verificationPending?: string | null;
  repositoryId?: number;
  githubConnectionId?: string;
  inspectedRevision?: string | null;
  cleanup?: { path: string; expectedStatus: number; marker: string } | null;
  revision: string | null;
  plan: DeploymentPlan | null;
  offer: HostOffer | null;
  authority: {
    acceptedAt: string;
    connectionId: string;
    maxMonthly: number;
  } | null;
  serverId: number | null;
  serverCreateAttempted: boolean;
  address: string | null;
  imageId: string | null;
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
   * runs from the plan. Nothing records these yet; the executor deploys one
   * web process plus optional PostgreSQL. The views read them once a
   * deployment records worker processes, Redis or Valkey, queues, scheduled
   * commands or file volumes.
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
