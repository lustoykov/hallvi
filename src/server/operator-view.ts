import {
  listActiveDecisions,
  listActivity,
  listApplications,
  listChatSummaries,
  listMessages,
  listObservations,
  listWorkspaces,
} from "./db";
import {
  currentPhaseOneChecks,
  currentRepositoryEvidence,
} from "./phase-one-evidence";
import {
  deriveUpcomingRequirements,
  observationMatchesConnection,
  PHASE_ONE_CHECKS,
} from "./phase-one-spec";
import { contractGapReport } from "./application-contract";
import {
  contractView,
  inspectionSummary,
  repositoryEvidence,
  type RepositoryEvidence,
} from "./phase-two";
import { computePhaseTwoChecks } from "./phase-two-spec";
import type {
  ApplicationContractView,
  ApplicationRecord,
  ApplicationStatus,
  GateCheck,
  LaunchBriefEvidence,
  OperatorView,
  PhaseKey,
  PhaseWorkspaceRecord,
  PhaseWorkspaceView,
} from "./types";
import { APPROVAL_MODES } from "./types";
import {
  loadApplication,
  loadChat,
  NotFoundError,
  phaseDefinition,
} from "./workspaces";

/**
 * A completed workspace shows its retained deliverable evidence, as recorded
 * at completion, not a live re-evaluation. Later changes to the underlying
 * sources appear in the current phase's checks instead.
 */
function retainedChecks(workspace: PhaseWorkspaceRecord): GateCheck[] {
  const evidence =
    workspace.deliverableEvidence as Partial<LaunchBriefEvidence> | null;
  const definitions = PHASE_ONE_CHECKS as readonly {
    key: string;
    label: string;
    definition: string;
  }[];
  return (evidence?.checks ?? []).map((check) => ({
    ...check,
    definition:
      definitions.find((item) => item.key === check.key)?.definition ??
      "Recorded when the phase completed.",
    rerun: null,
  }));
}

export interface PhaseEvaluation {
  checks: GateCheck[];
  evidence: RepositoryEvidence | null;
  contract: ApplicationContractView | null;
}

/** The viewed workspace's checks and, for Inspect app, its evidence. */
export function evaluatePhase(
  application: ApplicationRecord,
  workspace: PhaseWorkspaceRecord,
): PhaseEvaluation {
  if (workspace.completedAt)
    return {
      checks: retainedChecks(workspace),
      evidence: null,
      contract: null,
    };
  if (workspace.phaseKey === "start")
    return {
      checks: currentPhaseOneChecks(application),
      evidence: null,
      contract: null,
    };
  const evidence = repositoryEvidence(application.id);
  const contract = contractView(application.id, evidence);
  return {
    checks: computePhaseTwoChecks({
      inspection: evidence.inspection,
      inspectionCurrent: evidence.current,
      githubConnected: Boolean(evidence.connectionId),
      resolution: evidence.resolution,
      contract,
    }),
    evidence,
    contract,
  };
}

function workspaceView(
  workspace: PhaseWorkspaceRecord,
  checks: GateCheck[],
  current: boolean,
): PhaseWorkspaceView {
  const phase = phaseDefinition(workspace.phaseKey);
  return {
    ...workspace,
    phaseNumber: phase.number,
    name: phase.name,
    deliverable: phase.deliverable,
    status: workspace.completedAt
      ? "completed"
      : checks.every((check) => check.status === "passed")
        ? "ready"
        : "in-progress",
    current,
  };
}

function workspaceViews(
  application: ApplicationRecord,
  workspaces: PhaseWorkspaceRecord[],
  current: PhaseWorkspaceRecord,
  evaluated: { workspace: PhaseWorkspaceRecord; checks: GateCheck[] },
) {
  return workspaces.map((workspace) =>
    workspaceView(
      workspace,
      workspace.id === evaluated.workspace.id
        ? evaluated.checks
        : evaluatePhase(application, workspace).checks,
      workspace.id === current.id,
    ),
  );
}

/**
 * The Operator View for one application, projected from durable records.
 * The selected chat decides which phase is viewed; without one, the current
 * phase's primary chat is shown. `phaseKey` selects a phase's primary chat.
 */
export function getOperatorView(
  applicationId: string,
  chatId?: string,
  phaseKey?: PhaseKey,
): OperatorView {
  const { application, workspaces, current } = loadApplication(applicationId);
  let workspace = current;
  if (chatId) {
    const loaded = loadChat(applicationId, chatId);
    workspace = loaded.workspace;
  } else if (phaseKey) {
    const requested = workspaces.find((item) => item.phaseKey === phaseKey);
    if (!requested) throw new NotFoundError("Phase not found.");
    workspace = requested;
  }
  const chats = listChatSummaries(workspace.id);
  const selected =
    (chatId ? chats.find((chat) => chat.id === chatId) : null) ??
    chats.find((chat) => !chat.archivedAt && chat.isPrimary) ??
    chats.find((chat) => !chat.archivedAt) ??
    chats[0] ??
    null;
  const evaluation = evaluatePhase(application, workspace);
  const views = workspaceViews(application, workspaces, current, {
    workspace,
    checks: evaluation.checks,
  });
  return {
    application,
    workspace: views.find((item) => item.id === workspace.id) ?? null,
    workspaces: views,
    chats,
    selectedChatId: selected?.id ?? null,
    messages: selected ? listMessages(selected.id) : [],
    checks: evaluation.checks,
    decisions: listActiveDecisions(application.id),
    observations: listObservations(application.id),
    upcomingRequirements: deriveUpcomingRequirements(),
    activity: listActivity(workspace.id),
    inspection: evaluation.evidence
      ? inspectionSummary(evaluation.evidence)
      : null,
    contract: evaluation.contract,
  };
}

/** Retained name from the Phase 1 build. */
export const getPhaseOneOperatorView = getOperatorView;

export function listApplicationSummaries() {
  return listApplications().map((application) => {
    const workspaces = listWorkspaces(application.id);
    const current = workspaces.at(-1)!;
    const { checks } = evaluatePhase(application, current);
    return {
      application,
      workspace: workspaceView(current, checks, true),
      passedChecks: checks.filter((check) => check.status === "passed").length,
      totalChecks: checks.length,
    };
  });
}

/**
 * The read-only projection behind Pi's `get_application_status`. The worker
 * binds the application and Chat from the accepted Run, and the Chat must
 * still belong to that application. It reads the same current records and
 * gate evaluation as the Operator View for the Chat's phase, so an older
 * passing Observation never stands in for the latest failed or invalidated
 * result, and it returns only public check text and the evidence that
 * supports each current check: no credentials, raw provider payloads,
 * transcripts, Activity or Decisions. Reading is not rechecking;
 * `retrievedAt` is when these records were read.
 */
export function getApplicationStatus(
  applicationId: string,
  chatId: string,
): ApplicationStatus {
  const { application, workspace, current } = loadChat(applicationId, chatId);
  const evaluation = evaluatePhase(application, workspace);
  const view = workspaceView(workspace, evaluation.checks, current);
  const inspectionCurrent = evaluation.evidence?.current ?? false;
  const status: ApplicationStatus = {
    retrievedAt: new Date().toISOString(),
    application: {
      id: application.id,
      name: application.name,
      repositoryUrl: application.repositoryUrl,
      environment: application.environment,
      approvalMode: {
        key: application.approvalMode,
        label: APPROVAL_MODES[application.approvalMode].label,
      },
      updatedAt: application.updatedAt,
    },
    workspace: {
      phaseKey: view.phaseKey,
      phaseNumber: view.phaseNumber,
      deliverable: view.deliverable,
      status: view.status,
    },
    checks: evaluation.checks.map((check) => ({
      key: check.key,
      label: check.label,
      status: check.status,
      result: check.result,
      // The Operator View keeps an invalidated Observation inspectable as
      // history; the model must not receive it as support for current access.
      evidence: check.evidence
        .filter(
          (evidence) =>
            evidence.recordType !== "observation" ||
            (workspace.phaseKey === "start"
              ? phaseOneRepositoryCurrent(application)
              : inspectionCurrent) ||
            workspace.completedAt !== null,
        )
        .map(({ recordType, recordId, label, href, observedAt }) => ({
          recordType,
          recordId,
          label,
          href,
          observedAt,
        })),
    })),
    upcomingRequirements: deriveUpcomingRequirements().map(
      ({ key, label, requiredBeforePhase, resolutionPath }) => ({
        key,
        label,
        requiredBeforePhase,
        resolutionPath,
      }),
    ),
  };
  if (workspace.phaseKey === "inspect-app") {
    const evidence = evaluation.evidence!;
    status.inspection = evidence.inspection
      ? {
          observationId: evidence.inspection.id,
          status: evidence.inspection.status,
          commitSha: evidence.commitSha,
          observedAt: evidence.inspection.observedAt,
          current: evidence.current,
          profile: {
            status: evidence.resolution.status,
            profileId: evidence.resolution.profileId,
            profileVersion: evidence.resolution.profileVersion,
          },
        }
      : null;
    const contract = evaluation.contract;
    if (contract) {
      const gaps = contractGapReport(contract.body);
      status.contract = {
        id: contract.id,
        version: contract.version,
        commitSha: contract.commitSha,
        profileId: contract.profileId,
        profileVersion: contract.profileVersion,
        fieldCount: contract.body.fields.length,
        blockers: gaps.blockers.length,
        conformanceItems: gaps.conformance.length,
        policyItems: gaps.policies.length,
        createdAt: contract.createdAt,
      };
    } else status.contract = null;
  }
  return status;
}

// A repository Observation supports a current Phase 1 check only when it was
// made with the current GitHub connection: the same predicate the gate uses.
function phaseOneRepositoryCurrent(application: ApplicationRecord) {
  const { repository, connectionId } = currentRepositoryEvidence(application);
  return observationMatchesConnection(repository, connectionId);
}
