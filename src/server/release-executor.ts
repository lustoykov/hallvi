import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { z } from "zod";
import { deploymentSsh, deploymentLock, shellQuote } from "./deployment-ssh";
import { deploymentPath } from "./deployment-files";
import { writeTar } from "./tar";
import type { TreeFile } from "./execution-tree";
import type { DeploymentRecord } from "./deployment-types";
import type { DeploymentRelease } from "./deployment-release";
import { deniedPathReason, redactSecrets } from "./secrets";
import { invalidateDeploymentRuntime } from "./deployment-lifecycle";
import { establishedRuntime } from "./deployment-runtime";
import { deploymentEvent, saveDeployment } from "./deployment-store";
import { recordOperationRemoteEffect } from "./application-operations";
import { verifyRuntime } from "./deployment-executor";
import { composeProject, currentFacts, releaseFacts } from "./release-facts";
import {
  DATABASE_PASSWORD,
  executableCompose,
  PUBLIC_URL,
  runtimeArtifacts,
} from "./native-compose";

export class ReleaseExecutionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly phase: string,
    /** The exact runtime was observed before this failure. */
    readonly established = false,
  ) {
    super(message);
  }
}

/** Reuse existing private inputs without rotating credentials. */
export function releaseSecrets(record: DeploymentRecord) {
  const directory = deploymentPath(record.id);
  const password = readFileSync(join(directory, "database-password"), "utf8");
  let supplied: Record<string, string> = {};
  try {
    supplied = JSON.parse(readFileSync(join(directory, "inputs.json"), "utf8"));
  } catch {
    if (currentFacts(record)?.inputs.length)
      throw new Error("Restore the saved private inputs before releasing.");
  }
  const redact = (text: string) =>
    redactSecrets(
      [password, ...Object.values(supplied)]
        .filter(Boolean)
        .reduce((s, secret) => s.replaceAll(secret, "[REDACTED]"), text),
    ).text;
  return {
    password,
    supplied,
    redact,
    /** Values for a native release's ${NAME} references. */
    values: {
      ...supplied,
      [DATABASE_PASSWORD]: password,
      // Public and never redacted: the address the provider assigned.
      ...(record.address ? { [PUBLIC_URL]: `http://${record.address}` } : {}),
    },
  };
}
/** What the locked host script validates, builds, pulls and activates. */
export interface ReleaseExecution {
  /** Build-time project directory inside the stage; runtime uses the root. */
  projectDirectory: string | null;
  builds: string[];
  pulls: string[];
  /** Stage files the running containers mount, and their root paths. */
  activate: { from: string; to: string }[];
  retainedVolumes: string[];
  rollbackImages?: Record<string, string>;
}
/** The retained snapshot, its selected files and, to build, the source. */
export function nativeBundle(
  release: DeploymentRelease,
  source: TreeFile[],
  values: Record<string, string>,
  retainedVolumes: string[],
  newManagedDatabase: boolean,
  rollbackImages?: Record<string, string>,
) {
  const native = release.native!;
  const facts = releaseFacts(release);
  const builds = rollbackImages
    ? []
    : facts.services.filter((s) => s.build).map((s) => s.name);
  // An existing managed database keeps its image; a new one is pulled once.
  const pulls = facts.services.filter(
    (s) =>
      s.pinned || (newManagedDatabase && s.name === facts.database?.service),
  );
  const artifacts = native.files.map((file) => ({
    path: file.path,
    mode: file.mode,
    content: Buffer.from(file.content, "base64"),
  }));
  const selected = new Set(artifacts.map((file) => file.path));
  const tree = builds.length
    ? source.filter(
        (file) => !deniedPathReason(file.path) && !selected.has(file.path),
      )
    : [];
  const execution: ReleaseExecution = {
    projectDirectory: "bundle",
    builds,
    pulls: rollbackImages ? [] : pulls.map((s) => s.name),
    activate: runtimeArtifacts(native).map((path) => ({
      from: `bundle/${path}`,
      to: path,
    })),
    retainedVolumes,
    rollbackImages,
  };
  return {
    files: [
      ...[...tree, ...artifacts].map((file) => ({
        ...file,
        path: `bundle/${file.path}`,
      })),
      {
        path: "compose.json",
        content: Buffer.from(executableCompose(native, values, rollbackImages)),
        mode: 0o600,
      },
    ],
    execution,
  };
}

/** Compose owns config/build errors; one lock covers upload and replacement. */
export function releaseCommand(
  release: DeploymentRelease,
  id: string,
  attemptId: string,
  execution: ReleaseExecution,
) {
  const rollbackImages = execution.rollbackImages;
  for (const image of Object.values(rollbackImages ?? {}))
    z.string()
      .regex(/^sha256:[0-9a-f]{64}$/)
      .parse(image);
  z.string()
    .regex(/^[0-9a-f]{64}$/)
    .parse(release.id);
  z.string()
    .regex(/^[0-9a-f]{40}$/)
    .parse(release.revision);
  z.uuid().parse(id);
  z.uuid().parse(attemptId);
  const root = `/opt/server-guy/${id}`;
  const stage = `${root}/releases/${attemptId}`;
  const compose = `docker compose -p ${composeProject(id)} -f compose.json`;
  const staged = execution.projectDirectory
    ? `docker compose -p ${composeProject(id)} --project-directory ${shellQuote(execution.projectDirectory)} -f compose.json`
    : compose;
  const names = (values: string[]) => values.map(shellQuote).join(" ");
  const body = `umask 077
phase=upload
run_release() {
  mkdir -p ${stage} || return $?
  tar -xpf - -C ${stage} || return $?
  cd ${stage} || return $?
  phase=configuration
  ${staged} config --quiet || return $?
  ${execution.retainedVolumes.length ? `docker volume inspect ${names(execution.retainedVolumes)} >/dev/null || return $?` : ":"}
  phase=build
  ${execution.builds.length ? `${staged} build ${names(execution.builds)} || return $?` : ":"}
  ${execution.pulls.length ? `${staged} pull ${names(execution.pulls)} || return $?` : ":"}
  ${rollbackImages ? `docker image inspect ${names(Object.values(rollbackImages))} >/dev/null || return $?` : ":"}
  phase=activate
  cp compose.json ${root}/compose.json || return $?
  ${execution.activate.map(({ from, to }) => `mkdir -p ${shellQuote(`${root}/${posix.dirname(to)}`)} && cp -p ${shellQuote(from)} ${shellQuote(`${root}/${to}`)} || return $?`).join("\n  ") || ":"}
  cd ${root} || return $?
  phase=replace
  ${compose} up -d --no-build --pull never --remove-orphans --wait --wait-timeout 120 || return $?
}
run_release 2>&1
result=$?
printf '{"attemptId":"${attemptId}","releaseId":"${release.id}","revision":"${release.revision}","phase":"%s","exitCode":%s}\\n' "$phase" "$result" > ${stage}/result.tmp && mv ${stage}/result.tmp ${stage}/result.json || exit 1
printf '\\nSG_RELEASE_RESULT:%s:%s\\n' "$phase" "$result"
`;
  // Output is bounded by the SSH transport and redacted before reaching Pi.
  return deploymentLock(id, body);
}

export async function executeRelease(
  record: DeploymentRecord,
  release: DeploymentRelease,
  files: TreeFile[],
  signal: AbortSignal,
  rollbackImages?: Record<string, string>,
) {
  const attempt = record.lifecycle?.attempts.at(-1);
  if (
    (attempt?.kind !== "release" && attempt?.kind !== "deploy") ||
    attempt.outcome !== "working"
  )
    throw new Error("A recorded release attempt is required.");
  const secrets = releaseSecrets(record);
  // The data and database of the runtime this release replaces. A first
  // deployment replaces none: nothing is retained and its database is new.
  const lifecycle = record.lifecycle!;
  const priorRelease = lifecycle.releases.find(
    (r) => r.id === establishedRuntime(lifecycle.runtime)?.releaseId,
  );
  const prior = priorRelease ? releaseFacts(priorRelease) : null;
  const retainedVolumes = prior?.volumes.map((v) => v.dockerName) ?? [];
  const newManagedDatabase = Boolean(
    releaseFacts(release).database && !prior?.database,
  );
  const { files: bundle, execution } = nativeBundle(
    release,
    files,
    secrets.values,
    retainedVolumes,
    newManagedDatabase,
    rollbackImages,
  );
  const archive = writeTar(bundle, { mtime: Math.floor(Date.now() / 1000) });
  recordOperationRemoteEffect();
  invalidateDeploymentRuntime(record);
  record.native = release.native;
  record.revision = release.revision;
  record.releaseId = release.id;
  record.imageId = null;
  // Reuse the managed database image without an incidental pull or upgrade.
  const database = prior?.database?.service;
  record.serviceImages = rollbackImages
    ? structuredClone(rollbackImages)
    : database && record.serviceImages?.[database]
      ? { [database]: record.serviceImages[database] }
      : {};
  record.serviceReadiness = {};
  const hosted = new Map([
    ["compose.json", "compose.json"],
    ...execution.activate.map(({ from, to }) => [from, to] as const),
  ]);
  record.bundleHashes = Object.fromEntries(
    bundle
      .filter((f) => hosted.has(f.path))
      .map((f) => [
        hosted.get(f.path)!,
        createHash("sha256").update(f.content).digest("hex"),
      ]),
  );
  deploymentEvent(
    record,
    `Releasing revision ${release.revision.slice(0, 12)} on the existing host`,
  );
  let output: string;
  try {
    output = await deploymentSsh(
      record,
      releaseCommand(release, record.id, attempt.id, execution),
      { input: archive, signal, timeout: 20 * 60000 },
    );
  } catch {
    throw new ReleaseExecutionError(
      "The remote release outcome is unknown. Reconcile it before another execution; losing SSH does not prove the command stopped.",
      false,
      "transport",
    );
  }
  const safe = secrets.redact(output);
  record.logs = (record.logs + "\n" + safe).slice(-50000);
  const result =
    /\nSG_RELEASE_RESULT:(configuration|build|activate|replace|upload):(\d+)\s*$/.exec(
      output,
    );
  if (!result) {
    saveDeployment(record);
    throw new ReleaseExecutionError(
      "The host did not return a complete release result. Reconcile the remote outcome before retrying.",
      false,
      "transport",
    );
  }
  attempt.remoteResult = {
    phase: result[1],
    exitCode: Number(result[2]),
    at: new Date().toISOString(),
  };
  saveDeployment(record);
  if (attempt.remoteResult.exitCode !== 0)
    throw new ReleaseExecutionError(safe.slice(-10000), true, result[1]);
  return verifyRelease(record, release, signal);
}

/** Verify an existing replacement without building or restarting containers. */
export async function verifyRelease(
  record: DeploymentRecord,
  release: DeploymentRelease,
  signal: AbortSignal,
) {
  const secrets = releaseSecrets(record);
  let established = false;
  let behavior: "passed" | "unverified";
  try {
    behavior = await verifyRuntime(record, signal, () => {
      established = true;
    });
  } catch (error) {
    const detail = secrets.redact(
      error instanceof Error ? error.message : "Release verification failed.",
    );
    throw new ReleaseExecutionError(
      detail,
      !record.verificationPending && !record.cleanup,
      "verification",
      established,
    );
  }
  const revision = release.revision.slice(0, 12);
  record.imageId = record.serviceImages?.app ?? null;
  record.error = null;
  if (behavior === "unverified") {
    deploymentEvent(
      record,
      `Revision ${revision} runs the recorded images and passed readiness; no behavior criterion is recorded, so its behavior is unverified`,
    );
    return {
      behavior,
      evidence: `Released revision ${revision} on the existing host and observed its exact images and readiness; named data volumes were retained. Behavior is unverified: no behavior criterion is recorded.`,
    };
  }
  record.verifiedAt = new Date().toISOString();
  deploymentEvent(
    record,
    `Revision ${revision} passed image, readiness and application checks`,
  );
  return {
    behavior,
    evidence: `Verified revision ${revision} on the existing host; named data volumes were retained.`,
  };
}
