import { describe, expect, it } from "vitest";

import { computePhaseTwoChecks } from "../../../src/server/phase-two-spec";
import type {
  ApplicationContractView,
  Observation,
  ProfileResolution,
} from "../../../src/server/types";

const COMMIT = "c".repeat(40);
const inspection = (status: Observation["status"] = "passed"): Observation => ({
  id: "inspection",
  applicationId: "app",
  kind: "github-repository-inspection",
  status,
  summary:
    status === "passed"
      ? "Inspected qa/app at main · cccccccc: 9 files in 3 directories."
      : status === "failed"
        ? "Repository inspection did not pass: denied."
        : "Repository inspection is unavailable: timeout.",
  sourceLabel: "Repository inspection",
  sourceUrl: null,
  raw: { commitSha: COMMIT, entries: [] },
  observedAt: "2026-09-06T10:00:00.000Z",
});
const resolution = (
  status: ProfileResolution["status"],
  reason: string | null = null,
): ProfileResolution => ({
  status,
  profileId: "fastapi-uv",
  profileVersion: 1,
  label: "FastAPI + uv",
  criteria: [],
  reason,
});
function contract(
  overrides: Partial<ApplicationContractView> = {},
): ApplicationContractView {
  return {
    id: "contract-1",
    applicationId: "app",
    workspaceId: "ws",
    version: 1,
    profileId: "fastapi-uv",
    profileVersion: 1,
    commitSha: COMMIT,
    sourceMessageId: "m",
    body: {
      profileId: "fastapi-uv",
      profileVersion: 1,
      commitSha: COMMIT,
      summary: "x",
      fields: [
        {
          key: "health.path",
          value: "/health",
          provenance: { kind: "profile-rule", ruleId: "health-path" },
          conformance: { observed: "none", change: "add" },
        },
        {
          key: "backup.policy",
          value: null,
          provenance: {
            kind: "unresolved",
            blocker: "policy",
            dependency: "U1",
            reason: "open",
          },
        },
      ],
    },
    supersededById: null,
    createdAt: "2026-09-06T10:05:00.000Z",
    gaps: { blockers: [], conformance: [], policies: [] },
    provenanceIssues: [],
    ...overrides,
  };
}
const statuses = (checks: ReturnType<typeof computePhaseTwoChecks>) =>
  Object.fromEntries(checks.map((check) => [check.key, check.status]));
const results = (checks: ReturnType<typeof computePhaseTwoChecks>) =>
  Object.fromEntries(checks.map((check) => [check.key, check.result]));

describe("Phase 2 checks", () => {
  it("asks for GitHub, then an inspection, before anything else", () => {
    const disconnected = computePhaseTwoChecks({
      inspection: null,
      inspectionConnectionCurrent: false,
      githubConnected: false,
      resolution: resolution("not-inspected"),
      contract: null,
    });
    expect(statuses(disconnected)).toEqual({
      "profile-resolved": "not-yet",
      "contract-complete": "not-yet",
      "contract-provenance": "not-yet",
      "contract-gaps": "not-yet",
    });
    expect(results(disconnected)["profile-resolved"]).toBe(
      "Connect GitHub, then inspect the repository.",
    );
    expect(disconnected[0].rerun).toEqual({
      key: "repository-inspection",
      label: "Inspect repository",
    });
    expect(
      results(
        computePhaseTwoChecks({
          inspection: null,
          inspectionConnectionCurrent: false,
          githubConnected: true,
          resolution: resolution("not-inspected"),
          contract: null,
        }),
      )["profile-resolved"],
    ).toBe("Inspect the repository to resolve its profile.");
  });

  it("does not let an inspection from a previous login support the profile", () => {
    const checks = computePhaseTwoChecks({
      inspection: inspection(),
      inspectionConnectionCurrent: false,
      githubConnected: true,
      resolution: resolution("not-inspected"),
      contract: contract(),
    });
    expect(statuses(checks)["profile-resolved"]).toBe("not-yet");
    expect(results(checks)["profile-resolved"]).toContain("previous login");
    expect(checks[0].rerun?.label).toBe("Re-inspect repository");
    expect(checks[0].evidence.map((e) => e.recordId)).toEqual(["inspection"]);
    expect(statuses(checks)["contract-complete"]).toBe("not-yet");
  });

  it.each([
    ["unmatched", "FastAPI + uv did not match: no pyproject.toml at the root."],
    [
      "ambiguous",
      "The FastAPI service matched, but package.json at the root shows another runtime.",
    ],
  ] as const)("blocks an %s profile with its reason", (status, reason) => {
    const checks = computePhaseTwoChecks({
      inspection: inspection(),
      inspectionConnectionCurrent: true,
      githubConnected: true,
      resolution: resolution(status, reason),
      contract: null,
    });
    expect(statuses(checks)["profile-resolved"]).toBe("blocked");
    expect(results(checks)["profile-resolved"]).toBe(reason);
    expect(results(checks)["contract-complete"]).toBe(
      "Resolve the application profile first.",
    );
  });

  it("passes the profile and waits for a contract", () => {
    const checks = computePhaseTwoChecks({
      inspection: inspection(),
      inspectionConnectionCurrent: true,
      githubConnected: true,
      resolution: resolution("matched"),
      contract: null,
    });
    expect(statuses(checks)).toEqual({
      "profile-resolved": "passed",
      "contract-complete": "not-yet",
      "contract-provenance": "not-yet",
      "contract-gaps": "not-yet",
    });
    expect(results(checks)["profile-resolved"]).toBe(
      "FastAPI + uv selected from repository evidence · cccccccc · execution not yet verified",
    );
    expect(results(checks)["contract-complete"]).toContain(
      "No Application Contract yet",
    );
  });

  it("passes all four for a current, sourced contract without blockers", () => {
    const checks = computePhaseTwoChecks({
      inspection: inspection(),
      inspectionConnectionCurrent: true,
      githubConnected: true,
      resolution: resolution("matched"),
      contract: contract(),
    });
    expect(Object.values(statuses(checks)).every((s) => s === "passed")).toBe(
      true,
    );
    expect(results(checks)["contract-complete"]).toBe(
      "Application Contract v1 · 2 fields · cccccccc",
    );
    expect(results(checks)["contract-provenance"]).toBe(
      "Every field cites a current source: 1 profile rules, 1 unresolved.",
    );
    expect(results(checks)["contract-gaps"]).toBe(
      "No unresolved gaps · 1 conformance item for Phase 3 · 1 open policy for later gates",
    );
    expect(checks[1].evidence.map((e) => [e.recordType, e.recordId])).toEqual([
      ["contract", "contract-1"],
      ["observation", "inspection"],
    ]);
    expect(checks[1].evidence[0].href).toBe("/api/contracts/contract-1");
  });

  it("blocks a contract built at another commit or profile version, and holds later checks", () => {
    const stale = computePhaseTwoChecks({
      inspection: inspection(),
      inspectionConnectionCurrent: true,
      githubConnected: true,
      resolution: resolution("matched"),
      contract: contract({ commitSha: "d".repeat(40) }),
    });
    expect(statuses(stale)).toEqual({
      "profile-resolved": "passed",
      "contract-complete": "blocked",
      "contract-provenance": "not-yet",
      "contract-gaps": "not-yet",
    });
    expect(results(stale)["contract-complete"]).toContain(
      "(dddddddd → cccccccc)",
    );
    const olderProfile = computePhaseTwoChecks({
      inspection: inspection(),
      inspectionConnectionCurrent: true,
      githubConnected: true,
      resolution: { ...resolution("matched"), profileVersion: 2 },
      contract: contract(),
    });
    expect(results(olderProfile)["contract-complete"]).toContain(
      "fastapi-uv v1 → fastapi-uv v2",
    );
  });

  it("blocks on stale provenance and on required values that need a decision", () => {
    const provenance = computePhaseTwoChecks({
      inspection: inspection(),
      inspectionConnectionCurrent: true,
      githubConnected: true,
      resolution: resolution("matched"),
      contract: contract({
        provenanceIssues: [
          {
            field: "health.path",
            reason: "the cited saved requirement was replaced or removed",
          },
        ],
      }),
    });
    expect(statuses(provenance)["contract-provenance"]).toBe("blocked");
    expect(results(provenance)["contract-provenance"]).toContain(
      "health.path (the cited saved requirement was replaced or removed)",
    );
    const blocked = contract();
    blocked.body.fields.push({
      key: "persistence.database",
      value: null,
      provenance: {
        kind: "unresolved",
        blocker: "contradiction",
        reason: "SQLite declared where PostgreSQL is expected.",
      },
    });
    const gaps = computePhaseTwoChecks({
      inspection: inspection(),
      inspectionConnectionCurrent: true,
      githubConnected: true,
      resolution: resolution("matched"),
      contract: blocked,
    });
    expect(statuses(gaps)["contract-gaps"]).toBe("blocked");
    expect(results(gaps)["contract-gaps"]).toBe(
      "1 required value needs a decision: Database (contradiction: SQLite declared where PostgreSQL is expected.)",
    );
  });
});
