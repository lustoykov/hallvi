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

export interface PhaseWorkspaceRecord {
  id: string;
  applicationId: string;
  phaseKey: "start";
  createdAt: string;
}

export interface PhaseWorkspaceView extends PhaseWorkspaceRecord {
  phaseNumber: 1;
  deliverable: "Launch Brief";
  status: "in-progress" | "ready";
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
 * creation, a repository check result, or an invalidated verification. Reply
 * execution is not an Activity Event; it travels with its Chat reply.
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
  recordType: "application" | "decision" | "observation";
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
  canRerun: boolean;
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

export interface PhaseOneOperatorView {
  application: ApplicationRecord | null;
  workspace: PhaseWorkspaceView | null;
  chats: ChatSummary[];
  selectedChatId: string | null;
  messages: ChatMessage[];
  checks: GateCheck[];
  decisions: Decision[];
  observations: Observation[];
  upcomingRequirements: UpcomingRequirement[];
  activity: ActivityEvent[];
}

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
}

/**
 * What `get_application_status` returns to Pi: saved configuration, the
 * current check evaluation, the evidence that supports each current check and
 * the catalog of upcoming product requirements. `retrievedAt` is when these
 * local records were read; an evidence entry's `observedAt` is when that
 * record was saved or its check was performed, which may be much older.
 * Reading never rechecks GitHub, renews evidence or verifies a deployment.
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
}
