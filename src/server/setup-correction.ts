import { applicationDeployment } from "./deployment-store";
import { z } from "zod";
import {
  getObservation,
  insertActivity,
  insertObservation,
  listAcceptanceChecks,
  listConformanceProposals,
  reopenWorkspace,
  revokePublicationGrants,
  updateAcceptanceChecks,
  updateApplicationSetup,
  updateConformanceProposal,
  withTransaction,
} from "./db";
import { inspectGithubRepository, parseGithubRepository } from "./github";
import { currentGithubConnectionId } from "./github-connection";
import { REPOSITORY_OBSERVATION } from "./phase-one-evidence";
import { INSPECTION_OBSERVATION } from "./phase-two";
import { assertCorrectionIdle, correctionState } from "./revision-correction";
import { createApplicationRequestSchema } from "./schemas";

export const setupImpactRequest = createApplicationRequestSchema
  .omit({ requestKey: true })
  .extend({
    name: z.string().trim().min(1).max(120),
  });
export const setupApplyRequest = z.strictObject({ impactId: z.uuid() });
export interface SetupImpact {
  id: string;
  repositoryChanged: boolean;
  before: { name: string; repositoryUrl: string; approvalMode: string };
  after: z.infer<typeof setupImpactRequest>;
  retained: string[];
  required: string[];
  expiresAt: string;
}
type SavedImpact = {
  view: SetupImpact;
  stamp: string;
  connectionId: string | null;
  identity: Awaited<ReturnType<typeof inspectGithubRepository>> | null;
};
const KIND = "setup-correction-impact";

export async function previewSetupCorrection(
  applicationId: string,
  input: unknown,
) {
  const after = setupImpactRequest.parse(input);
  const before = correctionState(applicationId);
  if (
    !["start", "inspect-app", "make-launch-ready"].includes(
      before.current.phaseKey,
    )
  )
    throw new Error("Setup corrections are available before launch planning.");
  const repository = parseGithubRepository(after.repositoryUrl);
  after.repositoryUrl = repository.canonicalUrl;
  const repositoryChanged =
    after.repositoryUrl !== before.application.repositoryUrl;
  const policyChanged = after.approvalMode !== before.application.approvalMode;
  if (
    !repositoryChanged &&
    !policyChanged &&
    after.name === before.application.name
  )
    throw new Error("No setup changes to review.");
  const connectionId = currentGithubConnectionId();
  const identity = repositoryChanged
    ? await inspectGithubRepository(repository)
    : null;
  if (identity && identity.status !== "passed")
    throw new Error(identity.summary);
  if (correctionState(applicationId).stamp !== before.stamp)
    throw new Error("The application changed. Review the setup change again.");
  const view: SetupImpact = {
    id: "",
    repositoryChanged,
    before: {
      name: before.application.name,
      repositoryUrl: before.application.repositoryUrl,
      approvalMode: before.application.approvalMode,
    },
    after,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    retained: [
      "Chats, source evidence, saved versions, published branches and previous results remain in history.",
    ],
    required: repositoryChanged
      ? [
          "Review the Launch Brief for the new repository. Its access has just been checked.",
          "Inspect the new repository and save its Application Contract. Old repository evidence and source approvals stop applying.",
          "Review changes and behavior checks, then rebuild, verify and test a new preview. The amount of source work is not known yet.",
          "Allow publishing again before starting a new shared preparation branch. Existing GitHub branches are left intact.",
        ]
      : policyChanged
        ? [
            "Publishing permission is revoked. Allow publishing again under the new policy before any further checkpoints.",
            "Review pending source proposals again. Existing code checks remain valid because the repository and tested image did not change.",
          ]
        : [
            "Only the displayed application name changes. No code checks need repeating.",
          ],
  };
  const saved: SavedImpact = {
    view,
    stamp: before.stamp,
    connectionId,
    identity,
  };
  const observation = insertObservation({
    applicationId,
    kind: KIND,
    status: "passed",
    summary: "Setup impact reviewed; nothing changed yet.",
    sourceLabel: "Setup impact",
    sourceUrl: null,
    raw: saved,
  });
  return { ...view, id: observation.id };
}
export function applySetupCorrection(applicationId: string, input: unknown) {
  const { impactId } = setupApplyRequest.parse(input);
  return withTransaction(() => {
    const observation = getObservation(impactId);
    if (
      observation?.applicationId !== applicationId ||
      observation.kind !== KIND
    )
      throw new Error("Setup impact not found for this application.");
    const saved = observation.raw as SavedImpact;
    const before = correctionState(applicationId);
    if (
      saved.stamp !== before.stamp ||
      Date.now() >= Date.parse(saved.view.expiresAt) ||
      saved.connectionId !== currentGithubConnectionId()
    )
      throw new Error(
        "This impact is out of date. Review the setup change again.",
      );
    assertCorrectionIdle(applicationId);
    const { after, repositoryChanged } = saved.view;
    if (repositoryChanged && applicationDeployment(applicationId))
      throw new Error(
        "This application has a deployment record. Create a separate application for a different repository so its host and history stay correctly associated.",
      );
    const policyChanged =
      before.application.approvalMode !== after.approvalMode;
    const repository = parseGithubRepository(after.repositoryUrl);
    updateApplicationSetup(applicationId, {
      name: after.name,
      repositoryUrl: repository.canonicalUrl,
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      approvalMode: after.approvalMode,
    });
    if (repositoryChanged || policyChanged) {
      revokePublicationGrants(applicationId);
      for (const proposal of listConformanceProposals(applicationId))
        if (
          !["superseded", "withdrawn", "published"].includes(proposal.status) ||
          repositoryChanged
        )
          updateConformanceProposal(proposal.id, [proposal.status], {
            status: "superseded",
          });
    }
    if (repositoryChanged) {
      for (const checks of listAcceptanceChecks(applicationId))
        updateAcceptanceChecks(checks.id, [checks.status], {
          status: "superseded",
        });
      for (const workspace of before.workspaces) reopenWorkspace(workspace.id);
      insertObservation({
        applicationId,
        kind: REPOSITORY_OBSERVATION,
        status: "passed",
        summary: saved.identity!.summary,
        sourceLabel: "New repository identity",
        sourceUrl: saved.identity!.sourceUrl,
        raw: saved.identity!.raw,
      });
      insertObservation({
        applicationId,
        kind: INSPECTION_OBSERVATION,
        status: "unavailable",
        summary:
          "Repository changed. Inspect this repository before using an Application Contract.",
        sourceLabel: "Setup correction",
        sourceUrl: repository.canonicalUrl,
        raw: { connectionId: saved.connectionId, impactId },
      });
    }
    insertActivity(
      before.workspaces.find((w) => w.phaseKey === "start")!.id,
      "setup-corrected",
      "Application setup corrected",
      `${saved.view.before.repositoryUrl} → ${repository.canonicalUrl}. ${repositoryChanged ? "Earlier evidence stays in history; review starts at Phase 1." : policyChanged ? "Permission policy changed; publishing must be allowed again." : "Application name updated."}`,
    );
    insertObservation({
      applicationId,
      kind: "setup-correction-applied",
      status: "passed",
      summary: "Setup correction applied by the user.",
      sourceLabel: "Setup correction",
      sourceUrl: null,
      raw: { impactId, before: saved.view.before, after },
    });
    return { phaseKey: repositoryChanged ? "start" : before.current.phaseKey };
  });
}
