import {
  archiveChat as archiveChatRecord,
  deleteApplication,
  getApplication,
  getChat,
  insertApplication,
  insertChat,
  insertMessage,
  insertObservation,
  latestObservation,
  listApplicationChats,
  listApplications,
  withTransaction,
  renameApplicationRow,
} from "./db";
import {
  ANONYMOUS_CREDENTIAL,
  inspectGithubRepository,
  parseGithubRepository,
} from "./github";
import {
  currentGithubConnectionId,
  readGithubConnection,
} from "./github-connection";
import { removeNativeApplicationSessions } from "./pi-sessions";
import type { ApplicationRecord, Chat, CreateApplicationInput } from "./types";

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
    const chat = insertChat(application.id, "Main operator");
    insertMessage(
      chat.id,
      "assistant",
      `I’ve added ${name}. Next, I can read its repository and explain what it needs to run.`,
      "hallvi",
    );
    return application;
  });
  await observeRepository(application.id);
  return { application, created: true };
}

export function recordedRepositoryId(applicationId: string) {
  return getApplication(applicationId)?.repositoryId ?? undefined;
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

function credentialOf(observation: { raw: unknown } | null | undefined) {
  const raw = observation?.raw;
  return raw &&
    typeof raw === "object" &&
    "credentialSource" in raw &&
    typeof raw.credentialSource === "string"
    ? raw.credentialSource
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
  const result = await inspectGithubRepository(
    {
      owner: application.repositoryOwner,
      name: application.repositoryName,
      canonicalUrl: application.repositoryUrl,
    },
    recordedRepositoryId(application.id),
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
  return observation;
}

/** Whether the latest repository check counts with the current login. */
export function repositoryAccess(application: ApplicationRecord) {
  const latest = latestObservation(application.id);
  const connectionId = currentGithubConnectionId();
  // A check that used no login belongs to no login: what it established about
  // a public repository does not change when one is connected or dropped. A
  // failed anonymous check is different — connecting a login is exactly what
  // might make a private repository readable — so it stops counting then.
  const anonymous = credentialOf(latest) === ANONYMOUS_CREDENTIAL;
  const current = latest
    ? anonymous
      ? latest.status === "passed" || !connectionId
      : Boolean(connectionId && connectionIdOf(latest) === connectionId)
    : false;
  return {
    status: (!current || !latest || latest.status === "unavailable"
      ? "not-yet"
      : latest.status === "passed"
        ? "passed"
        : "blocked") as "passed" | "blocked" | "not-yet",
    result: current
      ? (latest?.summary ?? "The repository has not been checked yet.")
      : connectionId
        ? "Run the repository check with your current GitHub connection."
        : "Run the repository check, or connect GitHub if this repository is private.",
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
      const previous = latestObservation(application.id);
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

/** Access is evaluated against the current connection each time it is read. */
export async function withGithubConnectionTransition<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  return operation();
}

/** The name is the owner's label and nothing else: no record is keyed on it. */
export function renameApplication(applicationId: string, name: string) {
  loadApplication(applicationId);
  const next = name.trim();
  if (!next || next.length > 120)
    throw new Error("Give the application a name of up to 120 characters.");
  renameApplicationRow(applicationId, next);
  return loadApplication(applicationId);
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
    `This is a read-only side chat for ${application.name}. I can explain the application and its execution history. Send commands and changes to the main conversation.`,
    "hallvi",
  );
  // Chat administration is visible in the chat list; it is not an application
  // event.
  return chat;
}

export function archiveChat(applicationId: string, chatId: string) {
  const { application, chat } = loadChat(applicationId, chatId);
  assertChatWritable(chat);
  if (listApplicationChats(application.id)[0]?.id === chatId)
    throw new Error("The main operator conversation cannot be archived.");
  archiveChatRecord(chat.id);
}
