import {
  getApplication,
  getApplicationByRepository,
  getLatestApplication,
  getOperatorSession,
  getWorkspace,
  insertActivity,
  insertApplication,
  insertDecision,
  insertMessage,
  insertObservation,
  insertOperatorSession,
  insertWorkspace,
  latestObservation,
  listActivity,
  listBlockers,
  listDecisions,
  listMessages,
  listObservations,
  listOperatorSessions,
  resolveOperatorSession,
  updateWorkspaceStatus,
  upsertBlocker,
  withTransaction,
} from "./db";
import { inspectGithubRepository, parseGithubRepository } from "./github";
import { APPROVAL_MODE_LABELS, PREREQUISITES, computeChecks } from "./phase-one-spec";
import { askPi } from "./pi";
import type {
  ApplicationRecord,
  CreateApplicationInput,
  PhaseOneOperatorView,
  PhaseWorkspace,
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

function loadSession(applicationId: string, sessionId: string) {
  const { application, workspace } = loadWorkspace(applicationId);
  const session = getOperatorSession(sessionId);
  if (!session || session.workspaceId !== workspace.id) {
    throw new NotFoundError("Operator Session not found.");
  }
  return { application, workspace, session };
}

function currentChecks(application: ApplicationRecord, workspace: PhaseWorkspace) {
  return computeChecks(
    application,
    latestObservation(workspace.id, REPOSITORY_OBSERVATION),
    listBlockers(workspace.id),
  );
}

function refreshCompletion(application: ApplicationRecord, workspace: PhaseWorkspace) {
  const complete = currentChecks(application, workspace).every((check) => check.status === "passed");
  updateWorkspaceStatus(workspace.id, complete ? "ready" : "in-progress");
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
        `A launch workspace already exists for this repository with ${APPROVAL_MODE_LABELS[existing.approvalMode]}. Open that workspace instead of replacing its permission policy.`,
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
    const session = insertOperatorSession(workspace.id, "Launch Brief", true);

    for (const prerequisite of PREREQUISITES) {
      upsertBlocker({ workspaceId: workspace.id, ...prerequisite, status: "open" });
    }

    insertMessage(
      session.id,
      "assistant",
      `I created the ${repository.name} launch workspace. I’m checking the exact GitHub repository identity now. No code, infrastructure, domain, or paid resource has been changed.`,
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
    workspaceId: workspace.id,
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
  refreshCompletion(application, workspace);
  return observation;
}

export function getPhaseOneOperatorView(
  applicationId?: string,
  sessionId?: string,
): PhaseOneOperatorView {
  const application = applicationId ? getApplication(applicationId) : getLatestApplication();
  const workspace = application ? getWorkspace(application.id) : null;
  if (!application || !workspace) {
    return {
      application: null,
      workspace: null,
      sessions: [],
      activeSessionId: null,
      messages: [],
      checks: [],
      decisions: [],
      observations: [],
      blockers: [],
      activity: [],
    };
  }

  const sessions = listOperatorSessions(workspace.id);
  const active =
    (sessionId ? sessions.find((session) => session.id === sessionId) : null) ??
    sessions.find((session) => session.status === "active" && session.isPrimary) ??
    sessions.find((session) => session.status === "active") ??
    sessions[0] ??
    null;

  return {
    application,
    workspace,
    sessions,
    activeSessionId: active?.id ?? null,
    messages: active ? listMessages(active.id) : [],
    checks: currentChecks(application, workspace),
    decisions: listDecisions(workspace.id),
    observations: listObservations(workspace.id),
    blockers: listBlockers(workspace.id),
    activity: listActivity(workspace.id),
  };
}

export function createOperatorSession(applicationId: string, title?: string) {
  const { application, workspace } = loadWorkspace(applicationId);
  const sessionNumber = listOperatorSessions(workspace.id).length + 1;
  const session = insertOperatorSession(
    workspace.id,
    title?.trim() || `Launch question ${sessionNumber}`,
  );
  insertMessage(
    session.id,
    "assistant",
    "This is a separate conversation for the same Launch Brief. I can see the shared record and checks, but this transcript starts fresh.",
    "server-guy",
  );
  insertActivity(workspace.id, "operator-session-created", "Operator Session created", session.title);
  return getPhaseOneOperatorView(application.id, session.id);
}

export function archiveOperatorSession(applicationId: string, sessionId: string) {
  const { application, workspace, session } = loadSession(applicationId, sessionId);
  if (session.isPrimary) throw new Error("The main Launch Brief chat stays with Phase 1.");
  resolveOperatorSession(session.id);
  insertActivity(workspace.id, "operator-session-archived", "Operator Session archived", session.title);
  return getPhaseOneOperatorView(application.id);
}

function decisionLabel(decision: PiDecision) {
  return { "launch-priority": "Additional launch priority" }[decision.kind];
}

export async function sendOperatorMessage(applicationId: string, sessionId: string, body: string) {
  const { application, workspace, session } = loadSession(applicationId, sessionId);
  if (session.status !== "active") throw new Error("This chat is archived.");
  const userMessage = body.trim();
  if (!userMessage) throw new Error("Write a message first.");
  if (userMessage.length > 5_000) throw new Error("Keep this message under 5,000 characters.");

  const openBlockers = listBlockers(workspace.id).filter((blocker) => blocker.status === "open");
  const recordSummary = [
    `Application: ${application.name}`,
    `Repository: ${application.repositoryUrl}`,
    "Environment: Production",
    `Permission policy: ${APPROVAL_MODE_LABELS[application.approvalMode]}`,
    `Checks: ${currentChecks(application, workspace)
      .map((check) => `${check.label}=${check.status}`)
      .join("; ")}`,
    `Known later blockers: ${openBlockers
      .map((blocker) => `${blocker.label} before Phase ${blocker.requiredBeforePhase}`)
      .join("; ")}`,
  ].join("\n");

  const reply = await askPi({
    userMessage,
    messages: listMessages(session.id),
    decisions: listDecisions(workspace.id),
    recordSummary,
  });

  withTransaction(() => {
    insertMessage(session.id, "user", userMessage, "user");
    insertMessage(session.id, "assistant", reply.message, "pi");
    for (const decision of reply.decisions) {
      insertDecision({
        workspaceId: workspace.id,
        operatorSessionId: session.id,
        kind: decision.kind,
        label: decisionLabel(decision),
        value: decision.value,
      });
      insertActivity(
        workspace.id,
        "decision-recorded",
        "Decision recorded from Operator Session",
        `${decisionLabel(decision)}: ${decision.value}`,
      );
    }
  });

  return getPhaseOneOperatorView(application.id, session.id);
}
