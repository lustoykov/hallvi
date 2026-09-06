// Publication and observation through GitHub's API: one branch and one pull
// request per proposal through the Git Data API, reconciled before every
// retry so a lost receipt never creates duplicates or overwrites a branch
// someone else made; merged candidates observed on the default branch.
import { z } from "zod";

import { GithubAccessError, githubJson } from "./github-api";
import type { ProposedFileChange } from "./types";

export const PROPOSAL_TRAILER = "Server-Guy-Proposal:";

export function proposalBranchName(proposalId: string) {
  return `server-guy/conformance-${proposalId.slice(0, 8)}`;
}

const refSchema = z.object({ object: z.object({ sha: z.string() }) });
const commitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  parents: z.array(z.object({ sha: z.string() })),
  tree: z.object({ sha: z.string() }),
});
const pullSchema = z.object({
  number: z.number().int(),
  html_url: z.string(),
  state: z.enum(["open", "closed"]),
  merged: z.boolean().optional(),
  merged_at: z.string().nullable().optional(),
  merge_commit_sha: z.string().nullable().optional(),
  head: z.object({ sha: z.string(), ref: z.string() }),
  base: z.object({ ref: z.string(), sha: z.string() }),
  title: z.string().optional(),
});

export interface PublicationRequest {
  fullName: string;
  defaultBranch: string;
  baseSha: string;
  proposalId: string;
  branch: string;
  title: string;
  body: string;
  changes: ProposedFileChange[];
}

export interface PublicationReceipt {
  branch: string;
  commitSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  adopted: boolean;
}

/**
 * Creates the branch and pull request for a proposal, or adopts the ones an
 * interrupted earlier attempt already created. A branch of the same name
 * whose commit does not carry this proposal's trailer is refused, never
 * overwritten.
 */
export async function publishToGithub(
  token: string,
  request: PublicationRequest,
  signal?: AbortSignal,
): Promise<PublicationReceipt> {
  const { fullName, branch } = request;
  const trailer = `${PROPOSAL_TRAILER} ${request.proposalId}`;
  let adopted = false;
  let commitSha: string;
  const existing = await githubJson(
    `/repos/${fullName}/git/ref/${encodeURIComponent(`heads/${branch}`)}`,
    token,
    { signal, allowNotFound: true },
  );
  if (existing.data) {
    const { object } = refSchema.parse(existing.data);
    const commit = commitSchema.parse(
      (
        await githubJson(
          `/repos/${fullName}/git/commits/${object.sha}`,
          token,
          { signal },
        )
      ).data,
    );
    if (!commit.message.includes(trailer))
      throw new GithubAccessError(
        `Branch ${branch} already exists in ${fullName} and was not created from this change. Delete or rename it on GitHub, then retry.`,
        "access",
      );
    commitSha = commit.sha;
    adopted = true;
  } else {
    const tree: Array<Record<string, unknown>> = [];
    for (const change of request.changes) {
      signal?.throwIfAborted();
      if (change.content === null) {
        tree.push({
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: null,
        });
        continue;
      }
      const blob = z.object({ sha: z.string() }).parse(
        (
          await githubJson(`/repos/${fullName}/git/blobs`, token, {
            signal,
            method: "POST",
            body: {
              content: Buffer.from(change.content, "utf8").toString("base64"),
              encoding: "base64",
            },
          })
        ).data,
      );
      tree.push({
        path: change.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }
    const created = z.object({ sha: z.string() }).parse(
      (
        await githubJson(`/repos/${fullName}/git/trees`, token, {
          signal,
          method: "POST",
          body: { base_tree: request.baseSha, tree },
        })
      ).data,
    );
    const commit = z.object({ sha: z.string() }).parse(
      (
        await githubJson(`/repos/${fullName}/git/commits`, token, {
          signal,
          method: "POST",
          body: {
            message: `${request.title}\n\n${request.body}\n\n${trailer}`,
            tree: created.sha,
            parents: [request.baseSha],
          },
        })
      ).data,
    );
    commitSha = commit.sha;
    // The ref may already exist if a previous attempt died after creating it
    // but before this process observed it; adopt it in that case.
    try {
      await githubJson(`/repos/${fullName}/git/refs`, token, {
        signal,
        method: "POST",
        body: { ref: `refs/heads/${branch}`, sha: commit.sha },
      });
    } catch (error) {
      const again = await githubJson(
        `/repos/${fullName}/git/ref/${encodeURIComponent(`heads/${branch}`)}`,
        token,
        { signal, allowNotFound: true },
      );
      if (!again.data) throw error;
      const ref = refSchema.parse(again.data);
      const existingCommit = commitSchema.parse(
        (
          await githubJson(
            `/repos/${fullName}/git/commits/${ref.object.sha}`,
            token,
            { signal },
          )
        ).data,
      );
      if (!existingCommit.message.includes(trailer)) throw error;
      commitSha = existingCommit.sha;
      adopted = true;
    }
  }
  const owner = fullName.split("/")[0];
  const pulls = z
    .array(pullSchema)
    .parse(
      (
        await githubJson(
          `/repos/${fullName}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&per_page=10`,
          token,
          { signal },
        )
      ).data,
    );
  const pull =
    pulls.find((candidate) => candidate.state === "open") ??
    pulls.find((candidate) => candidate.merged) ??
    pulls[0];
  if (pull)
    return {
      branch,
      commitSha,
      pullRequestNumber: pull.number,
      pullRequestUrl: pull.html_url,
      adopted: true,
    };
  const createdPull = pullSchema.parse(
    (
      await githubJson(`/repos/${fullName}/pulls`, token, {
        signal,
        method: "POST",
        body: {
          title: request.title,
          head: branch,
          base: request.defaultBranch,
          body: request.body,
        },
      })
    ).data,
  );
  return {
    branch,
    commitSha,
    pullRequestNumber: createdPull.number,
    pullRequestUrl: createdPull.html_url,
    adopted,
  };
}

export interface ObservedPullRequest {
  number: number;
  url: string;
  state: "open" | "closed";
  merged: boolean;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  headSha: string;
  headRef: string;
  baseRef: string;
  title: string | null;
}

export async function observePullRequest(
  token: string,
  fullName: string,
  number: number,
  signal?: AbortSignal,
): Promise<ObservedPullRequest> {
  const pull = pullSchema.parse(
    (await githubJson(`/repos/${fullName}/pulls/${number}`, token, { signal }))
      .data,
  );
  return {
    number: pull.number,
    url: pull.html_url,
    state: pull.state,
    merged: Boolean(pull.merged),
    mergedAt: pull.merged_at ?? null,
    mergeCommitSha: pull.merge_commit_sha ?? null,
    headSha: pull.head.sha,
    headRef: pull.head.ref,
    baseRef: pull.base.ref,
    title: pull.title ?? null,
  };
}

/** The pull request whose head is the given branch, if one exists. */
export async function findPullRequestForBranch(
  token: string,
  fullName: string,
  branch: string,
  signal?: AbortSignal,
) {
  const owner = fullName.split("/")[0];
  const pulls = z
    .array(pullSchema)
    .parse(
      (
        await githubJson(
          `/repos/${fullName}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&per_page=10`,
          token,
          { signal },
        )
      ).data,
    );
  const pull =
    pulls.find((candidate) => candidate.merged) ??
    pulls.find((candidate) => candidate.state === "open") ??
    pulls[0];
  return pull ? observePullRequest(token, fullName, pull.number, signal) : null;
}

export async function observeBranchHead(
  token: string,
  fullName: string,
  branch: string,
  signal?: AbortSignal,
) {
  return z
    .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
    .parse(
      (
        await githubJson(
          `/repos/${fullName}/commits/${encodeURIComponent(branch)}`,
          token,
          { signal },
        )
      ).data,
    ).sha;
}

export async function observeCommit(
  token: string,
  fullName: string,
  sha: string,
  signal?: AbortSignal,
) {
  const commit = z
    .object({
      sha: z.string(),
      commit: z.object({ message: z.string() }),
      parents: z.array(z.object({ sha: z.string() })),
    })
    .parse(
      (await githubJson(`/repos/${fullName}/commits/${sha}`, token, { signal }))
        .data,
    );
  return {
    sha: commit.sha,
    message: commit.commit.message,
    parents: commit.parents.map((parent) => parent.sha),
  };
}

/** How a merged pull request reached the default branch, as far as visible. */
export function classifyMerge(
  mergeCommit: { message: string; parents: string[] },
  pullRequestNumber: number,
): "merge" | "squash" | "rebase" | "unknown" {
  if (mergeCommit.parents.length >= 2) return "merge";
  if (mergeCommit.parents.length === 1)
    return mergeCommit.message.includes(`(#${pullRequestNumber})`)
      ? "squash"
      : "rebase";
  return "unknown";
}

export interface ComparedFile {
  filename: string;
  status: string;
  previousFilename?: string;
}

export async function compareCommits(
  token: string,
  fullName: string,
  base: string,
  head: string,
  signal?: AbortSignal,
): Promise<ComparedFile[]> {
  const files: ComparedFile[] = [];
  for (let page = 1; page <= 10; page++) {
    const result = z
      .object({
        files: z
          .array(
            z.object({
              filename: z.string(),
              status: z.string(),
              previous_filename: z.string().optional(),
            }),
          )
          .optional(),
      })
      .parse(
        (
          await githubJson(
            `/repos/${fullName}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=100&page=${page}`,
            token,
            { signal },
          )
        ).data,
      );
    const batch = result.files ?? [];
    files.push(
      ...batch.map((file) => ({
        filename: file.filename,
        status: file.status,
        ...(file.previous_filename
          ? { previousFilename: file.previous_filename }
          : {}),
      })),
    );
    if (batch.length < 100) break;
  }
  return files;
}

/** File content at a ref, or null when absent; binary content is null too. */
export async function fileContentAt(
  token: string,
  fullName: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await githubJson(
    `/repos/${fullName}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    token,
    { signal, allowNotFound: true },
  );
  if (!response.data) return null;
  const parsed = z
    .object({
      type: z.string(),
      encoding: z.string().optional(),
      content: z.string().optional(),
    })
    .safeParse(response.data);
  if (!parsed.success || parsed.data.type !== "file" || !parsed.data.content)
    return null;
  const buffer = Buffer.from(parsed.data.content, "base64");
  return buffer.includes(0) ? null : buffer.toString("utf8");
}

/**
 * Verifies the minimum permissions publication needs for the chosen
 * mechanism and returns what was observed; a broadly scoped token is not a
 * grant by itself, the engineer's explicit choice records one.
 */
export async function verifyPublicationPermissions(
  token: string,
  fullName: string,
  mechanism: "cli" | "app",
  installationId: number | null,
  signal?: AbortSignal,
): Promise<{
  ok: boolean;
  reason: string | null;
  observed: Record<string, unknown>;
}> {
  const repository = z
    .object({
      permissions: z.record(z.string(), z.boolean()).optional(),
      default_branch: z.string(),
    })
    .parse((await githubJson(`/repos/${fullName}`, token, { signal })).data);
  if (mechanism === "app") {
    if (!installationId)
      return {
        ok: false,
        reason: "No App installation is recorded for this repository.",
        observed: {},
      };
    const installationSchema = z.object({
      id: z.number().int(),
      permissions: z.record(z.string(), z.string()),
      suspended_at: z.string().nullable(),
    });
    let installation: z.infer<typeof installationSchema> | undefined;
    // Device login yields an App user token. GitHub exposes installation
    // permissions on this list, not GET /user/installations/{id}.
    for (let page = 1; page <= 20; page++) {
      const { installations } = z
        .object({ installations: z.array(installationSchema) })
        .parse(
          (
            await githubJson(
              `/user/installations?per_page=100&page=${page}`,
              token,
              { signal },
            )
          ).data,
        );
      installation = installations.find((item) => item.id === installationId);
      if (installation || installations.length < 100) break;
    }
    if (!installation || installation.suspended_at)
      return {
        ok: false,
        reason:
          "The recorded GitHub App installation is unavailable or suspended. Check its installation and repository access on GitHub.",
        observed: { installationId },
      };
    const contents = installation.permissions.contents;
    const pulls = installation.permissions.pull_requests;
    const ok = contents === "write" && pulls === "write";
    return {
      ok,
      reason: ok
        ? null
        : `The GitHub App installation grants contents: ${contents ?? "none"}, pull_requests: ${pulls ?? "none"}; publication needs write access to both. Update the App's permissions and re-approve the installation.`,
      observed: { installationId, permissions: installation.permissions },
    };
  }
  const push = repository.permissions?.push === true;
  return {
    ok: push,
    reason: push
      ? null
      : "This login cannot push to the repository; publication needs push access.",
    observed: { accountRepositoryPermissions: repository.permissions ?? {} },
  };
}
