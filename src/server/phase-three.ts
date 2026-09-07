import { duringApplicationOperation } from "./application-operations";
// Phase 3, Make launch-ready: the brief, Pi's staged changes and previews,
// approval and publication, external returns, the exact candidate and the
// authoritative conformance run. The controller owns every source tree; a
// container is never the source of truth; nothing here merges.
import { contractGapReport } from "./application-contract";
import {
  validateAcceptanceChecks,
  weakensAcceptedChecks,
} from "./acceptance-checks";
import {
  buildConformanceBrief,
  executionConfiguration,
  secretVariableNames,
} from "./conformance-brief";
import {
  CONFORMANCE_DEFINITION,
  sensitivePathReason,
} from "./conformance-definition";
import {
  dockerConformanceExecutor,
  lastKnownEnvironment,
  rememberEnvironment,
  type ConformanceExecutor,
  type ExecutionPlan,
} from "./conformance-executor";
import {
  cancelConformanceRun,
  executeConformanceRun,
  queueConformanceRun,
  startConformanceRun,
} from "./conformance-runs";
import {
  acceptedAcceptanceChecks,
  activeConformanceProposal,
  activePublicationGrant,
  currentContract,
  findRepositoryFileObservation,
  getAcceptanceChecks,
  getConformanceProposal,
  getContract,
  getObservation,
  hasPendingRuns,
  insertAcceptanceChecks,
  insertActivity,
  insertConformanceProposal,
  insertPublicationGrant,
  listAcceptanceChecks,
  listChats,
  listConformanceProposals,
  listConformanceRuns,
  listObservations,
  listPendingConformanceRuns,
  proposedAcceptanceChecks,
  recordActivityOnce,
  revokePublicationGrants,
  updateAcceptanceChecks,
  updateConformanceProposal,
  updateConformanceRun,
} from "./db";
import {
  applyOverlay,
  dockerfileStartCommand,
  fetchBaseTree,
  overlayDigest,
  treeDigest,
  type TreeFile,
} from "./execution-tree";
import { GithubAccessError, githubJson } from "./github-api";
import {
  connectedGithubCredential,
  currentGithubConnectionId,
} from "./github-connection";
import {
  classifyMerge,
  compareCommits,
  fileContentAt,
  findPullRequestForBranch,
  observeBranchHead,
  observeCommit,
  observePullRequest,
  proposalBranchName,
  publishToGithub,
  verifyPublicationPermissions,
  type ObservedPullRequest,
} from "./github-publication";
import { REPOSITORY_OBSERVATION } from "./phase-one-evidence";
import { latestInspection } from "./phase-two";
import { PHASE_THREE } from "./phase-three-spec";
import { enqueueServerGuyRequest } from "./pi-runs";
import { validateSourceProposal } from "./source-proposal";
import type {
  AcceptanceChecksProposal,
  ApplicationContractRecord,
  ApplicationRecord,
  CandidateResolution,
  CandidateVerification,
  ConformanceProposalRecord,
  ConformanceRunConfiguration,
  ConformanceRunRecord,
  ConformanceView,
  ExecutionEnvironmentStatus,
  InspectAppEvidence,
  PhaseWorkspaceRecord,
  PiRun,
  PiTurnResult,
  ProposedFileChange,
  SourceChangeProposal,
} from "./types";
import { loadApplication, loadChat } from "./workspaces";

export const CONFORMANCE_REQUEST =
  "Make the repository launch-ready: resolve every required change in the conformance brief, verify the result in a preview run, and propose the application-behavior checks.";

let executor: ConformanceExecutor | null = null;

/** The runner in use; tests and disposable fixtures substitute their own. */
export function conformanceExecutor() {
  return (executor ??= dockerConformanceExecutor());
}

export function setConformanceExecutor(
  replacement: ConformanceExecutor | null,
) {
  executor = replacement;
}

function shortSha(sha: string | null | undefined) {
  return sha?.slice(0, 8) ?? "unknown";
}

function fullName(application: ApplicationRecord) {
  return `${application.repositoryOwner}/${application.repositoryName}`;
}

// Retained evidence and the contract Phase 3 works from.

export function retainedInspectApp(workspaces: PhaseWorkspaceRecord[]) {
  const workspace = workspaces.find(
    (item) => item.phaseKey === "inspect-app" && item.completedAt,
  );
  const evidence = workspace?.deliverableEvidence as
    Partial<InspectAppEvidence> | null | undefined;
  return evidence && typeof evidence.contractId === "string"
    ? (evidence as InspectAppEvidence)
    : null;
}

/**
 * The contract Phase 3 serves: the one retained when Inspect app completed,
 * or its active revision made during Phase 3. A revision that reintroduced
 * blockers keeps the phase blocked with a correction path.
 */
export function phaseThreeContract(
  applicationId: string,
  retained: InspectAppEvidence | null,
) {
  if (!retained) return { contract: null, blocked: null as string | null };
  const current = currentContract(applicationId);
  const contract = current ?? getContract(retained.contractId);
  if (!contract)
    return {
      contract: null,
      blocked: "The retained Application Contract is missing.",
    };
  const gaps = contractGapReport(contract.body);
  const blocked =
    gaps.blockers.length && contract.id !== retained.contractId
      ? `Application Contract v${contract.version} reintroduced ${gaps.blockers.length} unresolved value${gaps.blockers.length === 1 ? "" : "s"} (${gaps.blockers.map((gap) => gap.label).join(", ")}). Resolve them with a further revision before conformance can proceed.`
      : null;
  return { contract, blocked };
}

function defaultBranchOf(applicationId: string) {
  const inspection = latestInspection(applicationId);
  const raw = inspection?.raw as { defaultBranch?: string } | null;
  return typeof raw?.defaultBranch === "string" ? raw.defaultBranch : null;
}

function bindings(contract: ApplicationContractRecord, applicationId: string) {
  const accepted = acceptedAcceptanceChecks(applicationId);
  return {
    contractId: contract.id,
    contractVersion: contract.version,
    acceptanceChecksId: accepted?.id ?? null,
    accepted,
  };
}

/** The Phase 3 projection: everything the Record, the gate and Pi read. */
export function conformanceView(
  application: ApplicationRecord,
  workspaces: PhaseWorkspaceRecord[],
  workspace: PhaseWorkspaceRecord,
): ConformanceView {
  const retained = retainedInspectApp(workspaces);
  const { contract, blocked } = phaseThreeContract(application.id, retained);
  const accepted = acceptedAcceptanceChecks(application.id);
  const proposed = proposedAcceptanceChecks(application.id);
  const brief = contract
    ? buildConformanceBrief(
        application,
        contract,
        accepted ?? proposed,
        defaultBranchOf(application.id),
      )
    : null;
  const proposal = activeConformanceProposal(workspace.id);
  const runs = listConformanceRuns(application.id).slice(0, 25);
  const candidateSha = proposal?.candidate?.sha ?? null;
  return {
    retained,
    brief,
    proposal,
    proposals: listConformanceProposals(application.id),
    acceptance: accepted,
    proposedAcceptance: proposed,
    runs,
    latestPreview:
      runs.find(
        (run) =>
          run.kind === "preview" && run.proposalId === (proposal?.id ?? null),
      ) ??
      runs.find((run) => run.kind === "preview") ??
      null,
    latestCandidateRun:
      runs.find(
        (run) =>
          run.kind === "candidate" && run.source.commitSha === candidateSha,
      ) ??
      runs.find((run) => run.kind === "candidate") ??
      null,
    environment: lastKnownEnvironment(),
    grant: activePublicationGrant(application.id),
    contractBlocked: blocked,
  };
}

function currentWorkspace(applicationId: string) {
  const { application, workspaces, current } = loadApplication(applicationId);
  if (current.phaseKey !== PHASE_THREE.key || current.completedAt)
    throw new Error("Make launch-ready is not the current phase.");
  return { application, workspaces, workspace: current };
}

function requireBrief(applicationId: string) {
  const { application, workspaces, workspace } =
    currentWorkspace(applicationId);
  const retained = retainedInspectApp(workspaces);
  const { contract, blocked } = phaseThreeContract(application.id, retained);
  if (!retained || !contract) throw new Error("Complete Inspect app first.");
  if (blocked) throw new Error(blocked);
  return { application, workspace, retained, contract };
}

// The engineer's choice of working environment.

/** Continue with Server Guy: one request Server Guy starts in the main chat. */
export function continueWithServerGuy(applicationId: string) {
  const { application, workspace } = requireBrief(applicationId);
  if (hasPendingRuns(application.id))
    throw new Error("Wait for the current reply to finish or cancel it first.");
  const chat =
    listChats(workspace.id).find(
      (item) => item.isPrimary && !item.archivedAt,
    ) ?? null;
  if (!chat) throw new Error("The Make launch-ready chat is missing.");
  return enqueueServerGuyRequest(application.id, chat.id, CONFORMANCE_REQUEST);
}

export function exportBrief(applicationId: string) {
  const { application, workspace, contract } = requireBrief(applicationId);
  const brief = buildConformanceBrief(
    application,
    contract,
    acceptedAcceptanceChecks(application.id) ??
      proposedAcceptanceChecks(application.id),
    defaultBranchOf(application.id),
  );
  recordActivityOnce(
    `brief-exported:${workspace.id}:${contract.version}`,
    workspace.id,
    "brief-exported",
    "Conformance brief exported",
    `For external work from ${shortSha(brief.baseSha)} against Application Contract v${contract.version}; return a pull request, branch or commit to continue.`,
  );
  return { text: brief.exportText, brief };
}

// Staged work inside a Pi Run.

export interface StagedConformance {
  proposal: SourceChangeProposal | null;
  acceptance: AcceptanceChecksProposal | null;
  /** The tree digest of the last preview, or null when untested since an
   * edit. */
  previewTreeDigest: string | null;
}

export function newStagedConformance(): StagedConformance {
  return { proposal: null, acceptance: null, previewTreeDigest: null };
}

function runScope(run: PiRun) {
  const { application, workspaces, workspace } = loadChat(
    run.applicationId,
    run.chatId,
  );
  if (workspace.phaseKey !== PHASE_THREE.key)
    throw new Error("Conformance work belongs to Make launch-ready.");
  const retained = retainedInspectApp(workspaces);
  const { contract, blocked } = phaseThreeContract(application.id, retained);
  if (!retained || !contract)
    throw new Error(
      "Inspect app has not been completed; there is no contract to work from.",
    );
  return { application, workspace, retained, contract, blocked };
}

/** The projection behind `get_conformance_brief`. */
export function conformanceBriefForRun(run: PiRun, staged: StagedConformance) {
  const { application, workspace, contract, blocked } = runScope(run);
  const accepted = acceptedAcceptanceChecks(application.id);
  const proposed = proposedAcceptanceChecks(application.id);
  const brief = buildConformanceBrief(
    application,
    contract,
    accepted ?? proposed,
    defaultBranchOf(application.id),
  );
  const active = activeConformanceProposal(workspace.id);
  const environment = lastKnownEnvironment();
  return {
    retrievedAt: new Date().toISOString(),
    contractBlocked: blocked,
    brief: { ...brief, exportText: undefined },
    acceptedBehavior: accepted
      ? { id: accepted.id, version: accepted.version, steps: accepted.steps }
      : null,
    proposedBehavior: proposed
      ? {
          id: proposed.id,
          version: proposed.version,
          status: proposed.status,
          steps: proposed.steps,
        }
      : null,
    savedProposal: active
      ? {
          id: active.id,
          origin: active.origin,
          status: active.status,
          summary: active.summary,
          files: active.changes.map((change) => change.path),
          pullRequestUrl:
            active.publication?.pullRequestUrl ??
            active.external?.pullRequestUrl ??
            null,
          candidateSha: active.candidate?.sha ?? null,
        }
      : null,
    stagedInThisRequest: {
      changes: staged.proposal
        ? {
            files: staged.proposal.changes.map((change) => change.path),
            filesDigest: staged.proposal.filesDigest,
            preview: staged.previewTreeDigest
              ? "tested"
              : "untested since last edit",
          }
        : null,
      acceptanceChecks: staged.acceptance
        ? staged.acceptance.steps.length
        : null,
    },
    executionEnvironment: environment
      ? {
          state: environment.state,
          summary: environment.summary,
          checkedAt: environment.checkedAt,
        }
      : {
          state: "unchecked",
          summary: "Not checked yet; a preview run checks it.",
        },
    limits: {
      files: CONFORMANCE_DEFINITION.limits,
    },
  };
}

function baseTreePaths(applicationId: string, commitSha: string) {
  const inspection = latestInspection(applicationId);
  const raw = inspection?.raw as {
    commitSha?: string;
    entries?: Array<{ path: string; type: string }>;
  } | null;
  if (raw?.commitSha !== commitSha)
    throw new Error(
      `The latest inspection is at ${shortSha(raw?.commitSha)}, not the contract commit ${shortSha(commitSha)}. Ask the engineer to re-inspect and revise the contract first.`,
    );
  return new Set(
    (raw?.entries ?? [])
      .filter((entry) => entry.type === "blob")
      .map((entry) => entry.path),
  );
}

export function collectSourceProposal(
  run: PiRun,
  staged: StagedConformance,
  input: unknown,
) {
  const { application, contract, blocked } = runScope(run);
  if (blocked) throw new Error(blocked);
  const gaps = contractGapReport(contract.body);
  const proposal = validateSourceProposal(input, {
    contract,
    requiredFields: gaps.conformance.map((item) => item.field),
    treePaths: baseTreePaths(application.id, contract.commitSha),
    baseObservationId: (path) =>
      findRepositoryFileObservation(application.id, contract.commitSha, path)
        ?.id ?? null,
  });
  const replaced = staged.proposal !== null;
  staged.proposal = proposal;
  staged.previewTreeDigest = null;
  return {
    status: "pending, not saved" as const,
    replacedEarlierProposal: replaced,
    baseSha: proposal.baseSha,
    filesDigest: proposal.filesDigest,
    files: proposal.changes.map(
      (change) =>
        `${change.path}${change.content === null ? " (deleted)" : ""}`,
    ),
    mapped: proposal.mapping.map((entry) => entry.field),
    preview:
      "untested since last edit: run run_conformance_preview before finishing",
    approval:
      application.approvalMode === "always-ask"
        ? "The engineer must approve before Server Guy publishes a branch and pull request."
        : application.approvalMode === "full-autonomy"
          ? "Server Guy publishes a branch and pull request automatically; the engineer merges on GitHub."
          : proposal.requestApproval
            ? "Publication waits for the engineer's approval, as you requested."
            : "Server Guy publishes a branch and pull request without a separate approval; the engineer merges on GitHub.",
  };
}

export function collectAcceptanceProposal(
  run: PiRun,
  staged: StagedConformance,
  input: unknown,
) {
  const { application, contract, blocked } = runScope(run);
  if (blocked) throw new Error(blocked);
  const proposal = validateAcceptanceChecks(input, {
    contract,
    citations: {
      applicationId: application.id,
      commitSha: contract.commitSha,
      lookups: { observation: getObservation },
    },
  });
  const accepted = acceptedAcceptanceChecks(application.id);
  const weakens = weakensAcceptedChecks(proposal.steps, accepted);
  staged.acceptance = proposal;
  return {
    status: "pending, not saved" as const,
    steps: proposal.steps.length,
    digest: proposal.digest,
    replacesAccepted: accepted ? `v${accepted.version}` : null,
    weakensAccepted: weakens,
    acceptance:
      application.approvalMode === "full-autonomy" && !weakens
        ? "Accepted automatically under Full autonomy when this request completes."
        : "Saved as proposed; the engineer accepts it in the Record before it counts.",
  };
}

async function materialize(
  application: ApplicationRecord,
  contract: ApplicationContractRecord,
  changes: ProposedFileChange[],
  commitSha: string,
  signal?: AbortSignal,
) {
  const credential = await connectedGithubCredential();
  const base = await fetchBaseTree(
    fullName(application),
    commitSha,
    credential.token,
    signal,
  );
  const files = applyOverlay(base, changes);
  const startCommand = dockerfileStartCommand(files);
  const configuration = executionConfiguration(contract);
  const contractCommand = contract.body.fields.find(
    (field) => field.key === "runtime.startCommand",
  )?.value;
  const runConfiguration: ConformanceRunConfiguration = {
    ...configuration,
    startCommand:
      startCommand ??
      (contractCommand
        ? contractCommand.split(/\s+/)
        : ["uv", "run", "uvicorn", "app:app"]),
    startCommandSource: startCommand ? "dockerfile" : "contract",
  };
  return { files, runConfiguration, digest: treeDigest(files) };
}

function planFor(
  runId: string,
  application: ApplicationRecord,
  contract: ApplicationContractRecord,
  files: TreeFile[],
  configuration: ConformanceRunConfiguration,
  acceptance: {
    steps: AcceptanceChecksProposal["steps"];
    label: string;
  } | null,
  command?: string[],
): ExecutionPlan {
  return {
    runId,
    applicationId: application.id,
    files,
    configuration,
    secretVariables: secretVariableNames(contract),
    acceptance,
    ...(command ? { command } : {}),
  };
}

function boundedResults(run: ConformanceRunRecord) {
  return {
    runId: run.id,
    status: run.status,
    summary: run.summary,
    treeDigest: run.source.treeDigest,
    imageDigest: run.imageDigest,
    error: run.error,
    checks: run.results.map((result) => ({
      key: result.key,
      label: result.label,
      outcome: result.outcome,
      summary: result.summary,
      exitCode: result.exitCode,
      ...(result.steps ? { steps: result.steps } : {}),
      outputTail: result.output ? result.output.slice(-2_500) : null,
    })),
  };
}

function requireEnvironment(status: ExecutionEnvironmentStatus) {
  if (!status.ready)
    throw new Error(
      `The execution environment is not available on the controller host: ${status.summary} The engineer can fix this in Settings → Execution (${status.recovery.label}) and check again; meanwhile propose the changes and acceptance checks, and say plainly that they are untested.`,
    );
}

/**
 * The preview behind `run_conformance_preview`: the full check set over the
 * base tree plus the staged changes, recorded as a preview run bound to this
 * Pi Run. Worker evidence: it never satisfies P3.G3.
 */
export async function previewConformanceForRun(
  run: PiRun,
  staged: StagedConformance,
  signal?: AbortSignal,
) {
  const { application, workspace, contract, blocked } = runScope(run);
  if (blocked) throw new Error(blocked);
  const environment = rememberEnvironment(
    await conformanceExecutor().environment(),
  );
  requireEnvironment(environment);
  const changes = staged.proposal?.changes ?? [];
  const { files, runConfiguration, digest } = await materialize(
    application,
    contract,
    changes,
    contract.commitSha,
    signal,
  );
  const accepted = acceptedAcceptanceChecks(application.id);
  const acceptance = staged.acceptance
    ? {
        steps: staged.acceptance.steps,
        label: "proposed in this request (preview)",
      }
    : accepted
      ? { steps: accepted.steps, label: `accepted v${accepted.version}` }
      : null;
  const row = startConformanceRun({
    applicationId: application.id,
    workspaceId: workspace.id,
    kind: "preview",
    source: {
      commitSha: contract.commitSha,
      overlayDigest: changes.length ? overlayDigest(changes) : null,
      treeDigest: digest,
      fileCount: files.length,
    },
    proposalId: null,
    contractId: contract.id,
    contractVersion: contract.version,
    profileId: contract.profileId,
    profileVersion: contract.profileVersion,
    definitionVersion: CONFORMANCE_DEFINITION.version,
    acceptanceChecksId: staged.acceptance ? null : (accepted?.id ?? null),
    acceptanceChecksVersion: staged.acceptance
      ? null
      : (accepted?.version ?? null),
    imageDigest: null,
    configuration: runConfiguration,
    piRunId: run.id,
  });
  const finished = await executeConformanceRun(
    row,
    conformanceExecutor(),
    planFor(row.id, application, contract, files, runConfiguration, acceptance),
    { signal },
  );
  if (finished.status === "passed" || finished.status === "failed")
    staged.previewTreeDigest = digest;
  return {
    ...boundedResults(finished),
    kind: "preview",
    note: "Preview over the base commit plus your staged changes. It informs your next edit; only Server Guy's run over the merged candidate can satisfy the gate.",
  };
}

/** A Pi-requested command in the same isolated runner; worker evidence. */
export async function commandForRun(
  run: PiRun,
  staged: StagedConformance,
  input: { command: string[] },
  signal?: AbortSignal,
) {
  const { application, workspace, contract, blocked } = runScope(run);
  if (blocked) throw new Error(blocked);
  const environment = rememberEnvironment(
    await conformanceExecutor().environment(),
  );
  requireEnvironment(environment);
  const changes = staged.proposal?.changes ?? [];
  const { files, runConfiguration, digest } = await materialize(
    application,
    contract,
    changes,
    contract.commitSha,
    signal,
  );
  const row = startConformanceRun({
    applicationId: application.id,
    workspaceId: workspace.id,
    kind: "command",
    source: {
      commitSha: contract.commitSha,
      overlayDigest: changes.length ? overlayDigest(changes) : null,
      treeDigest: digest,
      fileCount: files.length,
    },
    proposalId: null,
    contractId: contract.id,
    contractVersion: contract.version,
    profileId: contract.profileId,
    profileVersion: contract.profileVersion,
    definitionVersion: CONFORMANCE_DEFINITION.version,
    acceptanceChecksId: null,
    acceptanceChecksVersion: null,
    imageDigest: null,
    configuration: { ...runConfiguration, command: input.command },
    piRunId: run.id,
  });
  const finished = await executeConformanceRun(
    row,
    conformanceExecutor(),
    planFor(
      row.id,
      application,
      contract,
      files,
      { ...runConfiguration, command: input.command },
      null,
      input.command,
    ),
    { signal },
  );
  return {
    ...boundedResults(finished),
    kind: "command",
    note: "Exploratory command output over the base commit plus your staged changes; worker evidence, never a gate input.",
  };
}

/**
 * Called inside the worker's final transaction: the staged change and the
 * staged acceptance checks are saved with the answer, guarded against a
 * contract that changed underneath them. Approval follows the Approval Mode.
 */
/**
 * The contract a staged proposal is saved against: normally the one it was
 * staged under. When the same reply revised the contract, that revision was
 * committed a moment earlier in this transaction, so the proposal keeps its
 * meaning if the revision stays at the same commit and every field it maps
 * is still a required change; it then binds to the revision. Otherwise the
 * attempt fails and nothing from it is saved, the revision included.
 */
function contractBinding(
  run: PiRun,
  reply: PiTurnResult,
  contract: ApplicationContractRecord,
) {
  const revisedHere =
    Boolean(reply.contractProposal) &&
    contract.sourceMessageId === run.userMessageId;
  const required = new Set(
    contractGapReport(contract.body).conformance.map((item) => item.field),
  );
  return (
    proposal: {
      contractId: string;
      contractVersion: number;
      mapping?: Array<{ field: string }>;
    },
    what: string,
  ) => {
    if (
      proposal.contractId === contract.id &&
      proposal.contractVersion === contract.version
    )
      return { id: contract.id, version: contract.version };
    if (!revisedHere)
      throw new StaleConformanceProposalError(
        `The Application Contract changed while ${what} was being proposed (v${proposal.contractVersion} → v${contract.version}); nothing from this attempt was saved. Ask again to propose it against the current contract.`,
      );
    const dropped = (proposal.mapping ?? [])
      .map((entry) => entry.field)
      .filter((field) => !required.has(field));
    if (
      getContract(proposal.contractId)?.commitSha !== contract.commitSha ||
      dropped.length
    )
      throw new StaleConformanceProposalError(
        `This reply revised the Application Contract (v${proposal.contractVersion} → v${contract.version})${
          dropped.length
            ? ` so that ${dropped.join(", ")} ${dropped.length === 1 ? "is" : "are"} no longer a required change`
            : " at a different commit"
        }; neither the revision nor ${what} was saved. Ask again, revising the contract first.`,
      );
    return { id: contract.id, version: contract.version };
  };
}

export function commitConformanceProposals(run: PiRun, reply: PiTurnResult) {
  if (!reply.sourceProposal && !reply.acceptanceProposal) return;
  const { application, workspace, contract, blocked } = runScope(run);
  if (workspace.completedAt) throw new Error("Make launch-ready is complete.");
  if (blocked) throw new Error(blocked);
  const bind = contractBinding(run, reply, contract);
  if (reply.sourceProposal) {
    const proposal = reply.sourceProposal;
    const bound = bind(proposal, "this change");
    if (proposal.filesDigest !== overlayDigest(proposal.changes))
      throw new Error("The staged change does not match its digest.");
    const previous = activeConformanceProposal(workspace.id);
    const mode = application.approvalMode;
    const automatic =
      mode === "full-autonomy" ||
      (mode === "pi-decides" && !proposal.requestApproval);
    const record = insertConformanceProposal({
      applicationId: application.id,
      workspaceId: workspace.id,
      origin: "server-guy",
      status: automatic ? "approved" : "proposed",
      baseSha: proposal.baseSha,
      contractId: bound.id,
      contractVersion: bound.version,
      summary: proposal.summary,
      changes: proposal.changes,
      filesDigest: proposal.filesDigest,
      mapping: proposal.mapping,
      requestApproval: proposal.requestApproval,
      sourceMessageId: run.userMessageId,
      piRunId: run.id,
      approval: automatic
        ? {
            mode,
            by: "approval-mode",
            approvedAt: new Date().toISOString(),
            filesDigest: proposal.filesDigest,
            baseSha: proposal.baseSha,
            contractVersion: bound.version,
          }
        : null,
      publication: null,
      publicationError: null,
      external: null,
      candidate: null,
      verification: null,
      supersededById: null,
    });
    if (previous)
      updateConformanceProposal(
        previous.id,
        ["proposed", "approved", "published"],
        {
          status: "superseded",
          supersededById: record.id,
        },
      );
    insertActivity(
      workspace.id,
      "change-proposed",
      "Conformance change proposed",
      `${proposal.changes.length} file${proposal.changes.length === 1 ? "" : "s"} against ${shortSha(proposal.baseSha)} · ${proposal.mapping.map((entry) => entry.field).join(", ")} · ${
        automatic
          ? `approved by the ${mode === "full-autonomy" ? "Full autonomy" : "Let Server Guy decide"} policy`
          : "waiting for your approval"
      }${previous ? ` · replaces the earlier ${previous.origin === "external" ? "returned change" : "proposal"}` : ""}`,
    );
  }
  if (reply.acceptanceProposal) {
    const proposal = reply.acceptanceProposal;
    const bound = bind(proposal, "the acceptance checks");
    const accepted = acceptedAcceptanceChecks(application.id);
    const weakens = weakensAcceptedChecks(proposal.steps, accepted);
    const automatic = application.approvalMode === "full-autonomy" && !weakens;
    const version =
      (listAcceptanceChecks(application.id).at(-1)?.version ?? 0) + 1;
    const record = insertAcceptanceChecks({
      applicationId: application.id,
      workspaceId: workspace.id,
      version,
      status: automatic ? "accepted" : "proposed",
      rationale: proposal.rationale,
      steps: proposal.steps,
      evidence: proposal.evidence,
      digest: proposal.digest,
      contractId: bound.id,
      contractVersion: bound.version,
      sourceMessageId: run.userMessageId,
      piRunId: run.id,
      acceptedAt: automatic ? new Date().toISOString() : null,
      acceptedBy: automatic ? "approval-mode" : null,
      supersededById: null,
    });
    const stale = proposedAcceptanceChecks(application.id);
    if (stale && stale.id !== record.id)
      updateAcceptanceChecks(stale.id, ["proposed"], {
        status: "superseded",
        supersededById: record.id,
      });
    if (automatic && accepted)
      updateAcceptanceChecks(accepted.id, ["accepted"], {
        status: "superseded",
        supersededById: record.id,
      });
    insertActivity(
      workspace.id,
      automatic ? "acceptance-accepted" : "acceptance-proposed",
      automatic
        ? "Application-behavior checks accepted"
        : "Application-behavior checks proposed",
      `v${version} · ${proposal.steps.length} step${proposal.steps.length === 1 ? "" : "s"}: ${proposal.steps.map((step) => `${step.method} ${step.path} → ${step.expectStatus}`).join("; ")}${
        automatic
          ? " · accepted by the Full autonomy policy"
          : weakens
            ? " · weaker than the accepted version, so it needs your explicit acceptance"
            : " · waiting for your acceptance"
      }`,
    );
  }
}

export class StaleConformanceProposalError extends Error {}

// Approval, publication and withdrawal.

function requireProposal(applicationId: string, proposalId: string) {
  const { application, workspace, contract } = requireBrief(applicationId);
  const proposal = getConformanceProposal(proposalId);
  if (
    !proposal ||
    proposal.applicationId !== application.id ||
    proposal.workspaceId !== workspace.id
  )
    throw new Error("Proposal not found.");
  return { application, workspace, contract, proposal };
}

export function approveProposal(applicationId: string, proposalId: string) {
  const { application, workspace, contract, proposal } = requireProposal(
    applicationId,
    proposalId,
  );
  if (proposal.status === "approved" || proposal.status === "published")
    return proposal;
  if (proposal.contractVersion !== contract.version)
    throw new Error(
      `This change was proposed against Application Contract v${proposal.contractVersion}; the contract is now v${contract.version}. Ask Server Guy for a new change.`,
    );
  const updated = updateConformanceProposal(proposal.id, ["proposed"], {
    status: "approved",
    approval: {
      mode: application.approvalMode,
      by: "engineer",
      approvedAt: new Date().toISOString(),
      filesDigest: proposal.filesDigest,
      baseSha: proposal.baseSha,
      contractVersion: proposal.contractVersion,
    },
  });
  if (!updated) throw new Error("This proposal can no longer be approved.");
  insertActivity(
    workspace.id,
    "change-approved",
    "Conformance change approved",
    `${proposal.changes.length} file${proposal.changes.length === 1 ? "" : "s"} against ${shortSha(proposal.baseSha)} · approved by you; Server Guy publishes a branch and pull request next.`,
  );
  return updated;
}

/**
 * Publishes an approved proposal as one branch and one pull request. Inputs
 * are rechecked immediately before the effect; an interrupted earlier attempt
 * is reconciled from GitHub before anything is created again.
 */
export async function publishProposal(
  applicationId: string,
  proposalId: string,
  signal?: AbortSignal,
) {
  return duringApplicationOperation(applicationId, () =>
    publishProposalImpl(applicationId, proposalId, signal),
  );
}

async function publishProposalImpl(
  applicationId: string,
  proposalId: string,
  signal?: AbortSignal,
) {
  const { application, workspace, contract, proposal } = requireProposal(
    applicationId,
    proposalId,
  );
  if (proposal.status === "published" && proposal.publication) return proposal;
  if (proposal.status !== "approved")
    throw new Error("Only an approved change can be published.");
  if (proposal.origin !== "server-guy")
    throw new Error(
      "Only Server Guy's own changes are published; returned changes are already on GitHub.",
    );
  if (proposal.contractVersion !== contract.version)
    throw new Error(
      `This change was approved against Application Contract v${proposal.contractVersion}; the contract is now v${contract.version}.`,
    );
  if (
    proposal.approval?.filesDigest !== proposal.filesDigest ||
    proposal.filesDigest !== overlayDigest(proposal.changes)
  )
    throw new Error("The approved change no longer matches what was approved.");
  const grant = activePublicationGrant(application.id);
  const connectionId = currentGithubConnectionId();
  if (!grant || !connectionId || grant.connectionId !== connectionId)
    throw new Error(
      "Publishing needs your explicit grant for this repository with the current GitHub connection. Open the Conformance Result and choose Allow publishing.",
    );
  const credential = await connectedGithubCredential();
  const defaultBranch = defaultBranchOf(application.id) ?? "main";
  try {
    const receipt = await publishToGithub(
      credential.token,
      {
        fullName: fullName(application),
        defaultBranch,
        baseSha: proposal.baseSha,
        proposalId: proposal.id,
        branch: proposalBranchName(proposal.id),
        title: `Make launch-ready: ${proposal.mapping.map((entry) => entry.field).join(", ") || "conformance"}`,
        body: `${proposal.summary}\n\nProposed by Server Guy against Application Contract v${proposal.contractVersion} at ${proposal.baseSha}.\n\nRequired changes resolved:\n${proposal.mapping.map((entry) => `- ${entry.field}: ${entry.explanation}`).join("\n")}\n\nServer Guy verifies the merged revision independently; merging is yours.`,
        changes: proposal.changes,
      },
      signal,
    );
    const updated = updateConformanceProposal(proposal.id, ["approved"], {
      status: "published",
      publication: {
        ...receipt,
        publishedAt: new Date().toISOString(),
        connectionId,
        state: "open",
        observedAt: new Date().toISOString(),
      },
      publicationError: null,
    });
    if (!updated)
      throw new Error("The proposal changed while it was being published.");
    insertActivity(
      workspace.id,
      "change-published",
      "Branch and pull request published",
      `${receipt.branch} at ${shortSha(receipt.commitSha)} · ${receipt.pullRequestUrl}${receipt.adopted ? " · adopted from an earlier attempt" : ""} · merge it on GitHub, then refresh.`,
    );
    return updated;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Publication failed.";
    updateConformanceProposal(proposal.id, ["approved"], {
      publicationError: reason,
    });
    insertActivity(
      workspace.id,
      "change-publication-failed",
      "Publication did not complete",
      `${reason} Nothing was merged; retry publishing after fixing the cause.`,
    );
    throw error;
  }
}

/** Publication that follows a commit automatically under the policy. */
export async function publishIfAutomatic(
  applicationId: string,
  workspaceId: string,
) {
  const proposal = activeConformanceProposal(workspaceId);
  if (
    !proposal ||
    proposal.status !== "approved" ||
    proposal.approval?.by !== "approval-mode"
  )
    return null;
  if (!activePublicationGrant(applicationId)) {
    updateConformanceProposal(proposal.id, ["approved"], {
      publicationError:
        "No publishing grant for this repository yet; choose Allow publishing in the Conformance Result, then Publish.",
    });
    return null;
  }
  try {
    return await publishProposal(applicationId, proposal.id);
  } catch {
    return null;
  }
}

export function withdrawProposal(applicationId: string, proposalId: string) {
  const { workspace, proposal } = requireProposal(applicationId, proposalId);
  const updated = updateConformanceProposal(
    proposal.id,
    ["proposed", "approved", "published"],
    {
      status: "withdrawn",
    },
  );
  if (!updated) throw new Error("This proposal can no longer be withdrawn.");
  insertActivity(
    workspace.id,
    "change-withdrawn",
    proposal.origin === "external"
      ? "Returned change withdrawn"
      : "Conformance change withdrawn",
    `${proposal.summary.slice(0, 160)}${proposal.publication ? ` · the pull request ${proposal.publication.pullRequestUrl} stays on GitHub for you to close` : ""}`,
  );
  return updated;
}

// External returns.

function parseReturnReference(
  application: ApplicationRecord,
  reference: string,
) {
  const trimmed = reference.trim();
  const pull = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i.exec(
    trimmed,
  );
  if (pull)
    return {
      kind: "pull" as const,
      owner: pull[1],
      name: pull[2],
      number: Number(pull[3]),
    };
  const commit =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/commit\/([a-f0-9]{40})/i.exec(
      trimmed,
    );
  if (commit)
    return {
      kind: "sha" as const,
      owner: commit[1],
      name: commit[2],
      sha: commit[3].toLowerCase(),
    };
  const tree = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/(.+)$/i.exec(
    trimmed,
  );
  if (tree)
    return {
      kind: "branch" as const,
      owner: tree[1],
      name: tree[2],
      branch: tree[3],
    };
  const number = /^#?(\d+)$/.exec(trimmed);
  if (number)
    return {
      kind: "pull" as const,
      owner: application.repositoryOwner,
      name: application.repositoryName,
      number: Number(number[1]),
    };
  if (/^[a-f0-9]{40}$/i.test(trimmed))
    return {
      kind: "sha" as const,
      owner: application.repositoryOwner,
      name: application.repositoryName,
      sha: trimmed.toLowerCase(),
    };
  if (/^[A-Za-z0-9._\/-]{1,200}$/.test(trimmed))
    return {
      kind: "branch" as const,
      owner: application.repositoryOwner,
      name: application.repositoryName,
      branch: trimmed,
    };
  throw new Error(
    "Enter a pull request URL or number, a branch name, or a 40-character commit SHA.",
  );
}

async function returnedChanges(
  token: string,
  repository: string,
  baseSha: string,
  headSha: string,
  signal?: AbortSignal,
) {
  const compared = await compareCommits(
    token,
    repository,
    baseSha,
    headSha,
    signal,
  );
  const changes: ProposedFileChange[] = [];
  const violations: string[] = [];
  for (const file of compared.slice(0, 200)) {
    const reason = sensitivePathReason(file.filename);
    if (reason) violations.push(`${file.filename} (${reason})`);
    if (file.status === "removed") {
      changes.push({
        path: file.filename,
        content: null,
        baseObservationId: null,
      });
      continue;
    }
    const content = await fileContentAt(
      token,
      repository,
      file.filename,
      headSha,
      signal,
    );
    changes.push({
      path: file.filename,
      content: content ?? "",
      baseObservationId: null,
    });
  }
  return {
    changes,
    violations,
    changedFiles: compared.map((file) => file.filename),
  };
}

/**
 * Accepts a change made elsewhere: the reference is resolved on GitHub, the
 * diff against the brief's base is fetched independently, and the same scope
 * rules apply. The worker's own report is never trusted for anything.
 */
export async function returnExternalChange(
  applicationId: string,
  reference: string,
  signal?: AbortSignal,
) {
  return duringApplicationOperation(applicationId, () =>
    returnExternalChangeImpl(applicationId, reference),
  );
}

async function returnExternalChangeImpl(
  applicationId: string,
  reference: string,
  signal?: AbortSignal,
) {
  const { application, workspace, contract } = requireBrief(applicationId);
  const parsed = parseReturnReference(application, reference);
  if (
    parsed.owner.toLowerCase() !== application.repositoryOwner.toLowerCase() ||
    parsed.name.toLowerCase() !== application.repositoryName.toLowerCase()
  )
    throw new Error(
      `That reference points at ${parsed.owner}/${parsed.name}, not this application's repository ${fullName(application)}.`,
    );
  const credential = await connectedGithubCredential();
  const repository = fullName(application);
  let pull: ObservedPullRequest | null = null;
  let headSha: string;
  let branch: string | null = null;
  if (parsed.kind === "pull") {
    pull = await observePullRequest(
      credential.token,
      repository,
      parsed.number,
      signal,
    );
    headSha = pull.headSha;
    branch = pull.headRef;
  } else if (parsed.kind === "branch") {
    headSha = await observeBranchHead(
      credential.token,
      repository,
      parsed.branch,
      signal,
    );
    branch = parsed.branch;
    pull = await findPullRequestForBranch(
      credential.token,
      repository,
      parsed.branch,
      signal,
    );
  } else {
    headSha = (
      await observeCommit(credential.token, repository, parsed.sha, signal)
    ).sha;
  }
  const { changes, violations, changedFiles } = await returnedChanges(
    credential.token,
    repository,
    contract.commitSha,
    headSha,
    signal,
  );
  if (!changes.length)
    throw new Error(
      `${shortSha(headSha)} changes nothing against the brief's base ${shortSha(contract.commitSha)}. If no change is needed, verify the current revision instead.`,
    );
  const gaps = contractGapReport(contract.body);
  const previous = activeConformanceProposal(workspace.id);
  const record = insertConformanceProposal({
    applicationId: application.id,
    workspaceId: workspace.id,
    origin: "external",
    status: "published",
    baseSha: contract.commitSha,
    contractId: contract.id,
    contractVersion: contract.version,
    summary: `Returned from external work: ${reference.trim()} (${changes.length} file${changes.length === 1 ? "" : "s"} against ${shortSha(contract.commitSha)})`,
    changes,
    filesDigest: overlayDigest(changes),
    mapping: gaps.conformance.map((item) => ({
      field: item.field,
      paths: changedFiles,
      explanation:
        "Returned externally: which files resolve this change is established by Server Guy's conformance run, not by the worker's report.",
    })),
    requestApproval: false,
    sourceMessageId: null,
    piRunId: null,
    approval: null,
    publication: null,
    publicationError: null,
    external: {
      reference: reference.trim(),
      branch,
      headSha,
      pullRequestNumber: pull?.number ?? null,
      pullRequestUrl: pull?.url ?? null,
      returnedAt: new Date().toISOString(),
      state: pull ? (pull.merged ? "merged" : pull.state) : undefined,
      observedAt: new Date().toISOString(),
    },
    candidate: null,
    verification: {
      candidateSha: headSha,
      verifiedAt: new Date().toISOString(),
      changesComplete: true,
      differences: [],
      scope: { ok: violations.length === 0, violations, changedFiles },
    },
    supersededById: null,
  });
  if (previous)
    updateConformanceProposal(
      previous.id,
      ["proposed", "approved", "published"],
      {
        status: "superseded",
        supersededById: record.id,
      },
    );
  insertActivity(
    workspace.id,
    "change-returned",
    "External change returned",
    `${reference.trim()} → ${shortSha(headSha)} · ${changes.length} file${changes.length === 1 ? "" : "s"}${violations.length ? ` · out of scope: ${violations.join(", ")}` : ""}${pull?.merged ? " · already merged; refresh to record the candidate" : ""}`,
  );
  if (pull?.merged) return refreshCandidate(applicationId, signal);
  return record;
}

// The exact candidate.

/** The no-change path: the contract commit itself becomes the candidate. */
export function selectCurrentRevision(applicationId: string) {
  const { application, workspace, contract } = requireBrief(applicationId);
  const gaps = contractGapReport(contract.body);
  if (gaps.conformance.length)
    throw new Error(
      `The contract records ${gaps.conformance.length} required change${gaps.conformance.length === 1 ? "" : "s"}; the current revision cannot be the candidate until they are resolved.`,
    );
  const previous = activeConformanceProposal(workspace.id);
  if (
    previous?.origin === "no-change" &&
    previous.candidate?.sha === contract.commitSha
  )
    return previous;
  const record = insertConformanceProposal({
    applicationId: application.id,
    workspaceId: workspace.id,
    origin: "no-change",
    status: "published",
    baseSha: contract.commitSha,
    contractId: contract.id,
    contractVersion: contract.version,
    summary: `No source change required; the candidate is the contract commit ${shortSha(contract.commitSha)}.`,
    changes: [],
    filesDigest: overlayDigest([]),
    mapping: [],
    requestApproval: false,
    sourceMessageId: null,
    piRunId: null,
    approval: null,
    publication: null,
    publicationError: null,
    external: null,
    candidate: {
      sha: contract.commitSha,
      defaultBranch: defaultBranchOf(application.id) ?? "main",
      resolvedAt: new Date().toISOString(),
      source: "contract-commit",
      merge: null,
    },
    verification: {
      candidateSha: contract.commitSha,
      verifiedAt: new Date().toISOString(),
      changesComplete: true,
      differences: [],
      scope: { ok: true, violations: [], changedFiles: [] },
    },
    supersededById: null,
  });
  if (previous)
    updateConformanceProposal(
      previous.id,
      ["proposed", "approved", "published"],
      {
        status: "superseded",
        supersededById: record.id,
      },
    );
  recordActivityOnce(
    `candidate:${record.id}:${contract.commitSha}`,
    workspace.id,
    "candidate-recorded",
    "Candidate revision recorded",
    `${shortSha(contract.commitSha)} · the contract commit; no change was required. Conformance checks still run against it.`,
  );
  return record;
}

async function verifyCandidateContents(
  token: string,
  repository: string,
  proposal: ConformanceProposalRecord,
  candidateSha: string,
  signal?: AbortSignal,
): Promise<CandidateVerification> {
  const differences: string[] = [];
  for (const change of proposal.changes) {
    const content = await fileContentAt(
      token,
      repository,
      change.path,
      candidateSha,
      signal,
    );
    if (change.content === null) {
      if (content !== null) differences.push(`${change.path} still exists`);
    } else if (content === null) differences.push(`${change.path} is missing`);
    else if (content !== change.content)
      differences.push(`${change.path} differs from the reviewed content`);
  }
  // Inspect the full candidate, including changes incorporated while merging.
  // Comparing only the PR head would miss changes from its updated base.
  const scope = await (async () => {
    const compared = await compareCommits(
      token,
      repository,
      proposal.baseSha,
      candidateSha,
      signal,
    );
    const proposed = new Set(proposal.changes.map((change) => change.path));
    const violations = compared.flatMap((file) => {
      const sensitive = sensitivePathReason(file.filename);
      if (sensitive) return [`${file.filename} (${sensitive})`];
      if (proposal.origin === "server-guy" && !proposed.has(file.filename))
        return [`${file.filename} was not part of the reviewed change`];
      return [];
    });
    return {
      ok: violations.length === 0,
      violations,
      changedFiles: compared.map((file) => file.filename),
    };
  })();
  return {
    candidateSha,
    verifiedAt: new Date().toISOString(),
    changesComplete: differences.length === 0,
    differences,
    scope,
  };
}

/**
 * Selects the PR's exact merge result, or the returned external commit once
 * it is on the default branch. Refresh never adopts later default-branch
 * commits. The complete selected revision is checked against the proposal.
 */
export async function refreshCandidate(
  applicationId: string,
  signal?: AbortSignal,
) {
  return duringApplicationOperation(applicationId, () =>
    refreshCandidateImpl(applicationId),
  );
}

async function refreshCandidateImpl(
  applicationId: string,
  signal?: AbortSignal,
) {
  const { application, workspace } = requireBrief(applicationId);
  const proposal = activeConformanceProposal(workspace.id);
  if (!proposal) throw new Error("There is no change or candidate to refresh.");
  if (proposal.origin === "no-change") return proposal;
  const number =
    proposal.publication?.pullRequestNumber ??
    proposal.external?.pullRequestNumber ??
    null;
  const credential = await connectedGithubCredential();
  const repository = fullName(application);
  const defaultBranch = defaultBranchOf(application.id) ?? "main";
  let pull: ObservedPullRequest | null = null;
  if (number !== null)
    pull = await observePullRequest(
      credential.token,
      repository,
      number,
      signal,
    );
  else if (proposal.external?.branch)
    pull = await findPullRequestForBranch(
      credential.token,
      repository,
      proposal.external.branch,
      signal,
    );
  const observedAt = new Date().toISOString();
  const state = pull ? (pull.merged ? "merged" : pull.state) : undefined;
  const patch: Parameters<typeof updateConformanceProposal>[2] = {};
  if (proposal.publication && state)
    patch.publication = { ...proposal.publication, state, observedAt };
  if (proposal.external)
    patch.external = {
      ...proposal.external,
      ...(pull
        ? { pullRequestNumber: pull.number, pullRequestUrl: pull.url }
        : {}),
      state,
      observedAt,
    };
  const head = await observeBranchHead(
    credential.token,
    repository,
    defaultBranch,
    signal,
  );
  let candidateSha: string | null = null;
  let mergeInfo: CandidateResolution["merge"] = null;
  if (pull?.merged) {
    if (pull.baseRef !== defaultBranch)
      throw new Error(
        `The pull request was merged into ${pull.baseRef}, not ${defaultBranch}. Return a change merged into the application's default branch.`,
      );
    if (!pull.mergeCommitSha)
      throw new Error(
        "GitHub has not reported the merged revision yet. Refresh again; the latest branch head will not be selected instead.",
      );
    const mergeCommit = await observeCommit(
      credential.token,
      repository,
      pull.mergeCommitSha,
      signal,
    );
    if (mergeCommit.sha !== pull.mergeCommitSha)
      throw new Error(
        "GitHub returned a different commit from the pull request's merged revision.",
      );
    candidateSha = mergeCommit.sha;
    if (
      candidateSha !== head &&
      !(await isAncestor(
        credential.token,
        repository,
        candidateSha,
        head,
        signal,
      ))
    )
      throw new Error(
        "The merged revision is no longer included in the default branch. Review the repository history before selecting a deployment revision.",
      );
    mergeInfo = {
      pullRequestNumber: pull.number,
      mergedAt: pull.mergedAt,
      mergeCommitSha: pull.mergeCommitSha,
      method: classifyMerge(mergeCommit, pull.number),
    };
  } else if (!pull && proposal.external) {
    // A returned commit or branch without a pull request: it is the candidate
    // only when the default branch contains it, observed as an ancestor.
    const included =
      head === proposal.external.headSha ||
      (await isAncestor(
        credential.token,
        repository,
        proposal.external.headSha,
        head,
        signal,
      ));
    if (included) candidateSha = proposal.external.headSha;
  }
  if (!candidateSha) {
    const updated =
      updateConformanceProposal(proposal.id, [proposal.status], patch) ??
      proposal;
    return updated;
  }
  if (proposal.candidate && proposal.candidate.sha !== candidateSha)
    throw new Error(
      "The returned change now identifies a different revision. Return it as a new change to review it; Refresh keeps the selected revision.",
    );
  const verification = await verifyCandidateContents(
    credential.token,
    repository,
    proposal,
    candidateSha,
    signal,
  );
  const candidate: CandidateResolution = {
    sha: candidateSha,
    defaultBranch,
    resolvedAt: observedAt,
    source: proposal.origin === "external" ? "external" : "merged-pull-request",
    merge: mergeInfo,
  };
  const updated = updateConformanceProposal(proposal.id, [proposal.status], {
    ...patch,
    candidate,
    verification,
  });
  if (!updated)
    throw new Error("The proposal changed while GitHub was being observed.");
  if (proposal.candidate?.sha !== candidateSha)
    recordActivityOnce(
      `candidate:${proposal.id}:${candidateSha}`,
      workspace.id,
      "candidate-recorded",
      "Candidate revision recorded",
      `${shortSha(candidateSha)} on ${defaultBranch}${mergeInfo ? ` · pull request #${mergeInfo.pullRequestNumber} merged (${mergeInfo.method})` : ""}${
        verification.changesComplete
          ? " · reviewed change present"
          : ` · differs: ${verification.differences.join(", ")}`
      }${verification.scope.ok ? "" : ` · out of scope: ${verification.scope.violations.join(", ")}`}`,
    );
  return updated;
}

async function isAncestor(
  token: string,
  repository: string,
  ancestor: string,
  head: string,
  signal?: AbortSignal,
) {
  try {
    const response = await githubJson(
      `/repos/${repository}/compare/${ancestor}...${head}`,
      token,
      { signal },
    );
    const status = (response.data as { status?: string } | null)?.status;
    return status === "ahead" || status === "identical";
  } catch {
    return false;
  }
}

// Authoritative verification of the candidate.

/** Queues a candidate run; the worker executes it and records the outcome. */
export function requestCandidateVerification(applicationId: string) {
  const { application, workspace, contract } = requireBrief(applicationId);
  const proposal = activeConformanceProposal(workspace.id);
  if (!proposal?.candidate)
    throw new Error(
      "No candidate revision is identified yet; refresh from GitHub after merging.",
    );
  if (
    listPendingConformanceRuns().some((run) => run.workspaceId === workspace.id)
  )
    throw new Error(
      "A conformance run is already queued or running for this application.",
    );
  const { accepted } = bindings(contract, application.id);
  const run = queueConformanceRun({
    applicationId: application.id,
    workspaceId: workspace.id,
    kind: "candidate",
    source: {
      commitSha: proposal.candidate.sha,
      overlayDigest: null,
      treeDigest: "",
      fileCount: 0,
    },
    proposalId: proposal.id,
    contractId: contract.id,
    contractVersion: contract.version,
    profileId: contract.profileId,
    profileVersion: contract.profileVersion,
    definitionVersion: CONFORMANCE_DEFINITION.version,
    acceptanceChecksId: accepted?.id ?? null,
    acceptanceChecksVersion: accepted?.version ?? null,
    imageDigest: null,
    configuration: null,
    piRunId: null,
  });
  insertActivity(
    workspace.id,
    "conformance-requested",
    "Conformance checks requested",
    `Candidate ${shortSha(proposal.candidate.sha)} · check set v${CONFORMANCE_DEFINITION.version} · contract v${contract.version}${accepted ? ` · behavior checks v${accepted.version}` : " · no accepted behavior checks"}`,
  );
  return run;
}

export function cancelCandidateVerification(
  applicationId: string,
  runId: string,
) {
  const { workspace } = currentWorkspace(applicationId);
  const run = listConformanceRuns(applicationId).find(
    (item) => item.id === runId,
  );
  if (!run || run.workspaceId !== workspace.id)
    throw new Error("Conformance run not found.");
  return cancelConformanceRun(run.id) ?? run;
}

/** Worker side: executes a claimed candidate run over the exact commit. */
export async function executeClaimedConformanceRun(
  run: ConformanceRunRecord,
  signal?: AbortSignal,
) {
  const application = loadApplication(run.applicationId).application;
  const contract = getContract(run.contractId);
  if (!contract) throw new Error("The run's contract is missing.");
  const accepted = run.acceptanceChecksId
    ? getAcceptanceChecks(run.acceptanceChecksId)
    : null;
  let finished: ConformanceRunRecord;
  try {
    const { files, runConfiguration, digest } = await materialize(
      application,
      contract,
      [],
      run.source.commitSha,
      signal,
    );
    updateConformanceRun(run.id, ["running"], {
      source: { ...run.source, treeDigest: digest, fileCount: files.length },
      configuration: runConfiguration,
    });
    finished = await executeConformanceRun(
      run,
      conformanceExecutor(),
      planFor(
        run.id,
        application,
        contract,
        files,
        runConfiguration,
        accepted
          ? { steps: accepted.steps, label: `accepted v${accepted.version}` }
          : null,
      ),
      { signal },
    );
  } catch (error) {
    const reason =
      error instanceof GithubAccessError || error instanceof Error
        ? error.message
        : "The run failed.";
    finished =
      updateConformanceRun(run.id, ["running"], {
        status: "unavailable",
        summary: `The candidate could not be fetched or executed: ${reason}`,
        error: reason,
        finishedAt: new Date().toISOString(),
      }) ?? run;
  }
  const kind =
    finished.status === "passed"
      ? "conformance-passed"
      : finished.status === "failed"
        ? "conformance-failed"
        : "conformance-incomplete";
  insertActivity(
    finished.workspaceId,
    kind,
    finished.status === "passed"
      ? "Conformance checks passed"
      : finished.status === "failed"
        ? "Conformance checks failed"
        : "Conformance checks did not complete",
    `${shortSha(finished.source.commitSha)} · ${finished.summary}`,
  );
  return finished;
}

// Acceptance checks and grants.

export function acceptAcceptanceChecks(applicationId: string, id: string) {
  const { application, workspace } = requireBrief(applicationId);
  const record = getAcceptanceChecks(id);
  if (!record || record.applicationId !== application.id)
    throw new Error("Acceptance checks not found.");
  if (record.status === "accepted") return record;
  const previous = acceptedAcceptanceChecks(application.id);
  const updated = updateAcceptanceChecks(record.id, ["proposed"], {
    status: "accepted",
    acceptedAt: new Date().toISOString(),
    acceptedBy: "engineer",
  });
  if (!updated)
    throw new Error("These acceptance checks can no longer be accepted.");
  if (previous)
    updateAcceptanceChecks(previous.id, ["accepted"], {
      status: "superseded",
      supersededById: record.id,
    });
  insertActivity(
    workspace.id,
    "acceptance-accepted",
    "Application-behavior checks accepted",
    `v${record.version} · ${record.steps.length} step${record.steps.length === 1 ? "" : "s"} accepted by you${previous ? ` · replaces v${previous.version}` : ""}`,
  );
  return updated;
}

function recordedInstallationId(applicationId: string) {
  const recorded = listObservations(applicationId).find(
    (observation) =>
      observation.kind === REPOSITORY_OBSERVATION &&
      observation.status === "passed",
  );
  const raw = recorded?.raw as { installationId?: unknown } | undefined;
  return typeof raw?.installationId === "number" ? raw.installationId : null;
}

/**
 * The engineer's explicit grant to publish: verified against GitHub for the
 * current connection and recorded with what was observed. A later connection
 * change ends it because the grant names the connection.
 */
export async function grantPublication(
  applicationId: string,
  signal?: AbortSignal,
) {
  return duringApplicationOperation(applicationId, () =>
    grantPublicationImpl(applicationId),
  );
}

async function grantPublicationImpl(
  applicationId: string,
  signal?: AbortSignal,
) {
  const { application, workspace } = requireBrief(applicationId);
  const credential = await connectedGithubCredential();
  const mechanism = credential.connection.mode;
  const verification = await verifyPublicationPermissions(
    credential.token,
    fullName(application),
    mechanism,
    recordedInstallationId(application.id),
    signal,
  );
  if (!verification.ok)
    throw new Error(
      verification.reason ??
        "Publishing is not permitted with this connection.",
    );
  revokePublicationGrants(application.id);
  const grant = insertPublicationGrant({
    applicationId: application.id,
    connectionId: credential.connection.id,
    mechanism,
    verifiedPermissions: verification.observed,
  });
  insertActivity(
    workspace.id,
    "publication-granted",
    "Publishing allowed",
    `Server Guy may publish branches and pull requests to ${fullName(application)} with the current ${mechanism === "app" ? "GitHub App" : "GitHub CLI"} connection; merging stays yours.`,
  );
  return grant;
}

export function revokePublication(applicationId: string) {
  const { application, workspace } = requireBrief(applicationId);
  const revoked = revokePublicationGrants(application.id);
  if (revoked)
    insertActivity(
      workspace.id,
      "publication-revoked",
      "Publishing no longer allowed",
      `Server Guy will not publish to ${fullName(application)} until you allow it again.`,
    );
  return revoked;
}

// Execution environment.

export async function checkExecutionEnvironment() {
  return rememberEnvironment(await conformanceExecutor().environment());
}

export async function prepareExecutionEnvironment(
  onProgress?: (message: string) => void,
) {
  // The prepared status is remembered so Settings and the Record read the
  // same verified state, whichever executor produced it.
  return rememberEnvironment(
    await conformanceExecutor().prepare({
      onProgress: (event) => onProgress?.(`${event.step}: ${event.message}`),
    }),
  );
}
