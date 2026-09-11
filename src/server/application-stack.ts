// The application's stack as recorded: what runs on the one instance, what
// stores state, and what protects it. Derived from the deployment record so
// the views, Overview, navigation and the architecture canvas agree.
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
  /** False until a deployment configuration records what it needs. */
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
  return record?.native ? nativeStack(record) : emptyStack;
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
