import {
  archiveChat as archiveChatRecord,
  deleteApplication,
  getApplication,
  getApplicationByRepository,
  getChat,
  getWorkspace,
  insertActivity,
  insertApplication,
  insertChat,
  insertDecision,
  insertMessage,
  insertObservation,
  insertWorkspace,
  latestObservation,
  listActiveDecisions,
  listActivity,
  listApplications,
  listChats,
  listChatSummaries,
  listMessages,
  listObservations,
  recordActivityOnce,
  supersedeDecision,
  withTransaction,
} from "./db";
import { inspectGithubRepository, parseGithubRepository } from "./github";
import {
  currentGithubConnectionId,
  readGithubConnection,
} from "./github-connection";
import {
  PHASE_ONE,
  computeChecks,
  deriveUpcomingRequirements,
} from "./phase-one-spec";
import { APPROVAL_MODES, isApprovalMode } from "./types";
import { removeNativeApplicationSessions } from "./pi-sessions";
import type {
  ApplicationRecord,
  CreateApplicationInput,
  GateCheck,
  PhaseOneOperatorView,
  PhaseWorkspaceRecord,
  PhaseWorkspaceView,
  PiDecision,
} from "./types";

export class ExistingApplicationConflictError extends Error {}
export class NotFoundError extends Error {}

const REPOSITORY_OBSERVATION = "github-repository-identity";

function loadWorkspace(applicationId: string) {
  const application = getApplication(applicationId);
  const workspace = application ? getWorkspace(application.id) : null;
  if (!application || !workspace)
    throw new NotFoundError("Application not found.");
  return { application, workspace };
}

export function loadChat(applicationId: string, chatId: string) {
  const { application, workspace } = loadWorkspace(applicationId);
  const chat = getChat(chatId);
  if (!chat || chat.workspaceId !== workspace.id) {
    throw new NotFoundError("Chat not found.");
  }
  return { application, workspace, chat };
}

function currentChecks(application: ApplicationRecord) {
  return computeChecks(
    application,
    latestObservation(application.id, REPOSITORY_OBSERVATION),
    currentGithubConnectionId(),
  );
}

function workspaceView(
  workspace: PhaseWorkspaceRecord,
  checks: GateCheck[],
): PhaseWorkspaceView {
  return {
    ...workspace,
    phaseNumber: PHASE_ONE.number,
    deliverable: PHASE_ONE.deliverable,
    status: checks.every((check) => check.status === "passed")
      ? "ready"
      : "in-progress",
  };
}

export async function createPhaseOneApplication(input: CreateApplicationInput) {
  if (input.environment !== "production") {
    throw new Error(
      "Phase 1 currently supports the production launch environment only.",
    );
  }
  if (!isApprovalMode(input.approvalMode)) {
    throw new Error("Choose a valid permission policy.");
  }
  const repository = parseGithubRepository(input.repositoryUrl);
  const existing = getApplicationByRepository(repository.canonicalUrl);
  if (existing) {
    if (existing.approvalMode !== input.approvalMode) {
      throw new ExistingApplicationConflictError(
        `An application already exists for this repository with ${APPROVAL_MODES[existing.approvalMode].label}. Open it instead of replacing its permission policy.`,
      );
    }
    return { view: getPhaseOneOperatorView(existing.id), created: false };
  }

  const application = withTransaction(() => {
    const application = insertApplication({
      name: repository.name,
      repositoryUrl: repository.canonicalUrl,
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      environment: "production",
      approvalMode: input.approvalMode,
      approvalScope: "Current application launch",
    });
    const workspace = insertWorkspace(application.id);
    const chat = insertChat(workspace.id, "Launch Brief", true);

    insertMessage(
      chat.id,
      "assistant",
      `I created the ${repository.name} application. I’m checking the exact GitHub repository identity now. No code, infrastructure, domain, or paid resource has been changed.`,
      "server-guy",
    );
    insertActivity(
      workspace.id,
      "workspace-created",
      "Application workspace created",
      `Recorded ${repository.canonicalUrl} as a production launch with ${APPROVAL_MODES[input.approvalMode].label}.`,
    );
    return application;
  });

  await observeRepository(application.id);
  return { view: getPhaseOneOperatorView(application.id), created: true };
}

export async function observeRepository(
  applicationId: string,
  expectedConnectionId?: string,
) {
  if (
    expectedConnectionId &&
    currentGithubConnectionId() !== expectedConnectionId
  ) {
    throw new Error(
      "The GitHub connection changed. Check repositories with the current login.",
    );
  }
  const { application, workspace } = loadWorkspace(applicationId);
  const recorded = listObservations(application.id).find(
    (observation) =>
      observation.kind === REPOSITORY_OBSERVATION &&
      observation.status === "passed" &&
      observation.raw &&
      typeof observation.raw === "object" &&
      "repositoryId" in observation.raw,
  );
  const expectedId =
    recorded?.raw &&
    typeof recorded.raw === "object" &&
    "repositoryId" in recorded.raw &&
    typeof recorded.raw.repositoryId === "number"
      ? recorded.raw.repositoryId
      : undefined;
  const result = await inspectGithubRepository(
    {
      owner: application.repositoryOwner,
      name: application.repositoryName,
      canonicalUrl: application.repositoryUrl,
    },
    expectedId,
  );

  // A slow check from a previous login must not overwrite the new login's
  // evidence.
  if (
    expectedConnectionId &&
    readGithubConnection()?.id !== expectedConnectionId
  ) {
    throw new Error(
      "The GitHub connection changed. Check repositories with the current login.",
    );
  }

  const observation = insertObservation({
    applicationId: application.id,
    kind: REPOSITORY_OBSERVATION,
    status: result.status,
    summary: result.summary,
    sourceLabel:
      result.status === "passed" ? "GitHub commit" : "GitHub repository check",
    sourceUrl: result.sourceUrl,
    raw: result.raw,
  });
  insertActivity(
    workspace.id,
    result.status === "passed"
      ? "repository-observed"
      : "repository-unavailable",
    result.status === "passed"
      ? "Repository identity recorded"
      : "Repository check did not pass",
    observation.summary,
  );
  return observation;
}

export interface GithubRepositoryCheckResult {
  applicationId: string;
  repository: string;
  status: GateCheck["status"];
  result: string;
}

const reconnectChecks = new Map<
  string,
  Promise<GithubRepositoryCheckResult[]>
>();

/**
 * One bounded verification of existing applications after explicit connection
 * consent.
 */
export async function recheckGithubRepositories(connectionId: string) {
  if (currentGithubConnectionId() !== connectionId) {
    throw new Error(
      "The GitHub connection changed. Check repositories with the current login.",
    );
  }
  const pending = reconnectChecks.get(connectionId);
  if (pending) return pending;
  const work = (async () => {
    const results: GithubRepositoryCheckResult[] = [];
    for (const application of listApplications()) {
      if (readGithubConnection()?.id !== connectionId) {
        throw new Error(
          "The GitHub connection changed. Check repositories with the current login.",
        );
      }
      const previous = latestObservation(
        application.id,
        REPOSITORY_OBSERVATION,
      );
      const checkedConnection =
        previous?.raw &&
        typeof previous.raw === "object" &&
        "connectionId" in previous.raw
          ? previous.raw.connectionId
          : null;
      // A failed check is still a completed attempt. Only explicit Retry runs
      // it again.
      if (
        currentGithubConnectionId() === connectionId &&
        checkedConnection !== connectionId
      ) {
        await observeRepository(application.id, connectionId);
      }
      const check = currentChecks(application).find(
        (item) => item.key === "repository-readable",
      )!;
      results.push({
        applicationId: application.id,
        repository: `${application.repositoryOwner}/${application.repositoryName}`,
        status: check.status,
        result: check.result,
      });
    }
    return results;
  })();
  reconnectChecks.set(connectionId, work);
  try {
    return await work;
  } finally {
    reconnectChecks.delete(connectionId);
  }
}

function observationConnectionId(observation: { raw: unknown }) {
  return observation.raw &&
    typeof observation.raw === "object" &&
    "connectionId" in observation.raw &&
    typeof observation.raw.connectionId === "string"
    ? observation.raw.connectionId
    : null;
}

/**
 * Disconnecting or replacing the GitHub login is installation-wide; its
 * application consequence is that a passing repository check made with the
 * previous login no longer counts as current. That does not show access was
 * lost. The event ID is derived from the invalidated Observation, so a retried
 * or concurrent request, a later read, or a view refresh cannot add a second
 * item; a fresh check under the current login records its own outcome.
 */
function invalidateRepositoryVerifications(
  previousConnectionId: string,
  next: "disconnected" | "replaced",
) {
  withTransaction(() => {
    for (const application of listApplications()) {
      const latest = latestObservation(application.id, REPOSITORY_OBSERVATION);
      if (
        latest?.status !== "passed" ||
        observationConnectionId(latest) !== previousConnectionId
      )
        continue;
      const workspace = getWorkspace(application.id);
      if (!workspace) continue;
      recordActivityOnce(
        `verification-invalidated:${latest.id}`,
        workspace.id,
        "repository-verification-invalidated",
        "Repository verification invalidated",
        `${
          next === "disconnected"
            ? "GitHub was disconnected"
            : "The GitHub connection was replaced"
        } after this repository was verified with the previous login, so that check no longer counts as current. This does not show that access was lost. Check the repository again with the current connection to verify access. Earlier result: ${latest.summary}`,
      );
    }
  });
}

function savedGithubConnectionId() {
  try {
    return readGithubConnection()?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Runs one GitHub setup operation and records the application consequence of
 * an actual connection transition: the saved connection ID after the operation
 * differs from the one before. Token renewal keeps the ID and records nothing.
 */
export async function withGithubConnectionTransition<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  const before = savedGithubConnectionId();
  try {
    return await operation();
  } finally {
    const after = savedGithubConnectionId();
    if (before && before !== after)
      invalidateRepositoryVerifications(
        before,
        after ? "replaced" : "disconnected",
      );
  }
}

export function listApplicationSummaries() {
  return listApplications().map((application) => {
    const checks = currentChecks(application);
    return {
      application,
      passedChecks: checks.filter((check) => check.status === "passed").length,
      totalChecks: checks.length,
    };
  });
}

export function removeApplication(applicationId: string, repository: string) {
  const { application } = loadWorkspace(applicationId);
  if (
    repository !==
    `${application.repositoryOwner}/${application.repositoryName}`
  ) {
    throw new Error(
      "Type the exact repository owner/name to remove this application.",
    );
  }
  // Delete the identity too: adding the repository again gets new IDs, so old
  // in-flight messages/observations cannot repopulate the new application.
  removeNativeApplicationSessions(application.id, () => {
    deleteApplication(application.id);
  });
  return { removedApplicationId: application.id };
}

export function getPhaseOneOperatorView(
  applicationId: string,
  chatId?: string,
): PhaseOneOperatorView {
  const { application, workspace } = loadWorkspace(applicationId);

  const checks = currentChecks(application);
  const chats = listChatSummaries(workspace.id);
  const selected =
    (chatId ? chats.find((chat) => chat.id === chatId) : null) ??
    chats.find((chat) => !chat.archivedAt && chat.isPrimary) ??
    chats.find((chat) => !chat.archivedAt) ??
    chats[0] ??
    null;

  return {
    application,
    workspace: workspaceView(workspace, checks),
    chats,
    selectedChatId: selected?.id ?? null,
    messages: selected ? listMessages(selected.id) : [],
    checks,
    decisions: listActiveDecisions(application.id),
    observations: listObservations(application.id),
    upcomingRequirements: deriveUpcomingRequirements(),
    activity: listActivity(workspace.id),
  };
}

export function createChat(applicationId: string, title?: string) {
  const { application, workspace } = loadWorkspace(applicationId);
  const chatNumber = listChats(workspace.id).length + 1;
  const chat = insertChat(
    workspace.id,
    title?.trim() || `Launch question ${chatNumber}`,
  );
  insertMessage(
    chat.id,
    "assistant",
    "This is a separate Chat for the same Launch Brief. I can see the shared Operator View and checks, but this transcript starts fresh.",
    "server-guy",
  );
  // Chat administration is visible in the chat list; it is not an application
  // event.
  return getPhaseOneOperatorView(application.id, chat.id);
}

export function archiveChat(applicationId: string, chatId: string) {
  const { application, chat } = loadChat(applicationId, chatId);
  if (chat.isPrimary)
    throw new Error("The main Launch Brief Chat stays with Phase 1.");
  archiveChatRecord(chat.id);
  return getPhaseOneOperatorView(application.id);
}

function decisionLabel(decision: PiDecision) {
  return { "launch-priority": "Saved requirement" }[decision.kind];
}

export function buildViewSummary(application: ApplicationRecord) {
  const checks = currentChecks(application);
  const upcoming = deriveUpcomingRequirements();
  return [
    `Application: ${application.name}`,
    `Repository: ${application.repositoryUrl}`,
    "Environment: Production",
    `Permission policy: ${APPROVAL_MODES[application.approvalMode].label}`,
    // Public current results, not raw provider payloads or credential records.
    // Old observations must not masquerade as evidence for the current login.
    `Checks:\n${checks.map((check) => `- ${check.label}=${check.status}; result=${JSON.stringify(check.result)}`).join("\n")}`,
    `Upcoming requirements: ${upcoming
      .map(
        (requirement) =>
          `${requirement.label} before Phase ${requirement.requiredBeforePhase}`,
      )
      .join("; ")}`,
  ].join("\n");
}

// Called only inside the worker's final transaction. Model text is not a
// Decision: every proposal must still match the current durable domain state.
// Each committed Decision produces exactly one Activity Event in that same
// transaction, so a rollback leaves neither the record nor a success claim.
export function savePiDecisions(
  applicationId: string,
  workspaceId: string,
  sourceMessageId: string,
  proposals: PiDecision[],
) {
  for (const proposed of proposals) {
    const decision = insertDecision({
      applicationId,
      sourceMessageId,
      kind: proposed.kind,
      label: decisionLabel(proposed),
      value: proposed.value,
    });
    const previous =
      proposed.replaces === undefined
        ? null
        : supersedeDecision(applicationId, proposed.replaces, decision.id);

    if (previous) {
      insertActivity(
        workspaceId,
        "decision-revised",
        "Requirement changed",
        `${previous.value} → ${decision.value}`,
      );
    } else {
      insertActivity(
        workspaceId,
        "decision-recorded",
        "Requirement saved",
        decision.value,
      );
    }
  }
}
