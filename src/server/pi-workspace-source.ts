import { fetchBaseTree } from "./execution-tree";
import type { WorkspaceSource } from "./pi-workspace";

/** Resolve source lazily; GitHub credentials never enter the shell. */
export async function applicationWorkspaceSource(
  applicationId: string,
  signal?: AbortSignal,
): Promise<WorkspaceSource> {
  const { applicationDeployment } = await import("./deployment-store");
  const deployment = applicationDeployment(applicationId);
  if (deployment?.revision) {
    const { checkDeploymentSource } = await import("./deployment-source");
    const { token } = await checkDeploymentSource(deployment);
    return {
      description: `${deployment.repository}@${deployment.revision}`,
      files: await fetchBaseTree(
        deployment.repository,
        deployment.revision,
        token,
        signal,
      ),
    };
  }
  // Before a deployment selects a revision, read the default branch as it is
  // now, through the repository identity its access check recorded.
  const { getApplication, latestObservation } = await import("./db");
  const { REPOSITORY_OBSERVATION } = await import("./applications");
  const { connectedGithubCredential } = await import("./github-connection");
  const { githubJson } = await import("./github-api");
  const application = getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  const repository = `${application.repositoryOwner}/${application.repositoryName}`;
  const { token } = await connectedGithubCredential();
  const found = (await githubJson(`/repos/${repository}`, token, { signal }))
    .data as { id?: number; default_branch?: string };
  const recorded = latestObservation(applicationId, REPOSITORY_OBSERVATION)
    ?.raw as { repositoryId?: number } | undefined;
  if (
    recorded?.repositoryId !== undefined &&
    found.id !== recorded.repositoryId
  )
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
  return {
    description: `${repository}@${commit.sha}, the ${branch} branch when this request started; no deployment has selected a revision yet`,
    files: await fetchBaseTree(repository, commit.sha, token, signal),
  };
}
