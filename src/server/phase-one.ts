import {
  getApplication,
  getApplicationByRepository,
  getLatestApplication,
  getObservation,
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
  updateApplicationStatus,
  updateWorkspaceStatus,
  upsertBlocker,
  withTransaction,
} from "./db";
import { inspectGithubRepository, parseGithubRepository } from "./github";
import { askPi } from "./pi";
import {
  APPROVAL_MODE_LABELS,
  PHASE_ONE_CHECKS,
  PREREQUISITES,
  PRODUCTION_BASELINE,
} from "./phase-one-spec";
import type {
  CreateApplicationInput,
  GateCheck,
  PhaseOneOperatorView,
  PiDecision,
} from "./types";

export class ExistingApplicationConflictError extends Error {}

function normalizeCreateInput(input: CreateApplicationInput): CreateApplicationInput {
  if (input.environment !== "production") {
    throw new Error("Phase 1 currently supports the production launch environment only.");
  }
  if (!["pi-decides", "always-ask", "full-autonomy"].includes(input.approvalMode)) {
    throw new Error("Choose a valid permission policy.");
  }
  return input;
}

export async function createPhaseOneApplication(rawInput: CreateApplicationInput) {
  const input = normalizeCreateInput(rawInput);
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
      slug: `${repository.owner}-${repository.name}`.toLowerCase(),
      repositoryUrl: repository.canonicalUrl,
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      environment: "production",
      approvalMode: input.approvalMode,
      approvalScope: "Current application launch",
      status: "phase-1",
    });
    const workspace = insertWorkspace(application.id);
    const session = insertOperatorSession(workspace.id, "Launch Brief", true);

    for (const prerequisite of PREREQUISITES) {
      upsertBlocker({
        workspaceId: workspace.id,
        ...prerequisite,
        status: "open",
      });
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
  const application = getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  const workspace = getWorkspace(application.id);
  if (!workspace) throw new Error("Phase 1 workspace not found.");

  const result = await inspectGithubRepository({
    owner: application.repositoryOwner,
    name: application.repositoryName,
    canonicalUrl: application.repositoryUrl,
  });

  const observation = insertObservation({
    applicationId: application.id,
    workspaceId: workspace.id,
    kind: "github-repository-identity",
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

  insertObservation({
    applicationId: application.id,
    workspaceId: workspace.id,
    kind: "authority-context",
    status: "passed",
    summary:
      result.status === "passed"
        ? "GitHub repository access is recorded. Hetzner and Cloudflare are not configured yet."
        : "GitHub repository access is not currently available. Hetzner and Cloudflare are not configured yet.",
    sourceLabel: "Server Guy authority snapshot",
    sourceUrl: null,
    raw: {
      approvalMode: application.approvalMode,
      approvalScope: application.approvalScope,
      github: {
        status: result.status,
        repository: result.raw.repository,
        authenticatedAs: result.raw.authenticatedAs ?? null,
        permissions: result.raw.permissions ?? null,
      },
      hetzner: "not-configured",
      cloudflare: "not-configured",
    },
  });
  refreshCompletion(application.id);
  return observation;
}

function computeChecks(applicationId: string): GateCheck[] {
  const application = getApplication(applicationId);
  if (!application) return [];
  const workspace = getWorkspace(application.id);
  if (!workspace) return [];
  const repository = latestObservation(workspace.id, "github-repository-identity");
  const authority = latestObservation(workspace.id, "authority-context");
  const blockers = listBlockers(workspace.id);
  const prerequisitesRecorded = PREREQUISITES.every(({ key }) => blockers.some((item) => item.key === key));

  const intentSources = [
    application.createdAt,
    ...PREREQUISITES.map(({ key }) => blockers.find((blocker) => blocker.key === key)?.createdAt ?? null),
  ].filter((value): value is string => Boolean(value));
  const intentRecordedAt = intentSources.sort().at(-1) ?? null;
  const values = {
    "application-identity": {
      status: "passed",
      result: `${application.name} · ${application.repositoryOwner}/${application.repositoryName} · Production`,
      sourceLabel: "Application record",
      sourceUrl: `/api/applications/${application.id}`,
      observationId: null,
      observedAt: application.createdAt,
      canRerun: false,
    },
    "repository-readable": {
      status: repository?.status === "passed" ? "passed" : repository ? "blocked" : "not-yet",
      result: repository?.summary ?? "The repository has not been checked yet.",
      sourceLabel: repository?.sourceLabel ?? "GitHub",
      sourceUrl: repository?.sourceUrl ?? application.repositoryUrl,
      observationId: repository?.id ?? null,
      observedAt: repository?.observedAt ?? null,
      canRerun: true,
    },
    "target-environment": {
      status: "passed",
      result: "Production",
      sourceLabel: "Application record",
      sourceUrl: `/api/applications/${application.id}`,
      observationId: null,
      observedAt: application.createdAt,
      canRerun: false,
    },
    "approval-authority": {
      status: authority ? "passed" : "not-yet",
      result:
        authority
          ? `${APPROVAL_MODE_LABELS[application.approvalMode]} · ${application.approvalScope}. ${authority.summary}`
          : "Choose how Pi should ask for permission and record the access currently available.",
      sourceLabel: "Application permission policy",
      sourceUrl: `/api/applications/${application.id}`,
      observationId: authority?.id ?? null,
      observedAt: authority?.observedAt ?? application.createdAt,
      canRerun: false,
    },
    "intent-prerequisites": {
      status: prerequisitesRecorded ? "passed" : "not-yet",
      result:
        prerequisitesRecorded
          ? `${PRODUCTION_BASELINE.map(({ label }) => label).join(", ")}. ${PREREQUISITES.length} later prerequisites are recorded with owners and resolution paths.`
          : "The production baseline or later prerequisites are incomplete.",
      sourceLabel: "Launch record",
      sourceUrl: `/api/applications/${application.id}`,
      observationId: null,
      observedAt: intentRecordedAt,
      canRerun: false,
    },
  } satisfies Record<
    (typeof PHASE_ONE_CHECKS)[number]["key"],
    Omit<GateCheck, "key" | "label" | "definition">
  >;

  return PHASE_ONE_CHECKS.map((check) => ({ ...check, ...values[check.key] }));
}

function refreshCompletion(applicationId: string) {
  const workspace = getWorkspace(applicationId);
  if (!workspace) return;
  const complete = computeChecks(applicationId).every((check) => check.status === "passed");
  updateWorkspaceStatus(workspace.id, complete ? "ready" : "in-progress");
  updateApplicationStatus(applicationId, complete ? "phase-1-ready" : "phase-1");
}

export function getPhaseOneOperatorView(
  applicationId?: string,
  sessionId?: string,
): PhaseOneOperatorView {
  const application = applicationId ? getApplication(applicationId) : getLatestApplication();
  if (!application) {
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
      changes: [],
    };
  }

  const workspace = getWorkspace(application.id);
  if (!workspace) throw new Error("Phase 1 workspace not found.");
  const sessions = listOperatorSessions(workspace.id);
  const requested = sessionId ? sessions.find((session) => session.id === sessionId) : null;
  const active =
    requested ??
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
    checks: computeChecks(application.id),
    decisions: listDecisions(workspace.id),
    observations: listObservations(workspace.id),
    blockers: listBlockers(workspace.id),
    activity: listActivity(workspace.id),
    changes: [],
  };
}

export function createOperatorSession(applicationId: string, title?: string) {
  const application = getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  const workspace = getWorkspace(application.id);
  if (!workspace) throw new Error("Phase 1 workspace not found.");
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
  const application = getApplication(applicationId);
  const session = getOperatorSession(sessionId);
  const workspace = application ? getWorkspace(application.id) : null;
  if (!application || !session || !workspace || session.workspaceId !== workspace.id) {
    throw new Error("Operator Session not found.");
  }
  if (session.isPrimary) throw new Error("The main Launch Brief chat stays with Phase 1.");
  resolveOperatorSession(session.id);
  insertActivity(workspace.id, "operator-session-archived", "Operator Session archived", session.title);
  return getPhaseOneOperatorView(application.id);
}

function decisionLabel(decision: PiDecision) {
  return { "launch-priority": "Additional launch priority" }[decision.kind];
}

export async function sendOperatorMessage(applicationId: string, sessionId: string, body: string) {
  const application = getApplication(applicationId);
  const workspace = application ? getWorkspace(application.id) : null;
  const session = getOperatorSession(sessionId);
  if (!application || !workspace || !session || session.workspaceId !== workspace.id) {
    throw new Error("Operator Session not found.");
  }
  if (session.status !== "active") throw new Error("This chat is archived.");
  const userMessage = body.trim();
  if (!userMessage) throw new Error("Write a message first.");
  if (userMessage.length > 5_000) throw new Error("Keep this message under 5,000 characters.");

  const priorMessages = listMessages(session.id);
  const checks = computeChecks(application.id);
  const recordSummary = [
    `Application: ${application.name}`,
    `Repository: ${application.repositoryUrl}`,
    `Environment: Production`,
    `Permission policy: ${APPROVAL_MODE_LABELS[application.approvalMode]}`,
    `Checks: ${checks.map((check) => `${check.label}=${check.status}`).join("; ")}`,
    `Known later blockers: ${listBlockers(workspace.id)
      .filter((blocker) => blocker.status === "open")
      .map((blocker) => `${blocker.label} before Phase ${blocker.requiredBeforePhase}`)
      .join("; ")}`,
  ].join("\n");

  const reply = await askPi({
    userMessage,
    messages: priorMessages,
    decisions: listDecisions(workspace.id),
    recordSummary,
  });
  withTransaction(() => {
    insertMessage(session.id, "user", userMessage, "user");
    insertMessage(session.id, "assistant", reply.message, "pi");
    for (const decision of reply.decisions) {
      const input = {
        workspaceId: workspace.id,
        operatorSessionId: session.id,
        kind: decision.kind,
        label: decisionLabel(decision),
        value: decision.value,
      };
      insertDecision(input);
      insertActivity(
        workspace.id,
        "decision-recorded",
        "Decision recorded from Operator Session",
        `${decisionLabel(decision)}: ${decision.value}`,
      );
    }
  });

  refreshCompletion(application.id);
  return getPhaseOneOperatorView(application.id, session.id);
}

export function getObservationForApplication(applicationId: string, observationId: string) {
  const observation = getObservation(observationId);
  if (!observation || observation.applicationId !== applicationId) {
    throw new Error("Observation not found.");
  }
  return observation;
}
