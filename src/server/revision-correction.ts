// An impact is a saved read, not permission to change the selected revision.
// Apply accepts its ID only and rechecks the state the person reviewed.
import { hasApplicationOperation } from "./application-operations";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  activePublicationGrant,
  currentContract,
  getObservation,
  hasPendingRuns,
  insertActivity,
  insertObservation,
  latestObservation,
  listAcceptanceChecks,
  listActiveDecisions,
  listConformanceProposals,
  listConformanceRuns,
  reopenWorkspace,
  updateAcceptanceChecks,
  updateConformanceProposal,
  withTransaction,
} from "./db";
import { inspectGithubRepository } from "./github";
import { githubJson } from "./github-api";
import {
  connectedGithubCredential,
  currentGithubConnectionId,
} from "./github-connection";
import { fetchRepositoryTree, type RepositoryTree } from "./github-inspection";
import {
  INSPECTION_OBSERVATION,
  latestInspection,
  repositoryEvidence,
} from "./phase-two";
import { loadApplication } from "./workspaces";

const IMPACT = "revision-correction-impact";
const APPLIED = "revision-correction-applied";
export const revisionImpactRequest = z.strictObject({
  reference: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
      (value) => !/[\x00-\x20]/.test(value),
      "Enter a branch, tag or commit without spaces.",
    ),
});
export const revisionApplyRequest = z.strictObject({ impactId: z.uuid() });
export interface RevisionImpact {
  id: string;
  fromCommit: string;
  toCommit: string;
  reference: string;
  expiresAt: string;
  changedFiles: Array<{
    path: string;
    change: "added" | "removed" | "modified";
  }>;
  filesComplete: boolean;
  retained: string[];
  required: string[];
  uncertainty: string;
}
interface SavedImpact {
  view: RevisionImpact;
  base: string;
  tree: RepositoryTree;
  repositoryId: number;
  connectionId: string;
  defaultBranch: string;
}
function state(applicationId: string) {
  const loaded = loadApplication(applicationId);
  const inspection = latestInspection(applicationId);
  return {
    ...loaded,
    inspection,
    stamp: createHash("sha256")
      .update(
        JSON.stringify({
          application: loaded.application,
          workspaces: loaded.workspaces,
          inspection: inspection?.id,
          connection: currentGithubConnectionId(),
          contract: currentContract(applicationId),
          decisions: listActiveDecisions(applicationId),
          proposals: listConformanceProposals(applicationId),
          runs: listConformanceRuns(applicationId),
          acceptance: listAcceptanceChecks(applicationId),
          grant: activePublicationGrant(applicationId),
        }),
      )
      .digest("hex"),
  };
}
function idle(applicationId: string) {
  if (
    hasPendingRuns(applicationId) ||
    listConformanceRuns(applicationId).some((run) =>
      ["queued", "running"].includes(run.status),
    ) ||
    hasApplicationOperation(applicationId)
  )
    throw new Error(
      "Wait for the current work to finish or cancel it before changing the selected revision.",
    );
}

export async function previewRevisionCorrection(
  applicationId: string,
  input: unknown,
): Promise<RevisionImpact> {
  const { reference } = revisionImpactRequest.parse(input);
  const before = state(applicationId);
  if (!["inspect-app", "make-launch-ready"].includes(before.current.phaseKey))
    throw new Error(
      "Revision changes are available during Inspect app and Make launch-ready.",
    );
  const evidence = repositoryEvidence(applicationId);
  if (!evidence.current || !evidence.commitSha)
    throw new Error(
      "Re-inspect the selected revision with the current GitHub connection first.",
    );
  const raw = before.inspection!.raw as { repositoryId: number };
  const identity = await inspectGithubRepository(
    {
      owner: before.application.repositoryOwner,
      name: before.application.repositoryName,
      canonicalUrl: before.application.repositoryUrl,
    },
    raw.repositoryId,
  );
  if (
    identity.status !== "passed" ||
    !identity.raw.repositoryId ||
    !identity.raw.defaultBranch
  )
    throw new Error(identity.summary);
  const credential = await connectedGithubCredential();
  if (credential.connection.id !== evidence.connectionId)
    throw new Error("The GitHub connection changed. Review the impact again.");
  const name = `${before.application.repositoryOwner}/${before.application.repositoryName}`;
  const commit = z
    .object({ sha: z.string().regex(/^[a-f0-9]{40}$/i) })
    .parse(
      (
        await githubJson(
          `/repos/${name}/commits/${encodeURIComponent(reference)}`,
          credential.token,
        )
      ).data,
    );
  if (commit.sha === evidence.commitSha)
    throw new Error("That commit is already selected.");
  const tree = await fetchRepositoryTree(name, commit.sha, credential.token);
  if (state(applicationId).stamp !== before.stamp)
    throw new Error(
      "The application changed while checking impact. Review it again.",
    );
  const oldFiles = new Map(
    evidence.entries
      .filter((e) => e.type === "blob")
      .map((e) => [e.path, e.sha]),
  );
  const newFiles = new Map(
    tree.entries.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]),
  );
  const changes: RevisionImpact["changedFiles"] = [];
  for (const [path, sha] of newFiles) {
    if (!oldFiles.has(path)) changes.push({ path, change: "added" });
    else if (!sha || sha !== oldFiles.get(path))
      changes.push({ path, change: "modified" });
  }
  for (const path of oldFiles.keys())
    if (!newFiles.has(path)) changes.push({ path, change: "removed" });
  const view: RevisionImpact = {
    id: "",
    fromCommit: evidence.commitSha,
    toCommit: commit.sha,
    reference,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    changedFiles: changes.slice(0, 100),
    filesComplete:
      !evidence.truncated &&
      !tree.truncated &&
      changes.length <= 100 &&
      [...oldFiles.values(), ...newFiles.values()].every(Boolean),
    retained: [
      "The Launch Brief and your saved requirements.",
      "Chats, contract versions, source reads, published PRs and previous test results remain in history.",
    ],
    required: [
      "Review and save the Application Contract for the selected commit in Phase 2.",
      "Review behavior checks and any proposed source changes again.",
      "Build and verify the selected candidate again in Phase 3. Previous results cannot prove this revision works.",
    ],
    uncertainty:
      "A file comparison cannot establish runtime impact or how much source work is needed. Server Guy must inspect the new revision; changed-file lists may be incomplete.",
  };
  const saved: SavedImpact = {
    view,
    base: before.stamp,
    tree,
    repositoryId: identity.raw.repositoryId,
    connectionId: credential.connection.id,
    defaultBranch: identity.raw.defaultBranch,
  };
  const observation = insertObservation({
    applicationId,
    kind: IMPACT,
    status: "passed",
    summary: `Reviewed revision change ${view.fromCommit.slice(0, 8)} → ${view.toCommit.slice(0, 8)}. No revision changed.`,
    sourceLabel: "Revision impact",
    sourceUrl: `${before.application.repositoryUrl}/compare/${view.fromCommit}...${view.toCommit}`,
    raw: saved,
  });
  return { ...view, id: observation.id };
}

export function getRevisionImpact(
  applicationId: string,
  impactId: string,
): RevisionImpact {
  const observation = getObservation(impactId);
  if (
    !observation ||
    observation.applicationId !== applicationId ||
    observation.kind !== IMPACT
  )
    throw new Error("Revision impact not found for this application.");
  return { ...(observation.raw as SavedImpact).view, id: impactId };
}

export function applyRevisionCorrection(applicationId: string, input: unknown) {
  const { impactId } = revisionApplyRequest.parse(input);
  return withTransaction(() => {
    const view = getRevisionImpact(applicationId, impactId);
    const saved = getObservation(impactId)!.raw as SavedImpact;
    const before = state(applicationId);
    const applied = latestObservation(applicationId, APPLIED)?.raw as
      { impactId?: string } | undefined;
    if (
      applied?.impactId === impactId &&
      repositoryEvidence(applicationId).commitSha === view.toCommit
    )
      return {
        impactId,
        commitSha: view.toCommit,
        phaseKey: "inspect-app" as const,
      };
    if (Date.now() >= Date.parse(view.expiresAt) || saved.base !== before.stamp)
      throw new Error(
        "This impact is out of date. Review the revision change again before applying it.",
      );
    idle(applicationId);
    const inspectionWorkspace = before.workspaces.find(
      (w) => w.phaseKey === "inspect-app",
    )!;
    // Keep old rows; remove their authority to approve or pass current checks.
    for (const proposal of listConformanceProposals(applicationId))
      if (!["superseded", "withdrawn"].includes(proposal.status))
        updateConformanceProposal(proposal.id, [proposal.status], {
          status: "superseded",
        });
    for (const check of listAcceptanceChecks(applicationId))
      if (check.status !== "superseded")
        updateAcceptanceChecks(check.id, [check.status], {
          status: "superseded",
        });
    for (const workspace of before.workspaces)
      if (["inspect-app", "make-launch-ready"].includes(workspace.phaseKey))
        reopenWorkspace(workspace.id);
    insertObservation({
      applicationId,
      kind: INSPECTION_OBSERVATION,
      status: "passed",
      summary: `Selected ${view.toCommit.slice(0, 8)} after reviewing impact from ${view.fromCommit.slice(0, 8)}.`,
      sourceLabel: "Selected repository revision",
      sourceUrl: `${before.application.repositoryUrl}/tree/${view.toCommit}`,
      raw: {
        connectionId: saved.connectionId,
        repositoryId: saved.repositoryId,
        defaultBranch: saved.defaultBranch,
        commitSha: view.toCommit,
        entries: saved.tree.entries,
        truncated: saved.tree.truncated,
        impactId,
      },
    });
    insertObservation({
      applicationId,
      kind: APPLIED,
      status: "passed",
      summary: "Revision correction applied by the user.",
      sourceLabel: "Revision correction",
      sourceUrl: null,
      raw: { impactId, fromCommit: view.fromCommit, toCommit: view.toCommit },
    });
    insertActivity(
      inspectionWorkspace.id,
      "revision-changed",
      "Selected revision changed",
      `${view.fromCommit.slice(0, 8)} → ${view.toCommit.slice(0, 8)}. Review the Application Contract again; earlier records are retained and Phase 3 work is paused.`,
    );
    return {
      impactId,
      commitSha: view.toCommit,
      phaseKey: "inspect-app" as const,
    };
  });
}
