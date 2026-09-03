import { describe, expect, it } from "vitest";

import { computeChecks } from "../src/server/phase-one-spec";
import type { ApplicationRecord, GateCheck, Observation } from "../src/server/types";

const application: ApplicationRecord = {
  id: "app",
  name: "todo-fastapi",
  repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
  repositoryOwner: "lustoykov",
  repositoryName: "todo-fastapi",
  environment: "production",
  approvalMode: "pi-decides",
  approvalScope: "Current application launch",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function repositoryObservation(status: Observation["status"]): Observation {
  return {
    id: "observation",
    applicationId: "app",
    kind: "github-repository-identity",
    status,
    summary: `repository ${status}`,
    sourceLabel: "GitHub repository check",
    sourceUrl: null,
    raw: {},
    observedAt: "2026-09-01T00:00:02.000Z",
  };
}

const statuses = (checks: GateCheck[]) =>
  Object.fromEntries(checks.map((check) => [check.key, check.status]));

describe("computeChecks", () => {
  it("evaluates configuration independently while waiting for repository evidence", () => {
    expect(statuses(computeChecks(application, null))).toEqual({
      "application-identity": "passed",
      "repository-readable": "not-yet",
      "target-environment": "passed",
      "approval-authority": "passed",
    });
  });

  it("blocks only when the latest repository evidence refutes readability", () => {
    const checks = computeChecks(application, repositoryObservation("failed"));
    expect(statuses(checks)["repository-readable"]).toBe("blocked");
  });

  it("does not claim a repository failure when GitHub could not be checked", () => {
    const checks = computeChecks(application, repositoryObservation("unavailable"));
    expect(statuses(checks)["repository-readable"]).toBe("not-yet");
  });

  it("passes all four checks and cites the exact repository observation", () => {
    const checks = computeChecks(application, repositoryObservation("passed"));
    const repositoryCheck = checks.find((check) => check.key === "repository-readable")!;

    expect(checks).toHaveLength(4);
    expect(checks.every((check) => check.status === "passed")).toBe(true);
    expect(repositoryCheck.evidence).toEqual([
      expect.objectContaining({
        recordType: "observation",
        recordId: "observation",
        role: "Latest repository access result",
      }),
    ]);
  });

});
