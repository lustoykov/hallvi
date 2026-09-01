import { describe, expect, it } from "vitest";

import { PREREQUISITES, computeChecks } from "../src/server/phase-one-spec";
import type {
  ApplicationRecord,
  BlockerRecord,
  GateCheck,
  ObservationRecord,
} from "../src/server/types";

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

const blockers: BlockerRecord[] = PREREQUISITES.map((prerequisite) => ({
  id: prerequisite.key,
  workspaceId: "workspace",
  ...prerequisite,
  status: "open",
  createdAt: "2026-09-01T00:00:01.000Z",
  resolvedAt: null,
}));

function repositoryObservation(status: ObservationRecord["status"]): ObservationRecord {
  return {
    id: "observation",
    applicationId: "app",
    workspaceId: "workspace",
    kind: "github-repository-identity",
    status,
    summary: `repository ${status}`,
    sourceLabel: "GitHub commit",
    sourceUrl: null,
    raw: {},
    observedAt: "2026-09-01T00:00:02.000Z",
  };
}

const statuses = (checks: GateCheck[]) =>
  Object.fromEntries(checks.map((check) => [check.key, check.status]));

describe("computeChecks", () => {
  it("waits for the repository observation before passing the repository and authority checks", () => {
    expect(statuses(computeChecks(application, null, blockers))).toEqual({
      "application-identity": "passed",
      "repository-readable": "not-yet",
      "target-environment": "passed",
      "approval-authority": "not-yet",
      "intent-prerequisites": "passed",
    });
  });

  it("blocks the repository check on a failed observation while still recording authority", () => {
    const checks = computeChecks(application, repositoryObservation("failed"), blockers);
    expect(statuses(checks)["repository-readable"]).toBe("blocked");
    expect(statuses(checks)["approval-authority"]).toBe("passed");
    expect(checks.find((check) => check.key === "approval-authority")?.result).toContain(
      "not currently available",
    );
  });

  it("passes every check once the repository is readable and prerequisites are recorded", () => {
    const checks = computeChecks(application, repositoryObservation("passed"), blockers);
    expect(checks.every((check) => check.status === "passed")).toBe(true);
    expect(checks.find((check) => check.key === "approval-authority")?.observationId).toBe(
      "observation",
    );
  });

  it("keeps the prerequisites check open until every prerequisite is recorded", () => {
    const checks = computeChecks(application, repositoryObservation("passed"), blockers.slice(1));
    expect(statuses(checks)["intent-prerequisites"]).toBe("not-yet");
  });
});
