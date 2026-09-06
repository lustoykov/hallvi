import { randomUUID } from "node:crypto";
import * as database from "../../src/server/db";
import { validateContractProposal } from "../../src/server/application-contract";
import { saveGithubConnection } from "../../src/server/github-connection";
import { getOperatorView } from "../../src/server/operator-view";
import { repositoryEvidence } from "../../src/server/phase-two";
import { PHASE_TWO } from "../../src/server/phase-two-spec";
import type { LaunchBriefEvidence } from "../../src/server/types";
import { primaryChatTitle } from "../../src/server/workspaces";
import {
  buildContractProposal,
  type SeenRead,
} from "../fixtures/contract-builder";
import { fixtureCommitSha } from "../fixtures/github-responses";
import { fixtureTree, repositoryFixtures } from "../fixtures/repositories";
import type { PhaseOneEvalCase } from "./phase-one-cases";

/**
 * Seeds an application already in Inspect app: a completed Launch Brief, the
 * Phase 2 workspace and chat, a synthetic inspection at a synthetic commit and
 * a saved read of every fixture file, so the model's reads are served from
 * records. No GitHub request is made; the runner blocks the API anyway.
 */
export function seedPhaseTwoEvalCase(
  scenario: PhaseOneEvalCase,
  repetition: number,
) {
  const phaseTwo = scenario.phaseTwo!;
  const name = `${scenario.id}-${repetition}`;
  const fullName = `qa/${name}`;
  const connectionId = randomUUID();
  saveGithubConnection({
    id: connectionId,
    mode: "app",
    account: { id: 42, login: "eval-user" },
    connectedAt: new Date().toISOString(),
    clientId: "Iv1.eval",
    slug: "server-guy-eval",
    token: "ghu_eval-fixture-not-a-real-token",
    expiresAt: null,
  });
  const application = database.insertApplication({
    name,
    repositoryUrl: `https://github.com/${fullName}`,
    repositoryOwner: "qa",
    repositoryName: name,
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Current application launch",
  });
  const files = repositoryFixtures[phaseTwo.repository];
  const seedInspection = (revision: string) => {
    const commitSha = fixtureCommitSha(fullName, revision);
    const entries = fixtureTree(files).map(({ path, type, size }) => ({
      path,
      type,
      ...(size !== undefined ? { size } : {}),
    }));
    const inspection = database.insertObservation({
      applicationId: application.id,
      kind: "github-repository-inspection",
      status: "passed",
      summary: `Inspected ${fullName} at main · ${commitSha.slice(0, 8)}: ${files.length} files.`,
      sourceLabel: "Repository inspection",
      sourceUrl: `${application.repositoryUrl}/tree/${commitSha}`,
      raw: {
        connectionId,
        repositoryId: 123,
        defaultBranch: "main",
        commitSha,
        entries,
        truncated: false,
        checkedAt: new Date().toISOString(),
        resolutionFiles: ["pyproject.toml"],
      },
    });
    const reads: SeenRead[] = files.map((file) => {
      const observation = database.insertObservation({
        applicationId: application.id,
        kind: "github-repository-file",
        status: "passed",
        summary: `Read ${file.path} at ${commitSha.slice(0, 8)}.`,
        sourceLabel: `Repository file · ${file.path}`,
        sourceUrl: `${application.repositoryUrl}/blob/${commitSha}/${file.path}`,
        raw: {
          connectionId,
          commitSha,
          path: file.path,
          blobSha: "synthetic",
          size: Buffer.byteLength(file.content),
          content: file.content,
          truncated: false,
          binary: false,
          redactedCount: 0,
          checkedAt: new Date().toISOString(),
        },
      });
      return {
        status: "read" as const,
        observationId: observation.id,
        path: file.path,
        content: file.content,
      };
    });
    return { inspection, commitSha, reads, entries };
  };
  // The Phase 1 repository check and its completed workspace.
  const identity = database.insertObservation({
    applicationId: application.id,
    kind: "github-repository-identity",
    status: "passed",
    summary: `${fullName} is readable at main · ${fixtureCommitSha(fullName).slice(0, 8)}.`,
    sourceLabel: "GitHub commit",
    sourceUrl: `${application.repositoryUrl}/commit/${fixtureCommitSha(fullName)}`,
    raw: {
      connectionId,
      repository: fullName,
      repositoryId: 123,
      defaultBranch: "main",
      commitSha: fixtureCommitSha(fullName),
    },
  });
  const start = database.insertWorkspace(application.id, "start");
  database.insertChat(start.id, primaryChatTitle("start"), true);
  const evidence: LaunchBriefEvidence = {
    completedAt: new Date().toISOString(),
    checks: [],
    repositoryObservationId: identity.id,
    commitSha: fixtureCommitSha(fullName),
    connectionId,
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Current application launch",
    decisionIds: [],
  };
  database.completeWorkspace(start.id, evidence);
  const workspace = database.insertWorkspace(application.id, PHASE_TWO.key);
  const chat = database.insertChat(
    workspace.id,
    primaryChatTitle(PHASE_TWO.key),
    true,
  );
  database.insertMessage(
    chat.id,
    "assistant",
    "Phase 2, Inspect app, starts here. The deliverable is the Application Contract.",
    "server-guy",
  );
  const first = seedInspection("1");
  if (phaseTwo.existingContract) {
    const evidenceNow = repositoryEvidence(application.id);
    const request = database.insertMessage(
      chat.id,
      "user",
      "Inspect the repository and propose the Application Contract.",
      "server-guy",
    );
    const proposal = validateContractProposal(
      buildContractProposal(
        {
          inspection: {
            observationId: first.inspection.id,
            commitSha: first.commitSha,
          },
          tree: { entries: first.entries.map((entry) => entry.path) },
        },
        first.reads,
      ),
      {
        applicationId: application.id,
        commitSha: first.commitSha,
        profile: evidenceNow.resolution,
        currentContract: null,
        lookups: {
          observation: database.getObservation,
          activeDecision: (id) =>
            database.getActiveDecision(application.id, id),
          applicationMessage: (id) =>
            database.getApplicationMessage(application.id, id),
        },
      },
    );
    database.insertContract({
      applicationId: application.id,
      workspaceId: workspace.id,
      version: 1,
      sourceMessageId: request.id,
      body: proposal.body,
    });
    database.insertMessage(
      chat.id,
      "assistant",
      "I proposed the Application Contract from the inspected repository.",
      "pi",
    );
    database.insertActivity(
      workspace.id,
      "contract-established",
      "Application Contract established",
      `v1 · ${first.commitSha.slice(0, 8)}`,
    );
  }
  if (phaseTwo.staleCommit) seedInspection("2");
  return getOperatorView(application.id, chat.id);
}
