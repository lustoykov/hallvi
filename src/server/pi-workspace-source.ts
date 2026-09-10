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
  const { repositoryEvidence } = await import("./phase-two");
  const evidence = repositoryEvidence(applicationId);
  if (!evidence.current || !evidence.commitSha)
    return {
      description:
        "No current repository revision has been selected. This is an empty scratch workspace; use repository inspection to select source.",
      files: [],
    };
  const { getApplication } = await import("./db");
  const { connectedGithubCredential } = await import("./github-connection");
  const application = getApplication(applicationId);
  const credential = await connectedGithubCredential();
  if (!application || credential.connection.id !== evidence.connectionId)
    throw new Error("Repository access changed since inspection.");
  const repository = `${application.repositoryOwner}/${application.repositoryName}`;
  return {
    description: `${repository}@${evidence.commitSha}`,
    files: await fetchBaseTree(
      repository,
      evidence.commitSha,
      credential.token,
      signal,
    ),
  };
}
