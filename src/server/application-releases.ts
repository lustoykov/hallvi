import { rememberVerifiedImages, rollbackSelection } from "./rollback";
import { reconcileRelease } from "./release-reconciliation";
import { inspectRuntime } from "./release-diagnostics";
import { getApplication } from "./db";
import { randomUUID } from "node:crypto";
import {
  applicationDeployment,
  getDeployment,
  retryInitialDeployment,
  runDeploymentAttempt,
  saveDeployment,
  deploymentEvent,
  DeploymentConflictError,
} from "./deployment-store";
import { ensureDeploymentLifecycle } from "./deployment-lifecycle";
import { deploymentRuntime, establishedRuntime } from "./deployment-runtime";
import { releaseOf, type DeploymentRelease } from "./deployment-release";
import { checkDeploymentSource } from "./deployment-source";
import { githubJson } from "./github-api";
import { fetchBaseTree, type TreeFile } from "./execution-tree";
import { deploymentSourceFiles } from "./deployment-source-files";
import {
  operation,
  proposeOperation,
  publicOperation,
  resolveOperation,
} from "./operation-store";
import type { StoredOperation } from "./operation-types";
import { planRelease } from "./deployment-planner";
import {
  currentConfigurationFiles,
  prepareNativeRelease,
} from "./native-compose";
import {
  currentFacts,
  releaseFacts,
  declaredOwners,
  stateOwners,
  type ReleaseFacts,
} from "./release-facts";
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
import type { DeploymentRecord } from "./deployment-types";

export async function proposeApplicationRelease(
  applicationId: string,
  chatId: string,
  ref = "HEAD",
  requirements = "Update this application.",
  rollbackRequest?: { releaseId: string; compatibilityEvidence: string },
  stateChangeRequest?: { services: string[]; evidence: string },
) {
  const record = applicationDeployment(applicationId);
  const state = deploymentRuntime(record).state;
  // A stopped first deployment whose host exists continues under the
  // approval it has: the owner already accepted its price, inputs and
  // effects, and a correction stays inside them.
  const stoppedFirst = Boolean(
    record?.status === "failed" &&
    record.authority &&
    record.serverId &&
    !record.lifecycle?.runtime.lastVerified,
  );
  // A known runtime, verified or merely observed, can baseline an update.
  if (
    !record ||
    !currentFacts(record) ||
    !record.serverId ||
    !record.address ||
    (state !== "verified" && state !== "observed" && !stoppedFirst)
  )
    throw new Error(
      "Verify or reconcile the existing deployment before proposing a new release.",
    );
  if (stoppedFirst && !rollbackRequest && !stateChangeRequest)
    return publicOperation(
      retryInitialDeployment(record, {
        correction: { instructions: requirements.slice(0, 4000), chatId },
      }),
    );
  if (stoppedFirst && rollbackRequest)
    throw new Error(
      "A first deployment that never verified has nothing to roll back to.",
    );
  const lifecycle = ensureDeploymentLifecycle(record);
  rememberVerifiedImages(record);
  const rollback = rollbackRequest
    ? rollbackSelection(
        record,
        rollbackRequest.releaseId,
        releaseSecrets(record).redact(rollbackRequest.compatibilityEvidence),
      )
    : undefined;
  const facts = currentFacts(record)!;
  // Owners keep their image unless this approval names them.
  let stateChange: ReleaseScope["stateChange"];
  if (stateChangeRequest) {
    const owners = [...declaredOwners(facts)];
    const services = [...new Set(stateChangeRequest.services)];
    const unknown = services.filter((name) => !owners.includes(name));
    const evidence = releaseSecrets(record)
      .redact(stateChangeRequest.evidence.trim())
      .slice(0, 5000);
    if (rollback)
      throw new Error(
        "A rollback keeps the current images of services that own data. Propose an image change as a separate release.",
      );
    if (unknown.length)
      throw new Error(
        `${unknown.join(", ")}: not a declared owner of persistent data. Declared owners: ${owners.join(", ") || "none"}.`,
      );
    if (!evidence)
      throw new Error(
        "Explain why the current data stays usable after this change.",
      );
    stateChange = { services, evidence };
  }
  const kept = [
    facts.volumes.length
      ? `the data in ${facts.volumes.map((volume) => volume.name).join(", ")}`
      : null,
    ...[...stateOwners(facts)]
      .filter((name) => !stateChange?.services.includes(name))
      .map((name) => `the ${name} image`),
    "network exposure",
  ].filter((item): item is string => Boolean(item));
  const keeps =
    kept.length > 1
      ? `${kept.slice(0, -1).join(", ")} and ${kept.at(-1)}`
      : kept[0];
  let revision: string;
  if (rollback) {
    revision = lifecycle.releases.find(
      (r) => r.id === rollback.releaseId,
    )!.revision;
  } else {
    const { token } = await checkDeploymentSource(record);
    const { data } = await githubJson(
      `/repos/${record.repository}/commits/${encodeURIComponent(ref)}`,
      token,
    );
    revision = (data as { sha?: string }).sha!;
    if (!revision || !/^[0-9a-f]{40}$/.test(revision))
      throw new Error("GitHub did not identify an exact revision.");
  }
  const established = establishedRuntime(lifecycle.runtime);
  const scope: ReleaseScope = {
    id: randomUUID(),
    deploymentId: record.id,
    hostId: lifecycle.host.id,
    serverId: record.serverId,
    address: record.address,
    repository: record.repository,
    repositoryId: record.repositoryId!,
    revision,
    // A stopped first deployment with nothing established binds the release
    // it approved; the new host holds no runtime to compare against yet.
    baselineReleaseId:
      established?.releaseId ??
      record.authority?.releaseId ??
      releaseOf(record)!.id,
    ...(established ? {} : { initial: true as const }),
    maxAttempts: 3,
    ...(rollback ? { rollback } : {}),
    ...(stateChange ? { stateChange } : {}),
  };
  const hold = record.commandPending
    ? ` Note: command check ${record.commandPending.name} from an earlier attempt has an unknown outcome on the host; approving accepts that it may run again.`
    : "";
  if (rollback)
    assertReleaseScope(
      record,
      scope,
      releaseFacts(
        lifecycle.releases.find((r) => r.id === rollback.releaseId)!,
      ),
    );
  saveDeployment(record);
  return publicOperation(
    proposeOperation({
      applicationId,
      chatId,
      source: { type: "release", id: `${record.id}:${revision}` },
      target: "release-deployment",
      kind: "change",
      title: `${rollback ? "Roll back to" : "Release"} ${revision.slice(0, 12)}`,
      summary: rollback
        ? `Return to previously verified application images for revision ${revision.slice(0, 12)} on this host. Keep private settings, ${keeps}. No builds or pulls. This does not undo migrations or restore older data. Compatibility assessment: ${rollback.compatibilityEvidence}`
        : `${stoppedFirst ? `Continue this application's first deployment on its prepared host with revision ${revision.slice(0, 12)}` : `Update this application to revision ${revision.slice(0, 12)} on its existing host`} with Pi-authored Docker Compose. Allow brief downtime and up to three execution attempts with agent-corrected configuration. Keep ${keeps}.${stateChange ? ` Allow changing the image, data declarations and mounts of ${stateChange.services.join(", ")}, which own${stateChange.services.length === 1 ? "s" : ""} persistent data; an earlier version may not read that data afterwards and a retired volume stays on the host unmanaged${stoppedFirst ? "" : ", so take a verified backup first"}. Compatibility assessment: ${stateChange.evidence}` : ""} No server purchase or resize. Destructive data migrations need a separate decision.${hold} Task: ${requirements.slice(0, 1200)}`,
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
  candidate: ReleaseFacts,
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
  // A release operation carries its scope; a first deployment's operation
  // holds the approval its scope is derived from.
  const command = current?.command;
  const authorized =
    command?.type === "release-deployment"
      ? command.scope.id === scope.id
      : command?.type === "deployment" &&
        command.deploymentId === record.id &&
        scope.initial === true;
  if (
    !current?.approvedAt ||
    current.state !== "working" ||
    current.executorPid !== process.pid ||
    !authorized
  )
    throw new ReleaseScopeError(
      "This release operation does not hold active authorization.",
    );
  assertReleaseScope(record, scope, candidate);
  if (!execution) return;
  if (record.verificationPending || record.cleanup)
    throw new ReleaseScopeError(
      "Reconcile the previous verification object's outcome before another release.",
    );
  // A command whose outcome the host never reported may have changed data.
  // The hold belongs to the deployment, whatever operation runs next: only
  // the host's record, read by reconciliation, resolves it.
  if (record.commandPending)
    throw new ReleaseScopeError(
      `Command check ${record.commandPending.name} from attempt ${record.commandPending.attemptId} has an unknown outcome. Call reconcile_release: it runs again only once the host's record resolves it.`,
    );
  const attempts = record.lifecycle!.attempts.filter(
    (a) =>
      a.authorizationId === scope.id &&
      (a.kind === "release" || a.kind === "deploy"),
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

/**
 * The loop first deployments and updates share: Pi's native selection is
 * resolved, compared with the authorized baseline, executed by the locked
 * host script and verified, and the outcome returns to Pi as feedback. A first
 * deployment executes its approved release before Pi corrects anything.
 */
async function releaseLoop(input: {
  record: DeploymentRecord;
  tracked: StoredOperation;
  scope: ReleaseScope;
  /** The authorized release whose effects bind every selection. */
  baseline: DeploymentRelease;
  /** Pi's starting point: the running or last executed release. */
  current: DeploymentRelease;
  task: string;
  token: string;
  signal: AbortSignal;
  /** Executed unchanged before Pi's session. */
  approved?: DeploymentRelease;
  /** Feedback from an earlier execution under the same authorization. */
  earlier?: string | null;
}) {
  const { record, tracked, scope, signal } = input;
  // The immutable tree is fetched once: to compare selected files with the
  // repository and, when the release builds, to upload exactly this source.
  let tree: Promise<TreeFile[]> | undefined;
  const sourceTree = () =>
    (tree ??= fetchBaseTree(
      scope.repository,
      scope.revision,
      input.token,
      signal,
    ));
  const current = () => currentFacts(record)!;
  let evidence: string | undefined;
  const execute = async (release: DeploymentRelease) => {
    const facts = releaseFacts(release);
    // Operation and runtime must agree: without a behavior criterion a
    // release could only ever be observed, never verified.
    if (!facts.criterion)
      throw new ReleaseScopeError(
        "This application has no behavior criterion, so a release could not be verified. Releasing it needs the managed private check path, which is not implemented yet.",
      );
    assertOwned(record, tracked, scope, facts);
    const buildFiles = facts.services.some((service) => service.build)
      ? await sourceTree()
      : [];
    const wasLive = record.status === "live";
    const result = await runDeploymentAttempt(
      record,
      scope.initial ? "deploy" : "release",
      tracked.id,
      async () => {
        record.lifecycle!.attempts.at(-1)!.authorizationId = scope.id;
        saveDeployment(record);
        return executeRelease(record, release, buildFiles, signal);
      },
      release,
    );
    evidence = result.evidence;
    // A release that finishes a stopped first deployment makes it live and
    // settles the deployment operation it continued.
    if (!wasLive && result.behavior === "passed") {
      const { completeInitialDeployment } =
        await import("./deployment-executor");
      completeInitialDeployment(record);
      if (tracked.command?.type === "release-deployment")
        resolveOperation(
          record.operationId ?? `deployment:${record.id}`,
          tracked.id,
        );
    }
    return { ok: true, message: evidence };
  };
  const feedback = (error: unknown) => {
    if (signal.aborted || error instanceof DeploymentConflictError) throw error;
    const message = redactSecrets(
      error instanceof Error ? error.message : "Release failed.",
    ).text;
    deploymentEvent(record, `Release feedback: ${message.slice(0, 1500)}`);
    return {
      ok: false,
      kind:
        error instanceof ReleaseScopeError
          ? "authorization"
          : error instanceof ReleaseExecutionError
            ? error.phase
            : "configuration",
      retryable:
        error instanceof ReleaseExecutionError
          ? error.retryable
          : !(error instanceof ReleaseScopeError),
      message,
    };
  };
  let earlier = input.earlier;
  if (input.approved) {
    const result = await execute(input.approved).catch(feedback);
    if (evidence) return evidence;
    earlier = JSON.stringify(result);
  }
  const files = await deploymentSourceFiles(
    scope.repository,
    scope.revision,
    input.token,
    signal,
  );
  const session = planRelease(files, record, signal, {
    revision: scope.revision,
    runId: tracked.id,
    initial: scope.initial,
    context: `${input.task}${earlier ? `\nThe previous execution under this authorization failed. Its feedback: ${earlier.slice(-6000)}` : ""}`,
    workspaceFiles: currentConfigurationFiles(input.current),
    reconcile: async () => {
      if (evidence) return { ok: true, completed: true, message: evidence };
      assertOwned(record, tracked, scope, current(), false);
      const result = await reconcileRelease(
        record,
        { id: scope.id, operationId: tracked.id },
        signal,
      );
      if (result.completed) evidence = result.message;
      return result;
    },
    inspect: async (options) => {
      assertOwned(record, tracked, scope, current(), false);
      return inspectRuntime(record, signal, options);
    },
    apply: async (selection, artifacts) => {
      if (evidence) return { ok: true, message: evidence };
      try {
        assertOwned(record, tracked, scope, current(), false);
        // A source/credential check is repeated immediately before execution.
        await checkDeploymentSource(record);
        const secrets = releaseSecrets(record);
        const native = await prepareNativeRelease({
          deploymentId: record.id,
          revision: scope.revision,
          selection,
          artifacts,
          repositoryFile: async (path) =>
            files.paths.includes(path)
              ? ((await sourceTree()).find((file) => file.path === path)
                  ?.content ?? null)
              : null,
          inputs: Object.keys(secrets.supplied).filter((name) =>
            secrets.supplied[name]?.trim(),
          ),
          baseline: releaseFacts(input.baseline),
          signal,
        });
        return await execute(
          releaseOf({
            repository: scope.repository,
            revision: scope.revision,
            native,
          })!,
        );
      } catch (error) {
        return feedback(error);
      }
    },
  });
  // A verified execution stands: interrupting Pi's closing reply, or a
  // failure after it, does not undo the runtime that execution established.
  await session.catch((error: unknown) => {
    if (!evidence) throw error;
  });
  if (!evidence)
    throw new Error("The agent stopped without a completed release.");
  return evidence;
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
  assertOwned(record, tracked, scope, currentFacts(record)!, false);
  if (scope.rollback) {
    const selected = record.lifecycle!.releases.find(
      (r) => r.id === scope.rollback!.releaseId,
    );
    const expected = rollbackSelection(
      record,
      scope.rollback.releaseId,
      scope.rollback.compatibilityEvidence,
    );
    if (
      !selected ||
      JSON.stringify(expected) !== JSON.stringify(scope.rollback)
    )
      throw new ReleaseScopeError(
        "The selected rollback evidence changed. Review the rollback again.",
      );
    // Unknown outcomes use the same recorded host-result protocol as releases.
    const prior = record
      .lifecycle!.attempts.filter(
        (a) => a.authorizationId === scope.id && a.kind === "release",
      )
      .at(-1);
    if (prior?.remoteStartedAt) {
      const result = await reconcileRelease(
        record,
        { id: scope.id, operationId: tracked.id },
        signal,
      );
      if (result.completed) return { evidence: result.message };
      if (!result.retryable) throw new ReleaseScopeError(result.message);
    }
    assertOwned(record, tracked, scope, releaseFacts(selected));
    record.releaseOperationId = tracked.id;
    saveDeployment(record);
    return runDeploymentAttempt(
      record,
      "release",
      tracked.id,
      async () => {
        record.lifecycle!.attempts.at(-1)!.authorizationId = scope.id;
        saveDeployment(record);
        return executeRelease(
          record,
          selected,
          [],
          signal,
          scope.rollback!.images,
        );
      },
      selected,
    );
  }
  const { token } = await checkDeploymentSource(record);
  const { data } = await githubJson(
    `/repos/${scope.repository}/commits/${scope.revision}`,
    token,
  );
  if ((data as { sha?: string }).sha !== scope.revision)
    throw new Error("The selected source revision is unavailable.");
  const baseline = record.lifecycle!.releases.find(
    (r) => r.id === scope.baselineReleaseId,
  )!;
  record.releaseOperationId = tracked.id;
  saveDeployment(record);
  // A release continuing a stopped first deployment starts from what the
  // last execution left on the host, and carries the conversation's latest
  // correction beside the task the owner approved.
  const current = scope.initial ? (releaseOf(record) ?? baseline) : baseline;
  const correction =
    scope.initial && record.correction
      ? `\nCorrection requested from the owner's conversation at ${record.correction.at}: ${record.correction.instructions.slice(0, 3000)}`
      : "";
  // A held command is read from the host's record before anything runs,
  // whichever operation continues: a known result is consumed, a lost one
  // proceeds only with the owner's recorded decision, a running one holds.
  let earlier: string | null = null;
  if (record.commandPending) {
    const result = await reconcileRelease(
      record,
      { id: scope.id, operationId: tracked.id },
      signal,
    );
    if (result.completed) return { evidence: result.message };
    if (!result.retryable) throw new ReleaseScopeError(result.message);
    earlier = result.message;
  }
  try {
    const evidence = await releaseLoop({
      record,
      tracked,
      scope,
      baseline,
      current,
      token,
      signal,
      earlier,
      task: `Approved task: ${requirements}${correction}\nRelease scope: ${JSON.stringify(scope)}\nUse the existing host and private inputs. Inspect source changes for migrations; do not run destructive migrations under this scope. If data compatibility cannot be established, explain the blocker. You may correct ordinary configuration and retry within this scope; there is no per-attempt approval.`,
    });
    return { evidence };
  } catch (error) {
    // The deployment card shows why its continuation stopped, not the
    // earlier failure's text.
    if (scope.initial && record.status === "failed") {
      record.error = redactSecrets(
        error instanceof Error ? error.message : "The release failed.",
      ).text.slice(0, 4000);
      saveDeployment(record);
    }
    throw error;
  }
}

/**
 * A first deployment on its newly prepared host, under the deployment
 * operation's approval: the approved release runs through the shared loop and
 * Pi corrects failures within that approval's effects. A retry reconciles an
 * unknown outcome from the host receipt, then resumes with Pi instead of
 * repeating the failed execution.
 */
export async function runInitialRelease(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  const tracked = operation(record.operationId ?? `deployment:${record.id}`);
  if (!tracked) throw new Error("The deployment operation is unavailable.");
  const lifecycle = ensureDeploymentLifecycle(record);
  const selected = releaseOf(record);
  const approvedId = record.authority?.releaseId ?? record.releaseId;
  const approved =
    lifecycle.releases.find((r) => r.id === approvedId) ??
    (selected?.id === approvedId ? selected : undefined);
  if (
    !approved ||
    !selected ||
    !record.authority ||
    !record.serverId ||
    !record.address
  )
    throw new Error(
      "The approved release and its prepared host are required before execution.",
    );
  if (!lifecycle.releases.some((r) => r.id === approved.id))
    lifecycle.releases.push(structuredClone(approved));
  saveDeployment(record);
  const scope: ReleaseScope = {
    id: record.recommendationId ?? `approval:${record.authority.acceptedAt}`,
    deploymentId: record.id,
    hostId: lifecycle.host.id,
    serverId: record.serverId,
    address: record.address,
    repository: record.repository,
    repositoryId: record.repositoryId!,
    revision: approved.revision,
    baselineReleaseId: approved.id,
    initial: true,
    maxAttempts: 3,
  };
  assertOwned(record, tracked, scope, currentFacts(record)!, false);
  const { token } = await checkDeploymentSource(record);
  const earlier = lifecycle.attempts.filter(
    (a) => a.authorizationId === scope.id,
  );
  const last = earlier.filter((a) => a.kind !== "reconcile").at(-1);
  let resume = earlier.at(-1)?.error ?? null;
  // A lost outcome is established from the host receipt, never repeated;
  // so is a command check whose result the host never reported.
  if (
    (last?.remoteStartedAt &&
      !last.remoteResult &&
      !lifecycle.reconciliations?.some((r) => r.attemptId === last.id)) ||
    record.commandPending
  ) {
    const result = await reconcileRelease(
      record,
      { id: scope.id, operationId: tracked.id },
      signal,
    );
    if (result.completed) return result.message;
    // A hold the host's record cannot resolve stays, whichever operation
    // continues; the owner's decision is read by reconciliation itself.
    if (!result.retryable) throw new ReleaseScopeError(result.message);
    resume = result.message;
  }
  return releaseLoop({
    record,
    tracked,
    scope,
    baseline: approved,
    current: selected,
    token,
    signal,
    approved: earlier.length ? undefined : approved,
    earlier: resume,
    task: `Approved task: the first deployment of ${record.repository}@${approved.revision} on its newly prepared host.${record.requirements ? ` Owner request: ${record.requirements.slice(0, 2000)}` : ""}${record.correction ? `\nCorrection requested from the owner's conversation at ${record.correction.at}: ${record.correction.instructions.slice(0, 3000)}` : ""}\nAuthorization: ${JSON.stringify(scope)}\nThe owner approved this configuration's price, private inputs and effects: published listeners and HTTP access, the managed database, and named volumes with their data records. Correct ordinary configuration (commands, builds, packaging, environment, readiness, check paths) and deploy again within them; there is no per-attempt approval. A state owner's image change is outside them: stop and explain it, so the owner can approve it as a state change.`,
  });
}
