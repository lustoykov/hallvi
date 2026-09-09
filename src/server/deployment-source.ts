import { currentContract, listObservations } from "./db";
import {
  connectedGithubCredential,
  currentGithubConnectionId,
} from "./github-connection";
import { githubJson } from "./github-api";
import type { DeploymentRecord } from "./deployment-types";

// Provider identity, source identity and immutable revision are distinct facts.
export async function checkDeploymentSource(
  record: DeploymentRecord,
  bind = false,
) {
  const { connection, token } = await connectedGithubCredential();
  if (
    !bind &&
    (!record.repositoryId || record.githubConnectionId !== connection.id)
  )
    throw new Error(
      "GitHub access changed or this recommendation lacks source identity. Prepare and review a new recommendation.",
    );
  const { data } = await githubJson(`/repos/${record.repository}`, token);
  const repository = data as { id?: number; full_name?: string };
  const observation = listObservations(record.applicationId).find(
    (o) =>
      o.kind === "github-repository-identity" &&
      o.status === "passed" &&
      typeof o.raw === "object" &&
      o.raw !== null &&
      "repositoryId" in o.raw,
  );
  const observedId =
    observation?.raw &&
    typeof observation.raw === "object" &&
    "repositoryId" in observation.raw
      ? observation.raw.repositoryId
      : undefined;
  const expected = record.repositoryId ?? observedId;
  if (
    !Number.isSafeInteger(repository.id) ||
    (expected !== undefined && repository.id !== expected) ||
    repository.full_name?.toLowerCase() !== record.repository.toLowerCase()
  )
    throw new Error(
      "Repository identity changed. Review the application's GitHub source before deploying.",
    );
  if (currentGithubConnectionId() !== connection.id)
    throw new Error(
      "GitHub access changed during source inspection. Try again.",
    );
  if (bind) {
    record.repositoryId = repository.id;
    record.githubConnectionId = connection.id;
    record.inspectedRevision =
      currentContract(record.applicationId)?.commitSha ?? null;
  }
  if (record.revision) {
    const { data: commit } = await githubJson(
      `/repos/${record.repository}/commits/${record.revision}`,
      token,
    );
    if ((commit as { sha?: string }).sha !== record.revision)
      throw new Error(
        "GitHub did not confirm the selected deployment revision.",
      );
  }
  return { token };
}
