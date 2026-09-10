// Facts current consumers need, derived from a release's retained
// configuration: a legacy plan through its compatibility renderer, or a native
// release's resolved snapshot. Browser-safe. A projection, never a second
// authoring format; runtime observations stay on the deployment record.
import { composeDefinition } from "./deployment-compose";
import type { DeploymentPlan, DeploymentRecord } from "./deployment-types";
import type {
  Criterion,
  DeploymentRelease,
  NativeConfiguration,
  ResolvedService,
} from "./deployment-release";

export interface ServiceFacts {
  name: string;
  /** Registry reference the runtime must match; builds are observed instead. */
  pinned: string | null;
  build: boolean;
  /** The service whose built image this service also runs. */
  sharesImageWith: string | null;
  command: string | null;
  healthcheck: boolean;
  dependsOn: string[];
  /** Carries the controller's revision label. */
  labeled: boolean;
}
export interface VolumeFacts {
  name: string;
  dockerName: string;
  kind: "files" | "database";
  capture?: "quiesced-files";
  /** SQLite file relative to the volume root. */
  sqlite: string | null;
  mounts: {
    service: string;
    target: string;
    readOnly: boolean;
    sqlite: string | null;
  }[];
}
export interface Exposure {
  service: string;
  published: string;
  target: number;
  protocol: string;
  hostIp: string;
}
export interface ReleaseFacts {
  services: ServiceFacts[];
  volumes: VolumeFacts[];
  exposure: Exposure[];
  /** Enforced by the provider firewall, outside Compose. */
  httpAccess: "public" | "controller";
  database: {
    service: string;
    version: string;
    image: string | null;
    volume: string | null;
  } | null;
  inputs: string[];
  variables: string[];
  criterion: Criterion | null;
  summary: string;
}

export const composeProject = (deploymentId: string) =>
  `sg-${deploymentId.slice(0, 8)}`;

type DataRecord = {
  kind: "database" | "files";
  sqlite: string | null;
  capture?: "quiesced-files";
};
function composeFacts(input: {
  project: string;
  services: Record<string, ResolvedService>;
  volumeNames: Record<string, string>;
  records: Map<string, DataRecord>;
  database: { service: string; version: string } | null;
  labeled: (service: string) => boolean;
  httpAccess: "public" | "controller";
  inputs: string[];
  variables: string[];
  criterion: Criterion | null;
  summary: string;
}): ReleaseFacts {
  // Services configured with one image must run one image: its builder, or
  // else the first service naming it.
  const owner = new Map<string, string>();
  for (const [name, service] of Object.entries(input.services))
    if (service.build && service.image) owner.set(service.image, name);
  for (const [name, service] of Object.entries(input.services))
    if (service.image && !owner.has(service.image))
      owner.set(service.image, name);
  const volumes = new Map<string, VolumeFacts>();
  const services = Object.entries(input.services).map(([name, service]) => {
    for (const mount of service.volumes ?? []) {
      if (mount.type !== "volume" || !mount.source) continue;
      const record = input.records.get(mount.source);
      const volume = volumes.get(mount.source) ?? {
        name: mount.source,
        dockerName:
          input.volumeNames[mount.source] ?? `${input.project}_${mount.source}`,
        kind: record?.kind ?? "files",
        ...(record?.capture ? { capture: record.capture } : {}),
        sqlite: record?.sqlite ?? null,
        mounts: [],
      };
      volume.mounts.push({
        service: name,
        target: mount.target,
        readOnly: Boolean(mount.read_only),
        sqlite: volume.sqlite
          ? `${mount.target.replace(/\/$/, "")}/${volume.sqlite}`
          : null,
      });
      volumes.set(mount.source, volume);
    }
    const health = service.healthcheck;
    return {
      name,
      pinned:
        !service.build &&
        name !== input.database?.service &&
        /@sha256:[0-9a-f]{64}$/.test(service.image ?? "")
          ? service.image!
          : null,
      build: Boolean(service.build),
      sharesImageWith:
        service.image && owner.get(service.image) !== name
          ? owner.get(service.image)!
          : null,
      command: Array.isArray(service.command)
        ? service.command.join(" ")
        : null,
      healthcheck: Boolean(
        health?.test?.length && !health.disable && health.test[0] !== "NONE",
      ),
      dependsOn: Object.keys(service.depends_on ?? {}),
      labeled: input.labeled(name),
    };
  });
  const database = input.database
    ? input.services[input.database.service]
    : undefined;
  return {
    services,
    volumes: [...volumes.values()],
    exposure: Object.entries(input.services).flatMap(([name, service]) =>
      (service.ports ?? []).map((port) => ({
        service: name,
        published: String(port.published ?? ""),
        target: Number(port.target),
        protocol: port.protocol ?? "tcp",
        hostIp: port.host_ip ?? "",
      })),
    ),
    httpAccess: input.httpAccess,
    database: input.database
      ? {
          ...input.database,
          image: database?.image ?? null,
          volume:
            database?.volumes?.find((m) => m.type === "volume")?.source ?? null,
        }
      : null,
    inputs: input.inputs,
    variables: input.variables,
    criterion: input.criterion,
    summary: input.summary,
  };
}

// The legacy renderer emits Compose short syntax; read it as Compose would.
function legacyPort(value: string) {
  const [spec, protocol = "tcp"] = value.split("/");
  const parts = spec.split(":");
  return {
    target: Number(parts.at(-1)),
    published: parts.length > 1 ? parts.at(-2)! : "",
    protocol,
    ...(parts.length > 2 && parts[0] ? { host_ip: parts[0] } : {}),
  };
}
function legacyMount(value: string) {
  const [source, target, mode] = value.split(":");
  return {
    type: /^[./]/.test(source) ? "bind" : "volume",
    source,
    target,
    ...(mode === "ro" ? { read_only: true } : {}),
  };
}

const placeholder = "server-guy-placeholder";
/** Legacy plans: facts about exactly what the compatibility renderer runs. */
export function planFacts(
  plan: DeploymentPlan,
  deploymentId: string,
  revision: string,
): ReleaseFacts {
  const inputs = plan.missingInputs.map((input) => input.name);
  const rendered = composeDefinition(
    plan,
    revision,
    deploymentId,
    placeholder,
    Object.fromEntries(inputs.map((name) => [name, placeholder])),
  ).services as Record<string, ResolvedService & { ports?: unknown }>;
  const services = Object.fromEntries(
    Object.entries(rendered).map(([name, service]) => [
      name,
      {
        ...service,
        ports: ((service.ports as string[] | undefined) ?? []).map(legacyPort),
        volumes: (
          (service.volumes as unknown as string[] | undefined) ?? []
        ).map(legacyMount),
      },
    ]),
  );
  const records = new Map<string, DataRecord>(
    plan.postgres ? [["database", { kind: "database", sqlite: null }]] : [],
  );
  for (const service of [
    { volumes: plan.volumes ?? [] },
    ...(plan.services ?? []),
  ])
    for (const volume of service.volumes)
      if (!records.has(volume.name))
        records.set(volume.name, {
          kind: volume.kind,
          sqlite: volume.sqlite
            ? volume.sqlite.slice(volume.target.replace(/\/$/, "").length + 1)
            : null,
          ...(volume.capture ? { capture: volume.capture } : {}),
        });
  return composeFacts({
    project: composeProject(deploymentId),
    services,
    volumeNames: {},
    records,
    database: plan.postgres
      ? { service: "postgres", version: plan.postgres.version }
      : null,
    // Legacy verification attributes only the web container by label.
    labeled: (name) => name === "app",
    httpAccess: plan.httpAccess ?? "public",
    inputs,
    variables: [
      ...new Set([
        ...plan.environment.map((item) => item.name),
        ...inputs,
        ...(plan.inputBindings ?? []).map((item) => item.variable),
        ...(plan.postgres?.variable ? [plan.postgres.variable] : []),
      ]),
    ],
    criterion: {
      healthPath: plan.healthPath,
      checks: plan.checks,
      services: (plan.services ?? []).flatMap((service) =>
        service.port && service.healthPath
          ? [
              {
                name: service.name,
                port: service.port,
                healthPath: service.healthPath,
                checks: service.checks,
              },
            ]
          : [],
      ),
    },
    summary: plan.summary,
  });
}

export function nativeFacts(native: NativeConfiguration): ReleaseFacts {
  const { resolved } = native;
  return composeFacts({
    project: resolved.name,
    services: resolved.services,
    volumeNames: Object.fromEntries(
      Object.entries(resolved.volumes ?? {}).flatMap(([key, volume]) =>
        volume.name ? [[key, volume.name]] : [],
      ),
    ),
    records: new Map(native.data.map((record) => [record.volume, record])),
    database: native.database,
    labeled: (name) => name !== native.database?.service,
    httpAccess: native.httpAccess,
    inputs: native.inputs,
    variables: [
      ...new Set(
        Object.values(resolved.services).flatMap((service) =>
          Object.keys(service.environment ?? {}),
        ),
      ),
    ].sort(),
    criterion: native.criterion,
    summary: native.summary,
  });
}

export function releaseFacts(
  release: DeploymentRelease,
  deploymentId: string,
): ReleaseFacts {
  return release.native
    ? nativeFacts(release.native)
    : planFacts(release.plan, deploymentId, release.revision);
}

/** Facts of the configuration currently selected on the record. */
export function currentFacts(
  record: Pick<DeploymentRecord, "id" | "plan" | "native" | "revision"> | null,
): ReleaseFacts | null {
  if (record?.native) return nativeFacts(record.native);
  return record?.plan
    ? planFacts(record.plan, record.id, record.revision ?? "unselected")
    : null;
}

/** The host port 80 listener, when the release serves primary HTTP. */
export function primaryHttp(facts: ReleaseFacts | null) {
  return (
    facts?.exposure.find(
      (item) =>
        item.protocol === "tcp" &&
        (item.published === "80" || item.published === ""),
    ) ?? null
  );
}
