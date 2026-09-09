import { applicationDeployment } from "./deployment-store";
import {
  archiveChat as archiveChatRecord,
  deleteApplication,
  getApplication,
  getWorkspace,
  insertActivity,
  insertApplication,
  insertChat,
  insertDecision,
  insertMessage,
  insertObservation,
  insertWorkspace,
  latestObservation,
  listApplications,
  listApplicationChats,
  listObservations,
  listApplicationPreviews,
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
  getApplicationStatus,
  getOperatorView,
  getPhaseOneOperatorView,
  listApplicationSummaries,
} from "./operator-view";
import {
  currentPhaseOneChecks,
  REPOSITORY_OBSERVATION,
} from "./phase-one-evidence";
import { INSPECTION_OBSERVATION } from "./phase-two";
import { removeNativeApplicationSessions } from "./pi-sessions";
import { APPROVAL_MODES, isApprovalMode } from "./types";
import type { CreateApplicationInput, GateCheck, PiDecision } from "./types";
import {
  assertChatWritable,
  ExistingApplicationConflictError,
  loadApplication,
  loadChat,
  NotFoundError,
  primaryChatTitle,
} from "./workspaces";

export {
  ExistingApplicationConflictError,
  NotFoundError,
  loadChat,
  getApplicationStatus,
  getOperatorView,
  getPhaseOneOperatorView,
  listApplicationSummaries,
};

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
  const name = input.name?.trim() || repository.name;
  const existing = input.requestKey ? getApplication(input.requestKey) : null;
  if (existing) {
    if (
      existing.approvalMode !== input.approvalMode ||
      existing.repositoryUrl !== repository.canonicalUrl ||
      existing.name !== name
    ) {
      throw new ExistingApplicationConflictError(
        "This creation request was already used with different application settings. Open the existing application or start a new creation request.",
      );
    }
    return { view: getOperatorView(existing.id), created: false };
  }

  const application = withTransaction(() => {
    const application = insertApplication(
      {
        name,
        repositoryUrl: repository.canonicalUrl,
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
        environment: "production",
        approvalMode: input.approvalMode,
        approvalScope: "Current application launch",
      },
      input.requestKey,
    );
    const workspace = insertWorkspace(application.id);
    const chat = insertChat(workspace.id, "Deploy application", true);

    insertMessage(
      chat.id,
      "assistant",
      `I created ${name}. I’m checking access to the repository so we can work out what it needs.`,
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
  return { view: getOperatorView(application.id), created: true };
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
  const { application } = loadApplication(applicationId);
  // Repository identity evidence belongs to the Launch Brief workspace, even
  // after Phase 1 completed: the check may still be rerun after a reconnect.
  const workspace = getWorkspace(application.id, "start");
  if (!workspace) throw new NotFoundError("Application not found.");
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

  if (
    loadApplication(applicationId).application.repositoryUrl !==
    application.repositoryUrl
  )
    throw new Error(
      "The repository changed during its access check. Check the current repository again.",
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
      const check = currentPhaseOneChecks(application).find(
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
 * application consequence is that a passing repository check or inspection
 * made with the previous login no longer counts as current. That does not
 * show access was lost. The event ID is derived from the invalidated
 * Observation, so a retried or concurrent request, a later read, or a view
 * refresh cannot add a second item; a fresh check under the current login
 * records its own outcome.
 */
function invalidateRepositoryVerifications(
  previousConnectionId: string,
  next: "disconnected" | "replaced",
) {
  const cause =
    next === "disconnected"
      ? "GitHub was disconnected"
      : "The GitHub connection was replaced";
  withTransaction(() => {
    for (const application of listApplications()) {
      const latest = latestObservation(application.id, REPOSITORY_OBSERVATION);
      const workspace = getWorkspace(application.id, "start");
      if (
        workspace &&
        latest?.status === "passed" &&
        observationConnectionId(latest) === previousConnectionId
      )
        recordActivityOnce(
          `verification-invalidated:${latest.id}`,
          workspace.id,
          "repository-verification-invalidated",
          "Repository verification invalidated",
          `${cause} after this repository was verified with the previous login, so that check no longer counts as current. This does not show that access was lost. Check the repository again with the current connection to verify access. Earlier result: ${latest.summary}`,
        );
      const inspection = latestObservation(
        application.id,
        INSPECTION_OBSERVATION,
      );
      const inspectWorkspace = getWorkspace(application.id, "inspect-app");
      if (
        inspectWorkspace &&
        inspection?.status === "passed" &&
        observationConnectionId(inspection) === previousConnectionId
      )
        recordActivityOnce(
          `inspection-invalidated:${inspection.id}`,
          inspectWorkspace.id,
          "repository-inspection-invalidated",
          "Repository inspection invalidated",
          `${cause} after this repository was inspected with the previous login, so that inspection no longer supports the Application Contract checks. Saved file reads keep their content; re-inspect with the current connection to make them citable again. Earlier result: ${inspection.summary}`,
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

export function removeApplication(applicationId: string, repository: string) {
  const { application } = loadApplication(applicationId);
  if (
    repository !==
    `${application.repositoryOwner}/${application.repositoryName}`
  ) {
    throw new Error(
      "Type the exact repository owner/name to remove this application.",
    );
  }
  if (
    listApplicationPreviews(application.id).some((item) =>
      ["ready", "starting"].includes(item.status),
    )
  )
    throw new Error(
      "Stop the application preview before removing this application.",
    );
  if (applicationDeployment(application.id))
    throw new Error(
      "This application owns a deployment record. Host retirement is not implemented yet; preserve this record to retain access and billing history.",
    );
  // Delete the identity too: adding the repository again gets new IDs, so old
  // in-flight messages/observations cannot repopulate the new application.
  // Contracts, every phase workspace and their native files go with it.
  removeNativeApplicationSessions(application.id, () => {
    deleteApplication(application.id);
  });
  return { removedApplicationId: application.id };
}

/** A new Chat in the current phase; completed phases accept none. */
export function createChat(applicationId: string, title?: string) {
  const { application, current } = loadApplication(applicationId);
  if (current.completedAt)
    throw new Error("This phase is complete; its chats are read-only.");
  const chatNumber = listApplicationChats(application.id).length + 1;
  const chat = insertChat(
    current.id,
    title?.trim() || `Conversation ${chatNumber}`,
  );
  insertMessage(
    chat.id,
    "assistant",
    `We can continue working on ${application.name} here. The application keeps its configuration and history; this conversation starts fresh.`,
    "server-guy",
  );
  // Chat administration is visible in the chat list; it is not an application
  // event.
  return getOperatorView(application.id, chat.id);
}

export function archiveChat(applicationId: string, chatId: string) {
  const { application, chat, workspace } = loadChat(applicationId, chatId);
  if (chat.isPrimary)
    throw new Error(
      `The main ${primaryChatTitle(workspace.phaseKey)} Chat stays with its phase.`,
    );
  assertChatWritable(chat, workspace);
  archiveChatRecord(chat.id);
  return getOperatorView(application.id);
}

function decisionLabel(decision: PiDecision) {
  return { "launch-priority": "Saved requirement" }[decision.kind];
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
