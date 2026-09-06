import { describe, expect, it } from "vitest";

import { CONFORMANCE_DEFINITION } from "../../../src/server/conformance-definition";
import { computePhaseThreeChecks } from "../../../src/server/phase-three-spec";
import type {
  AcceptanceChecksRecord,
  ConformanceBrief,
  ConformanceProposalRecord,
  ConformanceRunRecord,
  ConformanceView,
  InspectAppEvidence,
} from "../../../src/server/types";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const retained: InspectAppEvidence = {
  completedAt: "2026-09-06T10:00:00.000Z",
  checks: [],
  contractId: "c1",
  contractVersion: 1,
  profileId: "fastapi-uv",
  profileVersion: 1,
  commitSha: BASE,
  inspectionObservationId: "i",
  connectionId: "conn",
};
const brief = (required = 1): ConformanceBrief => ({
  repository: {
    url: "https://github.com/qa/app",
    owner: "qa",
    name: "app",
    defaultBranch: "main",
  },
  baseSha: BASE,
  contract: {
    id: "c1",
    version: 1,
    profileId: "fastapi-uv",
    profileVersion: 1,
    profileLabel: "FastAPI + uv",
  },
  requiredChanges: Array.from({ length: required }, (_, index) => ({
    field: index === 0 ? "health.path" : "network.bindHost",
    label: index === 0 ? "Health endpoint" : "Bind address",
    required: "/health",
    observed: "none",
    change: "add",
  })),
  blockers: [],
  scope: { allowed: "app", forbidden: [], sensitive: [] },
  acceptance: {
    definitionVersion: CONFORMANCE_DEFINITION.version,
    checks: [],
    applicationBehavior: null,
    configuration: {
      port: 8000,
      healthPath: "/health",
      environment: {},
      database: "postgresql",
      migrationTool: "alembic",
    },
  },
  exclusions: [],
  exportText: "",
});
const acceptance = {
  id: "acc-1",
  version: 1,
  status: "accepted",
  steps: [],
} as unknown as AcceptanceChecksRecord;
function proposal(
  overrides: Partial<ConformanceProposalRecord> = {},
): ConformanceProposalRecord {
  return {
    id: "p1",
    applicationId: "app",
    workspaceId: "ws",
    origin: "server-guy",
    status: "proposed",
    baseSha: BASE,
    contractId: "c1",
    contractVersion: 1,
    summary: "Add /health",
    changes: [{ path: "app/main.py", content: "x", baseObservationId: "o" }],
    filesDigest: "d",
    mapping: [
      { field: "health.path", paths: ["app/main.py"], explanation: "adds" },
    ],
    requestApproval: true,
    sourceMessageId: null,
    piRunId: null,
    approval: null,
    publication: null,
    publicationError: null,
    external: null,
    candidate: null,
    verification: null,
    supersededById: null,
    createdAt: "2026-09-06T10:05:00.000Z",
    ...overrides,
  };
}
function run(
  overrides: Partial<ConformanceRunRecord> = {},
): ConformanceRunRecord {
  return {
    id: "r1",
    applicationId: "app",
    workspaceId: "ws",
    kind: "candidate",
    status: "passed",
    source: {
      commitSha: HEAD,
      overlayDigest: null,
      treeDigest: "t",
      fileCount: 10,
    },
    proposalId: "p1",
    contractId: "c1",
    contractVersion: 1,
    profileId: "fastapi-uv",
    profileVersion: 1,
    definitionVersion: CONFORMANCE_DEFINITION.version,
    acceptanceChecksId: "acc-1",
    acceptanceChecksVersion: 1,
    imageDigest: "sha256:abc",
    configuration: null,
    results: CONFORMANCE_DEFINITION.checks.map((check) => ({
      key: check.key,
      label: check.label,
      outcome: "passed" as const,
      summary: "ok",
      output: null,
      outputTruncated: false,
      exitCode: 0,
      startedAt: null,
      finishedAt: null,
    })),
    summary: "Every required check passed.",
    error: null,
    piRunId: null,
    createdAt: "2026-09-06T10:10:00.000Z",
    startedAt: "2026-09-06T10:10:00.000Z",
    finishedAt: "2026-09-06T10:15:00.000Z",
    ...overrides,
  };
}
function view(overrides: Partial<ConformanceView> = {}): ConformanceView {
  return {
    retained,
    brief: brief(),
    proposal: null,
    proposals: [],
    acceptance: null,
    proposedAcceptance: null,
    runs: [],
    latestPreview: null,
    latestCandidateRun: null,
    environment: null,
    grant: null,
    contractBlocked: null,
    ...overrides,
  };
}
const statuses = (checks: ReturnType<typeof computePhaseThreeChecks>) =>
  Object.fromEntries(checks.map((check) => [check.key, check.status]));
const results = (checks: ReturnType<typeof computePhaseThreeChecks>) =>
  Object.fromEntries(checks.map((check) => [check.key, check.result]));

describe("Phase 3 checks", () => {
  it("waits for a choice of working environment, naming the required changes", () => {
    const checks = computePhaseThreeChecks(view());
    expect(statuses(checks)).toEqual({
      "candidate-identified": "not-yet",
      "changes-resolved": "not-yet",
      "conformance-passed": "not-yet",
    });
    expect(results(checks)["changes-resolved"]).toContain("Health endpoint");
    expect(results(checks)["candidate-identified"]).toContain(
      "Continue with Server Guy",
    );
  });

  it("keeps a proposed, approved or open pull request short of a candidate", () => {
    expect(
      results(computePhaseThreeChecks(view({ proposal: proposal() })))[
        "candidate-identified"
      ],
    ).toContain("waits for review");
    expect(
      results(
        computePhaseThreeChecks(
          view({
            proposal: proposal({
              status: "approved",
              publicationError: "boom",
            }),
          }),
        ),
      )["candidate-identified"],
    ).toContain("Publication did not complete: boom");
    const open = computePhaseThreeChecks(
      view({
        proposal: proposal({
          status: "published",
          publication: {
            branch: "b",
            commitSha: HEAD,
            pullRequestNumber: 7,
            pullRequestUrl: "https://github.com/qa/app/pull/7",
            publishedAt: "",
            connectionId: "conn",
            adopted: false,
            state: "open",
          },
        }),
        latestPreview: run({
          kind: "preview",
          source: {
            commitSha: BASE,
            overlayDigest: "d",
            treeDigest: "tt",
            fileCount: 10,
          },
        }),
      }),
    );
    expect(statuses(open)["candidate-identified"]).toBe("not-yet");
    expect(results(open)["candidate-identified"]).toContain(
      "unmerged head gets preview results only",
    );
    expect(open[0].rerun?.key).toBe("conformance-refresh");
    expect(results(open)["conformance-passed"]).toContain(
      "previews never satisfy this check",
    );
  });

  it("blocks unmapped required changes, scope violations and candidates that differ from the reviewed change", () => {
    const unmapped = computePhaseThreeChecks(
      view({ brief: brief(2), proposal: proposal() }),
    );
    expect(statuses(unmapped)["changes-resolved"]).toBe("blocked");
    expect(results(unmapped)["changes-resolved"]).toContain("Bind address");
    const merged = proposal({
      status: "published",
      candidate: {
        sha: HEAD,
        defaultBranch: "main",
        resolvedAt: "",
        source: "merged-pull-request",
        merge: {
          pullRequestNumber: 7,
          mergedAt: null,
          mergeCommitSha: HEAD,
          method: "squash",
        },
      },
    });
    const violation = computePhaseThreeChecks(
      view({
        proposal: {
          ...merged,
          verification: {
            candidateSha: HEAD,
            verifiedAt: "",
            changesComplete: true,
            differences: [],
            scope: {
              ok: false,
              violations: [
                ".github/workflows/ci.yml (GitHub workflows and repository automation)",
              ],
              changedFiles: [],
            },
          },
        },
      }),
    );
    expect(statuses(violation)["changes-resolved"]).toBe("blocked");
    expect(results(violation)["changes-resolved"]).toContain("Out-of-scope");
    const differs = computePhaseThreeChecks(
      view({
        proposal: {
          ...merged,
          verification: {
            candidateSha: HEAD,
            verifiedAt: "",
            changesComplete: false,
            differences: ["app/main.py differs from the reviewed content"],
            scope: { ok: true, violations: [], changedFiles: ["app/main.py"] },
          },
        },
      }),
    );
    expect(statuses(differs)["changes-resolved"]).toBe("blocked");
    expect(statuses(differs)["candidate-identified"]).toBe("passed");
    const stale = computePhaseThreeChecks(
      view({
        proposal: {
          ...merged,
          verification: {
            candidateSha: "c".repeat(40),
            verifiedAt: "",
            changesComplete: true,
            differences: [],
            scope: { ok: true, violations: [], changedFiles: [] },
          },
        },
      }),
    );
    expect(results(stale)["changes-resolved"]).toContain("candidate moved");
  });

  it("passes only for an accepted behavior definition and a current, complete run over the exact candidate", () => {
    const merged = proposal({
      status: "published",
      candidate: {
        sha: HEAD,
        defaultBranch: "main",
        resolvedAt: "",
        source: "merged-pull-request",
        merge: {
          pullRequestNumber: 7,
          mergedAt: null,
          mergeCommitSha: HEAD,
          method: "merge",
        },
      },
      verification: {
        candidateSha: HEAD,
        verifiedAt: "",
        changesComplete: true,
        differences: [],
        scope: { ok: true, violations: [], changedFiles: ["app/main.py"] },
      },
    });
    const noAcceptance = computePhaseThreeChecks(
      view({ proposal: merged, latestCandidateRun: run() }),
    );
    expect(statuses(noAcceptance)["conformance-passed"]).toBe("blocked");
    expect(results(noAcceptance)["conformance-passed"]).toContain(
      "No application-behavior check",
    );
    const noRun = computePhaseThreeChecks(
      view({ proposal: merged, acceptance }),
    );
    expect(statuses(noRun)["conformance-passed"]).toBe("not-yet");
    expect(noRun[2].rerun?.label).toBe("Verify candidate");
    const otherCommit = computePhaseThreeChecks(
      view({
        proposal: merged,
        acceptance,
        latestCandidateRun: run({
          source: {
            commitSha: BASE,
            overlayDigest: null,
            treeDigest: "t",
            fileCount: 1,
          },
        }),
      }),
    );
    expect(statuses(otherCommit)["conformance-passed"]).toBe("not-yet");
    const staleBindings = computePhaseThreeChecks(
      view({
        proposal: merged,
        acceptance,
        latestCandidateRun: run({
          acceptanceChecksId: "acc-0",
          acceptanceChecksVersion: 0,
        }),
      }),
    );
    expect(results(staleBindings)["conformance-passed"]).toContain("stale");
    const failed = computePhaseThreeChecks(
      view({
        proposal: merged,
        acceptance,
        latestCandidateRun: run({
          status: "failed",
          results: run().results.map((item) =>
            item.key === "health"
              ? { ...item, outcome: "failed", summary: "connection refused" }
              : item.key === "behavior"
                ? { ...item, outcome: "not-run", summary: "not run" }
                : item,
          ),
        }),
      }),
    );
    expect(statuses(failed)["conformance-passed"]).toBe("blocked");
    expect(results(failed)["conformance-passed"]).toContain(
      "Health endpoint answers from outside the process (connection refused)",
    );
    expect(results(failed)["conformance-passed"]).toContain(
      "later checks not run",
    );
    const cancelled = computePhaseThreeChecks(
      view({
        proposal: merged,
        acceptance,
        latestCandidateRun: run({ status: "cancelled" }),
      }),
    );
    expect(statuses(cancelled)["conformance-passed"]).toBe("blocked");
    expect(results(cancelled)["conformance-passed"]).toContain(
      "Unrun checks cannot pass",
    );
    const passed = computePhaseThreeChecks(
      view({ proposal: merged, acceptance, latestCandidateRun: run() }),
    );
    expect(statuses(passed)).toEqual({
      "candidate-identified": "passed",
      "changes-resolved": "passed",
      "conformance-passed": "passed",
    });
    expect(passed[2].evidence[0]).toMatchObject({
      recordType: "conformance-run",
      href: "/api/conformance/runs/r1",
    });
  });

  it("handles the no-change candidate and a contract revision that reintroduced blockers", () => {
    const noChange = computePhaseThreeChecks(
      view({
        brief: brief(0),
        acceptance,
        proposal: proposal({
          origin: "no-change",
          status: "published",
          changes: [],
          mapping: [],
          candidate: {
            sha: BASE,
            defaultBranch: "main",
            resolvedAt: "",
            source: "contract-commit",
            merge: null,
          },
          verification: {
            candidateSha: BASE,
            verifiedAt: "",
            changesComplete: true,
            differences: [],
            scope: { ok: true, violations: [], changedFiles: [] },
          },
        }),
        latestCandidateRun: run({
          source: {
            commitSha: BASE,
            overlayDigest: null,
            treeDigest: "t",
            fileCount: 1,
          },
        }),
      }),
    );
    expect(
      Object.values(statuses(noChange)).every((status) => status === "passed"),
    ).toBe(true);
    expect(results(noChange)["candidate-identified"]).toContain(
      "no change required",
    );
    const wrongNoChange = computePhaseThreeChecks(
      view({
        proposal: proposal({
          origin: "no-change",
          changes: [],
          mapping: [],
          candidate: {
            sha: BASE,
            defaultBranch: "main",
            resolvedAt: "",
            source: "contract-commit",
            merge: null,
          },
        }),
      }),
    );
    expect(statuses(wrongNoChange)["changes-resolved"]).toBe("blocked");
    const blocked = computePhaseThreeChecks(
      view({
        contractBlocked:
          "Application Contract v2 reintroduced 1 unresolved value (Database).",
      }),
    );
    expect(
      Object.values(statuses(blocked)).every((status) => status === "blocked"),
    ).toBe(true);
  });
});
