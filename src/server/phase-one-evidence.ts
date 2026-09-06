import { latestObservation } from "./db";
import { currentGithubConnectionId } from "./github-connection";
import { computeChecks } from "./phase-one-spec";
import type { ApplicationRecord } from "./types";

export const REPOSITORY_OBSERVATION = "github-repository-identity";

// The latest repository Observation and the login it must match. Every gate
// evaluation reads both from current records; nothing caches a result.
export function currentRepositoryEvidence(application: ApplicationRecord) {
  return {
    repository: latestObservation(application.id, REPOSITORY_OBSERVATION),
    connectionId: currentGithubConnectionId(),
  };
}

export function currentPhaseOneChecks(application: ApplicationRecord) {
  const { repository, connectionId } = currentRepositoryEvidence(application);
  return computeChecks(application, repository, connectionId);
}
