import {
  archiveChat as archiveChatRecord,
  getApplication,
  getApplicationByRepository,
  getChat,
  getDecision,
  getLatestApplication,
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
  listChats,
  listMessages,
  listObservations,
  supersedeDecision,
  withTransaction,
} from "./db";
import { inspectGithubRepository, parseGithubRepository } from "./github";
import {
  APPROVAL_MODE_LABELS,
  PHASE_ONE,
  computeChecks,
  deriveUpcomingRequirements,
} from "./phase-one-spec";
import { askPi } from "./pi";
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
  if (!application || !workspace) throw new NotFoundError("Application not found.");
  return { application, workspace };
}

function loadChat(applicationId: string, chatId: string) {
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
    status: checks.every((check) => check.status === "passed") ? "ready" : "in-progress",
  };
}

export async function createPhaseOneApplication(input: CreateApplicationInput) {
  if (input.environment !== "production") {
    throw new Error("Phase 1 currently supports the production launch environment only.");
  }
  if (!Object.hasOwn(APPROVAL_MODE_LABELS, input.approvalMode)) {
    throw new Error("Choose a valid permission policy.");
  }
  const repository = parseGithubRepository(input.repositoryUrl);
  const existing = getApplicationByRepository(repository.canonicalUrl);
  if (existing) {
    if (existing.approvalMode !== input.approvalMode) {
      throw new ExistingApplicationConflictError(
        `An application already exists for this repository with ${APPROVAL_MODE_LABELS[existing.approvalMode]}. Open it instead of replacing its permission policy.`,
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
      `Recorded ${repository.canonicalUrl} as a production launch with ${APPROVAL_MODE_LABELS[input.approvalMode]}.`,
    );
    return application;
  });

  await observeRepository(application.id);
  return { view: getPhaseOneOperatorView(application.id), created: true };
}

export async function observeRepository(applicationId: string) {
  const { application, workspace } = loadWorkspace(applicationId);
  const result = await inspectGithubRepository({
    owner: application.repositoryOwner,
    name: application.repositoryName,
    canonicalUrl: application.repositoryUrl,
  });

  const observation = insertObservation({
    applicationId: application.id,
    kind: REPOSITORY_OBSERVATION,
    status: result.status,
    summary: result.summary,
    sourceLabel: result.status === "passed" ? "GitHub commit" : "GitHub repository check",
    sourceUrl: result.sourceUrl,
    raw: result.raw,
  });
  insertActivity(
    workspace.id,
    result.status === "passed" ? "repository-observed" : "repository-unavailable",
    result.status === "passed" ? "Repository identity recorded" : "Repository check did not pass",
    observation.summary,
  );
  return observation;
}

export function getPhaseOneOperatorView(
  applicationId?: string,
  chatId?: string,
): PhaseOneOperatorView {
  const application = applicationId ? getApplication(applicationId) : getLatestApplication();
  const workspace = application ? getWorkspace(application.id) : null;
  if (!application || !workspace) {
    return {
      application: null,
      workspace: null,
      chats: [],
      selectedChatId: null,
      messages: [],
      checks: [],
      decisions: [],
      observations: [],
      upcomingRequirements: deriveUpcomingRequirements(),
      activity: [],
    };
  }

  const checks = currentChecks(application);
  const chats = listChats(workspace.id);
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
  const chat = insertChat(workspace.id, title?.trim() || `Launch question ${chatNumber}`);
  insertMessage(
    chat.id,
    "assistant",
    "This is a separate Chat for the same Launch Brief. I can see the shared Operator View and checks, but this transcript starts fresh.",
    "server-guy",
  );
  insertActivity(workspace.id, "chat-created", "Chat created", chat.title);
  return getPhaseOneOperatorView(application.id, chat.id);
}

export function archiveChat(applicationId: string, chatId: string) {
  const { application, workspace, chat } = loadChat(applicationId, chatId);
  if (chat.isPrimary) throw new Error("The main Launch Brief Chat stays with Phase 1.");
  archiveChatRecord(chat.id);
  insertActivity(workspace.id, "chat-archived", "Chat archived", chat.title);
  return getPhaseOneOperatorView(application.id);
}

function decisionLabel(decision: PiDecision) {
  return { "launch-priority": "Additional launch priority" }[decision.kind];
}

function buildViewSummary(application: ApplicationRecord) {
  const checks = currentChecks(application);
  const upcoming = deriveUpcomingRequirements();
  return [
    `Application: ${application.name}`,
    `Repository: ${application.repositoryUrl}`,
    "Environment: Production",
    `Permission policy: ${APPROVAL_MODE_LABELS[application.approvalMode]}`,
    `Checks: ${checks.map((check) => `${check.label}=${check.status}`).join("; ")}`,
    `Upcoming requirements: ${upcoming
      .map((requirement) => `${requirement.label} before Phase ${requirement.requiredBeforePhase}`)
      .join("; ")}`,
  ].join("\n");
}

export async function sendChatMessage(applicationId: string, chatId: string, body: string) {
  const { application, workspace, chat } = loadChat(applicationId, chatId);
  if (chat.archivedAt) throw new Error("This Chat is archived.");
  const userMessage = body.trim();
  if (!userMessage) throw new Error("Write a message first.");
  if (userMessage.length > 5_000) throw new Error("Keep this message under 5,000 characters.");

  const decisions = listActiveDecisions(application.id);
  const reply = await askPi({
    userMessage,
    messages: listMessages(chat.id),
    decisions,
    viewSummary: buildViewSummary(application),
  });

  withTransaction(() => {
    const sourceMessage = insertMessage(chat.id, "user", userMessage, "user");
    insertMessage(chat.id, "assistant", reply.message, "pi");

    for (const proposed of reply.decisions) {
      const previous = proposed.replaces ? getDecision(proposed.replaces) : null;
      if (
        proposed.replaces &&
        (!previous ||
          previous.applicationId !== application.id ||
          previous.supersededById !== null)
      ) {
        throw new Error(
          "Pi referenced a Decision that is missing, already replaced, or belongs to another application.",
        );
      }

      const decision = insertDecision({
        applicationId: application.id,
        sourceMessageId: sourceMessage.id,
        kind: proposed.kind,
        label: decisionLabel(proposed),
        value: proposed.value,
      });

      if (previous) {
        supersedeDecision(application.id, previous.id, decision.id);
        insertActivity(
          workspace.id,
          "decision-revised",
          "Decision revised from Chat",
          `${previous.value} → ${decision.value}`,
        );
      } else {
        insertActivity(
          workspace.id,
          "decision-recorded",
          "Decision recorded from Chat",
          `${decision.label}: ${decision.value}`,
        );
      }
    }
  });

  return getPhaseOneOperatorView(application.id, chat.id);
}
