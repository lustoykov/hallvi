// The current step of a phase as a person reads it: purpose, what is
// happening, whose move it is, distinct actions, Phase 3 stages, honest
// remaining work. Pure over the Operator View.
import { describe, expect, it } from "vitest";

import { describeCurrentStep } from "../../../src/components/server-guy/current-step";
import type {
  AcceptanceChecksRecord,
  ApplicationContractView,
  ApplicationRecord,
  ConformanceBrief,
  ConformanceProposalRecord,
  ConformanceRunRecord,
  ConformanceView,
  GateCheck,
  OperatorView,
  PhaseWorkspaceView,
  RepositoryInspectionSummary,
} from "../../../src/server/types";

const at = "2026-09-07T10:00:00.000Z";
const COMMIT = "a".repeat(40);
const MERGED = "b".repeat(40);

const application: ApplicationRecord = {
  id: "app",
  name: "todo",
  repositoryUrl: "https://github.com/qa/todo",
  repositoryOwner: "qa",
  repositoryName: "todo",
  environment: "production",
  approvalMode: "always-ask",
  approvalScope: "Current application launch",
  createdAt: at,
  updatedAt: at,
};

function workspace(
  phaseKey: PhaseWorkspaceView["phaseKey"],
  status: PhaseWorkspaceView["status"],
  current = true,
): PhaseWorkspaceView {
  const phases = {
    start: { number: 1, name: "Start", deliverable: "Launch Brief" },
    "inspect-app": {
      number: 2,
      name: "Inspect app",
      deliverable: "Application Contract",
    },
    "make-launch-ready": {
      number: 3,
      name: "Make launch-ready",
      deliverable: "Conformance Result",
    },
  } as const;
  return {
    id: `ws-${phaseKey}`,
    applicationId: "app",
    phaseKey,
    createdAt: at,
    completedAt: status === "completed" ? at : null,
    deliverableEvidence: null,
    phaseNumber: phases[phaseKey].number,
    name: phases[phaseKey].name,
    deliverable: phases[phaseKey].deliverable,
    status,
    current,
  };
}

function check(
  key: string,
  status: GateCheck["status"],
  result: string,
  rerun: GateCheck["rerun"] = null,
): GateCheck {
  return {
    key,
    label: key,
    status,
    result,
    definition: "",
    evidence: [],
    rerun,
  };
}

function view(overrides: Partial<OperatorView>): OperatorView {
  return {
    application,
    workspace: null,
    workspaces: [],
    chats: [],
    selectedChatId: null,
    messages: [],
    checks: [],
    decisions: [],
    observations: [],
    upcomingRequirements: [],
    activity: [],
    inspection: null,
    contract: null,
    conformance: null,
    ...overrides,
  };
}

function contract(
  conformanceItems: number,
  blockers = 0,
): ApplicationContractView {
  return {
    id: "contract-1",
    applicationId: "app",
    workspaceId: "ws-inspect-app",
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
      fields: [],
    },
    supersededById: null,
    createdAt: at,
    gaps: {
      blockers: Array.from({ length: blockers }, (_, index) => ({
        field: `field-${index}`,
        label: `Value ${index + 1}`,
        blocker: "unknown" as const,
        reason: "not declared",
        observed: null,
      })),
      conformance: Array.from({ length: conformanceItems }, (_, index) => ({
        field: `work-${index}`,
        label: `Change ${index + 1}`,
        observed: "missing",
        change: "add it",
      })),
      policies: [],
    },
    provenanceIssues: [],
  };
}

const matchedInspection: RepositoryInspectionSummary = {
  observationId: "obs",
  status: "passed",
  summary: "Inspected qa/todo at main.",
  observedAt: at,
  commitSha: COMMIT,
  defaultBranch: "main",
  connectionCurrent: true,
  current: true,
  entries: 9,
  truncated: false,
  filesRead: 4,
  profile: {
    status: "matched",
    profileId: "fastapi-uv",
    profileVersion: 1,
    label: "FastAPI + uv",
    criteria: [],
    reason: null,
  },
};

function brief(requiredChanges: number): ConformanceBrief {
  return {
    repository: {
      url: application.repositoryUrl,
      owner: "qa",
      name: "todo",
      defaultBranch: "main",
    },
    baseSha: COMMIT,
    contract: {
      id: "contract-1",
      version: 1,
      profileId: "fastapi-uv",
      profileVersion: 1,
      profileLabel: "FastAPI + uv",
    },
    requiredChanges: Array.from({ length: requiredChanges }, (_, index) => ({
      field: `work-${index}`,
      label: `Health endpoint ${index + 1}`,
      required: "/health",
      observed: "none",
      change: "Add GET /health",
    })),
    blockers: [],
    scope: { allowed: "Application source", forbidden: [], sensitive: [] },
    acceptance: {
      definitionVersion: 1,
      checks: [],
      applicationBehavior: null,
      configuration: {
        port: 8000,
        healthPath: "/health",
        environment: {},
        database: "none",
        migrationTool: null,
      },
    },
    exclusions: [],
    exportText: "",
  };
}

function proposal(
  overrides: Partial<ConformanceProposalRecord> = {},
): ConformanceProposalRecord {
  return {
    id: "proposal-1",
    applicationId: "app",
    workspaceId: "ws-make-launch-ready",
    origin: "server-guy",
    status: "proposed",
    baseSha: COMMIT,
    contractId: "contract-1",
    contractVersion: 1,
    summary: "Add /health.",
    changes: [{ path: "app/main.py", content: "…", baseObservationId: "obs" }],
    filesDigest: "digest-1",
    mapping: [],
    requestApproval: true,
    sourceMessageId: "m",
    piRunId: null,
    approval: null,
    publication: null,
    publicationError: null,
    external: null,
    candidate: null,
    verification: null,
    supersededById: null,
    createdAt: at,
    ...overrides,
  };
}

function acceptance(
  status: AcceptanceChecksRecord["status"],
): AcceptanceChecksRecord {
  return {
    id: `acceptance-${status}`,
    applicationId: "app",
    workspaceId: "ws-make-launch-ready",
    version: 1,
    status,
    rationale: "Creating a todo and reading it back.",
    steps: [],
    evidence: [],
    digest: "d",
    contractId: "contract-1",
    contractVersion: 1,
    sourceMessageId: "m",
    piRunId: null,
    acceptedAt: status === "accepted" ? at : null,
    acceptedBy: status === "accepted" ? "engineer" : null,
    supersededById: null,
    createdAt: at,
  };
}

function run(
  overrides: Partial<ConformanceRunRecord> = {},
): ConformanceRunRecord {
  return {
    id: "run-1",
    applicationId: "app",
    workspaceId: "ws-make-launch-ready",
    kind: "candidate",
    status: "passed",
    source: {
      commitSha: MERGED,
      overlayDigest: null,
      treeDigest: "t",
      fileCount: 9,
    },
    proposalId: "proposal-1",
    contractId: "contract-1",
    contractVersion: 1,
    profileId: "fastapi-uv",
    profileVersion: 1,
    definitionVersion: 1,
    acceptanceChecksId: "acceptance-accepted",
    acceptanceChecksVersion: 1,
    imageDigest: null,
    configuration: null,
    results: [],
    summary: "Every required check passed.",
    error: null,
    piRunId: null,
    createdAt: at,
    startedAt: at,
    finishedAt: at,
    ...overrides,
  };
}

function conformance(
  overrides: Partial<ConformanceView> = {},
): ConformanceView {
  return {
    retained: null,
    brief: brief(1),
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

function phaseThree(
  overrides: Partial<ConformanceView>,
  checks: GateCheck[] = [],
) {
  const state = conformance(overrides);
  return view({
    workspace: workspace("make-launch-ready", "in-progress"),
    workspaces: [
      workspace("start", "completed", false),
      workspace("inspect-app", "completed", false),
      workspace("make-launch-ready", "in-progress"),
    ],
    conformance: state,
    checks,
  });
}

describe("Phase 1", () => {
  it("offers Continue when the Launch Brief is ready", () => {
    const step = describeCurrentStep(
      view({ workspace: workspace("start", "ready"), checks: [] }),
    );
    expect(step.waitingOn).toBe("you");
    expect(step.actions.map((action) => action.key)).toEqual(["continue"]);
    expect(step.purpose).toMatch(/^Save what Server Guy needs/);
  });

  it("names the open check and its recovery when GitHub access is missing", () => {
    const step = describeCurrentStep(
      view({
        workspace: workspace("start", "in-progress"),
        checks: [
          check("application-identity", "passed", "todo"),
          check(
            "repository-readable",
            "not-yet",
            "Connect GitHub, then run the repository check.",
            { key: "repository-readable", label: "Re-run repository check" },
          ),
        ],
      }),
    );
    expect(step.now).toBe("Connect GitHub, then run the repository check.");
    expect(step.actions.map((action) => action.key)).toEqual([
      "rerun:repository-readable",
      "settings:github",
    ]);
    expect(step.passed).toBe(1);
    expect(step.total).toBe(2);
  });
});

describe("Phase 2", () => {
  const base = {
    workspace: workspace("inspect-app", "in-progress"),
    workspaces: [
      workspace("start", "completed", false),
      workspace("inspect-app", "in-progress"),
    ],
  };

  it("says Server Guy is inspecting before any inspection exists", () => {
    const step = describeCurrentStep(view(base));
    expect(step.waitingOn).toBe("server-guy");
    expect(step.now).toMatch(/inspecting the repository/);
    expect(step.purpose).toMatch(
      /^Understand the application and identify required changes/,
    );
  });

  it("asks for a decision when the contract has blockers", () => {
    const step = describeCurrentStep(
      view({
        ...base,
        inspection: matchedInspection,
        contract: contract(0, 2),
      }),
    );
    expect(step.waitingOn).toBe("you");
    expect(step.now).toBe(
      "2 required values need your decision: Value 1, Value 2.",
    );
    expect(step.actions[0]).toMatchObject({ key: "ask", kind: "primary" });
  });

  it("states remaining work honestly when ready, including zero", () => {
    const one = describeCurrentStep(
      view({
        ...base,
        workspace: workspace("inspect-app", "ready"),
        inspection: matchedInspection,
        contract: contract(1),
      }),
    );
    expect(one.now).toBe(
      "Inspection complete. 1 required change remains for Phase 3.",
    );
    expect(one.actions.map((action) => action.key)).toEqual(["continue"]);
    const none = describeCurrentStep(
      view({
        ...base,
        workspace: workspace("inspect-app", "ready"),
        inspection: matchedInspection,
        contract: contract(0),
      }),
    );
    expect(none.remaining).toBe(
      "Inspection complete. No required changes remain; Phase 3 still has to verify that the application runs.",
    );
    const three = describeCurrentStep(
      view({
        ...base,
        workspace: workspace("inspect-app", "ready"),
        inspection: matchedInspection,
        contract: contract(3),
      }),
    );
    expect(three.remaining).toBe(
      "Inspection complete. 3 required changes remain for Phase 3.",
    );
  });

  it("links a completed phase to the current one and keeps its remaining work", () => {
    const step = describeCurrentStep(
      view({
        workspace: workspace("inspect-app", "completed", false),
        workspaces: [
          workspace("start", "completed", false),
          workspace("inspect-app", "completed", false),
          workspace("make-launch-ready", "in-progress"),
        ],
        contract: contract(1),
      }),
    );
    expect(step.waitingOn).toBe("none");
    expect(step.now).toMatch(/^Completed\./);
    expect(step.actions).toEqual([
      expect.objectContaining({ key: "phase:make-launch-ready", kind: "link" }),
    ]);
    expect(step.remaining).toMatch(/1 required change remains/);
  });
});

describe("Phase 3", () => {
  it("offers the working-environment choice before any proposal", () => {
    const step = describeCurrentStep(phaseThree({}));
    expect(step.waitingOn).toBe("you");
    expect(step.now).toMatch(/^1 required change recorded on the contract/);
    expect(step.actions.map((action) => [action.key, action.kind])).toEqual([
      ["preparation-start", "primary"],
      ["reveal:change", "link"],
    ]);
    expect(step.stages.map((stage) => stage.state)).toEqual([
      "current",
      "todo",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
  });

  it("keeps accepting the test plan and approving the code distinct, one primary at a time", () => {
    const step = describeCurrentStep(
      phaseThree({
        proposal: proposal(),
        proposals: [proposal()],
        proposedAcceptance: acceptance("proposed"),
        runs: [
          run({
            id: "preview",
            kind: "preview",
            status: "passed",
            source: {
              commitSha: COMMIT,
              overlayDigest: "digest-1",
              treeDigest: "t",
              fileCount: 9,
            },
          }),
        ],
      }),
    );
    expect(step.actions.map((action) => [action.key, action.kind])).toEqual([
      ["accept-checks:acceptance-proposed", "primary"],
      ["approve:proposal-1", "secondary"],
      ["withdraw:proposal-1", "link"],
    ]);
    expect(step.now).toBe(
      "Waiting for you: accept behavior checks v1, then approve change. Preview passed over this exact change (worker evidence, not the gate).",
    );
    expect(step.stages.map((stage) => stage.state)).toEqual([
      "done",
      "current",
      "current",
      "todo",
      "todo",
      "todo",
    ]);
  });

  it("requires the publishing grant before publishing", () => {
    const approved = proposal({ status: "approved" });
    const withoutGrant = describeCurrentStep(
      phaseThree({
        proposal: approved,
        proposals: [approved],
        acceptance: acceptance("accepted"),
      }),
    );
    expect(withoutGrant.actions[0]).toMatchObject({
      key: "grant",
      kind: "primary",
    });
    expect(withoutGrant.stages[3]).toMatchObject({
      state: "current",
      note: "needs your publishing grant",
    });
    const withGrant = describeCurrentStep(
      phaseThree({
        proposal: approved,
        proposals: [approved],
        acceptance: acceptance("accepted"),
        grant: {
          id: "grant",
          applicationId: "app",
          connectionId: "c",
          mechanism: "app",
          verifiedPermissions: {},
          grantedAt: at,
          revokedAt: null,
        },
      }),
    );
    expect(withGrant.actions[0]).toMatchObject({ key: "publish:proposal-1" });
  });

  it("waits for the merge on GitHub and marks a demo link as not followable", () => {
    const published = proposal({
      status: "published",
      publication: {
        branch: "server-guy/conformance",
        commitSha: COMMIT,
        pullRequestNumber: 1,
        pullRequestUrl: "https://github.com/qa/todo/pull/1",
        publishedAt: at,
        connectionId: "c",
        adopted: false,
        state: "open",
      },
    });
    const step = describeCurrentStep(
      phaseThree({
        proposal: published,
        proposals: [published],
        acceptance: acceptance("accepted"),
      }),
      { demo: true },
    );
    expect(step.waitingOn).toBe("github");
    expect(step.actions[0]).toMatchObject({
      key: "open-pull-request",
      kind: "link",
      href: "https://github.com/qa/todo/pull/1",
      demo: true,
    });
    expect(step.actions[1]).toMatchObject({ key: "refresh" });
    expect(step.stages[4]).toMatchObject({ key: "merge", state: "current" });
  });

  it("offers Verify once the candidate is recorded and the checks are accepted", () => {
    const merged = proposal({
      status: "published",
      candidate: {
        sha: MERGED,
        defaultBranch: "main",
        resolvedAt: at,
        source: "merged-pull-request",
        merge: {
          pullRequestNumber: 1,
          mergedAt: at,
          mergeCommitSha: MERGED,
          method: "squash",
        },
      },
    });
    const step = describeCurrentStep(
      phaseThree({
        proposal: merged,
        proposals: [merged],
        acceptance: acceptance("accepted"),
      }),
    );
    expect(step.now).toMatch(/^Candidate bbbbbbbb is recorded on main/);
    expect(step.actions[0]).toMatchObject({
      key: "verify",
      label: "Verify candidate",
    });
    expect(step.stages[5]).toMatchObject({ key: "verify", state: "current" });
  });

  it("reports a running conformance run as Server Guy's move", () => {
    const merged = proposal({
      status: "published",
      candidate: {
        sha: MERGED,
        defaultBranch: "main",
        resolvedAt: at,
        source: "merged-pull-request",
        merge: null,
      },
    });
    const running = run({
      status: "running",
      finishedAt: null,
      summary: "Installing dependencies.",
    });
    const step = describeCurrentStep(
      phaseThree({
        proposal: merged,
        proposals: [merged],
        acceptance: acceptance("accepted"),
        runs: [running],
        latestCandidateRun: running,
      }),
    );
    expect(step.waitingOn).toBe("server-guy");
    expect(step.now).toBe(
      "Conformance checks are running for commit bbbbbbbb. Installing dependencies.",
    );
    expect(step.actions).toEqual([
      expect.objectContaining({ key: "cancel-run:run-1" }),
    ]);
  });

  it("asks the owner to try a preview after automated checks pass", () => {
    const merged = proposal({
      status: "published",
      candidate: {
        sha: MERGED,
        defaultBranch: "main",
        resolvedAt: at,
        source: "merged-pull-request",
        merge: null,
      },
    });
    const passed = run();
    const step = describeCurrentStep(
      phaseThree(
        {
          proposal: merged,
          proposals: [merged],
          acceptance: acceptance("accepted"),
          runs: [passed],
          latestCandidateRun: passed,
        },
        [
          check("candidate-identified", "passed", "bbbbbbbb on main"),
          check("changes-resolved", "passed", "1 file changed"),
          check("conformance-passed", "passed", "8 passed"),
        ],
      ),
    );
    expect(step.waitingOn).toBe("you");
    expect(step.now).toMatch(/Automated checks passed/);
    expect(step.actions[0].key).toBe("preview-start");
    expect(step.remaining).toBe(
      "Try the preview and confirm the application works.",
    );
    expect(step.stages.every((stage) => stage.state === "done")).toBe(true);
  });

  it("skips the approval, publication and merge stages for a no-change candidate", () => {
    const noChange = proposal({
      origin: "no-change",
      status: "approved",
      changes: [],
      candidate: {
        sha: COMMIT,
        defaultBranch: "main",
        resolvedAt: at,
        source: "contract-commit",
        merge: null,
      },
    });
    const step = describeCurrentStep(
      phaseThree({
        brief: brief(0),
        proposal: noChange,
        proposals: [noChange],
        proposedAcceptance: acceptance("proposed"),
      }),
    );
    expect(step.stages.map((stage) => stage.state)).toEqual([
      "done",
      "current",
      "skipped",
      "skipped",
      "skipped",
      "todo",
    ]);
    expect(step.actions[0]).toMatchObject({
      key: "accept-checks:acceptance-proposed",
    });
  });

  it("offers Continue with Server Guy when the current revision is the candidate but no checks exist", () => {
    const noChange = proposal({
      origin: "no-change",
      status: "approved",
      changes: [],
      candidate: {
        sha: COMMIT,
        defaultBranch: "main",
        resolvedAt: at,
        source: "contract-commit",
        merge: null,
      },
    });
    const step = describeCurrentStep(
      phaseThree({
        brief: brief(0),
        proposal: noChange,
        proposals: [noChange],
      }),
    );
    expect(step.waitingOn).toBe("you");
    expect(step.actions.map((action) => action.key)).toEqual([
      "continue-with-server-guy",
      "reveal:change",
    ]);
    expect(step.now).toMatch(/a health response alone is not sufficient/);
  });
});
