import { serviceImage } from "./deployment-layout";
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
export const deploymentPlanSchema = z
  .strictObject({
    image: imageReferenceSchema.optional(),
    volumes: z.array(volumeMountSchema).max(8).optional(),
    configs: z.array(configMountSchema).max(8).optional(),
    services: z.array(composeServiceSchema).max(5).optional(),
    dependencies: z.array(dependencySchema).max(30).optional(),
    inputBindings: z.array(inputBindingSchema).max(60).optional(),
    healthCommand: z
      .array(z.string().min(1).max(500))
      .min(1)
      .max(20)
      .optional(),
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
          waitSeconds: z.number().int().min(1).max(30).optional(),
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
    if (plan.image && plan.generatedDockerfile)
      fail("Choose an image or a Dockerfile build, not both.");
    const names = new Set([
      "app",
      ...(plan.postgres ? ["postgres"] : []),
      ...(plan.services ?? []).map((s) => s.name),
    ]);
    const healthNames = new Set([
      ...(plan.postgres ? ["postgres"] : []),
      ...(plan.healthCommand ? ["app"] : []),
      ...(plan.services ?? [])
        .filter((s) => s.healthCommand)
        .map((s) => s.name),
    ]);
    for (const service of plan.services ?? []) {
      if (
        [service.image, service.imageFrom, service.build].filter(Boolean)
          .length !== 1
      )
        fail(
          "Each service needs exactly one image, imageFrom reference or source build.",
        );
      try {
        serviceImage(plan, "revision", "deployment", service.name);
      } catch (error) {
        fail((error as Error).message);
      }
      if (service.imageFrom && !service.command?.length)
        fail("A service sharing the app image needs its own command.");
      if (service.checks.length && !(service.port && service.healthPath))
        fail("Private HTTP checks need a port and health path.");
      if (
        (service.role === "worker" || service.role === "broker") &&
        !service.healthCommand &&
        !(service.port && service.healthPath)
      )
        fail("Workers and brokers need an explicit readiness check.");
    }
    const edges = [
      ...(plan.dependencies ?? []),
      ...(plan.postgres
        ? [{ service: "app", needs: "postgres", condition: "healthy" }]
        : []),
    ];
    const uniqueEdges = new Set<string>();
    for (const edge of plan.dependencies ?? []) {
      if (!names.has(edge.service) || !names.has(edge.needs))
        fail("Dependency refers to an unknown service.");
      if (edge.service === "postgres")
        fail("The managed database cannot depend on an application service.");
      const key = `${edge.service}:${edge.needs}`;
      if (uniqueEdges.has(key) || (plan.postgres && key === "app:postgres"))
        fail("Dependency is already declared.");
      uniqueEdges.add(key);
      if (edge.condition === "healthy" && !healthNames.has(edge.needs))
        fail("Healthy dependencies require a container readiness command.");
    }
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (name: string): boolean => {
      if (visiting.has(name)) return false;
      if (visited.has(name)) return true;
      visiting.add(name);
      if (edges.filter((e) => e.service === name).some((e) => !visit(e.needs)))
        return false;
      visiting.delete(name);
      visited.add(name);
      return true;
    };
    if ([...names].some((name) => !visit(name)))
      fail("Service dependencies must not contain a cycle.");
    if (plan.inputBindings) {
      const inputs = new Set(plan.missingInputs.map((i) => i.name));
      const bound = new Set<string>();
      for (const binding of plan.inputBindings) {
        if (!names.has(binding.service) || binding.service === "postgres")
          fail("Input binding refers to an unsupported service.");
        if (Boolean(binding.input) === Boolean(binding.connection))
          fail("Bind either a private input or a managed connection.");
        if (binding.input && !inputs.has(binding.input))
          fail("Input binding refers to an undeclared private input.");
        if (binding.connection && !plan.postgres)
          fail("The managed PostgreSQL connection is not configured.");
        const key = `${binding.service}:${binding.variable}`;
        if (bound.has(key))
          fail("Each service variable may be bound only once.");
        bound.add(key);
        const environment =
          binding.service === "app"
            ? plan.environment
            : plan.services?.find((s) => s.name === binding.service)
                ?.environment;
        if (
          environment?.some((e) => e.name === binding.variable) ||
          (binding.service === "app" &&
            binding.variable === plan.postgres?.variable)
        )
          fail("Input binding conflicts with an existing variable.");
      }
      if (
        [...inputs].some(
          (input) => !plan.inputBindings!.some((b) => b.input === input),
        )
      )
        fail("Every private input needs a service binding.");
    }
    const services = [
      { name: "app", volumes: plan.volumes ?? [], configs: plan.configs ?? [] },
      ...(plan.services ?? []),
    ];
    if (new Set(services.map((s) => s.name)).size !== services.length)
      fail("Service names must be unique.");
    const volumes = new Map<string, { kind: string; sqlite: string | null }>();
    for (const service of services) {
      const targets = [...service.volumes, ...service.configs].map(
        (m) => m.target,
      );
      if (new Set(targets).size !== targets.length)
        fail("Mount targets must be unique per service.");
      if (
        new Set(service.configs.map((c) => c.name)).size !==
        service.configs.length
      )
        fail("Configuration names must be unique per service.");
      for (const volume of service.volumes) {
        if (plan.postgres && volume.name === "database")
          fail(
            "The managed database volume cannot be mounted by another service.",
          );
        const relativeSqlite =
          volume.sqlite?.slice(volume.target.replace(/\/$/, "").length) ?? null;
        const prior = volumes.get(volume.name);
        if (
          prior &&
          (prior.kind !== volume.kind || prior.sqlite !== relativeSqlite)
        )
          fail(
            "Shared volume mounts must describe the same data kind and relative SQLite path.",
          );
        volumes.set(volume.name, { kind: volume.kind, sqlite: relativeSqlite });
        if (
          volume.sqlite &&
          (!volume.sqlite.startsWith(volume.target.replace(/\/$/, "") + "/") ||
            volume.sqlite.includes(".."))
        )
          fail("SQLite must be inside its persistent volume.");
      }
    }
    if (plan.checks.some((c) => c.waitSeconds && c.method !== "GET"))
      fail("Only read checks may wait for an asynchronous result.");
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
