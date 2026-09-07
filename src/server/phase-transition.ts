import {
  completeWorkspace,
  hasPendingRuns,
  insertActivity,
  insertChat,
  insertMessage,
  insertWorkspace,
  listChats,
  withTransaction,
} from "./db";
import { getOperatorView } from "./operator-view";
import {
  currentPhaseOneChecks,
  currentRepositoryEvidence,
} from "./phase-one-evidence";
import { PHASE_ONE, observationMatchesConnection } from "./phase-one-spec";
import {
  contractView,
  inspectRepository,
  repositoryEvidence,
} from "./phase-two";
import {
  computePhaseTwoChecks,
  PHASE_TWO,
  phaseTwoCheckListForPrompt,
} from "./phase-two-spec";
import { PHASE_THREE, phaseThreeCheckListForPrompt } from "./phase-three-spec";
import { contractGapReport } from "./application-contract";
import { enqueueServerGuyRequest } from "./pi-runs";
import type { InspectAppEvidence, LaunchBriefEvidence } from "./types";
import { loadApplication, primaryChatTitle } from "./workspaces";

export const INSPECTION_REQUEST =
  "Inspect the repository and propose the Application Contract.";

/**
 * The explicit Phase 1 → Phase 2 transition. One immediate transaction
 * re-evaluates the Launch Brief checks, refuses while any Run is pending,
 * completes the Phase 1 workspace with its evidence retained and creates the
 * Inspect app workspace with its primary Chat. Repeating the request after
 * that returns the current view; the unique phase constraint guarantees one
 * workspace. Inspection and the first Run follow outside the transaction.
 */
export async function completeLaunchBrief(applicationId: string) {
  const transition = withTransaction(() => {
    const { application, workspaces, current } = loadApplication(applicationId);
    const existing = workspaces.find(
      (workspace) => workspace.phaseKey === PHASE_TWO.key,
    );
    if (existing)
      return { application, workspace: existing, created: false as const };
    if (current.phaseKey !== PHASE_ONE.key || current.completedAt)
      throw new Error("The Launch Brief phase is not the current phase.");
    const checks = currentPhaseOneChecks(application);
    const unmet = checks.filter((check) => check.status !== "passed");
    if (unmet.length)
      throw new Error(
        `The Launch Brief is not ready: ${unmet
          .map((check) => check.label)
          .join(", ")}.`,
      );
    if (hasPendingRuns(application.id))
      throw new Error(
        "Wait for the current reply to finish or cancel it before continuing to Inspect app.",
      );
    const { repository, connectionId } = currentRepositoryEvidence(application);
    const repositoryCurrent = observationMatchesConnection(
      repository,
      connectionId,
    );
    const raw = repository?.raw as { commitSha?: string } | undefined;
    const evidence: LaunchBriefEvidence = {
      completedAt: new Date().toISOString(),
      checks: checks.map(({ key, label, status, result, evidence }) => ({
        key,
        label,
        status,
        result,
        evidence,
      })),
      repositoryObservationId:
        repository && repositoryCurrent ? repository.id : null,
      commitSha: typeof raw?.commitSha === "string" ? raw.commitSha : null,
      connectionId,
      environment: application.environment,
      approvalMode: application.approvalMode,
      approvalScope: application.approvalScope,
      decisionIds: [],
    };
    if (!completeWorkspace(current.id, evidence))
      throw new Error("The Launch Brief phase was already completed.");
    const workspace = insertWorkspace(application.id, PHASE_TWO.key);
    const chat = insertChat(
      workspace.id,
      primaryChatTitle(PHASE_TWO.key),
      true,
    );
    insertMessage(
      chat.id,
      "assistant",
      `Phase 2, Inspect app, starts here. The deliverable is the Application Contract. The checks are:\n${phaseTwoCheckListForPrompt()}\n\nI will inspect the repository at an exact commit and propose the contract from what it declares. Nothing in this phase changes code, infrastructure or the repository.`,
      "server-guy",
    );
    insertActivity(
      current.id,
      "phase-completed",
      "Launch Brief completed",
      `All ${checks.length} checks passed; evidence retained as recorded. Phase 1 chats are now read-only.`,
    );
    insertActivity(
      workspace.id,
      "phase-started",
      "Inspect app started",
      `Phase 2 workspace opened with its ${primaryChatTitle(PHASE_TWO.key)} chat.`,
    );
    return { application, workspace, chat, created: true as const };
  });
  if (!transition.created) return getOperatorView(applicationId);
  const { application, chat } = transition;
  // The inspection is a bounded network read outside the transaction; its
  // outcome is recorded as an Observation either way.
  const inspection = await inspectRepository(application.id);
  if (inspection.status === "passed") {
    // The first Run is Server Guy's request, recorded as such; the engineer
    // wrote nothing. Without a worker it stays visibly queued.
    enqueueServerGuyRequest(application.id, chat.id, INSPECTION_REQUEST);
  } else {
    insertMessage(
      chat.id,
      "assistant",
      `${inspection.summary} Use Re-inspect repository in the check details once the repository is readable again.`,
      "server-guy",
    );
  }
  return getOperatorView(application.id, chat.id);
}

/**
 * The explicit Phase 2 → Phase 3 transition. One immediate transaction
 * re-evaluates the four Application Contract checks, refuses while any Run is
 * pending, retains the contract identity and check evidence on the completed
 * workspace and opens Make launch-ready with its primary Chat. No request is
 * started: the engineer chooses the working environment in the Record.
 */
export function completeInspectApp(applicationId: string) {
  const transition = withTransaction(() => {
    const { application, workspaces, current } = loadApplication(applicationId);
    const existing = workspaces.find(
      (workspace) => workspace.phaseKey === PHASE_THREE.key,
    );
    if (existing && current.phaseKey !== PHASE_TWO.key)
      return { application, workspace: existing, created: false as const };
    if (current.phaseKey !== PHASE_TWO.key || current.completedAt)
      throw new Error("The Inspect app phase is not the current phase.");
    const evidence = repositoryEvidence(application.id);
    const contract = contractView(application.id);
    const checks = computePhaseTwoChecks({
      inspection: evidence.inspection,
      inspectionConnectionCurrent: evidence.connectionCurrent,
      githubConnected: Boolean(evidence.connectionId),
      resolution: evidence.resolution,
      contract,
    });
    const unmet = checks.filter((check) => check.status !== "passed");
    if (unmet.length)
      throw new Error(
        `The Application Contract is not ready: ${unmet
          .map((check) => check.label)
          .join(", ")}.`,
      );
    if (hasPendingRuns(application.id))
      throw new Error(
        "Wait for the current reply to finish or cancel it before continuing to Make launch-ready.",
      );
    if (!contract || !evidence.inspection)
      throw new Error("The Application Contract is missing.");
    const retained: InspectAppEvidence = {
      completedAt: new Date().toISOString(),
      checks: checks.map(({ key, label, status, result, evidence: refs }) => ({
        key,
        label,
        status,
        result,
        evidence: refs,
      })),
      contractId: contract.id,
      contractVersion: contract.version,
      profileId: contract.profileId,
      profileVersion: contract.profileVersion,
      commitSha: contract.commitSha,
      inspectionObservationId: evidence.inspection.id,
      connectionId: evidence.connectionId,
    };
    if (!completeWorkspace(current.id, retained))
      throw new Error("The Inspect app phase was already completed.");
    const workspace =
      existing ?? insertWorkspace(application.id, PHASE_THREE.key);
    const chat =
      listChats(workspace.id).find(
        (item) => item.isPrimary && !item.archivedAt,
      ) ?? insertChat(workspace.id, primaryChatTitle(PHASE_THREE.key), true);
    const gaps = contractGapReport(contract.body);
    const required = gaps.conformance.length;
    insertMessage(
      chat.id,
      "assistant",
      `Phase 3, Make launch-ready, starts here. The deliverable is a Conformance Result: one exact repository revision with independent evidence that the required checks pass for it. The checks are:\n${phaseThreeCheckListForPrompt()}\n\nThe brief works from Application Contract v${contract.version} at ${contract.commitSha.slice(0, 8)}: ${
        required
          ? `${required} required change${required === 1 ? "" : "s"} (${gaps.conformance.map((item) => item.label).join(", ")}).`
          : "no required changes; the current revision still needs conformance evidence."
      } Choose how the work happens in the Record: Continue with Server Guy (recommended), or export the brief for Codex, Claude, another harness or manual work and return the change. Server Guy publishes a reviewable pull request; you merge it on GitHub; then Server Guy verifies the exact merged revision in an isolated runner.`,
      "server-guy",
    );
    insertActivity(
      current.id,
      "phase-completed",
      "Inspect app completed",
      `All ${checks.length} checks passed; Application Contract v${contract.version} at ${contract.commitSha.slice(0, 8)} retained as recorded. Phase 2 chats are now read-only.`,
    );
    insertActivity(
      workspace.id,
      "phase-started",
      "Make launch-ready started",
      `Phase 3 workspace opened with its ${primaryChatTitle(PHASE_THREE.key)} chat · ${required} required change${required === 1 ? "" : "s"} in the brief.`,
    );
    return { application, workspace, chat, created: true as const };
  });
  return getOperatorView(
    transition.application.id,
    transition.created ? transition.chat.id : undefined,
    transition.created ? undefined : PHASE_THREE.key,
  );
}
