// Facts current consumers need, derived from a release's retained native
// configuration: its resolved snapshot and the records Compose cannot express.
// Browser-safe. A projection, never a second authoring format; runtime
// observations stay on the deployment record.
import type { DeploymentRecord } from "./deployment-types";
import type {
  Criterion,
  DeploymentRelease,
  NativeConfiguration,
  StateProcedure,
} from "./deployment-release";

export interface ServiceFacts {
  name: string;
  /** The resolved image reference: a pinned digest, a tag or a built name. */
  image: string | null;
  /** Registry reference the runtime must match; builds are observed instead. */
  pinned: string | null;
  build: boolean;
  /** The service whose built image this service also runs. */
  sharesImageWith: string | null;
  command: string | null;
  healthcheck: boolean;
  dependsOn: string[];
  /**
   * Runs to completion instead of serving: another service waits for it
   * with Compose's service_completed_successfully condition.
   */
  completes?: true;
  /** Carries the controller's revision label. */
  labeled: boolean;
}
export interface VolumeFacts {
  name: string;
  dockerName: string;
  kind: "files" | "database";
  capture?: "quiesced-files" | "dump";
  /** The service that owns this state; it keeps its image across releases. */
  owner?: string;
  procedure?: StateProcedure;
  /**
   * Services that change this data without mounting it, such as database
   * clients over the network; they pause while it is captured. Declared by
   * Pi: absent means unknown, an empty list means none but the owner.
   */
  writers?: string[];
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

/**
 * The default procedure for the managed PostgreSQL service when a release
 * declares its volume without one: a custom-format dump of the configured
 * database, a restore from standard input into a fresh instance, and a
 * fingerprint of every user table (row count and a hash of its rows) that
 * must match between the source and the restored copy. Pi may declare its
 * own procedure instead; nothing else about the slot is special to backups.
 */
export const managedDatabaseProcedure: StateProcedure = {
  dump: [
    "sh",
    "-c",
    'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-acl',
  ],
  restore: [
    "sh",
    "-c",
    'exec pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --no-acl --exit-on-error',
  ],
  verify: [
    "sh",
    "-c",
    "exec psql -X -A -t -v ON_ERROR_STOP=1 --username=\"$POSTGRES_USER\" --dbname=\"$POSTGRES_DB\" -c \"SELECT schemaname || '.' || tablename || '|' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename), false, true, '')))[1]::text || '|' || coalesce((xpath('/row/d/text()', query_to_xml(format('SELECT md5(string_agg(md5(t::text), %L ORDER BY md5(t::text))) AS d FROM %I.%I t', '', schemaname, tablename), false, true, '')))[1]::text, '') FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1\"",
  ],
};

export function nativeFacts(native: NativeConfiguration): ReleaseFacts {
  const { resolved } = native;
  const records = new Map(native.data.map((record) => [record.volume, record]));
  const database = native.database;
  // Older releases recorded the managed database's volume without a capture,
  // when the controller dumped it itself. They are read with the default
  // procedure, so one mechanism serves every database.
  const managed = database ? resolved.services[database.service] : undefined;
  for (const mount of managed?.volumes ?? [])
    if (mount.type === "volume" && mount.source && !mount.read_only) {
      const declared = records.get(mount.source);
      if (
        declared?.kind === "database" &&
        !declared.capture &&
        !declared.sqlite
      )
        records.set(mount.source, {
          ...declared,
          capture: "dump",
          owner: database!.service,
          procedure: managedDatabaseProcedure,
        });
    }
  // Services configured with one image must run one image: its builder, or
  // else the first service naming it.
  const owner = new Map<string, string>();
  for (const [name, service] of Object.entries(resolved.services))
    if (service.build && service.image) owner.set(service.image, name);
  for (const [name, service] of Object.entries(resolved.services))
    if (service.image && !owner.has(service.image))
      owner.set(service.image, name);
  const completing = new Set(
    Object.values(resolved.services).flatMap((service) =>
      Object.entries(service.depends_on ?? {}).flatMap(([name, dependency]) =>
        (dependency as { condition?: string } | null)?.condition ===
        "service_completed_successfully"
          ? [name]
          : [],
      ),
    ),
  );
  const volumes = new Map<string, VolumeFacts>();
  const services = Object.entries(resolved.services).map(([name, service]) => {
    for (const mount of service.volumes ?? []) {
      if (mount.type !== "volume" || !mount.source) continue;
      const record = records.get(mount.source);
      const volume = volumes.get(mount.source) ?? {
        name: mount.source,
        dockerName:
          resolved.volumes?.[mount.source]?.name ??
          `${resolved.name}_${mount.source}`,
        kind: record?.kind ?? "files",
        ...(record?.capture ? { capture: record.capture } : {}),
        ...(record?.owner ? { owner: record.owner } : {}),
        ...(record?.procedure ? { procedure: record.procedure } : {}),
        ...(record?.writers ? { writers: record.writers } : {}),
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
      image: service.image ?? null,
      pinned:
        !service.build && /@sha256:[0-9a-f]{64}$/.test(service.image ?? "")
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
      ...(completing.has(name) ? { completes: true as const } : {}),
      // State owners run unlabeled, so a revision never recreates them.
      labeled: Boolean(service.labels?.["server-guy.revision"]),
    };
  });
  const databaseService = database
    ? resolved.services[database.service]
    : undefined;
  return {
    services,
    volumes: [...volumes.values()],
    exposure: Object.entries(resolved.services).flatMap(([name, service]) =>
      (service.ports ?? []).map((port) => ({
        service: name,
        published: String(port.published ?? ""),
        target: Number(port.target),
        protocol: port.protocol ?? "tcp",
        hostIp: port.host_ip ?? "",
      })),
    ),
    httpAccess: native.httpAccess,
    database: database
      ? {
          ...database,
          image: databaseService?.image ?? null,
          volume:
            databaseService?.volumes?.find((m) => m.type === "volume")
              ?.source ?? null,
        }
      : null,
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
  };
}

export function releaseFacts(release: DeploymentRelease): ReleaseFacts {
  return nativeFacts(release.native);
}

/** Facts of the configuration currently selected on the record. */
export function currentFacts(
  record: Pick<DeploymentRecord, "native"> | null,
): ReleaseFacts | null {
  return record?.native ? nativeFacts(record.native) : null;
}

/**
 * Services whose database state outlives application releases: every
 * declared owner of a database volume, the managed PostgreSQL included,
 * whose on-disk format belongs to its version. They keep their image unless
 * the owner approves a change, and releases leave them unlabeled so a label
 * never recreates them. An owner of files is recorded but upgrades freely.
 */
export function stateOwners(facts: Pick<ReleaseFacts, "volumes">) {
  return new Set(
    facts.volumes.flatMap((volume) =>
      volume.owner && volume.kind === "database" ? [volume.owner] : [],
    ),
  );
}

/** Every service that owns a declared volume, files included: the service
 * whose decision a change of that volume's declaration or mount needs. */
export function declaredOwners(facts: Pick<ReleaseFacts, "volumes">) {
  return new Set(
    facts.volumes.flatMap((volume) => (volume.owner ? [volume.owner] : [])),
  );
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
