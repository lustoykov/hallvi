import { reconcileRelease } from "./release-reconciliation";
import { inspectRelease } from "./release-diagnostics";
import { getApplication } from "./db";
import { randomUUID } from "node:crypto";
import {
  applicationDeployment,
  getDeployment,
  runDeploymentAttempt,
  saveDeployment,
  deploymentEvent,
  DeploymentConflictError,
} from "./deployment-store";
import { ensureDeploymentLifecycle } from "./deployment-lifecycle";
import { deploymentRuntime } from "./deployment-runtime";
import { releaseOf } from "./deployment-release";
import { checkDeploymentSource } from "./deployment-source";
import { githubJson } from "./github-api";
import { fetchBaseTree } from "./execution-tree";
import { deploymentSourceFiles } from "./deployment-source-files";
import { sourceBuilds } from "./deployment-layout";
import {
  operation,
  proposeOperation,
  publicOperation,
} from "./operation-store";
import type { StoredOperation } from "./operation-types";
import { planDeployment } from "./deployment-planner";
import { pinContainerImage } from "./container-images";
import {
  assertReleaseScope,
  ReleaseScopeError,
  type ReleaseScope,
} from "./release-scope";
import {
  executeRelease,
  ReleaseExecutionError,
  releaseSecrets,
} from "./release-executor";
import { redactSecrets } from "./secrets";
import type { DeploymentPlan, DeploymentRecord } from "./deployment-types";

export async function proposeApplicationRelease(
  applicationId: string,
  chatId: string,
  ref = "HEAD",
  requirements = "Update this application.",
) {
  const record = applicationDeployment(applicationId);
  if (
    !record?.plan ||
    !record.serverId ||
    !record.address ||
    deploymentRuntime(record).state !== "verified"
  )
    throw new Error(
      "Verify or reconcile the existing deployment before proposing a new release.",
    );
  const { token } = await checkDeploymentSource(record);
  const { data } = await githubJson(
    `/repos/${record.repository}/commits/${encodeURIComponent(ref)}`,
    token,
  );
  const revision = (data as { sha?: string }).sha;
  if (!revision || !/^[0-9a-f]{40}$/.test(revision))
    throw new Error("GitHub did not identify an exact revision.");
  const lifecycle = ensureDeploymentLifecycle(record);
  const scope: ReleaseScope = {
    id: randomUUID(),
    deploymentId: record.id,
    hostId: lifecycle.host.id,
    serverId: record.serverId,
    address: record.address,
    repository: record.repository,
    repositoryId: record.repositoryId!,
    revision,
    baselineReleaseId: lifecycle.runtime.lastVerified!.releaseId,
    maxAttempts: 3,
  };
  saveDeployment(record);
  return publicOperation(
    proposeOperation({
      applicationId,
      chatId,
      source: { type: "release", id: `${record.id}:${revision}` },
      target: "release-deployment",
      kind: "change",
      title: `Release ${revision.slice(0, 12)}`,
      summary: `Update this application to revision ${revision.slice(0, 12)} on its existing host. Allow brief downtime and up to three execution attempts with agent-corrected configuration. Preserve existing data volumes, database version and network exposure. No server purchase or resize. Destructive data migrations need a separate decision.`,
      destinations: ["deployment", "history", "processes"],
      command: {
        type: "release-deployment",
        scope,
        requirements: requirements.slice(0, 5000),
      },
    }),
  );
}

function assertOwned(
  record: DeploymentRecord,
  tracked: StoredOperation,
  scope: ReleaseScope,
  plan: DeploymentPlan,
  execution = true,
) {
  const app = getApplication(record.applicationId);
  if (
    !app ||
    `${app.repositoryOwner}/${app.repositoryName}` !== scope.repository
  )
    throw new ReleaseScopeError(
      "The application repository changed. Review its release scope again.",
    );
  const current = operation(tracked.id);
  if (
    !current?.approvedAt ||
    current.state !== "working" ||
    current.executorPid !== process.pid ||
    current.command?.type !== "release-deployment" ||
    current.command.scope.id !== scope.id
  )
    throw new ReleaseScopeError(
      "This release operation does not hold active authorization.",
    );
  assertReleaseScope(record, scope, plan);
  if (!execution) return;
  if (record.verificationPending || record.cleanup)
    throw new ReleaseScopeError(
      "Reconcile the previous verification object's outcome before another release.",
    );
  const attempts = record.lifecycle!.attempts.filter(
    (a) => a.authorizationId === scope.id && a.kind === "release",
  );
  if (
    attempts.filter((a) => a.operationId === tracked.id).length >=
    scope.maxAttempts
  )
    throw new ReleaseScopeError(
      "The three-attempt execution budget is used. Review the recorded failures before authorizing more work.",
    );
  const last = attempts.at(-1);
  if (
    last?.remoteStartedAt &&
    !last.remoteResult &&
    !record.lifecycle!.reconciliations?.some((r) => r.attemptId === last.id)
  )
    throw new ReleaseScopeError(
      "The previous remote outcome is unknown. Reconcile it before repeating execution.",
    );
}

export async function runApplicationRelease(
  tracked: StoredOperation,
  signal: AbortSignal,
) {
  if (tracked.command?.type !== "release-deployment")
    throw new Error("Expected a release operation.");
  const { scope, requirements } = tracked.command;
  const record = getDeployment(scope.deploymentId);
  if (!record || record.applicationId !== tracked.applicationId)
    throw new ReleaseScopeError(
      "The deployment no longer belongs to this application.",
    );
  assertOwned(record, tracked, scope, record.plan!, false);
  const { token } = await checkDeploymentSource(record);
  const { data } = await githubJson(
    `/repos/${scope.repository}/commits/${scope.revision}`,
    token,
  );
  if ((data as { sha?: string }).sha !== scope.revision)
    throw new Error("The selected source revision is unavailable.");
  const files = await deploymentSourceFiles(
    scope.repository,
    scope.revision,
    token,
    signal,
  );
  record.releaseOperationId = tracked.id;
  saveDeployment(record);
  let evidence: string | undefined;
  await planDeployment(files, record, signal, {
    revision: scope.revision,
    context: `Approved task: ${requirements}\nRelease scope: ${JSON.stringify(scope)}\nExisting plan: ${JSON.stringify(record.plan)}\nUse the existing host and private inputs. Inspect source changes for migrations; do not run destructive migrations under this scope. If data compatibility cannot be established, explain the blocker. You may correct ordinary configuration and retry within this scope; there is no per-plan approval.`,
    reconcile: async () => {
      if (evidence)
        return {
          ok: true,
          verified: true,
          message: evidence,
          plan: record.plan!,
        };
      assertOwned(record, tracked, scope, record.plan!, false);
      const result = await reconcileRelease(record, tracked, signal);
      if (result.verified) evidence = result.message;
      return result;
    },
    inspect: async () => {
      assertOwned(record, tracked, scope, record.plan!, false);
      return inspectRelease(record, signal);
    },
    apply: async (candidate) => {
      if (evidence) return { ok: true, message: evidence };
      try {
        assertOwned(record, tracked, scope, candidate);
        // A source/credential check is repeated immediately before execution.
        await checkDeploymentSource(record);
        if (candidate.image)
          candidate.image = await pinContainerImage(candidate.image, signal);
        for (const service of candidate.services ?? [])
          if (service.image)
            service.image = await pinContainerImage(service.image, signal);
        const secrets = releaseSecrets(record);
        for (const input of candidate.missingInputs)
          if (!secrets.supplied[input.name]?.trim())
            throw new ReleaseScopeError(
              `Private input ${input.name} is unavailable. Ask for it through private configuration; never put its value in a tool call.`,
            );
        const selected = releaseOf({
          repository: scope.repository,
          revision: scope.revision,
          plan: candidate,
        })!;
        assertOwned(record, tracked, scope, candidate);
        // Published images need inspection evidence, not an executable copy
        // of every upstream fixture/media asset. Builds need the full tree.
        const buildFiles = sourceBuilds(candidate).length
          ? await fetchBaseTree(scope.repository, scope.revision, token, signal)
          : [];
        const result = await runDeploymentAttempt(
          record,
          "release",
          tracked.id,
          async () => {
            record.lifecycle!.attempts.at(-1)!.authorizationId = scope.id;
            saveDeployment(record);
            return executeRelease(record, selected, buildFiles, signal);
          },
          selected,
        );
        evidence = result.evidence;
        return { ok: true, message: evidence };
      } catch (error) {
        if (signal.aborted || error instanceof DeploymentConflictError)
          throw error;
        const message = redactSecrets(
          error instanceof Error ? error.message : "Release failed.",
        ).text;
        const retryable =
          error instanceof ReleaseExecutionError
            ? error.retryable
            : !(error instanceof ReleaseScopeError);
        deploymentEvent(record, `Release feedback: ${message.slice(0, 1500)}`);
        return {
          ok: false,
          kind:
            error instanceof ReleaseScopeError
              ? "authorization"
              : error instanceof ReleaseExecutionError
                ? error.phase
                : "configuration",
          retryable,
          message,
        };
      }
    },
  });
  if (!evidence)
    throw new Error("The agent stopped without a verified release.");
  return { evidence };
}
