import { describe, expect, it } from "vitest";

import { validateContractProposal } from "../../../src/server/application-contract";
import { APPLICATION_PROFILE } from "../../../src/server/application-profile";
import {
  buildConformanceBrief,
  executionConfiguration,
  secretVariableNames,
} from "../../../src/server/conformance-brief";
import type {
  ApplicationContractRecord,
  ApplicationRecord,
  Observation,
  ProfileResolution,
} from "../../../src/server/types";
import {
  buildContractProposal,
  type SeenRead,
} from "../../fixtures/contract-builder";
import {
  fixtureTree,
  repositoryFixtures,
  type RepositoryFixtureName,
} from "../../fixtures/repositories";

const COMMIT = "a".repeat(40);
const application: ApplicationRecord = {
  id: "app",
  name: "todo",
  repositoryUrl: "https://github.com/qa/todo",
  repositoryOwner: "qa",
  repositoryName: "todo",
  environment: "production",
  approvalMode: "always-ask",
  approvalScope: "Current application launch",
  createdAt: "",
  updatedAt: "",
};
const matched: ProfileResolution = {
  status: "matched",
  profileId: APPLICATION_PROFILE.id,
  profileVersion: APPLICATION_PROFILE.version,
  label: APPLICATION_PROFILE.label,
  criteria: [],
  reason: null,
};

function contractFor(name: RepositoryFixtureName): ApplicationContractRecord {
  const files = repositoryFixtures[name];
  const observations = new Map<string, Observation>();
  observations.set("inspection", {
    id: "inspection",
    applicationId: "app",
    kind: "github-repository-inspection",
    status: "passed",
    summary: "",
    sourceLabel: "",
    sourceUrl: null,
    raw: { commitSha: COMMIT, entries: fixtureTree(files), truncated: false },
    observedAt: "",
  });
  const reads: SeenRead[] = files.map((file) => {
    observations.set(`read:${file.path}`, {
      id: `read:${file.path}`,
      applicationId: "app",
      kind: "github-repository-file",
      status: "passed",
      summary: "",
      sourceLabel: "",
      sourceUrl: null,
      raw: { commitSha: COMMIT, path: file.path, content: file.content },
      observedAt: "",
    });
    return {
      status: "read",
      observationId: `read:${file.path}`,
      path: file.path,
      content: file.content,
    };
  });
  const proposal = validateContractProposal(
    buildContractProposal(
      {
        inspection: { observationId: "inspection", commitSha: COMMIT },
        tree: { entries: fixtureTree(files).map((e) => e.path) },
      },
      reads,
    ),
    {
      applicationId: "app",
      commitSha: COMMIT,
      profile: matched,
      currentContract: null,
      lookups: {
        observation: (id) => observations.get(id) ?? null,
        activeDecision: () => null,
        applicationMessage: () => null,
      },
    },
  );
  return {
    id: "c1",
    applicationId: "app",
    workspaceId: "ws",
    version: 1,
    profileId: proposal.body.profileId,
    profileVersion: proposal.body.profileVersion,
    commitSha: COMMIT,
    sourceMessageId: "m",
    body: proposal.body,
    supersededById: null,
    createdAt: "",
  };
}

describe("the conformance brief", () => {
  it("derives the runner configuration from the contract with synthetic values only", () => {
    const configuration = executionConfiguration(
      contractFor("fastapi-conforming"),
    );
    expect(configuration).toMatchObject({
      port: 8000,
      healthPath: "/health",
      database: "postgresql",
      migrationTool: "alembic",
    });
    expect(configuration.environment.DATABASE_URL).toBe(
      "postgresql+psycopg://app:<synthetic-per-run>@db:5432/app",
    );
    expect(configuration.environment.SECRET_KEY).toMatch(/^synthetic-/);
    expect(configuration.environment.LOG_LEVEL).toBe("info");
    expect(Object.values(configuration.environment).join(" ")).not.toContain(
      "todo:todo",
    );
    expect(secretVariableNames(contractFor("fastapi-conforming"))).toEqual([
      "DATABASE_URL",
      "SECRET_KEY",
    ]);
  });

  it("lists required changes with what the repository does now, and blockers as blockers", () => {
    const brief = buildConformanceBrief(
      application,
      contractFor("fastapi-nohealth"),
      null,
      "main",
    );
    expect(brief.requiredChanges).toEqual([
      expect.objectContaining({
        field: "health.path",
        required: "/health",
        change: expect.stringContaining("GET /health"),
      }),
    ]);
    expect(brief.blockers).toEqual([]);
    expect(brief.exportText).toContain("# Conformance brief for qa/todo");
    expect(brief.exportText).toContain(
      `Starting revision (base): ${COMMIT} on main`,
    );
    expect(brief.exportText).toContain("Health endpoint (health.path)");
    expect(brief.exportText).toContain("Never change:");
    expect(brief.exportText).toContain(
      "Server Guy verifies the merged revision independently",
    );
    expect(brief.scope.forbidden).toContain(
      "GitHub workflows and repository automation",
    );
    const none = buildConformanceBrief(
      application,
      contractFor("fastapi-conforming"),
      null,
      null,
    );
    expect(none.requiredChanges).toEqual([]);
    expect(none.exportText).toContain(
      "candidate revision still needs current conformance evidence",
    );
    expect(none.acceptance.checks.map((check) => check.key)).toEqual([
      "install",
      "configuration",
      "database",
      "migrations",
      "startup",
      "health",
      "behavior",
      "tests",
    ]);
  });
});
