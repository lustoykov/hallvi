import type {
  Criterion,
  NativeConfiguration,
  ResolvedService,
} from "../../src/server/deployment-release";
import { releaseOf } from "../../src/server/deployment-release";
import type { DeploymentRecord } from "../../src/server/deployment-types";

type Volume = {
  name: string;
  target: string;
  kind: "files" | "database";
  sqlite?: string;
  readOnly?: boolean;
};
/** A compact description of a resolved native release, for tests. */
export interface NativeShape {
  deploymentId?: string;
  revision?: string;
  /** A published application image; absent builds the root Dockerfile. */
  image?: string;
  port: number;
  command?: string[] | null;
  environment?: Record<string, string>;
  postgres?: "16" | "17" | "18" | null;
  inputs?: { name: string; reason: string }[];
  volumes?: Volume[];
  services?: {
    name: string;
    image?: string;
    /** Runs the application's image, like a worker built from it. */
    sharesAppImage?: boolean;
    command?: string[] | null;
    volumes?: Volume[];
    healthcheck?: string[];
    /** A private HTTP check on this container port. */
    port?: number;
    healthPath?: string;
  }[];
  healthPath?: string;
  checks: Criterion["checks"];
  httpAccess?: "public" | "controller";
  summary?: string;
}

export function nativeApp(shape: NativeShape): NativeConfiguration {
  const id = shape.deploymentId ?? "00000000-0000-4000-8000-000000000001";
  const revision = shape.revision ?? "a".repeat(40);
  const project = `sg-${id.slice(0, 8)}`;
  const built = `server-guy-${id}-app:${revision}`;
  const labels = {
    "server-guy.revision": revision,
    "server-guy.deployment": id,
  };
  const mounts = (volumes: Volume[] = []) =>
    volumes.map((volume) => ({
      type: "volume",
      source: volume.name,
      target: volume.target,
      ...(volume.readOnly ? { read_only: true } : {}),
    }));
  const services: Record<string, ResolvedService> = {
    app: {
      image: shape.image ?? built,
      ...(shape.image
        ? {}
        : { build: { context: ".", dockerfile: "Dockerfile" } }),
      command: shape.command ?? null,
      ports: [{ target: shape.port, published: "80", protocol: "tcp" }],
      environment: {
        ...shape.environment,
        ...Object.fromEntries(
          (shape.inputs ?? []).map((input) => [
            input.name,
            `\${${input.name}}`,
          ]),
        ),
      },
      labels,
      volumes: mounts(shape.volumes),
      ...(shape.postgres
        ? { depends_on: { postgres: { condition: "service_healthy" } } }
        : {}),
    },
  };
  if (shape.postgres)
    services.postgres = {
      image: `postgres:${shape.postgres}`,
      environment: {
        POSTGRES_USER: "serverguy",
        POSTGRES_DB: "application",
        POSTGRES_PASSWORD: "${SERVER_GUY_DATABASE_PASSWORD}",
      },
      volumes: [
        {
          type: "volume",
          source: "database",
          target: "/var/lib/postgresql/data",
        },
      ],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U serverguy -d application"],
      },
    };
  for (const service of shape.services ?? [])
    services[service.name] = {
      image: service.sharesAppImage
        ? (services.app.image as string)
        : (service.image ?? `example/${service.name}:1`),
      command: service.command ?? null,
      labels,
      volumes: mounts(service.volumes),
      ...(service.healthcheck
        ? { healthcheck: { test: ["CMD", ...service.healthcheck] } }
        : {}),
    };
  const volumes = [
    ...(shape.postgres ? ["database"] : []),
    ...[
      ...(shape.volumes ?? []),
      ...(shape.services ?? []).flatMap((service) => service.volumes ?? []),
    ].map((volume) => volume.name),
  ];
  const records = new Map<string, NativeConfiguration["data"][number]>();
  if (shape.postgres)
    records.set("database", {
      volume: "database",
      kind: "database",
      sqlite: null,
    });
  for (const volume of [
    ...(shape.volumes ?? []),
    ...(shape.services ?? []).flatMap((service) => service.volumes ?? []),
  ])
    if (!records.has(volume.name))
      records.set(volume.name, {
        volume: volume.name,
        kind: volume.kind,
        sqlite: volume.sqlite ?? null,
      });
  return {
    format: 1,
    resolver: "docker compose 2.40.3",
    compose: ["compose.yaml", ".server-guy/override.compose.json"],
    files: [],
    resolved: {
      name: project,
      services,
      volumes: Object.fromEntries(
        [...new Set(volumes)].map((name) => [
          name,
          { name: `${project}_${name}` },
        ]),
      ),
    },
    inputs: (shape.inputs ?? []).map((input) => input.name).sort(),
    ...(shape.inputs?.length
      ? {
          inputReasons: Object.fromEntries(
            shape.inputs.map((input) => [input.name, input.reason]),
          ),
        }
      : {}),
    data: [...records.values()],
    database: shape.postgres
      ? { service: "postgres", version: shape.postgres }
      : null,
    httpAccess: shape.httpAccess ?? "public",
    criterion: {
      healthPath: shape.healthPath ?? "/health",
      checks: shape.checks,
      services: (shape.services ?? []).flatMap((service) =>
        service.port && service.healthPath
          ? [
              {
                name: service.name,
                port: service.port,
                healthPath: service.healthPath,
                checks: [],
              },
            ]
          : [],
      ),
    },
    summary: shape.summary ?? "A synthetic application for this test.",
  };
}

/** Record the selected release as a verified first deployment. */
export function verifiedLifecycle(record: DeploymentRecord) {
  const release = releaseOf(record)!;
  const hostId = `host:${record.id}`;
  const at = record.verifiedAt ?? "2026-09-10T08:00:00Z";
  record.lifecycle = {
    host: {
      id: hostId,
      provider: "hetzner",
      connectionId: record.authority?.connectionId ?? null,
      serverId: record.serverId,
      address: record.address,
    },
    releases: [release],
    attempts: [
      {
        id: `attempt:${record.id}`,
        operationId: `deployment:${record.id}`,
        releaseId: release.id,
        hostId,
        kind: "deploy",
        startedAt: record.createdAt ?? at,
        finishedAt: at,
        outcome: "verified",
        remoteStartedAt: record.createdAt ?? at,
        error: null,
        eventOffset: 0,
      },
    ],
    runtime: {
      state: "verified",
      lastVerified: {
        attemptId: `attempt:${record.id}`,
        releaseId: release.id,
        hostId,
        revision: release.revision,
        checkedAt: at,
        images: structuredClone(
          record.serviceImages ??
            (record.imageId ? { app: record.imageId } : {}),
        ),
      },
    },
  };
  return record;
}
