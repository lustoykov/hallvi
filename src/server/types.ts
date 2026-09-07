export const APPROVAL_MODES = {
  "pi-decides": {
    label: "Let Server Guy decide",
    hint: "Server Guy asks when the consequence warrants it.",
  },
  "always-ask": {
    label: "Always ask",
    hint: "Ask before every external change.",
  },
  "full-autonomy": {
    label: "Full autonomy",
    hint: "Act within the launch scope without asking.",
  },
} as const;

export type ApprovalMode = keyof typeof APPROVAL_MODES;

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return typeof value === "string" && Object.hasOwn(APPROVAL_MODES, value);
}

export type GateStatus = "passed" | "blocked" | "not-yet";
export type ObservationStatus = "passed" | "failed" | "unavailable";

export interface ApplicationRecord {
  id: string;
  name: string;
  repositoryUrl: string;
  repositoryOwner: string;
  repositoryName: string;
  environment: "production";
  approvalMode: ApprovalMode;
  approvalScope: string;
  createdAt: string;
  updatedAt: string;
}

/** The launch phases with a durable workspace in this build. */
export type PhaseKey = "start" | "inspect-app" | "make-launch-ready";

export interface PhaseWorkspaceRecord {
  id: string;
  applicationId: string;
  phaseKey: PhaseKey;
  createdAt: string;
  /** Set once by the phase transition; a completed workspace is read-only. */
  completedAt: string | null;
  /** The Phase Deliverable's retained evidence, written at completion. */
  deliverableEvidence: unknown;
}

/**
 * The Launch Brief as it was when Phase 1 completed: the check results and
 * the records they cited at that moment. It is retained history, not a live
 * re-evaluation.
 */
export interface LaunchBriefEvidence {
  completedAt: string;
  checks: Array<
    Pick<GateCheck, "key" | "label" | "status" | "result" | "evidence">
  >;
  repositoryObservationId: string | null;
  commitSha: string | null;
  connectionId: string | null;
  environment: ApplicationRecord["environment"];
  approvalMode: ApprovalMode;
  approvalScope: string;
  decisionIds: string[];
}

/**
 * The Application Contract as it was when Inspect app completed: the check
 * results and the contract identity Phase 3 works from. Retained history, not
 * a live re-evaluation; a later revision appears in the current phase.
 */
export interface InspectAppEvidence {
  completedAt: string;
  checks: Array<
    Pick<GateCheck, "key" | "label" | "status" | "result" | "evidence">
  >;
  contractId: string;
  contractVersion: number;
  profileId: string;
  profileVersion: number;
  commitSha: string;
  inspectionObservationId: string;
  connectionId: string | null;
}

export interface PhaseWorkspaceView extends PhaseWorkspaceRecord {
  phaseNumber: number;
  name: string;
  deliverable: string;
  status: "in-progress" | "ready" | "completed";
  /** Whether this is the application's current (latest) phase. */
  current: boolean;
}

export interface Chat {
  id: string;
  workspaceId: string;
  title: string;
  isPrimary: boolean;
  createdAt: string;
  archivedAt: string | null;
}

/** A chat as the list shows it: with the time of its newest message. */
export interface ChatSummary extends Chat {
  lastActivityAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  body: string;
  /**
   * `user` is the engineer's own message. `server-guy` marks a recorded
   * event or a request Server Guy started itself; it is never presented as
   * the engineer's words.
   */
  source: "user" | "pi" | "server-guy";
  createdAt: string;
  status: "completed" | PiRunStatus;
  revision: number;
}

export type PiRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "interrupted";

export interface PiRun {
  id: string;
  applicationId: string;
  workspaceId: string;
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
  requestKey: string;
  retryOfId: string | null;
  status: PiRunStatus;
  revision: number;
  error: string | null;
  piCalls: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AcceptedPiRun {
  run: PiRun;
  userMessageId: string;
  assistantMessageId: string;
}

export interface Decision {
  id: string;
  applicationId: string;
  sourceMessageId: string;
  kind: "launch-priority";
  label: string;
  value: string;
  supersededById: string | null;
  createdAt: string;
}

export interface Observation {
  id: string;
  applicationId: string;
  kind: string;
  status: ObservationStatus;
  summary: string;
  sourceLabel: string;
  sourceUrl: string | null;
  raw: unknown;
  observedAt: string;
}

/**
 * One meaningful application event: a saved or changed requirement, workspace
 * creation, a repository check result, a phase transition, an inspection or
 * an established/revised Application Contract. Reply execution is not an
 * Activity Event; it travels with its Chat reply.
 */
export interface ActivityEvent {
  id: string;
  workspaceId: string;
  kind: string;
  summary: string;
  detail: string;
  createdAt: string;
}

/**
 * The authoritative Chat state delivered over SSE and on demand: messages,
 * their Pi Runs and the application's Activity.
 */
export interface ChatRunSnapshot {
  messages: ChatMessage[];
  runs: PiRun[];
  activity: ActivityEvent[];
}

export interface EvidenceReference {
  recordType:
    | "application"
    | "decision"
    | "observation"
    | "contract"
    | "conformance-proposal"
    | "conformance-run";
  recordId: string;
  role: string;
  label: string;
  href: string;
  observedAt: string;
}

export interface GateCheck {
  key: string;
  label: string;
  status: GateStatus;
  result: string;
  definition: string;
  evidence: EvidenceReference[];
  /** The explicit re-verification this check offers, if any. */
  rerun: {
    key:
      | "repository-readable"
      | "repository-inspection"
      | "conformance-refresh"
      | "conformance-verify";
    label: string;
  } | null;
}

export interface UpcomingRequirement {
  key: string;
  label: string;
  status: "satisfied" | "missing" | "unavailable" | "failed";
  owner: "engineer" | "server-guy" | "pi";
  resolutionPath: string;
  requiredBeforePhase: number;
  evidence: EvidenceReference[];
}

// Application Profile resolution (Phase 2)

export interface ProfileCriterion {
  id: string;
  label: string;
  matched: boolean;
  /** What was found or missing, naming the inspected path. */
  evidence: string;
}

export interface ProfileResolution {
  status: "matched" | "pending" | "unmatched" | "ambiguous" | "not-inspected";
  profileId: string;
  profileVersion: number;
  label: string;
  criteria: ProfileCriterion[];
  /** Why the repository did not resolve, when it did not. */
  reason: string | null;
}

/** What the Operator View shows about the latest repository inspection. */
export interface RepositoryInspectionSummary {
  observationId: string;
  status: ObservationStatus;
  summary: string;
  observedAt: string;
  commitSha: string | null;
  defaultBranch: string | null;
  /** Made with the current GitHub connection, whatever its outcome. */
  connectionCurrent: boolean;
  /** Passed and made with the current connection, so it can support checks. */
  current: boolean;
  entries: number;
  truncated: boolean;
  /** Repository files saved as Observations at this commit. */
  filesRead: number;
  profile: ProfileResolution;
}

// Application Contract (Phase 2)

/** A quoted excerpt of a saved repository-file Observation. */
export interface RepositoryCitation {
  observationId: string;
  path: string;
  snippet: string;
  /** Computed at validation from the saved content; not model-supplied. */
  line?: number;
}

/** A path proven absent by the inspection's tree at the contract commit. */
export interface AbsenceCitation {
  observationId: string;
  absent: string;
}

export type ContractCitation = RepositoryCitation | AbsenceCitation;

export type ContractBlocker = "unknown" | "contradiction" | "unsupported";

/**
 * How one contract value was established. The kinds are not interchangeable:
 * a declaration quotes the repository verbatim, a rule is the profile's
 * convention, a confirmation quotes the engineer, an inference is Server
 * Guy's interpretation of cited content, and unresolved is an honest gap.
 */
export type ContractProvenance =
  | { kind: "repository-declared"; citation: RepositoryCitation }
  | { kind: "profile-rule"; ruleId: string }
  | {
      kind: "user-confirmed";
      source:
        | { type: "message"; messageId: string; quote: string }
        | { type: "decision"; decisionId: string };
    }
  | { kind: "inferred"; citation: ContractCitation }
  | {
      kind: "unresolved";
      blocker: ContractBlocker;
      reason: string;
      observed?: string;
      citation?: ContractCitation;
    }
  | {
      kind: "unresolved";
      blocker: "policy";
      dependency: string;
      reason: string;
    };

export interface ContractField {
  key: string;
  /** The requirement the application must meet; null while unresolved. */
  value: string | null;
  provenance: ContractProvenance;
  /**
   * Known Phase 3 work: the repository does not yet meet this field's value.
   * `observed` is the current repository fact; `change` the required edit.
   */
  conformance?: {
    observed: string;
    change: string;
    citation?: ContractCitation;
  };
}

export interface ApplicationContractBody {
  /** Repository build recipe selected by Pi, independent of runtime profile. */
  imageBuild?: { dockerfile: string; context?: string; target?: string };
  profileId: string;
  profileVersion: number;
  commitSha: string;
  summary: string;
  fields: ContractField[];
  /** Pi's interpretation of repository evidence, not proof of execution. */
  profileSelection?: {
    profileId: string;
    rationale: string;
    citations: RepositoryCitation[];
  };
}

export interface ApplicationContractRecord {
  id: string;
  applicationId: string;
  workspaceId: string;
  version: number;
  profileId: string;
  profileVersion: number;
  commitSha: string;
  sourceMessageId: string;
  body: ApplicationContractBody;
  supersededById: string | null;
  createdAt: string;
}

/** A staged contract, validated but not saved until the final transaction. */
export interface ApplicationContractProposal {
  body: ApplicationContractBody;
  revises: string | null;
}

/** The gap report derived from a contract: what blocks, what Phase 3 owes,
 * and which product policies stay open until their later gates. */
export interface ContractGapReport {
  blockers: Array<{
    field: string;
    label: string;
    blocker: ContractBlocker;
    reason: string;
    observed: string | null;
  }>;
  conformance: Array<{
    field: string;
    label: string;
    observed: string;
    change: string;
  }>;
  policies: Array<{
    field: string;
    label: string;
    dependency: string;
    requiredBeforePhase: number;
    reason: string;
  }>;
}

export interface ApplicationContractView extends ApplicationContractRecord {
  gaps: ContractGapReport;
  /** Fields whose cited source no longer resolves against current records. */
  provenanceIssues: Array<{ field: string; reason: string }>;
}

// Make launch-ready (Phase 3)

export type ExecutionEnvironmentState =
  "ready" | "not-found" | "unreachable" | "permission-denied" | "unsupported";

/**
 * Whether the machine running Server Guy's controller can execute repository
 * code in disposable containers. Discovered by connecting to the configured
 * Docker Engine, never by finding a `docker` executable; the states say what
 * the evidence supports and nothing more.
 */
export interface ExecutionEnvironmentStatus {
  state: ExecutionEnvironmentState;
  ready: boolean;
  checkedAt: string;
  /** The machine that was checked: the controller host, not the browser. */
  host: { hostname: string; platform: string; arch: string };
  endpoint: string | null;
  endpointSource: "DOCKER_HOST" | "docker-context" | "known-socket" | null;
  engine: {
    version: string;
    apiVersion: string;
    platform: string;
    os: string;
    arch: string;
  } | null;
  summary: string;
  recovery: { label: string; href: string | null; steps: string[] };
  detail: string | null;
  /** The runner images were pulled and a trivial container ran. */
  verified: {
    at: string;
    runnerImage: string;
    runnerImageDigest: string;
    databaseImage: string;
    databaseImageDigest: string;
  } | null;
}

export type ConformanceCheckKey =
  | "install"
  | "configuration"
  | "database"
  | "migrations"
  | "startup"
  | "health"
  | "behavior"
  | "tests"
  /** A Pi-requested exploratory command; never part of the gate. */
  | "command";

export type ConformanceCheckOutcome =
  "passed" | "failed" | "not-run" | "not-applicable";

export interface ConformanceStepResult {
  name: string;
  request: string;
  status: number | null;
  passed: boolean;
  detail: string;
}

export interface ConformanceCheckResult {
  key: ConformanceCheckKey;
  label: string;
  outcome: ConformanceCheckOutcome;
  summary: string;
  /** Bounded, credential-redacted process or probe output. */
  output: string | null;
  outputTruncated: boolean;
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** For not-applicable: the record that proves the responsibility is
   * absent. */
  evidence?: string;
  /** For the behavior check: one entry per accepted step. */
  steps?: ConformanceStepResult[];
}

export type ConformanceRunKind = "preview" | "candidate" | "command";
export type ConformanceRunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "interrupted"
  | "unavailable";

/** What one execution ran: the exact tree and the configuration it used. */
export interface ConformanceRunSource {
  commitSha: string;
  /** Present for a preview over staged changes; null for an exact commit. */
  overlayDigest: string | null;
  treeDigest: string;
  fileCount: number;
}

export interface ConformanceRunConfiguration {
  /** Defaults to the root Dockerfile; the builder accepts other paths. */
  build?: { dockerfile: string; context?: string; target?: string };
  startCommand: string[];
  startCommandSource: "dockerfile" | "contract";
  port: number;
  healthPath: string;
  /** Variable names and their synthetic values; never production values. */
  environment: Record<string, string>;
  database: "postgresql" | "none";
  migrationTool: string | null;
  /** For a command run: the command Pi requested. */
  command?: string[];
}

/**
 * One execution attempt over an exact source tree. Preview and command runs
 * are worker evidence; only a candidate run over an exact commit with current
 * bindings can satisfy P3.G3. Rows are appended, never rewritten.
 */
export interface ConformanceRunRecord {
  id: string;
  applicationId: string;
  workspaceId: string;
  kind: ConformanceRunKind;
  status: ConformanceRunStatus;
  source: ConformanceRunSource;
  proposalId: string | null;
  contractId: string;
  contractVersion: number;
  profileId: string;
  profileVersion: number;
  definitionVersion: number;
  acceptanceChecksId: string | null;
  acceptanceChecksVersion: number | null;
  imageDigest: string | null;
  configuration: ConformanceRunConfiguration | null;
  results: ConformanceCheckResult[];
  summary: string;
  error: string | null;
  piRunId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type ConformanceProposalOrigin = "server-guy" | "external" | "no-change";
export type ConformanceProposalStatus =
  "proposed" | "approved" | "published" | "withdrawn" | "superseded";

export interface ProposedFileChange {
  path: string;
  /** Null deletes the file. */
  content: string | null;
  /** The saved read of the file at the base commit, when it existed. */
  baseObservationId: string | null;
}

export interface ConformanceMappingEntry {
  field: string;
  paths: string[];
  explanation: string;
}

export interface ProposalApproval {
  mode: ApprovalMode;
  by: "engineer" | "approval-mode";
  approvedAt: string;
  filesDigest: string;
  baseSha: string;
  contractVersion: number;
}

export type PullRequestState = "open" | "closed" | "merged";

export interface ProposalPublication {
  branch: string;
  commitSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  publishedAt: string;
  connectionId: string;
  /** Set when a prior attempt found the branch or pull request already
   * there. */
  adopted: boolean;
  /** As last observed on GitHub. */
  state?: PullRequestState;
  observedAt?: string;
}

export interface ExternalReturn {
  reference: string;
  branch: string | null;
  headSha: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  returnedAt: string;
  state?: PullRequestState;
  observedAt?: string;
}

export interface CandidateResolution {
  sha: string;
  defaultBranch: string;
  resolvedAt: string;
  source: "contract-commit" | "merged-pull-request" | "external";
  merge: {
    pullRequestNumber: number;
    mergedAt: string | null;
    mergeCommitSha: string | null;
    method: "merge" | "squash" | "rebase" | "unknown";
  } | null;
}

/** Deterministic checks of the candidate against the proposal and scope. */
export interface CandidateVerification {
  candidateSha: string;
  verifiedAt: string;
  changesComplete: boolean;
  differences: string[];
  scope: { ok: boolean; violations: string[]; changedFiles: string[] };
}

export interface ConformanceProposalRecord {
  id: string;
  applicationId: string;
  workspaceId: string;
  origin: ConformanceProposalOrigin;
  status: ConformanceProposalStatus;
  baseSha: string;
  contractId: string;
  contractVersion: number;
  summary: string;
  changes: ProposedFileChange[];
  filesDigest: string;
  mapping: ConformanceMappingEntry[];
  requestApproval: boolean;
  sourceMessageId: string | null;
  piRunId: string | null;
  approval: ProposalApproval | null;
  publication: ProposalPublication | null;
  publicationError: string | null;
  external: ExternalReturn | null;
  candidate: CandidateResolution | null;
  verification: CandidateVerification | null;
  supersededById: string | null;
  createdAt: string;
}

export interface AcceptanceStep {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: string;
  expectStatus: number;
  expectBodyIncludes?: string[];
}

/**
 * The application-specific behavior the candidate must show, proposed from
 * cited repository evidence and versioned; an accepted definition is executed
 * beside the fixed profile checks and cannot be weakened unilaterally.
 */
export interface AcceptanceChecksRecord {
  id: string;
  applicationId: string;
  workspaceId: string;
  version: number;
  status: "proposed" | "accepted" | "superseded";
  rationale: string;
  steps: AcceptanceStep[];
  evidence: RepositoryCitation[];
  digest: string;
  contractId: string;
  contractVersion: number;
  sourceMessageId: string | null;
  piRunId: string | null;
  acceptedAt: string | null;
  acceptedBy: "engineer" | "approval-mode" | null;
  supersededById: string | null;
  createdAt: string;
}

/**
 * The engineer's explicit, verified grant to publish branches and pull
 * requests to this application's repository with one GitHub connection.
 * A broadly scoped token is not a grant; a replaced connection ends it.
 */
export interface PublicationGrantRecord {
  id: string;
  applicationId: string;
  connectionId: string;
  mechanism: "cli" | "app";
  verifiedPermissions: Record<string, unknown>;
  grantedAt: string;
  revokedAt: string | null;
}

export interface ConformanceCheckDefinition {
  key: ConformanceCheckKey;
  label: string;
  proves: string;
  limits: string;
  required: boolean;
}

/** The bounded brief every working environment receives. */
export interface ConformanceBrief {
  repository: {
    url: string;
    owner: string;
    name: string;
    defaultBranch: string | null;
  };
  baseSha: string;
  contract: {
    id: string;
    version: number;
    profileId: string;
    profileVersion: number;
    profileLabel: string;
  };
  requiredChanges: Array<{
    field: string;
    label: string;
    required: string;
    observed: string;
    change: string;
  }>;
  blockers: Array<{ field: string; label: string; reason: string }>;
  scope: {
    allowed: string;
    forbidden: string[];
    sensitive: string[];
  };
  acceptance: {
    definitionVersion: number;
    checks: ConformanceCheckDefinition[];
    applicationBehavior: AcceptanceChecksRecord | null;
    configuration: Pick<
      ConformanceRunConfiguration,
      | "build"
      | "port"
      | "healthPath"
      | "environment"
      | "database"
      | "migrationTool"
    >;
  };
  exclusions: string[];
  exportText: string;
}

/** The Phase 3 projection the Operator View and the status tool share. */
export interface ConformanceView {
  retained: InspectAppEvidence | null;
  brief: ConformanceBrief | null;
  proposal: ConformanceProposalRecord | null;
  proposals: ConformanceProposalRecord[];
  acceptance: AcceptanceChecksRecord | null;
  proposedAcceptance: AcceptanceChecksRecord | null;
  runs: ConformanceRunRecord[];
  latestPreview: ConformanceRunRecord | null;
  latestCandidateRun: ConformanceRunRecord | null;
  environment: ExecutionEnvironmentStatus | null;
  grant: PublicationGrantRecord | null;
  /** Non-null when a Phase 3 contract revision reintroduced blockers. */
  contractBlocked: string | null;
}

export interface OperatorView {
  application: ApplicationRecord | null;
  /** The viewed workspace: the selected chat's phase. */
  workspace: PhaseWorkspaceView | null;
  /** Every phase workspace this application has, in phase order. */
  workspaces: PhaseWorkspaceView[];
  chats: ChatSummary[];
  selectedChatId: string | null;
  messages: ChatMessage[];
  checks: GateCheck[];
  decisions: Decision[];
  observations: Observation[];
  upcomingRequirements: UpcomingRequirement[];
  activity: ActivityEvent[];
  inspection: RepositoryInspectionSummary | null;
  contract: ApplicationContractView | null;
  /** Phase 3 only. */
  conformance: ConformanceView | null;
}

/** Retained name from the Phase 1 build; the view is now phase-aware. */
export type PhaseOneOperatorView = OperatorView;

export interface CreateApplicationInput {
  repositoryUrl: string;
  environment: "production";
  approvalMode: ApprovalMode;
}

export interface PiDecision {
  kind: "launch-priority";
  value: string;
  replaces?: string;
}

/** A staged source change, validated but not saved until the final
 * transaction. */
export interface SourceChangeProposal {
  baseSha: string;
  contractId: string;
  contractVersion: number;
  summary: string;
  changes: ProposedFileChange[];
  filesDigest: string;
  mapping: ConformanceMappingEntry[];
  requestApproval: boolean;
}

/** A staged acceptance-check definition, saved with the final answer. */
export interface AcceptanceChecksProposal {
  rationale: string;
  steps: AcceptanceStep[];
  evidence: RepositoryCitation[];
  digest: string;
  contractId: string;
  contractVersion: number;
}

export interface PiTurnResult {
  message: string;
  decisionProposals: PiDecision[];
  contractProposal?: ApplicationContractProposal | null;
  sourceProposal?: SourceChangeProposal | null;
  acceptanceProposal?: AcceptanceChecksProposal | null;
}

/**
 * What `get_application_status` returns to Pi: saved configuration, the
 * current check evaluation for the Run's phase, the evidence that supports
 * each current check, the catalog of upcoming product requirements and, in
 * Phase 2, a bounded contract summary. `retrievedAt` is when these local
 * records were read; an evidence entry's `observedAt` is when that record was
 * saved or its check was performed, which may be much older. Reading never
 * rechecks GitHub, renews evidence or verifies a deployment.
 */
export interface ApplicationStatus {
  retrievedAt: string;
  application: {
    id: string;
    name: string;
    repositoryUrl: string;
    environment: ApplicationRecord["environment"];
    approvalMode: { key: ApprovalMode; label: string };
    updatedAt: string;
  };
  workspace: Pick<
    PhaseWorkspaceView,
    "phaseKey" | "phaseNumber" | "deliverable" | "status"
  >;
  checks: Array<
    Pick<GateCheck, "key" | "label" | "status" | "result"> & {
      evidence: Array<
        Pick<
          EvidenceReference,
          "recordType" | "recordId" | "label" | "href" | "observedAt"
        >
      >;
    }
  >;
  // Product rules for later phases, not observations of provider access.
  upcomingRequirements: Array<
    Pick<
      UpcomingRequirement,
      "key" | "label" | "requiredBeforePhase" | "resolutionPath"
    >
  >;
  /** Phase 2 only: the latest inspection and the current contract summary. */
  inspection?: {
    observationId: string;
    status: ObservationStatus;
    commitSha: string | null;
    observedAt: string;
    /** Made with the current GitHub connection, whatever its outcome. */
    connectionCurrent: boolean;
    /** Passed and made with the current connection. */
    current: boolean;
    profile: Pick<ProfileResolution, "status" | "profileId" | "profileVersion">;
  } | null;
  contract?: {
    id: string;
    version: number;
    commitSha: string;
    profileId: string;
    profileVersion: number;
    fieldCount: number;
    blockers: number;
    conformanceItems: number;
    policyItems: number;
    createdAt: string;
  } | null;
  /** Phase 3 only: the current conformance state, bounded. */
  conformance?: {
    baseSha: string | null;
    requiredChanges: number;
    proposal: {
      id: string;
      origin: ConformanceProposalOrigin;
      status: ConformanceProposalStatus;
      files: number;
      pullRequestUrl: string | null;
      candidateSha: string | null;
    } | null;
    acceptance: { version: number; status: string; steps: number } | null;
    latestPreview: {
      status: ConformanceRunStatus;
      treeDigest: string;
      failed: string[];
    } | null;
    latestCandidateRun: {
      status: ConformanceRunStatus;
      commitSha: string;
      failed: string[];
    } | null;
    executionEnvironment: ExecutionEnvironmentState | "unchecked";
  } | null;
}
