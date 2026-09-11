import { currentFacts } from "./release-facts";
import { deploymentRuntime } from "./deployment-runtime";
import { applicationDeployment } from "./deployment-store";
import { Type } from "typebox";

import { loadChat, repositoryAccess } from "./applications";

// Empty input: the worker supplies the application and Chat from the accepted
// Run, so the model cannot select another application, add filters, or ask for
// a provider refresh. The SDK rejects any additional property before execution.
export const applicationStatusParameters = Type.Object(
  {},
  { additionalProperties: false },
);

// An oversized or malformed projection is a tool error, never a silently
// truncated status.
export const MAX_APPLICATION_STATUS_CHARACTERS = 12_000;

/**
 * Reads this application's saved state for Pi: its identity, the latest
 * repository access check and the recorded deployment. Every call reads the
 * current records; nothing is cached across Runs. `retrievedAt` is when they
 * were read; each fact carries its own observation time. Reading does not
 * recheck GitHub, probe the host or verify anything. A missing or mismatched
 * application/Chat throws, so the model receives a tool error rather than an
 * empty successful result.
 */
export function readPiApplicationStatus(applicationId: string, chatId: string) {
  const { application } = loadChat(applicationId, chatId);
  const access = repositoryAccess(application);
  const raw = (access.observation?.raw ?? {}) as {
    commitSha?: string;
    defaultBranch?: string;
  };
  const deployment = applicationDeployment(application.id);
  const status = {
    retrievedAt: new Date().toISOString(),
    application: {
      id: application.id,
      name: application.name,
      repositoryUrl: application.repositoryUrl,
      updatedAt: application.updatedAt,
    },
    repositoryAccess: {
      status: access.status,
      result: access.result,
      // Evidence from the current GitHub connection only; an older login's
      // check stays history, not support for current access.
      checkedAt: access.current
        ? (access.observation?.observedAt ?? null)
        : null,
      commitSha: access.current ? (raw.commitSha ?? null) : null,
      defaultBranch: access.current ? (raw.defaultBranch ?? null) : null,
    },
    deployment: deployment
      ? {
          status: deployment.status,
          runtime: deploymentRuntime(deployment),
          latestAttempt: deployment.lifecycle?.attempts.at(-1),
          revision: deployment.revision,
          configuration: currentFacts(deployment)?.summary,
          serverId: deployment.serverId,
          address: deployment.address,
          url: deployment.url,
          verifiedAt: deployment.verifiedAt,
          error: deployment.error,
          latestAction: deployment.events.at(-1),
          offer: deployment.offer,
        }
      : null,
  };
  const text = JSON.stringify(status);
  if (text.length > MAX_APPLICATION_STATUS_CHARACTERS)
    throw new Error(
      "The current application status is larger than the supported tool result. Check the application's records in its views.",
    );
  return { status, text };
}
