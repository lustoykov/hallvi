// Native Compose releases: Pi's selected files, resolved by the pinned Compose
// under the application's project, checked only for effects the executor
// cannot establish and for the records Server Guy owns. Compose owns syntax.
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { composeServiceSchema, imageReferenceSchema } from "./compose-plan";
import { pinContainerImage } from "./container-images";
import { composeDefinition } from "./deployment-compose";
import { sourceBuilds } from "./deployment-layout";
import type {
  Criterion,
  DeploymentRelease,
  NativeConfiguration,
  ResolvedCompose,
} from "./deployment-release";
import {
  checkIssues,
  httpPathSchema,
  primaryCheckSchema,
  type DeploymentRecord,
} from "./deployment-types";
import type { TreeFile } from "./execution-tree";
import { runComposeResolver } from "./pi-workspace";
import {
  composeProject,
  nativeFacts,
  primaryHttp,
  releaseFacts,
  type ReleaseFacts,
} from "./release-facts";
import { deniedPathReason, redactSecrets } from "./secrets";

/** Feedback Pi can act on within its task; never an authorization. */
export class NativeConfigurationError extends Error {}

/** The managed PostgreSQL password, available to Compose interpolation. */
export const DATABASE_PASSWORD = "SERVER_GUY_DATABASE_PASSWORD";
/** Controller-generated Compose file, retained with every native release. */
export const OVERRIDE_PATH = ".server-guy/override.compose.json";
export const SELECTION_LIMITS = { files: 64, bytes: 512 * 1024 };

export interface NativeSelection {
  /** Compose files in -f order. */
  compose: string[];
  /** Other selected files Compose or builds need. */
  files?: string[];
  /** Protection records for new named volumes. */
  data?: {
    volume: string;
    kind: "database" | "files";
    sqlite?: string | null;
    capture?: "quiesced-files";
  }[];
  /** JSON criterion in the current criterion's shape; omit to keep it. */
  criterion?: string;
  summary: string;
}

const criterionSchema = z
  .strictObject({
    healthPath: httpPathSchema,
    checks: z.array(primaryCheckSchema).min(1).max(8),
    services: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(63),
          port: z.number().int().min(1).max(65535),
          healthPath: httpPathSchema,
          checks: composeServiceSchema.shape.checks,
        }),
      )
      .max(8)
      .default([]),
  })
  .superRefine((criterion, ctx) => {
    for (const message of checkIssues(criterion.healthPath, criterion.checks))
      ctx.addIssue({ code: "custom", message });
  });

/** Selected paths are relative to the bundle root, never credential-bearing. */
export function selectedPaths(selection: NativeSelection) {
  const paths = [...selection.compose, ...(selection.files ?? [])].map(
    (raw) => {
      const path = raw.replace(/^\/workspace\//, "").replace(/^(\.\/)+/, "");
      if (
        path.length > 300 ||
        !/^[A-Za-z0-9_@+=,.-][A-Za-z0-9_@+=,./-]*$/.test(path) ||
        path.split("/").some((part) => !part || part === "." || part === "..")
      )
        throw new NativeConfigurationError(
          `${raw} is not a relative file path inside /workspace.`,
        );
      const denied = deniedPathReason(path);
      if (denied)
        throw new NativeConfigurationError(
          `${path} cannot be deployed: ${denied}. Reference recorded private inputs instead.`,
        );
      if (path === OVERRIDE_PATH)
        throw new NativeConfigurationError(`${path} is reserved.`);
      return path;
    },
  );
  if (!selection.compose.length || new Set(paths).size !== paths.length)
    throw new NativeConfigurationError(
      "Select at least one Compose file, and each file once.",
    );
  if (paths.length > SELECTION_LIMITS.files)
    throw new NativeConfigurationError(
      `Select at most ${SELECTION_LIMITS.files} files.`,
    );
  return paths;
}

const present = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  value !== false &&
  !(Array.isArray(value) && !value.length) &&
  !(
    typeof value === "object" &&
    !Array.isArray(value) &&
    !Object.keys(value).length
  );
const clean = (path: string) => path.replace(/^(\.\/)+/, "").replace(/\/$/, "");
const inside = (path: unknown) =>
  typeof path === "string" &&
  !path.startsWith("/") &&
  !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
  !path.includes("@") &&
  !path.split("/").includes("..");

/** Files the running containers mount: bind sources and file configs. */
function mountedFiles(resolved: ResolvedCompose, paths: string[]) {
  const sources = [
    ...Object.values(resolved.services).flatMap((service) =>
      (service.volumes ?? []).flatMap((mount) =>
        mount.type === "bind" && mount.source ? [mount.source] : [],
      ),
    ),
    ...(["configs", "secrets"] as const).flatMap((kind) =>
      Object.values(
        (resolved[kind] ?? {}) as Record<string, { file?: string }>,
      ).flatMap((item) => (item.file ? [item.file] : [])),
    ),
  ].map(clean);
  // The backup runner copies mounted files; directories are not supported.
  return paths.filter((path) => sources.includes(path));
}
export function runtimeArtifacts(native: NativeConfiguration) {
  return mountedFiles(
    native.resolved,
    native.files.map((file) => file.path),
  );
}

/**
 * Effects without an established execution boundary on the current host.
 * Reviewed against the pinned Compose 2.40.3 schema; revisit on upgrade.
 * Ordinary options pass through untouched.
 */
function capabilityGaps(
  resolved: ResolvedCompose,
  project: string,
  paths: string[],
) {
  const gaps: string[] = [];
  const unsupported = (where: string, what: string) =>
    gaps.push(`${where}: ${what} is not supported by the managed executor.`);
  const selected = (path: string) => paths.includes(clean(path));
  for (const [name, service] of Object.entries(resolved.services)) {
    const where = `Service ${name}`;
    if (!/^[a-z0-9][a-z0-9_.-]{0,62}$/.test(name))
      gaps.push(
        `${where}: use lowercase letters, digits, dots, hyphens or underscores.`,
      );
    for (const key of [
      "cap_add",
      "devices",
      "device_cgroup_rules",
      "gpus",
      "volumes_from",
      "external_links",
      "cgroup_parent",
      "runtime",
      "storage_opt",
      "credential_spec",
      "provider",
      "models",
      "use_api_socket",
      "profiles",
    ])
      if (present(service[key])) unsupported(where, key);
    if (service.privileged) unsupported(where, "privileged mode");
    for (const key of [
      "network_mode",
      "pid",
      "ipc",
      "uts",
      "userns_mode",
      "cgroup",
    ]) {
      const value = service[key];
      if (
        value === "host" ||
        (typeof value === "string" && value.startsWith("container:"))
      )
        unsupported(where, `${key} ${value}`);
    }
    for (const option of (service.security_opt as string[] | undefined) ?? [])
      if (/unconfined|disable|systempaths/i.test(option))
        unsupported(where, `security_opt ${option}`);
    const logging = (service.logging as { driver?: string } | undefined)
      ?.driver;
    if (logging && !["json-file", "local", "none"].includes(logging))
      unsupported(where, `logging driver ${logging}`);
    const deploy = service.deploy as
      | {
          replicas?: number;
          resources?: { reservations?: { devices?: unknown[] } };
        }
      | undefined;
    if ((deploy?.replicas ?? 1) !== 1 || ((service.scale as number) ?? 1) !== 1)
      unsupported(where, "a container count other than one");
    if (present(deploy?.resources?.reservations?.devices))
      unsupported(where, "device reservations");
    for (const hook of [
      ...((service.post_start as { privileged?: boolean }[]) ?? []),
      ...((service.pre_stop as { privileged?: boolean }[]) ?? []),
    ])
      if (hook.privileged) unsupported(where, "privileged lifecycle hooks");
    for (const mount of service.volumes ?? []) {
      if (mount.type === "volume" && !mount.source)
        gaps.push(
          `${where}: anonymous volume ${mount.target} has no identity; use a named volume.`,
        );
      else if (
        mount.type === "volume" &&
        (mount as { volume?: { subpath?: string } }).volume?.subpath
      )
        gaps.push(
          `${where}: a subpath of volume ${mount.source} changes which data the service sees; data preservation, SQLite and backup records identify whole volumes.`,
        );
      else if (
        mount.type === "bind" &&
        (!inside(mount.source) || !selected(mount.source!))
      )
        gaps.push(
          `${where}: bind mount ${mount.source} must be a file you selected inside the bundle.`,
        );
      else if (mount.type === "bind" && !mount.read_only)
        gaps.push(
          `${where}: bind mount ${mount.source} must be read-only; keep persistent data in a named volume.`,
        );
      else if (!["volume", "bind", "tmpfs"].includes(mount.type))
        unsupported(where, `${mount.type} mounts`);
    }
    const build = service.build as
      | {
          context?: string;
          dockerfile?: string;
          additional_contexts?: Record<string, string>;
          network?: string;
          [key: string]: unknown;
        }
      | undefined;
    if (build) {
      if (
        !inside(build.context ?? ".") ||
        (build.dockerfile && !inside(build.dockerfile))
      )
        unsupported(where, `build source ${build.context}`);
      for (const [key, value] of Object.entries(
        build.additional_contexts ?? {},
      ))
        if (!inside(value)) unsupported(where, `build context ${key}`);
      if (build.network === "host")
        unsupported(where, "host networking during builds");
      for (const key of ["ssh", "secrets", "privileged", "entitlements"])
        if (present(build[key])) unsupported(where, `build ${key}`);
    }
  }
  for (const [key, volume] of Object.entries(resolved.volumes ?? {})) {
    if (volume.external || volume.driver || volume.driver_opts)
      unsupported(`Volume ${key}`, "an external or driver-backed volume");
    else if (
      !/^[a-z][a-z0-9-]{0,39}$/.test(key) ||
      volume.name !== `${project}_${key}`
    )
      gaps.push(
        `Volume ${key}: use a lowercase name (letters, digits, hyphens) and its default project-scoped identity; data preservation and backups identify volumes by it.`,
      );
  }
  const networks = (resolved.networks ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  for (const [key, network] of Object.entries(networks))
    if (
      network.external ||
      (network.driver && network.driver !== "bridge") ||
      network.driver_opts
    )
      unsupported(`Network ${key}`, "an external or non-bridge network");
    else if (network.name !== `${project}_${key}`)
      gaps.push(
        `Network ${key}: keep its project-scoped name; joining a network named outside this application is not supported.`,
      );
  for (const kind of ["configs", "secrets"] as const)
    for (const [key, item] of Object.entries(
      (resolved[kind] ?? {}) as Record<string, Record<string, unknown>>,
    )) {
      if (item.external || item.environment)
        unsupported(
          `${kind} ${key}`,
          "external or environment-sourced content",
        );
      else if (
        item.file !== undefined &&
        (!inside(item.file) || !selected(item.file as string))
      )
        gaps.push(
          `${kind} ${key}: ${item.file} must be a file you selected inside the bundle.`,
        );
    }
  if (present(resolved.models)) unsupported("Configuration", "models");
  return gaps;
}

function referencePrivateValues(
  value: unknown,
  sentinels: Map<string, string>,
  referenced: Set<string>,
): unknown {
  if (typeof value === "string") {
    let text = value;
    for (const [sentinel, name] of sentinels)
      if (text.includes(sentinel)) {
        text = text.replaceAll(sentinel, `\${${name}}`);
        referenced.add(name);
      }
    return text;
  }
  if (Array.isArray(value))
    return value.map((item) =>
      referencePrivateValues(item, sentinels, referenced),
    );
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if ([...sentinels.keys()].some((sentinel) => key.includes(sentinel)))
          throw new NativeConfigurationError(
            "Private input values cannot be used as names.",
          );
        return [key, referencePrivateValues(item, sentinels, referenced)];
      }),
    );
  return value;
}

/**
 * Substitute recorded private values for ${NAME} references. Compose output
 * writes every literal dollar as $$, so a single-dollar reference is ours.
 */
export function materializePrivateValues(
  value: unknown,
  values: Record<string, string>,
): unknown {
  if (typeof value === "string")
    return value.replace(
      /\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match: string, name?: string) => {
        if (!name) return match;
        const secret = values[name];
        if (secret === undefined)
          throw new Error(
            `Private input ${name} is unavailable. Restore it before releasing.`,
          );
        return secret.replaceAll("$", () => "$$");
      },
    );
  if (Array.isArray(value))
    return value.map((item) => materializePrivateValues(item, values));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        materializePrivateValues(item, values),
      ]),
    );
  return value;
}

/** The protected host file: the retained snapshot with private values. */
export function executableCompose(
  native: NativeConfiguration,
  values: Record<string, string>,
  rollbackImages?: Record<string, string>,
) {
  const resolved = structuredClone(native.resolved);
  if (rollbackImages) {
    const names = Object.keys(resolved.services);
    if (
      names.length !== Object.keys(rollbackImages).length ||
      names.some((name) => !rollbackImages[name])
    )
      throw new Error("Rollback needs a verified image for every service.");
    for (const name of names) {
      resolved.services[name].image = rollbackImages[name];
      delete resolved.services[name].build;
    }
  }
  return JSON.stringify(materializePrivateValues(resolved, values));
}

async function resolve(
  files: TreeFile[],
  compose: string[],
  project: string,
  sentinels: Map<string, string>,
  signal: AbortSignal,
) {
  const result = await runComposeResolver(
    files,
    [
      "-p",
      project,
      "--project-directory",
      "/tmp/bundle",
      ...compose.flatMap((file) => ["-f", file]),
      "config",
      "--format",
      "json",
      "--no-path-resolution",
    ],
    Object.fromEntries(
      [...sentinels].map(([sentinel, name]) => [name, sentinel]),
    ),
    signal,
  );
  let diagnostics = result.stderr;
  for (const [sentinel, name] of sentinels)
    diagnostics = diagnostics.replaceAll(sentinel, `\${${name}}`);
  diagnostics = redactSecrets(diagnostics.trim()).text.slice(-4000);
  if (result.exitCode !== 0)
    throw new NativeConfigurationError(
      `Docker Compose rejected the configuration: ${diagnostics || `exit ${result.exitCode}`}`,
    );
  const unset = [
    ...new Set(
      [
        ...result.stderr.matchAll(
          /The \\?"([A-Za-z0-9_]+)\\?" variable is not set/g,
        ),
      ].map((match) => match[1]),
    ),
  ];
  if (unset.length)
    throw new NativeConfigurationError(
      `${unset.join(", ")}: not a recorded private input. Reference only ${[...sentinels.values()].join(", ") || "(none recorded)"} as \${NAME}. A new private value needs the owner's private configuration; it is unavailable in this release scope.`,
    );
  const newline = result.stdout.indexOf("\n");
  let resolved: ResolvedCompose;
  try {
    resolved = JSON.parse(result.stdout.slice(newline + 1));
  } catch {
    throw new Error("The pinned Compose resolver returned no configuration.");
  }
  if (!resolved?.services || !Object.keys(resolved.services).length)
    throw new NativeConfigurationError(
      "The configuration defines no services.",
    );
  return {
    version: `docker compose ${result.stdout.slice(0, newline).trim()}`,
    resolved,
  };
}

/** Controller facts expressed as native Compose: pins, image names, labels. */
async function controllerOverride(
  resolved: ResolvedCompose,
  deploymentId: string,
  revision: string,
  database: string | null,
  signal: AbortSignal,
) {
  const built = new Set(
    Object.values(resolved.services).flatMap((service) =>
      service.build && service.image ? [service.image] : [],
    ),
  );
  const services: Record<
    string,
    { labels?: Record<string, string>; image?: string }
  > = {};
  for (const [name, service] of Object.entries(resolved.services)) {
    const entry: { labels?: Record<string, string>; image?: string } = {};
    // The managed database keeps running across application releases.
    if (name !== database)
      entry.labels = {
        "server-guy.revision": revision,
        "server-guy.deployment": deploymentId,
      };
    if (service.build) {
      if (!service.image)
        entry.image = `server-guy-${deploymentId}-${name}:${revision}`;
    } else if (
      service.image &&
      name !== database &&
      !built.has(service.image)
    ) {
      if (!imageReferenceSchema.safeParse(service.image).success)
        throw new NativeConfigurationError(
          `Service ${name}: ${service.image} is not a public Docker Hub or GHCR reference with a tag; the controller pins public tags to digests.`,
        );
      if (!service.image.includes("@sha256:"))
        try {
          entry.image = await pinContainerImage(service.image, signal);
        } catch (error) {
          signal.throwIfAborted();
          throw new NativeConfigurationError(
            `Service ${name}: ${error instanceof Error ? error.message : "image unavailable"}`,
          );
        }
    }
    if (Object.keys(entry).length) services[name] = entry;
  }
  return { services };
}

function dataRecords(
  resolved: ResolvedCompose,
  declarations: NonNullable<NativeSelection["data"]>,
  baseline: ReleaseFacts,
): NativeConfiguration["data"] {
  const used = [
    ...new Set(
      Object.values(resolved.services).flatMap((service) =>
        (service.volumes ?? []).flatMap((mount) =>
          mount.type === "volume" && mount.source ? [mount.source] : [],
        ),
      ),
    ),
  ];
  const declared = new Map(declarations.map((item) => [item.volume, item]));
  for (const name of declared.keys())
    if (!used.includes(name))
      throw new NativeConfigurationError(
        `data names ${name}, which no service mounts.`,
      );
  return used.map((volume) => {
    const previous = baseline.volumes.find(
      (item) => item.dockerName === resolved.volumes?.[volume]?.name,
    );
    const declaration = declared.get(volume);
    const record = declaration
      ? {
          kind: declaration.kind,
          sqlite: declaration.sqlite ?? null,
          capture: declaration.capture,
        }
      : previous && {
          kind: previous.kind,
          sqlite: previous.sqlite,
          capture: previous.capture,
        };
    if (!record)
      throw new NativeConfigurationError(
        `Declare data for new volume ${volume}: kind "files" or "database", with its SQLite path relative to the volume root, or capture "quiesced-files" only when a clean shutdown leaves all state consistent in it.`,
      );
    if (
      record.sqlite !== null &&
      (!record.sqlite ||
        record.sqlite.startsWith("/") ||
        record.sqlite.split("/").includes(".."))
    )
      throw new NativeConfigurationError(
        `Volume ${volume}: sqlite is a file path relative to the volume root.`,
      );
    return {
      volume,
      kind: record.kind,
      sqlite: record.sqlite,
      ...(record.capture ? { capture: record.capture } : {}),
    };
  });
}

function criterionOf(
  json: string | undefined,
  inherited: Criterion | null,
  resolved: ResolvedCompose,
): Criterion | null {
  if (json === undefined) return inherited;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new NativeConfigurationError(
      "criterion must be JSON in the current criterion's shape.",
    );
  }
  const parsed = criterionSchema.safeParse(value);
  if (!parsed.success)
    throw new NativeConfigurationError(
      `Behavior criterion: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "criterion"}: ${issue.message}`).join("; ")}`,
    );
  for (const service of parsed.data.services)
    if (!resolved.services[service.name])
      throw new NativeConfigurationError(
        `Criterion service ${service.name} is not in the configuration.`,
      );
  if (redactSecrets(json).count)
    throw new NativeConfigurationError("Credentials cannot appear in checks.");
  return parsed.data;
}

const sha256 = (content: Buffer) =>
  createHash("sha256").update(content).digest("hex");

/**
 * Resolve Pi's exact selection into a native release configuration. Private
 * values never enter resolution: unguessable sentinels stand in for them and
 * become ${NAME} references in the retained snapshot.
 */
export async function prepareNativeRelease(input: {
  deploymentId: string;
  revision: string;
  selection: NativeSelection;
  artifacts: TreeFile[];
  repositoryFile: (path: string) => Promise<Buffer | null>;
  /** Recorded private input names that have saved values. */
  inputs: string[];
  baseline: ReleaseFacts;
  signal: AbortSignal;
}): Promise<NativeConfiguration> {
  const { selection, artifacts, baseline, signal } = input;
  const summary = selection.summary.trim();
  if (
    summary.length < 20 ||
    summary.length > 1500 ||
    redactSecrets(summary).count
  )
    throw new NativeConfigurationError(
      "Summarize the release in 20 to 1,500 characters without credentials.",
    );
  for (const file of artifacts) {
    const original = await input.repositoryFile(file.path);
    if (original && !original.equals(file.content))
      throw new NativeConfigurationError(
        `${file.path} differs from the repository at ${input.revision.slice(0, 12)}. Workspace edits to repository files are not deployed: author packaging as a new file, or change application source through an owner-merged revision.`,
      );
    if (redactSecrets(file.content.toString("utf8")).count)
      throw new NativeConfigurationError(
        `${file.path} contains credential-shaped text. Reference recorded private inputs as \${NAME} instead.`,
      );
  }
  const project = composeProject(input.deploymentId);
  const nonce = randomBytes(8).toString("hex");
  const names = [
    ...input.inputs.filter((name) => !/^(COMPOSE|DOCKER)_/.test(name)),
    ...(baseline.database ? [DATABASE_PASSWORD] : []),
  ];
  const sentinels = new Map(
    names.map((name, index) => [`sgp${nonce}i${index}e`, name]),
  );
  const first = await resolve(
    artifacts,
    selection.compose,
    project,
    sentinels,
    signal,
  );
  const paths = artifacts.map((file) => file.path);
  const gaps = capabilityGaps(first.resolved, project, paths);
  const reserved = mountedFiles(first.resolved, paths).filter(
    (path) => path === "compose.json" || path.startsWith("releases/"),
  );
  if (reserved.length)
    gaps.push(
      `${reserved.join(", ")}: this host path is reserved; mount the file from another path.`,
    );
  if (gaps.length) throw new NativeConfigurationError(gaps.join("\n"));
  const override = {
    path: OVERRIDE_PATH,
    mode: 0o644,
    content: Buffer.from(
      JSON.stringify(
        await controllerOverride(
          first.resolved,
          input.deploymentId,
          input.revision,
          baseline.database?.service ?? null,
          signal,
        ),
        null,
        2,
      ),
    ),
  };
  const final = await resolve(
    [...artifacts, override],
    [...selection.compose, OVERRIDE_PATH],
    project,
    sentinels,
    signal,
  );
  const referenced = new Set<string>();
  const resolved = referencePrivateValues(
    final.resolved,
    sentinels,
    referenced,
  ) as ResolvedCompose;
  const text = JSON.stringify(resolved);
  if (text.includes(`sgp${nonce}`))
    throw new NativeConfigurationError(
      "Use private inputs only as whole ${NAME} values.",
    );
  if (text.length > SELECTION_LIMITS.bytes)
    throw new NativeConfigurationError(
      "The resolved configuration exceeds the supported size.",
    );
  const native: NativeConfiguration = {
    format: 1,
    resolver: final.version,
    compose: [...selection.compose, OVERRIDE_PATH],
    files: [...artifacts, override].map((file) => ({
      path: file.path,
      mode: file.mode & 0o111 ? 0o755 : 0o644,
      sha256: sha256(file.content),
      content: file.content.toString("base64"),
    })),
    resolved,
    inputs: [...referenced].filter((name) => name !== DATABASE_PASSWORD).sort(),
    data: dataRecords(resolved, selection.data ?? [], baseline),
    database: baseline.database
      ? {
          service: baseline.database.service,
          version: baseline.database.version as "16" | "17" | "18",
        }
      : null,
    httpAccess: baseline.httpAccess,
    criterion: criterionOf(selection.criterion, baseline.criterion, resolved),
    summary,
  };
  if (native.criterion && !primaryHttp(nativeFacts(native)))
    throw new NativeConfigurationError(
      "The behavior checks use the primary HTTP listener, but no service publishes it.",
    );
  return native;
}

/**
 * The running release as Pi's starting point: its configuration with private
 * values as ${NAME}, the files it mounted or built, and the records Compose
 * cannot express. Evidence of what runs now, not instructions.
 */
export function currentConfigurationFiles(
  record: Pick<DeploymentRecord, "id">,
  release: DeploymentRelease,
): TreeFile[] {
  const root = ".server-guy/current";
  const facts = releaseFacts(release, record.id);
  const files: TreeFile[] = [];
  let compose: unknown;
  if (release.native) {
    compose = release.native.resolved;
    for (const file of release.native.files)
      files.push({
        path: `${root}/files/${file.path}`,
        mode: file.mode,
        content: Buffer.from(file.content, "base64"),
      });
  } else {
    const plan = release.plan;
    const nonce = randomBytes(8).toString("hex");
    const names = [
      ...plan.missingInputs.map((input) => input.name),
      DATABASE_PASSWORD,
    ];
    const sentinels = new Map(
      names.map((name, i) => [`sgp${nonce}i${i}e`, name]),
    );
    const value = (name: string) => `sgp${nonce}i${names.indexOf(name)}e`;
    compose = referencePrivateValues(
      composeDefinition(
        plan,
        release.revision,
        record.id,
        value(DATABASE_PASSWORD),
        Object.fromEntries(
          plan.missingInputs.map((input) => [input.name, value(input.name)]),
        ),
      ),
      sentinels,
      new Set(),
    );
    for (const service of [
      { name: "app", configs: plan.configs ?? [] },
      ...(plan.services ?? []),
    ])
      for (const config of service.configs)
        files.push({
          path: `${root}/files/configs/${service.name}-${config.name}`,
          mode: 0o644,
          content: Buffer.from(config.content),
        });
    for (const build of sourceBuilds(plan))
      if (build.generatedDockerfile)
        files.push({
          path: `${root}/files/${build.dockerfile}`,
          mode: 0o644,
          content: Buffer.from(build.generatedDockerfile),
        });
  }
  const records = {
    release: release.id,
    revision: release.revision,
    format: release.native
      ? `native Compose, resolved by ${release.native.resolver}`
      : "legacy plan rendered by the compatibility renderer: build contexts under ./source/ and ./configs/ are host paths; yours are relative to the repository root in /workspace",
    httpAccess: facts.httpAccess,
    exposure: facts.exposure,
    volumes: facts.volumes.map(({ name, kind, sqlite, capture, mounts }) => ({
      name,
      kind,
      sqlite,
      ...(capture ? { capture } : {}),
      mounts: mounts.map(({ service, target, readOnly }) => ({
        service,
        target,
        readOnly,
      })),
    })),
    managedDatabase: facts.database && {
      ...facts.database,
      user: "serverguy",
      database: "application",
      passwordVariable: DATABASE_PASSWORD,
    },
    privateInputs: facts.inputs,
    criterion: facts.criterion,
    summary: facts.summary,
  };
  return [
    {
      path: `${root}/compose.json`,
      mode: 0o644,
      content: Buffer.from(JSON.stringify(compose, null, 2)),
    },
    {
      path: `${root}/release.json`,
      mode: 0o644,
      content: Buffer.from(JSON.stringify(records, null, 2)),
    },
    ...files,
  ];
}
