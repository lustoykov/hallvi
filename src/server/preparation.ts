import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { duringApplicationOperation } from "./application-operations";
import {
  activePublicationGrant,
  currentContract,
  getObservation,
  insertActivity,
  insertObservation,
  latestPreparationBranch,
  listObservations,
  savePreparationBranch,
} from "./db";
import { githubJson } from "./github-api";
import {
  connectedGithubCredential,
  currentGithubConnectionId,
} from "./github-connection";
import {
  fetchRepositoryFile,
  fetchRepositoryTree,
  normalizeRepositoryPath,
} from "./github-inspection";
import { findPullRequestForBranch, observeCommit } from "./github-publication";
import { latestInspection } from "./phase-two";
import { deniedPathReason } from "./secrets";
import { assertChatWritable, loadApplication, loadChat } from "./workspaces";
import type {
  ConformanceProposalRecord,
  PiRun,
  PreparationBranch,
} from "./types";

const SHA = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) });
const REF = z.object({ object: SHA });
const PREPARATION_FILE = "preparation-file";
function scope(applicationId: string) {
  const { application, current } = loadApplication(applicationId);
  const contract = currentContract(applicationId);
  const grant = activePublicationGrant(applicationId);
  if (current.phaseKey !== "make-launch-ready" || !contract)
    throw new Error("Complete Inspect app before preparing source changes.");
  if (!grant || grant.connectionId !== currentGithubConnectionId())
    throw new Error(
      "Allow publishing with the current GitHub App connection first.",
    );
  return {
    application,
    workspace: current,
    contract,
    grant,
    fullName: `${application.repositoryOwner}/${application.repositoryName}`,
  };
}
export function preparationView(applicationId: string) {
  const record = latestPreparationBranch(applicationId);
  if (!record) return null;
  const grant = activePublicationGrant(applicationId);
  return record.contractId === currentContract(applicationId)?.id &&
    record.grantId === grant?.id &&
    record.connectionId === currentGithubConnectionId()
    ? record
    : {
        ...record,
        status: "stopped" as const,
        summary:
          "The contract or publication grant changed. Start a new preparation branch after reviewing the current scope.",
      };
}
export function preparationGranted(applicationId: string) {
  const record = preparationView(applicationId);
  return record && record.status !== "stopped" ? record : null;
}
function assertPreparationCurrent(record: PreparationBranch) {
  const current = preparationGranted(record.applicationId);
  if (current?.id !== record.id || current.grantId !== record.grantId)
    throw new Error(
      "The preparation scope changed. Review it before publishing.",
    );
}
async function branchHead(token: string, name: string, branch: string) {
  return REF.parse(
    (
      await githubJson(
        `/repos/${name}/git/ref/${encodeURIComponent(`heads/${branch}`)}`,
        token,
      )
    ).data,
  ).object.sha;
}
export async function startPreparation(applicationId: string) {
  return duringApplicationOperation(applicationId, async () => {
    const { application, workspace, contract, grant, fullName } =
      scope(applicationId);
    const previous = preparationGranted(applicationId);
    if (previous && previous.status !== "starting") return previous;
    const branch =
      previous?.branch ?? `server-guy/prepare-${randomUUID().slice(0, 8)}`;
    const inspection = latestInspection(applicationId)?.raw as {
      defaultBranch?: string;
    } | null;
    const record: PreparationBranch = previous ?? {
      id: randomUUID(),
      applicationId,
      contractId: contract.id,
      connectionId: grant.connectionId,
      grantId: grant.id,
      branch,
      baseSha: contract.commitSha,
      headSha: contract.commitSha,
      defaultBranch: inspection?.defaultBranch ?? "main",
      status: "starting",
      summary: "Creating the shared preparation branch.",
      createdAt: new Date().toISOString(),
      pullRequestUrl: null,
      pullRequestNumber: null,
      lastProposalId: null,
      lastFiles: [],
    };
    savePreparationBranch(record);
    const credential = await connectedGithubCredential();
    if (credential.connection.id !== record.connectionId)
      throw new Error("The GitHub connection changed.");
    const existing = await githubJson(
      `/repos/${fullName}/git/ref/${encodeURIComponent(`heads/${branch}`)}`,
      credential.token,
      { allowNotFound: true },
    );
    if (
      existing.data &&
      REF.parse(existing.data).object.sha !== contract.commitSha
    )
      throw new Error(
        "The preparation branch changed while creation was being recovered. Review it before continuing.",
      );
    assertPreparationCurrent(record);
    if (!existing.data)
      await githubJson(`/repos/${fullName}/git/refs`, credential.token, {
        method: "POST",
        body: { ref: `refs/heads/${branch}`, sha: contract.commitSha },
      });
    assertPreparationCurrent(record);
    const saved = savePreparationBranch({
      ...record,
      status: "working",
      summary:
        "The shared branch is ready. A draft PR opens with the first source checkpoint; merging stays yours.",
    });
    insertActivity(
      workspace.id,
      "preparation-started",
      "Shared preparation started",
      `${application.repositoryUrl}/tree/${branch} · checkpoints authorized for this contract and publishing grant.`,
    );
    return saved;
  });
}

export async function refreshPreparation(applicationId: string) {
  return duringApplicationOperation(applicationId, async () => {
    const { fullName } = scope(applicationId);
    const session = preparationGranted(applicationId);
    if (!session) throw new Error("No current preparation branch.");
    const credential = await connectedGithubCredential();
    const headSha = await branchHead(
      credential.token,
      fullName,
      session.branch,
    );
    const pull = await findPullRequestForBranch(
      credential.token,
      fullName,
      session.branch,
    );
    assertPreparationCurrent(session);
    return savePreparationBranch({
      ...session,
      headSha,
      status: pull?.state === "closed" ? "stopped" : "working",
      pullRequestUrl: pull?.url ?? session.pullRequestUrl,
      pullRequestNumber: pull?.number ?? session.pullRequestNumber,
      summary:
        pull?.state === "closed"
          ? "The preparation pull request is closed. Refresh the candidate if you merged it."
          : headSha !== session.headSha
            ? "New commits are present. Read affected preparation files before proposing another checkpoint."
            : "Preparation branch checked; your collaborators' commits are retained.",
    });
  });
}

export function preparationFileObservation(run: PiRun, path: string) {
  const session = preparationGranted(run.applicationId);
  if (!session) return null;
  return (
    listObservations(run.applicationId).find((observation) => {
      const raw = observation.raw as {
        path?: string;
        commitSha?: string;
        runId?: string;
      } | null;
      return (
        observation.kind === PREPARATION_FILE &&
        raw?.path === path &&
        raw.commitSha === session.headSha &&
        raw.runId === run.id
      );
    }) ?? null
  );
}
export async function readPreparationFile(
  run: PiRun,
  inputPath: string,
  signal?: AbortSignal,
) {
  const { chat, workspace } = loadChat(run.applicationId, run.chatId);
  assertChatWritable(chat, workspace);
  const path = normalizeRepositoryPath(inputPath);
  const denied = deniedPathReason(path);
  if (denied) throw new Error(`File not read: ${denied}`);
  const session = await refreshPreparation(run.applicationId);
  if (session.status !== "working") throw new Error(session.summary);
  const { application, fullName } = scope(run.applicationId);
  const credential = await connectedGithubCredential();
  const tree = await fetchRepositoryTree(
    fullName,
    session.headSha,
    credential.token,
    signal,
  );
  if (
    !tree.entries.some((entry) => entry.path === path && entry.type === "blob")
  ) {
    if (tree.truncated)
      throw new Error("The tree is incomplete; absence cannot be established.");
    return { status: "absent", path, commitSha: session.headSha };
  }
  const read = await fetchRepositoryFile(
    fullName,
    session.headSha,
    path,
    credential.token,
    { signal },
  );
  if (read.binary || read.truncated)
    throw new Error(
      "This file cannot be used for a complete text replacement.",
    );
  const observation = insertObservation({
    applicationId: run.applicationId,
    kind: PREPARATION_FILE,
    status: "passed",
    summary: `Read ${path} from the shared preparation branch at ${session.headSha.slice(0, 8)}.`,
    sourceLabel: "Preparation file",
    sourceUrl: `${application.repositoryUrl}/blob/${session.headSha}/${path}`,
    raw: {
      path,
      commitSha: session.headSha,
      blobSha: read.blobSha,
      content: read.content,
      runId: run.id,
    },
  });
  return {
    status: "read",
    path,
    commitSha: session.headSha,
    observationId: observation.id,
    content: read.content,
  };
}
function blobSha(content: string | null) {
  if (content === null) return null;
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

/** Fast-forward publication: every checkpoint has the observed remote head
 * as parent. GitHub rejects a race; no force push or stale whole-file reset. */
export async function publishPreparationCheckpoint(
  applicationId: string,
  proposal: ConformanceProposalRecord,
) {
  return duringApplicationOperation(applicationId, async () => {
    const { workspace, contract, grant, fullName } = scope(applicationId);
    let session = preparationGranted(applicationId);
    if (!session || session.status === "starting")
      throw new Error("Start the shared preparation branch first.");
    if (proposal.contractId !== contract.id)
      throw new Error("The checkpoint belongs to an earlier contract.");
    const credential = await connectedGithubCredential();
    if (credential.connection.id !== session.connectionId)
      throw new Error("The GitHub connection changed.");
    const marker = `Server-Guy-Checkpoint: ${session.id}/${proposal.id}/${proposal.filesDigest}`;
    try {
      const head = await branchHead(credential.token, fullName, session.branch);
      const pull = await findPullRequestForBranch(
        credential.token,
        fullName,
        session.branch,
      );
      if (pull?.state === "closed")
        throw new Error(
          "The preparation PR is closed. It cannot receive another checkpoint.",
        );
      let sha = head;
      let recovered: string | null = null;
      // Recover a successful push whose local receipt was lost, even with a
      // collaborator commit on top. Also prove the selected base is retained.
      for (let count = 0; sha !== session.baseSha && count < 100; count++) {
        const commit = await observeCommit(credential.token, fullName, sha);
        if (commit.message.split(/\r?\n/).includes(marker)) recovered = sha;
        sha = commit.parents[0] ?? "";
        if (!sha) break;
      }
      if (sha !== session.baseSha)
        throw new Error(
          "The branch no longer has the selected base in its recent history. Review the branch; nothing was overwritten.",
        );
      let commitSha = recovered ?? head;
      if (!recovered) {
        const tree = await fetchRepositoryTree(
          fullName,
          head,
          credential.token,
        );
        if (tree.truncated)
          throw new Error(
            "The shared branch tree is incomplete. A safe checkpoint cannot be prepared.",
          );
        const remote = new Map(
          tree.entries
            .filter((entry) => entry.type === "blob")
            .map((entry) => [entry.path, entry.sha ?? null]),
        );
        const edits: Array<Record<string, unknown>> = [];
        for (const change of proposal.changes) {
          const last = session.lastFiles.find(
            (item) => item.path === change.path,
          );
          const observation = change.baseObservationId
            ? getObservation(change.baseObservationId)
            : null;
          const read = observation?.raw as {
            blobSha?: string;
            commitSha?: string;
          } | null;
          const expected =
            observation?.kind === PREPARATION_FILE && read?.commitSha === head
              ? (read.blobSha ?? null)
              : last
                ? blobSha(last.content)
                : (read?.blobSha ?? null);
          const actual = remote.get(change.path) ?? null;
          const desired = blobSha(change.content);
          if (actual === desired) continue;
          if (actual !== expected)
            throw new Error(
              `Conflict in ${change.path}: a collaborator changed this file. Read it with read_preparation_file and propose a reconciled replacement. No commits were overwritten.`,
            );
          if (desired === null)
            edits.push({
              path: change.path,
              mode: "100644",
              type: "blob",
              sha: null,
            });
          else {
            const blob = SHA.parse(
              (
                await githubJson(
                  `/repos/${fullName}/git/blobs`,
                  credential.token,
                  {
                    method: "POST",
                    body: {
                      content: Buffer.from(change.content!, "utf8").toString(
                        "base64",
                      ),
                      encoding: "base64",
                    },
                  },
                )
              ).data,
            );
            edits.push({
              path: change.path,
              mode: "100644",
              type: "blob",
              sha: blob.sha,
            });
          }
        }
        if (edits.length) {
          const base = z
            .object({ tree: SHA })
            .parse(
              (
                await githubJson(
                  `/repos/${fullName}/git/commits/${head}`,
                  credential.token,
                )
              ).data,
            );
          const treeObject = SHA.parse(
            (
              await githubJson(
                `/repos/${fullName}/git/trees`,
                credential.token,
                {
                  method: "POST",
                  body: { base_tree: base.tree.sha, tree: edits },
                },
              )
            ).data,
          );
          const commit = SHA.parse(
            (
              await githubJson(
                `/repos/${fullName}/git/commits`,
                credential.token,
                {
                  method: "POST",
                  body: {
                    message: `${proposal.summary}\n\n${marker}`,
                    parents: [head],
                    tree: treeObject.sha,
                  },
                },
              )
            ).data,
          );
          // Last local guard before the only branch mutation.
          if (
            preparationGranted(applicationId)?.id !== session.id ||
            activePublicationGrant(applicationId)?.id !== grant.id
          )
            throw new Error("The work grant changed before publication.");
          await githubJson(
            `/repos/${fullName}/git/refs/${encodeURIComponent(`heads/${session.branch}`)}`,
            credential.token,
            { method: "PATCH", body: { sha: commit.sha, force: false } },
          );
          commitSha = commit.sha;
        }
      }
      assertPreparationCurrent(session);
      let pullNumber = pull?.number ?? null;
      let pullUrl = pull?.url ?? null;
      if (!pull && commitSha !== session.baseSha) {
        const created = z
          .object({ number: z.number().int(), html_url: z.string().url() })
          .parse(
            (
              await githubJson(`/repos/${fullName}/pulls`, credential.token, {
                method: "POST",
                body: {
                  title: "Prepare application with Server Guy",
                  head: session.branch,
                  base: session.defaultBranch,
                  draft: true,
                  body: `${proposal.summary}\n\nShared preparation branch. You may commit here too. Checkpoints are work in progress; final verification runs against the exact candidate. Merging stays yours.`,
                },
              })
            ).data,
          );
        pullNumber = created.number;
        pullUrl = created.html_url;
      }
      if (!pullNumber || !pullUrl)
        throw new Error(
          "There is no source difference to open a draft PR yet.",
        );
      assertPreparationCurrent(session);
      session = savePreparationBranch({
        ...session,
        status: "working",
        headSha: await branchHead(credential.token, fullName, session.branch),
        pullRequestNumber: pullNumber,
        pullRequestUrl: pullUrl,
        lastProposalId: proposal.id,
        lastFiles: proposal.changes,
        summary:
          "Checkpoint published to the shared draft PR. Collaborator commits are retained; review and merge on GitHub when ready.",
      });
      insertActivity(
        workspace.id,
        "preparation-checkpoint",
        "Preparation checkpoint published",
        `${session.branch} · ${commitSha.slice(0, 8)} · ${pullUrl}`,
      );
      return {
        branch: session.branch,
        commitSha,
        pullRequestNumber: pullNumber,
        pullRequestUrl: pullUrl,
        adopted: Boolean(recovered),
      };
    } catch (error) {
      savePreparationBranch({
        ...session,
        status: "conflict",
        summary:
          error instanceof Error
            ? error.message
            : "Checkpoint failed. Review the branch before retrying.",
      });
      throw error;
    }
  });
}
