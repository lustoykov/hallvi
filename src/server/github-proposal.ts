// Proposing a deployment-related change back to the owner's repository: a
// branch and a pull request, never a write to the branch they deploy from.
//
// The workspace is a folder holding a copy of one commit, not a checkout, so
// there is no `git push` to reach for and nothing inside the copy that knows
// where it came from. The revision is carried beside the copy
// (WorkspaceProvenance) and the commit is assembled through GitHub's git data
// API: blob, tree on top of that exact commit's tree, commit, ref, pull
// request. That is what makes the published diff the diff Hallvi inspected
// even when the branch has moved on since the copy was taken.
//
// The token never leaves this module. It is not passed to a shell, written
// into a remote, put in the commit, the branch name, the pull request or any
// record; what the caller gets back is a URL and a list of paths.
import { z } from "zod";

import { GithubAccessError, githubJson } from "./github-api";
import { connectedGithubCredential } from "./github-connection";
import { installationForRepository } from "./github";
import type { CapturedFile, WorkspaceProvenance } from "./pi-workspace";
import { deniedPathReason, redactSecrets } from "./secrets";

/** Small, narrow changes: packaging, configuration, a startup fix. */
export const PROPOSAL_LIMITS = {
  paths: 25,
  fileBytes: 1024 * 1024,
  totalBytes: 4 * 1024 * 1024,
} as const;

const BRANCH_PREFIX = "hallvi/";

export interface ProposedChange {
  path: string;
  change: "added" | "modified";
}

export interface ProposalOutcome {
  /**
   * `opened` a pull request, `reused` one that was already open for this
   * branch, `branch-only` when the branch is published and the pull request
   * is not, and `no-changes` when nothing in the workspace differs.
   */
  status: "opened" | "reused" | "branch-only" | "no-changes";
  repository: string;
  /** The branch the pull request merges into: the one the copy came from. */
  base: string;
  /** The revision the copy was made from, which the diff is against. */
  sourceRevision: string;
  /** Where that branch is now, so a moved base is visible, not guessed. */
  baseRevision: string;
  branch?: string;
  commit?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  changes: ProposedChange[];
  /** Paths that were asked for and left out, each with the reason. */
  skipped: Array<{ path: string; reason: string }>;
  /** What did not finish, when something did not. */
  problem?: string;
}

export function normalizeProposalBranch(value: string) {
  const raw = value.trim().replace(/^refs\/heads\//, "");
  const suffix = raw.startsWith(BRANCH_PREFIX)
    ? raw.slice(BRANCH_PREFIX.length)
    : raw;
  const branch = `${BRANCH_PREFIX}${suffix
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^[-._/]+|[-._/]+$/g, "")
    .replace(/\/{2,}/g, "/")
    .slice(0, 60)}`;
  if (branch === BRANCH_PREFIX || /\.\.|@\{|\.lock(\/|$)/.test(branch))
    throw new Error(
      "Give the branch a short name describing the change, such as “add-dockerfile”.",
    );
  return branch;
}

function pathProblem(path: string) {
  if (deniedPathReason(path))
    return `it is a credential path Hallvi never reads or writes (${deniedPathReason(path)})`;
  if (
    /(^|\/)(node_modules|\.next|dist|build|coverage|__pycache__)(\/|$)/.test(
      path,
    )
  )
    return "it is build output or installed dependencies rather than source";
  return null;
}

const repositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string(),
  default_branch: z.string().min(1),
  archived: z.boolean().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

/**
 * A login with write authority over this repository, or an error saying which
 * of the three separate things is missing: a connected account, this
 * repository inside the App's installation, or the write permissions GitHub
 * grants that installation.
 */
async function publishingAuthority(
  repository: string,
  signal?: AbortSignal,
): Promise<{ token: string; repo: z.infer<typeof repositorySchema> }> {
  const { connection, token } = await connectedGithubCredential();
  const repo = repositorySchema.parse(
    (await githubJson(`/repos/${repository}`, token, { signal })).data,
  );
  if (repo.archived)
    throw new GithubAccessError(
      `${repo.full_name} is archived on GitHub, so it accepts no branches or pull requests. Unarchive it to propose changes.`,
      "access",
    );
  const found = await installationForRepository(token, connection, repo);
  if (!found)
    throw new GithubAccessError(
      `Hallvi's GitHub App is not installed on ${repo.full_name.split("/")[0]}, so it cannot open a branch there. ` +
        (repo.permissions?.push
          ? "Install it for this repository from Settings → GitHub, then try again."
          : "Publishing into a repository you cannot write to would need a fork of your own, which Hallvi does not create: fork it on GitHub, add the fork as this application's repository, and propose the change there."),
      "access",
    );
  if (found.installation.suspended_at)
    throw new GithubAccessError(
      "Hallvi's GitHub App installation is suspended. Reactivate it on GitHub, then try again.",
      "access",
    );
  if (!found.listsRepository)
    throw new GithubAccessError(
      `Allow ${repo.full_name} in Hallvi's GitHub App installation on GitHub, then try again.`,
      "access",
    );
  const granted = found.installation.permissions;
  const missing = [
    granted.contents === "write" ? null : "Contents: read and write",
    granted.pull_requests === "write" ? null : "Pull requests: read and write",
  ].filter((each): each is string => Boolean(each));
  if (missing.length)
    throw new GithubAccessError(
      `Hallvi's GitHub App installation does not grant ${missing.join(" or ")} on ${repo.full_name}, so it can read the repository but not propose a change to it. Review the installation's permissions on GitHub and accept the update, then try again.`,
      "access",
    );
  return { token, repo };
}

/** The file at this path on this revision, or null when there is none. */
async function contentAt(
  repository: string,
  path: string,
  revision: string,
  token: string,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  const found = (
    await githubJson(
      `/repos/${repository}/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}?ref=${encodeURIComponent(revision)}`,
      token,
      { signal, allowNotFound: true },
    )
  ).data as {
    type?: string;
    encoding?: string;
    content?: string;
    sha?: string;
  } | null;
  if (!found) return null;
  if (found.type !== "file")
    throw new GithubAccessError(
      `${path} is not a file in ${repository}, so it cannot be replaced by one.`,
      "access",
    );
  if (found.encoding === "base64" && found.content !== undefined)
    return Buffer.from(found.content, "base64");
  // Over a megabyte the contents endpoint answers without the bytes; the blob
  // behind it still has them.
  const blob = (
    await githubJson(`/repos/${repository}/git/blobs/${found.sha}`, token, {
      signal,
    })
  ).data as { content?: string; encoding?: string };
  if (blob.encoding !== "base64" || blob.content === undefined)
    throw new GithubAccessError(
      `GitHub did not return the current contents of ${path}.`,
      "access",
    );
  return Buffer.from(blob.content, "base64");
}

export interface ProposalRequest {
  provenance: WorkspaceProvenance;
  /** The workspace's own copy of each path; null when it has none. */
  files: Map<string, CapturedFile | null>;
  branch: string;
  title: string;
  body: string;
  signal?: AbortSignal;
}

/**
 * Publish the workspace's version of these paths on a branch of its own and
 * open a pull request into the branch the copy came from.
 *
 * Nothing here merges, deploys or touches the base branch. A second call with
 * the same branch continues the work already there rather than opening a
 * second one: it commits on top of that branch when it descends from the same
 * revision, and returns the pull request that is already open for it.
 */
export async function proposeRepositoryChanges(
  request: ProposalRequest,
): Promise<ProposalOutcome> {
  const { provenance, signal } = request;
  const repository = provenance.repository;
  const base = provenance.branch;
  const branch = normalizeProposalBranch(request.branch);
  if (base === "HEAD")
    throw new Error(
      `GitHub did not name a default branch for ${repository}, so there is nothing to open a pull request against.`,
    );
  if (branch === base)
    throw new Error(
      `${branch} is the branch this application deploys from. A proposed change goes on a branch of its own.`,
    );

  const { token, repo } = await publishingAuthority(repository, signal);
  if (
    provenance.repositoryId !== undefined &&
    repo.id !== provenance.repositoryId
  )
    throw new GithubAccessError(
      "This repository's identity changed since the copy was taken. Check GitHub access before publishing to it.",
      "access",
    );
  if (repo.default_branch !== base)
    throw new Error(
      `The copy was taken from ${base}, and ${repository}'s default branch is now ${repo.default_branch}. Start the work again so the change is proposed against the branch it was written for.`,
    );

  // Where the branch already is, and whether it grew out of the same revision.
  const existingRef = (
    await githubJson(
      `/repos/${repository}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
      token,
      { signal, allowNotFound: true },
    )
  ).data as { object?: { sha?: string } } | null;
  const existingTip = existingRef?.object?.sha;
  if (existingTip) {
    const comparison = (
      await githubJson(
        `/repos/${repository}/compare/${provenance.commitSha}...${existingTip}`,
        token,
        { signal },
      )
    ).data as { status?: string };
    if (!["ahead", "identical"].includes(comparison.status ?? ""))
      throw new Error(
        `${branch} already exists in ${repository} and does not continue ${provenance.commitSha.slice(0, 8)}, the revision this work is based on. Publish under a different branch name, or look at that branch on GitHub first.`,
      );
  }
  const parent = existingTip ?? provenance.commitSha;

  const skipped: ProposalOutcome["skipped"] = [];
  const changes: ProposedChange[] = [];
  const blobs: Array<{ path: string; sha: string; mode: string }> = [];
  let total = 0;
  for (const [path, file] of request.files) {
    const refused = pathProblem(path);
    if (refused) {
      skipped.push({ path, reason: `It was left out because ${refused}.` });
      continue;
    }
    if (provenance.omitted.includes(path)) {
      skipped.push({
        path,
        reason:
          "The copy was too large to carry this file, so the workspace never held the real one and it cannot be published from here.",
      });
      continue;
    }
    if (provenance.withheld?.includes(path)) {
      skipped.push({
        path,
        reason:
          "The workspace holds this file only with its credential-shaped text redacted, so publishing it would write [REDACTED] over the real values.",
      });
      continue;
    }
    if (file === null) {
      skipped.push({
        path,
        reason:
          "The workspace has no such file. Removing files is not part of proposing a change; write the file first, or leave the path out.",
      });
      continue;
    }
    const content = file.content;
    if (content.length > PROPOSAL_LIMITS.fileBytes) {
      skipped.push({
        path,
        reason: `It is larger than the ${Math.round(PROPOSAL_LIMITS.fileBytes / 1024)} KB a proposed change may carry.`,
      });
      continue;
    }
    // A command run in the workspace can leave a real credential in a file.
    if (!content.includes(0) && redactSecrets(content.toString("utf8")).count) {
      skipped.push({
        path,
        reason:
          "It contains credential-shaped text. A proposed change never carries a secret into the repository; use the application's environment instead.",
      });
      continue;
    }
    const current = await contentAt(repository, path, parent, token, signal);
    if (current && current.equals(content)) continue;
    total += content.length;
    if (total > PROPOSAL_LIMITS.totalBytes)
      throw new Error(
        `These changes are larger than the ${Math.round(PROPOSAL_LIMITS.totalBytes / 1024 / 1024)} MB a proposed change may carry. Propose the narrow operability change on its own.`,
      );
    const blob = (
      await githubJson(`/repos/${repository}/git/blobs`, token, {
        signal,
        method: "POST",
        body: { content: content.toString("base64"), encoding: "base64" },
      })
    ).data as { sha?: string };
    if (!blob.sha)
      throw new GithubAccessError(
        `GitHub did not store the new contents of ${path}.`,
        "access",
      );
    blobs.push({
      path,
      sha: blob.sha,
      mode: file.executable ? "100755" : "100644",
    });
    changes.push({ path, change: current ? "modified" : "added" });
  }

  const baseRevision = (
    (
      await githubJson(
        `/repos/${repository}/commits/${encodeURIComponent(base)}`,
        token,
        { signal },
      )
    ).data as { sha: string }
  ).sha;
  const unchanged = {
    repository,
    base,
    sourceRevision: provenance.commitSha,
    baseRevision,
    changes,
    skipped,
  };
  // A branch already carrying work is the retry case: the commit was made,
  // and whatever failed after it must not make it again.
  const alreadyPublished = Boolean(
    existingTip && existingTip !== provenance.commitSha,
  );
  if (!blobs.length)
    return alreadyPublished
      ? // Nothing new to commit, and a branch that already holds work: this is
        // the retry after a pull request that did not open.
        pullRequestFor({
          published: { ...unchanged, branch, commit: existingTip! },
          request,
          provenance,
          owner: repo.full_name.split("/")[0],
          branch,
          base,
          token,
          signal,
        })
      : {
          ...unchanged,
          status: "no-changes" as const,
          problem: skipped.length
            ? "Nothing was published: every path was either already identical to the repository's or left out."
            : "Nothing was published: the workspace's copies of these files are identical to the repository's.",
        };

  const tree = (
    await githubJson(`/repos/${repository}/git/trees`, token, {
      signal,
      method: "POST",
      body: {
        base_tree: parent,
        tree: blobs.map((blob) => ({
          path: blob.path,
          mode: blob.mode,
          type: "blob",
          sha: blob.sha,
        })),
      },
    })
  ).data as { sha?: string };
  const commit = (
    await githubJson(`/repos/${repository}/git/commits`, token, {
      signal,
      method: "POST",
      body: {
        message: `${redactSecrets(request.title.trim()).text.slice(0, 72)}\n\nProposed by Hallvi from ${repository}@${provenance.commitSha}.`,
        tree: tree.sha,
        parents: [parent],
      },
    })
  ).data as { sha?: string };
  if (!commit.sha)
    throw new GithubAccessError(
      "GitHub did not record the commit for this change.",
      "access",
    );

  const reference = `heads/${branch}`
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  if (existingTip)
    await githubJson(`/repos/${repository}/git/refs/${reference}`, token, {
      signal,
      method: "PATCH",
      body: { sha: commit.sha, force: false },
    });
  else
    await githubJson(`/repos/${repository}/git/refs`, token, {
      signal,
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });

  // Past this line the branch exists on GitHub. Whatever happens next, the
  // caller is told about it: a branch nobody mentioned is work the owner
  // cannot find and a retry would duplicate.
  return pullRequestFor({
    published: { ...unchanged, branch, commit: commit.sha },
    request,
    provenance,
    owner: repo.full_name.split("/")[0],
    branch,
    base,
    token,
    signal,
  });
}

/**
 * The pull request for a branch that is already on GitHub: the one already
 * open for it, or a new one. A failure here never becomes a failure of the
 * whole thing, because the branch is published either way and the owner has
 * to be told where it is.
 */
async function pullRequestFor(options: {
  published: Omit<ProposalOutcome, "status"> & {
    branch: string;
    commit: string;
  };
  request: ProposalRequest;
  provenance: WorkspaceProvenance;
  owner: string;
  branch: string;
  base: string;
  token: string;
  signal?: AbortSignal;
}): Promise<ProposalOutcome> {
  const { published, request, owner, branch, base, token, signal } = options;
  const repository = published.repository;
  try {
    const open = (
      await githubJson(
        `/repos/${repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
        token,
        { signal },
      )
    ).data as Array<{ number: number; html_url: string }>;
    if (open.length)
      return {
        ...published,
        status: "reused",
        pullRequestNumber: open[0].number,
        pullRequestUrl: open[0].html_url,
      };
    const created = (
      await githubJson(`/repos/${repository}/pulls`, token, {
        signal,
        method: "POST",
        body: {
          title: redactSecrets(request.title.trim()).text.slice(0, 256),
          head: branch,
          base,
          body: proposalBody(request, options.provenance, published.changes),
          maintainer_can_modify: true,
        },
      })
    ).data as { number?: number; html_url?: string };
    return {
      ...published,
      status: "opened",
      pullRequestNumber: created.number,
      pullRequestUrl: created.html_url,
    };
  } catch (error) {
    return {
      ...published,
      status: "branch-only",
      problem: `The branch ${branch} is published at ${published.commit.slice(0, 8)}, and the pull request was not opened: ${error instanceof Error ? error.message : "GitHub refused the request."} Open it on GitHub, or ask again with the same branch name — the commit is already there and will not be made twice.`,
    };
  }
}

function proposalBody(
  request: ProposalRequest,
  provenance: WorkspaceProvenance,
  changes: ProposedChange[],
) {
  return redactSecrets(
    [
      request.body.trim(),
      "",
      "---",
      "",
      `Proposed by Hallvi while operating this application. Based on \`${provenance.repository}@${provenance.commitSha}\`, the \`${provenance.branch}\` branch as it was when this work started.`,
      "",
      ...changes.map((change) => `- \`${change.path}\` (${change.change})`),
      "",
      "Nothing is merged or deployed by this pull request.",
    ].join("\n"),
  ).text.slice(0, 60_000);
}
