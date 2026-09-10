import { sharedVolumes, serviceImage } from "./deployment-layout";
// The application's stack as recorded: what runs on the one instance, what
// stores state, and what protects it. Derived from the deployment record so
// the views, Overview, navigation and the architecture canvas agree. The
// web process and PostgreSQL come from the plan the executor runs; the rest
// comes from `record.stack` once a deployment records it.
import { deploymentRuntime } from "./deployment-runtime";
import { currentFacts } from "./release-facts";
import type { DeploymentRecord } from "./deployment-types";

export type StackState = "running" | "planned" | "unknown";

export interface StackProcess {
  name: string;
  role: "web" | "worker" | "broker" | "service";
  command: string | null;
  image: string | null;
  /** Host port → container port for the web process. */
  port: number | null;
  healthPath: string | null;
  consumes: string | null;
  private?: boolean;
  healthCommand?: string[];
  readiness?: NonNullable<DeploymentRecord["serviceReadiness"]>[string];
  dependsOn?: string[];
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
  mounts?: {
    service: string;
    target: string;
    readOnly: boolean;
    sqlite: string | null;
  }[];
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

/**
 * Native releases: the inventory derived from the retained configuration and
 * observed runtime. Descriptive recorded processes and services do not compete
 * with it; recorded jobs and queues remain operational records.
 */
function nativeStack(record: DeploymentRecord): ApplicationStack {
  const facts = currentFacts(record)!;
  const runtime = deploymentRuntime(record);
  const state: StackState =
    runtime.state === "unknown"
      ? "unknown"
      : record.status === "live"
        ? "running"
        : "planned";
  const usedBy = (mounts: { service: string }[]) =>
    [...new Set(mounts.map((m) => m.service))].join(", ");
  return {
    recorded: true,
    processes: facts.services
      .filter((service) => service.name !== facts.database?.service)
      .map((service) => {
        const exposure = facts.exposure.find((e) => e.service === service.name);
        return {
          name: service.name,
          role: exposure ? ("web" as const) : ("service" as const),
          command: service.command,
          image: record.serviceImages?.[service.name] ?? service.pinned,
          port: exposure?.target ?? null,
          healthPath: null,
          consumes: null,
          private: !exposure,
          dependsOn: service.dependsOn,
          ...(record.serviceReadiness?.[service.name]
            ? { readiness: record.serviceReadiness[service.name] }
            : {}),
          state,
        };
      }),
    databases: [
      ...(facts.database
        ? [
            {
              kind: "postgres" as const,
              name: facts.database.service,
              version: facts.database.version,
              location: `${facts.database.volume ?? "database"} volume`,
              state,
            },
          ]
        : []),
      ...facts.volumes
        .filter((volume) => volume.sqlite)
        .map((volume) => ({
          kind: "sqlite" as const,
          name: usedBy(volume.mounts),
          version: null,
          location: volume.mounts[0].sqlite!,
          state,
        })),
    ],
    services: [],
    queues: record.stack?.queues ?? [],
    jobs: record.stack?.jobs ?? [],
    volumes: facts.volumes.map((volume) => ({
      name: volume.name,
      usedBy: usedBy(volume.mounts),
      mount:
        volume.mounts.length === 1 && !volume.mounts[0].readOnly
          ? volume.mounts[0].target
          : volume.mounts
              .map(
                (m) =>
                  `${m.service}: ${m.target} (${m.readOnly ? "read-only" : "read/write"})`,
              )
              .join(" · "),
      ...(volume.mounts.length > 1 || volume.mounts.some((m) => m.readOnly)
        ? { mounts: volume.mounts }
        : {}),
      kind: volume.kind,
      state,
    })),
  };
}

export function stackOf(record: DeploymentRecord | null): ApplicationStack {
  if (record?.native) return nativeStack(record);
  const plan = record?.plan;
  if (!record || !plan) return emptyStack;
  const runtime = deploymentRuntime(record);
  const state: StackState =
    runtime.state === "unknown"
      ? "unknown"
      : record.status === "live"
        ? "running"
        : "planned";
  const extra = record.stack ?? {};
  const imageServices = plan.services ?? [];
  const plannedVolumes = sharedVolumes(plan).map((v) => ({
    name: v.name,
    usedBy: [...new Set(v.mounts.map((m) => m.service))].join(", "),
    mount:
      v.mounts.length === 1 && !v.mounts[0].readOnly
        ? v.mounts[0].target
        : v.mounts
            .map(
              (m) =>
                `${m.service}: ${m.target} (${m.readOnly ? "read-only" : "read/write"})`,
            )
            .join(" · "),
    kind: v.kind,
    sqlite: v.mounts[0].sqlite,
    mounts: v.mounts,
  }));
  const processes: StackProcess[] = [
    {
      name: "app",
      role: "web",
      command: plan.command?.join(" ") ?? null,
      image: plan.image ?? record.imageId ?? null,
      port: plan.port,
      healthPath: plan.healthPath,
      consumes: null,
      dependsOn: [
        ...(plan.postgres ? ["postgres"] : []),
        ...(plan.dependencies ?? [])
          .filter((d) => d.service === "app")
          .map((d) => d.needs),
      ],
      ...(plan.healthCommand ? { healthCommand: plan.healthCommand } : {}),
      ...(record.serviceReadiness?.app
        ? { readiness: record.serviceReadiness.app }
        : {}),
      state,
    },
    ...imageServices.map((service) => ({
      name: service.name,
      role:
        service.role ??
        (service.port ? ("web" as const) : ("service" as const)),
      command: service.command?.join(" ") ?? null,
      image:
        record.serviceImages?.[service.name] ??
        serviceImage(
          plan,
          record.revision ?? "unbuilt",
          record.id,
          service.name,
        ),
      port: service.port,
      private: true,
      healthPath: service.healthPath,
      healthCommand: service.healthCommand,
      readiness: record.serviceReadiness?.[service.name],
      dependsOn: plan.dependencies
        ?.filter((d) => d.service === service.name)
        .map((d) => d.needs),
      consumes: null,
      state,
    })),
    ...(extra.processes ?? [])
      .filter(
        (process) =>
          process.name !== "app" &&
          !imageServices.some((service) => service.name === process.name),
      )
      .map((process) => ({
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
      ...(v.mounts.length > 1 || v.mounts.some((m) => m.readOnly)
        ? { mounts: v.mounts }
        : {}),
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
      .filter(
        (volume) =>
          volume.kind === "files" ||
          !stack.databases.some(
            (database) =>
              (database.kind === "postgres" &&
                volume.name === "database" &&
                volume.usedBy === "postgres") ||
              (database.kind === "sqlite" &&
                database.name === volume.usedBy &&
                (volume.mounts
                  ? volume.mounts.some((m) => m.sqlite === database.location)
                  : database.location.startsWith(
                      volume.mount.replace(/\/$/, "") + "/",
                    ))),
          ),
      )
      .map((volume) => ({
        key: `volume:${volume.name}`,
        label: `${volume.kind === "files" ? "Files" : "Data"} · ${volume.name}`,
        detail: `${volume.mount} · used by ${volume.usedBy}`,
        method:
          volume.kind === "files"
            ? "file archive"
            : "consistency procedure not yet supported",
      })),
  ];
}
