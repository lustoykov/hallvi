import { applicationDeployment } from "./deployment-store";
import {
  archiveChat as archiveChatRecord,
  deleteApplication,
  getApplication,
  getChat,
  insertActivity,
  insertApplication,
  insertChat,
  insertDecision,
  insertMessage,
  insertObservation,
  latestObservation,
  listApplicationChats,
  listApplications,
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
import { removeNativeApplicationSessions } from "./pi-sessions";
import type {
  ApplicationRecord,
  Chat,
  CreateApplicationInput,
  Observation,
  PiDecision,
} from "./types";

export class ExistingApplicationConflictError extends Error {}
export class NotFoundError extends Error {}

/** The recorded GitHub access check of an application's repository. */
export const REPOSITORY_OBSERVATION = "github-repository-identity";

export function loadApplication(applicationId: string): ApplicationRecord {
  const application = getApplication(applicationId);
  if (!application) throw new NotFoundError("Application not found.");
  return application;
}

export function loadChat(applicationId: string, chatId: string) {
  const application = loadApplication(applicationId);
  const chat = getChat(chatId);
  if (!chat || chat.applicationId !== application.id)
    throw new NotFoundError("Chat not found.");
  return { application, chat };
}

export function assertChatWritable(chat: Chat) {
  if (chat.archivedAt) throw new Error("This Chat is archived.");
}

export async function createApplication(input: CreateApplicationInput) {
  const repository = parseGithubRepository(input.repositoryUrl);
  const name = input.name?.trim() || repository.name;
  const existing = input.requestKey ? getApplication(input.requestKey) : null;
  if (existing) {
    if (
      existing.repositoryUrl !== repository.canonicalUrl ||
      existing.name !== name
    )
      throw new ExistingApplicationConflictError(
        "This creation request was already used with different application settings. Open the existing application or start a new creation request.",
      );
    return { application: existing, created: false };
  }
  const application = withTransaction(() => {
    const application = insertApplication(
      {
        name,
        repositoryUrl: repository.canonicalUrl,
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
      },
      input.requestKey,
    );
    const chat = insertChat(application.id, "Deploy application");
    insertMessage(
      chat.id,
      "assistant",
      `I created ${name}. I’m checking access to the repository so we can work out what it needs.`,
      "server-guy",
    );
    insertActivity(
      application.id,
      "application-created",
      "Application created",
      `Recorded ${repository.canonicalUrl}.`,
    );
    return application;
  });
  await observeRepository(application.id);
  return { application, created: true };
}

function repositoryIdOf(observation: Observation | undefined) {
  const raw = observation?.raw;
  return raw &&
    typeof raw === "object" &&
    "repositoryId" in raw &&
    typeof raw.repositoryId === "number"
    ? raw.repositoryId
    : undefined;
}

function connectionIdOf(observation: { raw: unknown }) {
  const raw = observation.raw;
  return raw &&
    typeof raw === "object" &&
    "connectionId" in raw &&
    typeof raw.connectionId === "string"
    ? raw.connectionId
    : null;
}

/** Records a fresh GitHub access check of the application's repository. */
export async function observeRepository(
  applicationId: string,
  expectedConnectionId?: string,
) {
  const changed = () =>
    new Error(
      "The GitHub connection changed. Check repositories with the current login.",
    );
  if (
    expectedConnectionId &&
    currentGithubConnectionId() !== expectedConnectionId
  )
    throw changed();
  const application = loadApplication(applicationId);
  const recorded = listObservations(application.id).find(
    (observation) =>
      observation.kind === REPOSITORY_OBSERVATION &&
      observation.status === "passed" &&
      repositoryIdOf(observation) !== undefined,
  );
  const result = await inspectGithubRepository(
    {
      owner: application.repositoryOwner,
      name: application.repositoryName,
      canonicalUrl: application.repositoryUrl,
    },
    repositoryIdOf(recorded),
  );
  if (
    loadApplication(applicationId).repositoryUrl !== application.repositoryUrl
  )
    throw new Error(
      "The repository changed during its access check. Check the current repository again.",
    );
  // A slow check from a previous login must not overwrite the new login's
  // evidence.
  if (
    expectedConnectionId &&
    readGithubConnection()?.id !== expectedConnectionId
  )
    throw changed();
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
    application.id,
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

/** Whether the latest repository check counts with the current login. */
export function repositoryAccess(application: ApplicationRecord) {
  const latest = latestObservation(application.id, REPOSITORY_OBSERVATION);
  const connectionId = currentGithubConnectionId();
  const current = Boolean(
    connectionId && latest && connectionIdOf(latest) === connectionId,
  );
  return {
    status: (!current || !latest || latest.status === "unavailable"
      ? "not-yet"
      : latest.status === "passed"
        ? "passed"
        : "blocked") as "passed" | "blocked" | "not-yet",
    result: !connectionId
      ? "Connect GitHub, then run the repository check."
      : !current
        ? "Run the repository check with your current GitHub connection."
        : (latest?.summary ?? "The repository has not been checked yet."),
    observation: latest,
    current,
    connected: Boolean(connectionId),
  };
}

export interface GithubRepositoryCheckResult {
  applicationId: string;
  repository: string;
  status: "passed" | "blocked" | "not-yet";
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
  if (currentGithubConnectionId() !== connectionId)
    throw new Error(
      "The GitHub connection changed. Check repositories with the current login.",
    );
  const pending = reconnectChecks.get(connectionId);
  if (pending) return pending;
  const work = (async () => {
    const results: GithubRepositoryCheckResult[] = [];
    for (const application of listApplications()) {
      if (readGithubConnection()?.id !== connectionId)
        throw new Error(
          "The GitHub connection changed. Check repositories with the current login.",
        );
      const previous = latestObservation(
        application.id,
        REPOSITORY_OBSERVATION,
      );
      // A failed check is still a completed attempt. Only explicit Retry runs
      // it again.
      if (
        currentGithubConnectionId() === connectionId &&
        (!previous || connectionIdOf(previous) !== connectionId)
      )
        await observeRepository(application.id, connectionId);
      const { status, result } = repositoryAccess(application);
      results.push({
        applicationId: application.id,
        repository: `${application.repositoryOwner}/${application.repositoryName}`,
        status,
        result,
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

/**
 * Disconnecting or replacing the GitHub login is installation-wide; its
 * application consequence is that a passing repository check made with the
 * previous login no longer counts as current. That does not show access was
 * lost. The event ID is derived from the invalidated Observation, so a
 * retried or concurrent request cannot add a second item.
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
      if (
        latest?.status === "passed" &&
        connectionIdOf(latest) === previousConnectionId
      )
        recordActivityOnce(
          `verification-invalidated:${latest.id}`,
          application.id,
          "repository-verification-invalidated",
          "Repository verification invalidated",
          `${cause} after this repository was verified with the previous login, so that check no longer counts as current. This does not show that access was lost. Connecting GitHub again rechecks it. Earlier result: ${latest.summary}`,
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
  const application = loadApplication(applicationId);
  if (
    repository !==
    `${application.repositoryOwner}/${application.repositoryName}`
  )
    throw new Error(
      "Type the exact repository owner/name to remove this application.",
    );
  if (applicationDeployment(application.id))
    throw new Error(
      "This application owns a deployment record. Host retirement is not implemented yet; preserve this record to retain access and billing history.",
    );
  // Delete the identity too: adding the repository again gets new IDs, so old
  // in-flight messages/observations cannot repopulate the new application.
  removeNativeApplicationSessions(application.id, () => {
    deleteApplication(application.id);
  });
  return { removedApplicationId: application.id };
}

/** A new conversation about the application, with its own transcript. */
export function createChat(applicationId: string, title?: string) {
  const application = loadApplication(applicationId);
  const chatNumber = listApplicationChats(application.id).length + 1;
  const chat = insertChat(
    application.id,
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
  return chat;
}

export function archiveChat(applicationId: string, chatId: string) {
  const { application, chat } = loadChat(applicationId, chatId);
  assertChatWritable(chat);
  if (
    listApplicationChats(application.id).filter((item) => !item.archivedAt)
      .length < 2
  )
    throw new Error(
      "Keep at least one active conversation. Start another before archiving this one.",
    );
  archiveChatRecord(chat.id);
}

// Called only inside the worker's final transaction. Model text is not a
// Decision: every proposal must still match the current durable domain state.
// Each committed Decision produces exactly one Activity Event in that same
// transaction, so a rollback leaves neither the record nor a success claim.
export function savePiDecisions(
  applicationId: string,
  sourceMessageId: string,
  proposals: PiDecision[],
) {
  for (const proposed of proposals) {
    const decision = insertDecision({
      applicationId,
      sourceMessageId,
      kind: proposed.kind,
      label: "Saved requirement",
      value: proposed.value,
    });
    const previous =
      proposed.replaces === undefined
        ? null
        : supersedeDecision(applicationId, proposed.replaces, decision.id);
    if (previous)
      insertActivity(
        applicationId,
        "decision-revised",
        "Requirement changed",
        `${previous.value} → ${decision.value}`,
      );
    else
      insertActivity(
        applicationId,
        "decision-recorded",
        "Requirement saved",
        decision.value,
      );
  }
}
