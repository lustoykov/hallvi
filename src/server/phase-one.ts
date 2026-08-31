import {
  getApplication,
  getApplicationByRepository,
  getLatestApplication,
  getObservation,
  getSession,
  getWorkspace,
  insertActivity,
  insertApplication,
  insertMessage,
  insertObservation,
  insertSession,
  insertWorkspace,
  latestObservation,
  listActivity,
  listBlockers,
  listDecisions,
  listMessages,
  listObservations,
  listSessions,
  resolveBlocker,
  resolveSession,
  updateApplicationStatus,
  updateApprovalMode,
  updateWorkspaceStatus,
  upsertBlocker,
  upsertDecision,
  withTransaction,
} from "./db";
import { inspectGithubRepository, parseGithubRepository } from "./github";
import { askPi } from "./pi";
import {
  APPROVAL_MODE_LABELS,
  PHASE_ONE_CHECKS,
  PREREQUISITES,
  PRODUCT_DEFAULTS,
} from "./phase-one-spec";
import type {
  ApprovalMode,
  CreateApplicationInput,
  GateCheck,
  PhaseOneView,
  PiDecision,
} from "./types";

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
  if (existing) return getPhaseOneView(existing.id);

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
    const session = insertSession(workspace.id, "Launch Brief", true);

    upsertDecision({
      workspaceId: workspace.id,
      sessionId: session.id,
      key: "target_environment",
      label: "Target environment",
      value: "Production",
      source: "launch-form",
    });
    upsertDecision({
      workspaceId: workspace.id,
      sessionId: session.id,
      key: "approval_mode",
      label: "Permission policy",
      value: APPROVAL_MODE_LABELS[input.approvalMode],
      source: "launch-form",
    });
    upsertDecision({
      workspaceId: workspace.id,
      sessionId: session.id,
      key: "approval_scope",
      label: "Permission scope",
      value: "Current application launch",
      source: "launch-form",
    });

    for (const [key, label, value] of PRODUCT_DEFAULTS) {
      upsertDecision({
        workspaceId: workspace.id,
        key,
        label,
        value,
        source: "product-default",
      });
    }

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
  refreshCompletion(application.id);
  return getPhaseOneView(application.id);
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
    status: result.ok ? "passed" : "failed",
    summary: result.summary,
    sourceLabel: result.ok ? "GitHub commit" : "GitHub repository",
    sourceUrl: result.sourceUrl,
    raw: result.raw,
  });
  insertActivity(
    workspace.id,
    result.ok ? "repository-observed" : "repository-unavailable",
    result.ok ? "Repository identity recorded" : "Repository check failed",
    observation.summary,
  );
  refreshCompletion(application.id);
  return observation;
}

function computeChecks(applicationId: string): GateCheck[] {
  const application = getApplication(applicationId);
  if (!application) return [];
  const workspace = getWorkspace(application.id);
  if (!workspace) return [];
  const decisions = listDecisions(workspace.id);
  const decisionByKey = new Map(decisions.map((decision) => [decision.key, decision]));
  const repository = latestObservation(workspace.id, "github-repository-identity");
  const blockers = listBlockers(workspace.id);
  const prioritiesRecorded = PRODUCT_DEFAULTS.every(([key]) => decisionByKey.has(key));
  const prerequisitesRecorded = PREREQUISITES.every(({ key }) => blockers.some((item) => item.key === key));

  const values: Record<string, Omit<GateCheck, "key" | "label" | "definition">> = {
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
      status: decisionByKey.has("target_environment") ? "passed" : "not-yet",
      result: decisionByKey.get("target_environment")?.value ?? "Choose a target environment.",
      sourceLabel: "Launch decision",
      sourceUrl: decisionByKey.get("target_environment")
        ? `/api/decisions/${decisionByKey.get("target_environment")!.id}`
        : null,
      observationId: null,
      observedAt: decisionByKey.get("target_environment")?.updatedAt ?? null,
      canRerun: false,
    },
    "approval-authority": {
      status:
        decisionByKey.has("approval_mode") && decisionByKey.has("approval_scope")
          ? "passed"
          : "not-yet",
      result:
        decisionByKey.has("approval_mode") && decisionByKey.has("approval_scope")
          ? `${decisionByKey.get("approval_mode")!.value} · ${decisionByKey.get("approval_scope")!.value}`
          : "Choose how Pi should ask for permission.",
      sourceLabel: "Permission decision",
      sourceUrl: decisionByKey.get("approval_mode")
        ? `/api/decisions/${decisionByKey.get("approval_mode")!.id}`
        : null,
      observationId: null,
      observedAt: decisionByKey.get("approval_mode")?.updatedAt ?? null,
      canRerun: false,
    },
    "intent-prerequisites": {
      status: prioritiesRecorded && prerequisitesRecorded ? "passed" : "not-yet",
      result:
        prioritiesRecorded && prerequisitesRecorded
          ? "Database protection, low downtime, low cost, and three later prerequisites are recorded."
          : "Launch priorities or prerequisites are incomplete.",
      sourceLabel: "Launch record",
      sourceUrl: `/api/applications/${application.id}`,
      observationId: null,
      observedAt: workspace.updatedAt,
      canRerun: false,
    },
  };

  return PHASE_ONE_CHECKS.map((check) => ({ ...check, ...values[check.key] }));
}

function refreshCompletion(applicationId: string) {
  const workspace = getWorkspace(applicationId);
  if (!workspace) return;
  const complete = computeChecks(applicationId).every((check) => check.status === "passed");
  updateWorkspaceStatus(workspace.id, complete ? "ready" : "in-progress");
  updateApplicationStatus(applicationId, complete ? "phase-1-ready" : "phase-1");
}

export function getPhaseOneView(applicationId?: string, sessionId?: string): PhaseOneView {
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
  const sessions = listSessions(workspace.id);
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

export function createChat(applicationId: string, title?: string) {
  const application = getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  const workspace = getWorkspace(application.id);
  if (!workspace) throw new Error("Phase 1 workspace not found.");
  const chatNumber = listSessions(workspace.id).length + 1;
  const session = insertSession(workspace.id, title?.trim() || `Launch question ${chatNumber}`);
  insertMessage(
    session.id,
    "assistant",
    "This is a separate chat for the same Launch Brief. I can see the shared record and checks, but this transcript starts fresh.",
    "server-guy",
  );
  insertActivity(workspace.id, "chat-created", "Phase chat created", session.title);
  return getPhaseOneView(application.id, session.id);
}

export function archiveChat(applicationId: string, sessionId: string) {
  const application = getApplication(applicationId);
  const session = getSession(sessionId);
  const workspace = application ? getWorkspace(application.id) : null;
  if (!application || !session || !workspace || session.workspaceId !== workspace.id) {
    throw new Error("Chat not found.");
  }
  if (session.isPrimary) throw new Error("The main Launch Brief chat stays with Phase 1.");
  resolveSession(session.id);
  insertActivity(workspace.id, "chat-archived", "Phase chat archived", session.title);
  return getPhaseOneView(application.id);
}

function decisionLabel(decision: PiDecision) {
  return {
    approval_mode: "Permission policy",
    target_environment: "Target environment",
    launch_priority: "Additional launch priority",
    domain_starting_state: "Domain starting state",
  }[decision.key];
}

function displayDecisionValue(decision: PiDecision) {
  if (decision.key === "approval_mode") {
    return APPROVAL_MODE_LABELS[decision.value as ApprovalMode];
  }
  if (decision.key === "target_environment") return "Production";
  if (decision.key === "domain_starting_state") {
    return ({
      "already-owned": "Domain already owned",
      "needs-acquisition": "Domain needs acquisition",
      unknown: "Unknown",
    } as Record<string, string>)[decision.value] ?? decision.value;
  }
  return decision.value;
}

export async function sendChatMessage(applicationId: string, sessionId: string, body: string) {
  const application = getApplication(applicationId);
  const workspace = application ? getWorkspace(application.id) : null;
  const session = getSession(sessionId);
  if (!application || !workspace || !session || session.workspaceId !== workspace.id) {
    throw new Error("Chat not found.");
  }
  if (session.status !== "active") throw new Error("This chat is archived.");
  const userMessage = body.trim();
  if (!userMessage) throw new Error("Write a message first.");
  if (userMessage.length > 5_000) throw new Error("Keep this message under 5,000 characters.");

  const priorMessages = listMessages(session.id);
  insertMessage(session.id, "user", userMessage, "user");

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
  insertMessage(session.id, "assistant", reply.message, "pi");

  for (const decision of reply.decisions) {
    upsertDecision({
      workspaceId: workspace.id,
      sessionId: session.id,
      key: decision.key,
      label: decisionLabel(decision),
      value: displayDecisionValue(decision),
      source: "chat",
    });
    if (decision.key === "approval_mode") {
      updateApprovalMode(application.id, decision.value as ApprovalMode);
    }
    if (decision.key === "domain_starting_state" && decision.value !== "unknown") {
      resolveBlocker(workspace.id, "domain-starting-state");
    }
    insertActivity(
      workspace.id,
      "decision-recorded",
      "Decision recorded from chat",
      `${decisionLabel(decision)}: ${displayDecisionValue(decision)}`,
    );
  }

  refreshCompletion(application.id);
  return getPhaseOneView(application.id, session.id);
}

export function getObservationForApplication(applicationId: string, observationId: string) {
  const observation = getObservation(observationId);
  if (!observation || observation.applicationId !== applicationId) {
    throw new Error("Observation not found.");
  }
  return observation;
}
