import { fetchBaseTree } from "./execution-tree";
import type { WorkspaceSource } from "./pi-workspace";

/** Resolve source lazily; GitHub credentials never enter the shell. */
export async function applicationWorkspaceSource(
  applicationId: string,
  signal?: AbortSignal,
): Promise<WorkspaceSource> {
  // Before a deployment selects a revision, read the default branch as it is
  // now, through the repository identity a successful access check recorded.
  const { getApplication } = await import("./db");
  const { recordedRepositoryId } = await import("./applications");
  const { repositoryCredential } = await import("./github-connection");
  const { githubJson } = await import("./github-api");
  const application = getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  const repository = `${application.repositoryOwner}/${application.repositoryName}`;
  const { token } = await repositoryCredential();
  const found = (await githubJson(`/repos/${repository}`, token, { signal }))
    .data as { id?: number; default_branch?: string };
  // A later failed or unavailable check records no identity; it does not
  // release the one a successful check pinned.
  const pinned = recordedRepositoryId(applicationId);
  if (pinned !== undefined && found.id !== pinned)
    throw new Error(
      "The repository's identity changed since its access check. Check GitHub access before reading it.",
    );
  const branch = found.default_branch ?? "HEAD";
  const commit = (
    await githubJson(
      `/repos/${repository}/commits/${encodeURIComponent(branch)}`,
      token,
      { signal },
    )
  ).data as { sha?: string };
  if (!commit.sha || !/^[0-9a-f]{40}$/.test(commit.sha))
    throw new Error("GitHub did not identify the default branch revision.");
  const snapshot = await fetchBaseTree(repository, commit.sha, token, signal);
  return {
    description:
      `${repository}@${commit.sha}, the ${branch} branch when this request started; repository snapshot for this request` +
      // A missing path must not read as a path that is not in the repository.
      (snapshot.omitted.length
        ? `\nToo large to carry, so left out of this copy (${snapshot.omitted.length} files, largest first): ${snapshot.omitted
            .slice(0, 12)
            .map((file) => `${file.path} (${Math.round(file.bytes / 1024)} KB)`)
            .join(
              ", ",
            )}${snapshot.omitted.length > 12 ? ", …" : ""}. These paths exist upstream; read them on GitHub or on the server if you need them.`
        : ""),
    files: snapshot.files,
  };
}
