import {
  completeWorkspace,
  hasPendingRuns,
  insertActivity,
  insertChat,
  insertMessage,
  insertWorkspace,
  withTransaction,
} from "./db";
import { getOperatorView } from "./operator-view";
import {
  currentPhaseOneChecks,
  currentRepositoryEvidence,
} from "./phase-one-evidence";
import { PHASE_ONE, observationMatchesConnection } from "./phase-one-spec";
import { inspectRepository } from "./phase-two";
import { PHASE_TWO, phaseTwoCheckListForPrompt } from "./phase-two-spec";
import { enqueueServerGuyRequest } from "./pi-runs";
import type { LaunchBriefEvidence } from "./types";
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
  const view = getOperatorView(application.id, chat.id);
  if (
    inspection.status === "passed" &&
    view.inspection?.profile.status === "matched"
  ) {
    // The first Run is Server Guy's request, recorded as such; the engineer
    // wrote nothing. Without a worker it stays visibly queued.
    enqueueServerGuyRequest(application.id, chat.id, INSPECTION_REQUEST);
  } else {
    insertMessage(
      chat.id,
      "assistant",
      inspection.status === "passed"
        ? `${inspection.summary} ${view.inspection?.profile.reason ?? "The repository did not resolve to a supported profile."} Check 1 explains what was found; Re-inspect repository runs the inspection again after changes.`
        : `${inspection.summary} Use Re-inspect repository in the check details once the repository is readable again.`,
      "server-guy",
    );
  }
  return getOperatorView(application.id, chat.id);
}
