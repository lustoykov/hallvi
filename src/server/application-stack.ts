// The application's stack as recorded: what runs on the one instance, what
// stores state, and what protects it. Derived from the deployment record so
// the views, Overview, navigation and the architecture canvas agree. The
// web process and PostgreSQL come from the plan the executor runs; the rest
// comes from `record.stack` once a deployment records it.
import type { DeploymentRecord } from "./deployment-types";

export type StackState = "running" | "planned";

export interface StackProcess {
  name: string;
  role: "web" | "worker";
  command: string | null;
  image: string | null;
  /** Host port → container port for the web process. */
  port: number | null;
  healthPath: string | null;
  consumes: string | null;
  state: StackState;
}
export interface StackDatabase {
  kind: "postgres" | "sqlite";
  name: string;
  version: string | null;
  /** Named volume or file path holding the data. */
  location: string;
  state: StackState;
}
export interface StackService {
  kind: "redis" | "valkey";
  name: string;
  version: string | null;
  role: "cache" | "broker" | "cache and broker";
  persistence: string | null;
  state: StackState;
}
export interface StackQueue {
  library: string;
  backend: "postgres" | "redis";
  workers: string[];
}
export type StackJob = NonNullable<
  NonNullable<DeploymentRecord["stack"]>["jobs"]
>[number];
export interface StackVolume {
  name: string;
  usedBy: string;
  mount: string;
  kind: "database" | "files";
  state: StackState;
}
export interface ApplicationStack {
  /** False until a deployment plan records what the application needs. */
  recorded: boolean;
  processes: StackProcess[];
  databases: StackDatabase[];
  services: StackService[];
  queues: StackQueue[];
  jobs: StackJob[];
  volumes: StackVolume[];
}

export const emptyStack: ApplicationStack = {
  recorded: false,
  processes: [],
  databases: [],
  services: [],
  queues: [],
  jobs: [],
  volumes: [],
};

export function stackOf(record: DeploymentRecord | null): ApplicationStack {
  const plan = record?.plan;
  if (!record || !plan) return emptyStack;
  const state: StackState = record.status === "live" ? "running" : "planned";
  const extra = record.stack ?? {};
  const imageServices = plan.services ?? [];
  const plannedVolumes = [
    { name: "app", volumes: plan.volumes ?? [] },
    ...imageServices,
  ].flatMap((service) =>
    service.volumes.map((v) => ({
      name: v.name,
      usedBy: service.name,
      mount: v.target,
      kind: v.kind,
      sqlite: v.sqlite,
    })),
  );
  const processes: StackProcess[] = [
    {
      name: "app",
      role: "web",
      command: plan.command?.join(" ") ?? null,
      image: plan.image ?? record.imageId ?? null,
      port: plan.port,
      healthPath: plan.healthPath,
      consumes: null,
      state,
    },
    ...imageServices.map((service) => ({
      name: service.name,
      role: "web" as const,
      command: service.command?.join(" ") ?? null,
      image: service.image,
      port: null,
      healthPath: service.healthPath,
      consumes: null,
      state,
    })),
    ...(extra.processes ?? []).map((process) => ({
      name: process.name,
      role: process.role,
      command: process.command,
      image: process.image ?? null,
      port: null,
      healthPath: null,
      consumes: process.consumes ?? null,
      state,
    })),
  ];
  const databases: StackDatabase[] = [
    ...(plan.postgres
      ? [
          {
            kind: "postgres" as const,
            name: "postgres",
            version: plan.postgres.version,
            location: "database volume",
            state,
          },
        ]
      : []),
    ...plannedVolumes
      .filter((v) => v.sqlite)
      .map((v) => ({
        kind: "sqlite" as const,
        name: v.usedBy,
        version: null,
        location: v.sqlite!,
        state,
      })),
    ...(extra.databases ?? []).map((database) => ({
      kind: database.kind,
      name: database.name,
      version: null,
      location: database.path,
      state,
    })),
  ];
  const volumes: StackVolume[] = [
    ...(plan.postgres
      ? [
          {
            name: "database",
            usedBy: "postgres",
            mount: `/var/lib/postgresql${plan.postgres.version === "18" ? "" : "/data"}`,
            kind: "database" as const,
            state,
          },
        ]
      : []),
    ...plannedVolumes.map((v) => ({
      name: v.name,
      usedBy: v.usedBy,
      mount: v.mount,
      kind: v.kind,
      state,
    })),
    ...(extra.volumes ?? []).map((volume) => ({ ...volume, state })),
  ];
  return {
    recorded: true,
    processes,
    databases,
    services: (extra.services ?? []).map((service) => ({
      kind: service.kind,
      name: service.name,
      version: service.version ?? null,
      role: service.role,
      persistence: service.persistence ?? null,
      state,
    })),
    queues: extra.queues ?? [],
    jobs: extra.jobs ?? [],
    volumes,
  };
}

/** Everything that holds state the application would lose with its host. */
export function persistentState(stack: ApplicationStack) {
  return [
    ...stack.databases.map((database) => ({
      key: `database:${database.name}`,
      label:
        database.kind === "postgres"
          ? `PostgreSQL ${database.version ?? ""}`.trim()
          : `SQLite · ${database.name}`,
      detail: database.location,
      method:
        database.kind === "postgres"
          ? "consistent database dump"
          : "consistent copy of the database file",
    })),
    ...stack.volumes
      .filter((volume) => volume.kind === "files")
      .map((volume) => ({
        key: `volume:${volume.name}`,
        label: `Files · ${volume.name}`,
        detail: `${volume.mount} · used by ${volume.usedBy}`,
        method: "file archive",
      })),
  ];
}
