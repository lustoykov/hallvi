// PROTOTYPE — the one piece of this folder written to be lifted into
// production: a pure description of the viewed phase (purpose, what is
// happening now, who the next move belongs to, the distinct next actions and
// the Phase 3 stages), derived only from the Operator View. No DOM, no
// fetching. The variants render it three different ways.
import type {
  ActivityEvent,
  ApplicationRecord,
  ConformanceView,
  OperatorView,
} from "@/server/types";

export const PHASE_PURPOSE: Record<string, string> = {
  start:
    "Save what Server Guy needs before it reads anything: the application, repository access, the deployment environment and when it must ask you before changing something.",
  "inspect-app":
    "Understand the application and identify required changes. Server Guy reads the repository at one exact commit and writes the Application Contract. Nothing in the repository changes yet.",
  "make-launch-ready":
    "Make the required changes and verify the application runs. Server Guy proposes the change, publishes it for your review and runs the checks in an isolated runner after you merge.",
};

export interface StepAction {
  /** Maps to an existing operation (`continue`, `approve`, …) or a link. */
  key: string;
  label: string;
  explanation: string;
  kind: "primary" | "secondary" | "link";
  href?: string;
  /** A link that must not be followed: synthetic demo evidence. */
  demo?: boolean;
}

export interface Stage {
  key: string;
  label: string;
  state: "done" | "current" | "todo" | "skipped";
  note?: string;
}

export interface CurrentStep {
  phaseKey: string;
  phaseNumber: number;
  phaseName: string;
  deliverable: string;
  purpose: string;
  /** One or two sentences: what is happening, or what is waited for. */
  now: string;
  waitingOn: "you" | "server-guy" | "github" | "none";
  /** Distinct next actions; the first is the primary one. */
  actions: StepAction[];
  /** The Phase 3 stages; empty elsewhere. */
  stages: Stage[];
  /** Honest remaining-work sentence, including zero. */
  remaining: string | null;
  passed: number;
  total: number;
}

const short = (sha: string | null | undefined) => sha?.slice(0, 8) ?? "unknown";

export function isDemoRepository(application: ApplicationRecord | null) {
  // The QA fixture's repositories live under a synthetic `qa` owner. A real
  // build needs an explicit signal from the record (interface need for Codex).
  return application?.repositoryOwner === "qa";
}

function remainingAfterInspection(view: OperatorView) {
  const items = view.contract?.gaps.conformance.length ?? 0;
  if (!view.contract) return null;
  if (items === 0)
    return "Inspection complete. No required changes remain; Phase 3 still has to verify that the application runs.";
  return `Inspection complete. ${items} required change${items === 1 ? "" : "s"} remain${items === 1 ? "s" : ""} for Phase 3.`;
}

export function describeCurrentStep(view: OperatorView): CurrentStep {
  const workspace = view.workspace;
  const checks = view.checks;
  const passed = checks.filter((check) => check.status === "passed").length;
  const phaseKey = workspace?.phaseKey ?? "start";
  const base = {
    phaseKey,
    phaseNumber: workspace?.phaseNumber ?? 1,
    phaseName: workspace?.name ?? "Start",
    deliverable: workspace?.deliverable ?? "Launch Brief",
    purpose: PHASE_PURPOSE[phaseKey] ?? "",
    passed,
    total: checks.length,
    stages: [] as Stage[],
    remaining: null as string | null,
  };
  if (!workspace)
    return {
      ...base,
      now: "No workspace yet.",
      waitingOn: "none",
      actions: [],
    };
  if (workspace.status === "completed") {
    const current = view.workspaces.find((item) => item.current);
    return {
      ...base,
      now: "Completed. These results are retained as recorded then and are not re-evaluated; later changes appear in the current phase.",
      waitingOn: "none",
      actions:
        current && current.id !== workspace.id
          ? [
              {
                key: `phase:${current.phaseKey}`,
                label: `Go to Phase ${current.phaseNumber} · ${current.name}`,
                explanation: "The current phase, where work continues.",
                kind: "link",
              },
            ]
          : [],
      remaining:
        phaseKey === "inspect-app" ? remainingAfterInspection(view) : null,
    };
  }
  if (phaseKey === "start") return startStep(view, base);
  if (phaseKey === "inspect-app") return inspectStep(view, base);
  return launchReadyStep(view, base);
}

type Base = Omit<CurrentStep, "now" | "waitingOn" | "actions">;

function startStep(view: OperatorView, base: Base): CurrentStep {
  if (view.workspace?.status === "ready")
    return {
      ...base,
      now: "All four checks pass. The Launch Brief is ready.",
      waitingOn: "you",
      actions: [
        {
          key: "continue",
          label: "Continue to Inspect app",
          explanation:
            "Server Guy inspects the repository and proposes the Application Contract. Phase 1 chats become read-only.",
          kind: "primary",
        },
      ],
    };
  const open = view.checks.find((check) => check.status !== "passed");
  const actions: StepAction[] = [];
  if (open?.rerun)
    actions.push({
      key: `rerun:${open.rerun.key}`,
      label: open.rerun.label,
      explanation: "Checks again with the current connection.",
      kind: "primary",
    });
  if (open?.key === "repository-readable")
    actions.push({
      key: "settings:github",
      label: "Open GitHub settings",
      explanation: "Connect GitHub or check repository access.",
      kind: "link",
      href: "/setup/github",
    });
  return {
    ...base,
    now: open?.result ?? "Working toward the Launch Brief.",
    waitingOn: open?.key === "repository-readable" ? "you" : "server-guy",
    actions,
  };
}

function inspectStep(view: OperatorView, base: Base): CurrentStep {
  const inspection = view.inspection;
  const contract = view.contract;
  const remaining = remainingAfterInspection(view);
  const profileCheck = view.checks.find(
    (check) => check.key === "profile-resolved",
  );
  const ask = (label: string, explanation: string): StepAction => ({
    key: "ask",
    label,
    explanation,
    kind: "primary",
  });
  if (!inspection)
    return {
      ...base,
      now: "Server Guy is inspecting the repository at its current commit.",
      waitingOn: "server-guy",
      actions: profileCheck?.rerun
        ? [
            {
              key: `rerun:${profileCheck.rerun.key}`,
              label: profileCheck.rerun.label,
              explanation: "Reads the tree at the current commit.",
              kind: "secondary",
            },
          ]
        : [],
      remaining,
    };
  if (inspection.status !== "passed" || !inspection.current)
    return {
      ...base,
      now: profileCheck?.result ?? inspection.summary,
      waitingOn: "you",
      actions: profileCheck?.rerun
        ? [
            {
              key: `rerun:${profileCheck.rerun.key}`,
              label: profileCheck.rerun.label,
              explanation: "Inspects again with the current GitHub connection.",
              kind: "primary",
            },
          ]
        : [],
      remaining,
    };
  if (inspection.profile.status !== "matched")
    return {
      ...base,
      now:
        inspection.profile.reason ??
        `${inspection.profile.label} did not match this repository.`,
      waitingOn: "you",
      actions: [
        ask(
          "Ask Server Guy about this repository",
          "Server Guy explains what it found; a supported profile is required to continue.",
        ),
      ],
      remaining,
    };
  if (!contract)
    return {
      ...base,
      now: "Server Guy is writing the Application Contract from the files it read.",
      waitingOn: "server-guy",
      actions: [],
      remaining,
    };
  const blockers = contract.gaps.blockers;
  if (blockers.length)
    return {
      ...base,
      now: `${blockers.length} required value${blockers.length === 1 ? " needs" : "s need"} your decision: ${blockers.map((gap) => gap.label).join(", ")}.`,
      waitingOn: "you",
      actions: [
        ask(
          "Answer in chat",
          "Tell Server Guy the value. It revises the contract and cites your message as the source.",
        ),
      ],
      remaining,
    };
  const blocked = view.checks.find((check) => check.status === "blocked");
  if (blocked)
    return {
      ...base,
      now: blocked.result,
      waitingOn: "you",
      actions: [
        ask(
          "Ask Server Guy to revise the contract",
          "The contract is rebuilt at the current commit; your earlier choices are kept as sources.",
        ),
      ],
      remaining,
    };
  if (view.workspace?.status === "ready")
    return {
      ...base,
      now: remaining ?? "The Application Contract is ready.",
      waitingOn: "you",
      actions: [
        {
          key: "continue",
          label: "Continue to Make launch-ready",
          explanation:
            "Phase 3 makes the required changes and verifies the application runs. Phase 2 chats become read-only.",
          kind: "primary",
        },
      ],
      remaining,
    };
  const open = view.checks.find((check) => check.status !== "passed");
  return {
    ...base,
    now: open?.result ?? "Working toward the Application Contract.",
    waitingOn: "server-guy",
    actions: [],
    remaining,
  };
}

function previewNote(conformance: ConformanceView) {
  const proposal = conformance.proposal;
  if (!proposal || proposal.origin !== "server-guy") return null;
  const preview = conformance.runs.find(
    (run) =>
      run.kind === "preview" &&
      run.source.overlayDigest === proposal.filesDigest,
  );
  return preview
    ? `Preview ${preview.status} over this exact change (worker evidence, not the gate).`
    : "Untested since the last edit: no preview ran over this exact change.";
}

function launchReadyStep(view: OperatorView, base: Base): CurrentStep {
  const conformance = view.conformance;
  const application = view.application;
  if (!conformance || !conformance.brief)
    return {
      ...base,
      now: conformance?.contractBlocked ?? "Complete Inspect app first.",
      waitingOn: "you",
      actions: [],
    };
  const { proposal, acceptance, proposedAcceptance, grant } = conformance;
  const run = conformance.latestCandidateRun;
  const required = conformance.brief.requiredChanges;
  const running =
    conformance.runs.find(
      (item) => item.status === "queued" || item.status === "running",
    ) ?? null;
  const noChange = proposal?.origin === "no-change";
  const published = Boolean(proposal?.publication || proposal?.external);
  const candidate = proposal?.candidate ?? null;
  const conformanceCheck = view.checks.find(
    (check) => check.key === "conformance-passed",
  );
  const verified = conformanceCheck?.status === "passed";
  const runForCandidate = Boolean(
    run && candidate && run.source.commitSha === candidate.sha,
  );

  const stages: Stage[] = [
    {
      key: "propose",
      label: required.length
        ? "Propose the change"
        : "Confirm no change is needed",
      state: proposal ? "done" : "current",
      note: proposal
        ? proposal.origin === "external"
          ? "returned from outside"
          : `${proposal.changes.length} file${proposal.changes.length === 1 ? "" : "s"}`
        : undefined,
    },
    {
      key: "accept",
      label: "Accept behavior checks",
      state: acceptance ? "done" : proposedAcceptance ? "current" : "todo",
      note: acceptance
        ? `v${acceptance.version} · ${acceptance.acceptedBy === "engineer" ? "by you" : "by policy"}`
        : proposedAcceptance
          ? `v${proposedAcceptance.version} proposed`
          : "Server Guy proposes them",
    },
    {
      key: "approve",
      label: "Approve the change",
      state: noChange
        ? "skipped"
        : !proposal
          ? "todo"
          : proposal.status === "proposed"
            ? "current"
            : proposal.status === "withdrawn"
              ? "todo"
              : "done",
    },
    {
      key: "publish",
      label: "Publish branch and pull request",
      state: noChange
        ? "skipped"
        : published || candidate
          ? "done"
          : proposal?.status === "approved"
            ? "current"
            : "todo",
      note:
        proposal?.status === "approved" && !grant && !published
          ? "needs your publishing grant"
          : undefined,
    },
    {
      key: "merge",
      label: "Merge on GitHub",
      state: noChange
        ? "skipped"
        : candidate
          ? "done"
          : published
            ? "current"
            : "todo",
      note: candidate ? undefined : "yours, never Server Guy's",
    },
    {
      key: "verify",
      label: "Verify the exact candidate",
      state: verified
        ? "done"
        : running
          ? "current"
          : candidate && acceptance
            ? "current"
            : "todo",
      note: running ? `${running.status}` : undefined,
    },
  ];
  const withStages = { ...base, stages };
  const demo = isDemoRepository(application);

  if (conformance.contractBlocked)
    return {
      ...withStages,
      now: conformance.contractBlocked,
      waitingOn: "you",
      actions: [
        {
          key: "ask",
          label: "Answer in chat",
          explanation:
            "The revised contract needs a decision before work continues.",
          kind: "primary",
        },
      ],
    };
  if (running)
    return {
      ...withStages,
      now: `Conformance checks are ${running.status} for ${running.kind === "candidate" ? `commit ${short(running.source.commitSha)}` : `tree ${short(running.source.treeDigest)}`}. ${running.summary}`,
      waitingOn: "server-guy",
      actions:
        running.kind === "candidate"
          ? [
              {
                key: `cancel-run:${running.id}`,
                label: "Cancel run",
                explanation: "Stops the runner; nothing counts as passed.",
                kind: "secondary",
              },
            ]
          : [],
    };
  if (!proposal || proposal.status === "withdrawn") {
    const actions: StepAction[] = [
      {
        key: "continue-with-server-guy",
        label: "Continue with Server Guy",
        explanation: required.length
          ? "Reads the repository, stages the change, previews it in an isolated runner and proposes the behavior checks."
          : "Proposes the behavior checks from the routes it reads and previews the current revision.",
        kind: "primary",
      },
      {
        key: "export-brief",
        label: "Export brief for external work",
        explanation:
          "The same brief for Codex, Claude, another harness or manual work; return the change afterwards.",
        kind: "secondary",
      },
    ];
    if (!required.length)
      actions.push({
        key: "select-current",
        label: "Verify the current revision",
        explanation:
          "Selects the contract commit as the candidate; no pull request.",
        kind: "secondary",
      });
    return {
      ...withStages,
      now: required.length
        ? `${required.length} required change${required.length === 1 ? "" : "s"} recorded on the contract: ${required.map((item) => item.label).join(", ")}. Choose how the work happens.`
        : "The contract records no required changes. The current revision still needs current conformance evidence: no change is not no verification.",
      waitingOn: "you",
      actions,
      remaining: required.length
        ? `${required.length} required change${required.length === 1 ? "" : "s"} before the application is launch-ready.`
        : "No source changes required; verification remains.",
    };
  }
  const pending: StepAction[] = [];
  if (proposedAcceptance && !acceptance)
    pending.push({
      key: `accept-checks:${proposedAcceptance.id}`,
      label: `Accept behavior checks v${proposedAcceptance.version}`,
      explanation:
        "Accepts the test plan only. It is separate from approving the code and from the checks actually passing.",
      kind: "primary",
    });
  if (proposal.status === "proposed")
    pending.push({
      key: `approve:${proposal.id}`,
      label: "Approve change",
      explanation:
        "Approves the exact staged files. Nothing reaches GitHub until you publish.",
      kind: "primary",
    });
  if (proposal.status === "approved" && proposal.origin === "server-guy")
    pending.push(
      grant
        ? {
            key: `publish:${proposal.id}`,
            label: "Publish branch and pull request",
            explanation:
              "Pushes a branch and opens the pull request under the granted scope. Merging stays yours.",
            kind: "primary",
          }
        : {
            key: "grant",
            label: "Allow publishing",
            explanation:
              "Verifies push and pull-request permission for this repository and records the grant. A broadly scoped token is not a grant.",
            kind: "primary",
          },
    );
  if (pending.length) {
    // One solid button at a time: the first decision is primary, the rest
    // wait as quieter secondary buttons.
    pending.forEach((action, index) => {
      action.kind = index === 0 ? "primary" : "secondary";
    });
    const preview = previewNote(conformance);
    return {
      ...withStages,
      now: `Waiting for you: ${pending.map((action) => action.label.toLowerCase()).join(", then ")}.${preview ? ` ${preview}` : ""}`,
      waitingOn: "you",
      actions: [
        ...pending,
        {
          key: `withdraw:${proposal.id}`,
          label: "Withdraw",
          explanation: "Discards this proposal; history keeps it.",
          kind: "link",
        },
      ],
    };
  }
  if (published && !candidate) {
    const url =
      proposal.publication?.pullRequestUrl ??
      proposal.external?.pullRequestUrl ??
      null;
    const number =
      proposal.publication?.pullRequestNumber ??
      proposal.external?.pullRequestNumber ??
      null;
    return {
      ...withStages,
      now: `Pull request${number ? ` #${number}` : ""} is open on GitHub. Merge it there, then refresh; an unmerged head gets preview results only.`,
      waitingOn: "github",
      actions: [
        ...(url
          ? [
              {
                key: "open-pull-request",
                label: number
                  ? `Open pull request #${number}`
                  : "Open pull request",
                explanation: demo
                  ? "Demo publication: this synthetic repository has no real GitHub page."
                  : "Review and merge on GitHub.",
                kind: "link" as const,
                href: url,
                demo,
              },
            ]
          : []),
        {
          key: "refresh",
          label: "Refresh from GitHub",
          explanation: "Records the exact merged revision as the candidate.",
          kind: "secondary",
        },
      ],
    };
  }
  if (candidate && !acceptance)
    return {
      ...withStages,
      now: proposedAcceptance
        ? `Behavior checks v${proposedAcceptance.version} are proposed and wait for your acceptance. A health response alone is not sufficient.`
        : "No application-behavior check has been established from the repository's routes. Ask Server Guy to propose one; a health response alone is not sufficient.",
      waitingOn: "you",
      actions: proposedAcceptance
        ? [
            {
              key: `accept-checks:${proposedAcceptance.id}`,
              label: `Accept behavior checks v${proposedAcceptance.version}`,
              explanation: "Accepts the test plan; the runner executes it.",
              kind: "primary",
            },
          ]
        : [
            {
              key: "ask",
              label: "Ask Server Guy to propose behavior checks",
              explanation: "Proposed from cited routes; you accept them.",
              kind: "primary",
            },
          ],
    };
  if (verified)
    return {
      ...withStages,
      now: `Every required check passed for the exact candidate ${short(candidate?.sha)}. Phase 4, Review launch plan, is not available in this build.`,
      waitingOn: "none",
      actions: [
        {
          key: "verify",
          label: "Run conformance checks again",
          explanation: "Repeats the run over the same candidate.",
          kind: "secondary",
        },
      ],
      remaining: "Nothing remains in this phase.",
    };
  if (candidate && runForCandidate && run)
    return {
      ...withStages,
      now: conformanceCheck?.result ?? `The last run ended ${run.status}.`,
      waitingOn: "you",
      actions: [
        {
          key: "verify",
          label: "Run conformance checks again",
          explanation:
            "Runs every required check over the exact candidate again.",
          kind: "primary",
        },
      ],
    };
  if (candidate)
    return {
      ...withStages,
      now: `Candidate ${short(candidate.sha)} is recorded on ${candidate.defaultBranch}. No conformance run for it yet.`,
      waitingOn: "you",
      actions: [
        {
          key: "verify",
          label: "Verify candidate",
          explanation:
            "Runs every required check over the exact candidate in the isolated runner.",
          kind: "primary",
        },
        {
          key: "refresh",
          label: "Refresh from GitHub",
          explanation: "Checks whether the default branch moved.",
          kind: "secondary",
        },
      ],
    };
  return {
    ...withStages,
    now: conformanceCheck?.result ?? "Working toward the Conformance Result.",
    waitingOn: "server-guy",
    actions: [],
  };
}

export interface ContractVersion {
  version: number;
  commitSha: string | null;
  when: string;
  why: string;
  current: boolean;
}

/**
 * Saved contract versions as far as the viewed phase's Activity records them.
 * Production needs a dedicated read (every saved version with its changed
 * values and sources); this derivation only proves the presentation.
 */
export function contractVersions(view: OperatorView): ContractVersion[] {
  const current = view.contract;
  if (!current) return [];
  const versions = new Map<number, ContractVersion>();
  const events = [...view.activity].reverse();
  const shaOf = (event: ActivityEvent) =>
    /\b([0-9a-f]{8})\b/.exec(event.detail)?.[1] ?? null;
  for (const event of events) {
    if (event.kind === "contract-established") {
      const version = Number(/v(\d+)/.exec(event.detail)?.[1] ?? 1);
      versions.set(version, {
        version,
        commitSha: shaOf(event),
        when: event.createdAt,
        why: "Proposed from the inspected repository.",
        current: false,
      });
    } else if (event.kind === "contract-revised") {
      const match = /v(\d+) → v(\d+)/.exec(event.detail);
      const version = Number(match?.[2] ?? 0);
      const why = event.detail.replace(/^v\d+ → v\d+ at [0-9a-f]+ · /, "");
      versions.set(version, {
        version,
        commitSha: shaOf(event),
        when: event.createdAt,
        why,
        current: false,
      });
    }
  }
  versions.set(current.version, {
    version: current.version,
    commitSha: current.commitSha,
    when: current.createdAt,
    why:
      versions.get(current.version)?.why ??
      "Proposed from the inspected repository.",
    current: true,
  });
  return [...versions.values()].sort((a, b) => b.version - a.version);
}
