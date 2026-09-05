import { randomUUID } from "node:crypto";
import * as database from "../../src/server/db";
import { saveGithubConnection } from "../../src/server/github-connection";
import { getPhaseOneOperatorView } from "../../src/server/phase-one";
import type { PhaseOneEvalCase } from "./phase-one-cases";

/** Seed real local records, never perform a GitHub login or repository request.
 * Call only after the runner has selected its scratch DB and config directory.
 */
export function seedPhaseOneEvalCase(
  scenario: PhaseOneEvalCase,
  repetition: number,
) {
  if (!process.env.SERVER_GUY_DB_PATH || !process.env.SERVER_GUY_CONFIG_DIR)
    throw new Error(
      "Select the eval scratch database and config before seeding.",
    );
  // Connection state is global to the instance, so reset it between cases too.
  saveGithubConnection(null);
  const name = `${scenario.id}-${repetition}`;
  const application = database.insertApplication({
    name,
    repositoryUrl: `https://github.com/qa/${name}`,
    repositoryOwner: "qa",
    repositoryName: name,
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Current application launch",
  });
  const workspace = database.insertWorkspace(application.id);
  const chat = database.insertChat(workspace.id, "Launch Brief", true);
  if (scenario.existingPriority) {
    const source = database.insertMessage(
      chat.id,
      "user",
      scenario.existingPriority,
      "user",
    );
    database.insertMessage(
      chat.id,
      "assistant",
      "Your launch priority is recorded.",
      "pi",
    );
    database.insertDecision({
      applicationId: application.id,
      sourceMessageId: source.id,
      kind: "launch-priority",
      label: "Additional launch priority",
      value: scenario.existingPriority,
    });
  }
  if (scenario.githubState) {
    const oldConnectionId = randomUUID();
    const connectionId =
      scenario.githubState === "reconnected" ? randomUUID() : oldConnectionId;
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
    const denied = scenario.githubState === "access-denied";
    const commitSha = "abcdef12".repeat(5);
    const commitUrl = `${application.repositoryUrl}/commit/${commitSha}`;
    database.insertObservation({
      applicationId: application.id,
      kind: "github-repository-identity",
      status: denied ? "failed" : "passed",
      summary: denied
        ? "Allow this exact repository in Server Guy’s GitHub App installation, then run the check again."
        : `qa/${name} is readable at main · ${commitSha.slice(0, 8)}.`,
      sourceLabel: denied ? "GitHub repository check" : "GitHub commit",
      sourceUrl: denied ? application.repositoryUrl : commitUrl,
      raw: {
        connectionId: oldConnectionId,
        repository: `qa/${name}`,
        authenticatedAs:
          scenario.githubState === "reconnected"
            ? "previous-eval-user"
            : "eval-user",
        ...(denied
          ? {}
          : { repositoryId: 123, defaultBranch: "main", commitSha, commitUrl }),
      },
    });
    if (scenario.githubState === "reconnected") {
      database.insertMessage(
        chat.id,
        "user",
        "Are all four Launch Brief checks complete?",
        "user",
      );
      database.insertMessage(
        chat.id,
        "assistant",
        "All four Launch Brief checks passed. The Launch Brief is ready.",
        "pi",
      );
    }
  }
  return getPhaseOneOperatorView(application.id, chat.id);
}
