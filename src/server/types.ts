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
export type PhaseKey = "start" | "inspect-app";

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
  recordType: "application" | "decision" | "observation" | "contract";
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
    key: "repository-readable" | "repository-inspection";
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
  status: "matched" | "unmatched" | "ambiguous" | "not-inspected";
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
  profileId: string;
  profileVersion: number;
  commitSha: string;
  summary: string;
  fields: ContractField[];
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

export interface PiTurnResult {
  message: string;
  decisionProposals: PiDecision[];
  contractProposal?: ApplicationContractProposal | null;
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
}
