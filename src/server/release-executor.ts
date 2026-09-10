import { sourceBuilds } from "./deployment-layout";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { deploymentSsh, deploymentLock, shellQuote } from "./deployment-ssh";
import { deploymentPath } from "./deployment-files";
import { composeDefinition } from "./deployment-compose";
import { writeTar } from "./tar";
import type { TreeFile } from "./execution-tree";
import type { DeploymentRecord, DeploymentPlan } from "./deployment-types";
import type { DeploymentRelease } from "./deployment-release";
import { deniedPathReason, redactSecrets } from "./secrets";
import { invalidateDeploymentRuntime } from "./deployment-lifecycle";
import { deploymentEvent, saveDeployment } from "./deployment-store";
import { recordOperationRemoteEffect } from "./application-operations";
import {
  verifyServiceImages,
  verifyDeployment,
  verifyPrivateServices,
  collectDeploymentLogs,
} from "./deployment-executor";

export class ReleaseExecutionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly phase: string,
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
    if (record.plan?.missingInputs.length)
      throw new Error("Restore the saved private inputs before releasing.");
  }
  const redact = (text: string) =>
    redactSecrets(
      [password, ...Object.values(supplied)]
        .filter(Boolean)
        .reduce((s, secret) => s.replaceAll(secret, "[REDACTED]"), text),
    ).text;
  return { password, supplied, redact };
}
export function releaseBundle(
  plan: DeploymentPlan,
  revision: string,
  id: string,
  files: TreeFile[],
  password: string,
  supplied: Record<string, string>,
) {
  const source = !sourceBuilds(plan).length
    ? []
    : files.filter((file) => !deniedPathReason(file.path));
  const compose = composeDefinition(plan, revision, id, password, supplied);
  return [
    ...source.map((file) => ({ ...file, path: `source/${file.path}` })),
    ...[
      ...new Map(
        sourceBuilds(plan)
          .filter((b) => b.generatedDockerfile)
          .map((b) => [b.dockerfile, b]),
      ).values(),
    ].map((b) => ({
      path: `source/${b.dockerfile}`,
      content: Buffer.from(b.generatedDockerfile!),
      mode: 0o644,
    })),
    ...[
      { name: "app", configs: plan.configs ?? [] },
      ...(plan.services ?? []),
    ].flatMap((service) =>
      service.configs.map((config) => ({
        path: `configs/${service.name}-${config.name}`,
        content: Buffer.from(config.content),
        mode: 0o600,
      })),
    ),
    {
      path: "compose.json",
      content: Buffer.from(JSON.stringify(compose)),
      mode: 0o600,
    },
  ];
}

/** Compose owns config/build errors; one lock covers upload and replacement. */
export function releaseCommand(
  release: DeploymentRelease,
  id: string,
  attemptId: string,
  retainedVolumes: string[],
  newManagedDatabase = false,
) {
  const plan = release.plan;
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
  const compose = `docker compose -p sg-${id.slice(0, 8)} -f compose.json`;
  const pull = [
    ...(newManagedDatabase ? ["postgres"] : []),
    ...(plan.image ? ["app"] : []),
    ...(plan.services ?? []).filter((s) => s.image).map((s) => s.name),
  ];
  const configs = [
    { name: "app", configs: plan.configs ?? [] },
    ...(plan.services ?? []),
  ].flatMap((s) => s.configs.map((c) => `${s.name}-${c.name}`));
  const body = `umask 077
phase=upload
run_release() {
  mkdir -p ${stage} || return $?
  tar -xpf - -C ${stage} || return $?
  cd ${stage} || return $?
  phase=configuration
  ${compose} config --quiet || return $?
  ${retainedVolumes.length ? `docker volume inspect ${retainedVolumes.map((name) => shellQuote(`sg-${id.slice(0, 8)}_${name}`)).join(" ")} >/dev/null || return $?` : ":"}
  phase=build
  ${
    sourceBuilds(plan).length
      ? `${compose} build ${sourceBuilds(plan)
          .map((b) => b.name)
          .join(" ")} || return $?`
      : ":"
  }
  ${pull.length ? `${compose} pull ${pull.map(shellQuote).join(" ")} || return $?` : ":"}
  phase=activate
  cp compose.json ${root}/compose.json || return $?
  mkdir -p ${root}/configs || return $?
  ${configs.map((name) => `cp ${shellQuote(`configs/${name}`)} ${shellQuote(`${root}/configs/${name}`)} || return $?`).join("\n  ") || ":"}
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
) {
  const attempt = record.lifecycle?.attempts.at(-1);
  if (attempt?.kind !== "release" || attempt.outcome !== "working")
    throw new Error("A recorded release attempt is required.");
  const secrets = releaseSecrets(record);
  const bundle = releaseBundle(
    release.plan,
    release.revision,
    record.id,
    files,
    secrets.password,
    secrets.supplied,
  );
  const priorPlan =
    record.lifecycle!.releases.find(
      (r) => r.id === record.lifecycle!.runtime.lastVerified?.releaseId,
    )?.plan ?? record.plan!;
  const volumes = [
    ...(priorPlan.postgres ? ["database"] : []),
    ...(priorPlan.volumes ?? []).map((v) => v.name),
    ...(priorPlan.services ?? []).flatMap((s) => s.volumes.map((v) => v.name)),
  ];
  const archive = await writeTar(bundle);
  recordOperationRemoteEffect();
  invalidateDeploymentRuntime(record);
  record.plan = release.plan;
  record.revision = release.revision;
  record.releaseId = release.id;
  record.imageId = null;
  // Reuse the managed database image without an incidental pull or upgrade.
  record.serviceImages =
    priorPlan.postgres && record.serviceImages?.postgres
      ? { postgres: record.serviceImages.postgres }
      : {};
  record.serviceReadiness = {};
  record.bundleHashes = Object.fromEntries(
    bundle
      .filter((f) => !f.path.startsWith("source/"))
      .map((f) => [
        f.path,
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
      releaseCommand(
        release,
        record.id,
        attempt.id,
        volumes,
        Boolean(release.plan.postgres && !priorPlan.postgres),
      ),
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
  try {
    await verifyServiceImages(record, signal);
    const revision = await deploymentSsh(
      record,
      `cd /opt/server-guy/${record.id} && docker inspect --format '{{index .Config.Labels "server-guy.revision"}}' $(docker compose -p sg-${record.id.slice(0, 8)} -f compose.json ps -q app)`,
      { signal },
    );
    if (revision.trim() !== release.revision)
      throw new Error("The running app does not match the selected revision.");
    await verifyDeployment(record, signal);
    await verifyPrivateServices(record, signal);
    await collectDeploymentLogs(record, signal);
  } catch (error) {
    const detail = secrets.redact(
      error instanceof Error ? error.message : "Release verification failed.",
    );
    throw new ReleaseExecutionError(
      detail,
      !record.verificationPending && !record.cleanup,
      "verification",
    );
  }
  record.imageId = record.serviceImages!.app;
  record.verifiedAt = new Date().toISOString();
  record.error = null;
  deploymentEvent(
    record,
    `Revision ${release.revision.slice(0, 12)} passed image, readiness and application checks`,
  );
  return {
    evidence: `Verified revision ${release.revision.slice(0, 12)} on the existing host; named data volumes were retained.`,
  };
}
