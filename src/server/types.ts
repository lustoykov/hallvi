export type ApprovalMode = "pi-decides" | "always-ask" | "full-autonomy";

export type GateStatus = "passed" | "blocked" | "not-yet";

export interface ApplicationRecord {
  id: string;
  name: string;
  slug: string;
  repositoryUrl: string;
  repositoryOwner: string;
  repositoryName: string;
  environment: "production";
  approvalMode: ApprovalMode;
  approvalScope: string;
  status: "phase-1" | "phase-1-ready";
  createdAt: string;
  updatedAt: string;
}

export interface PhaseWorkspace {
  id: string;
  applicationId: string;
  phaseNumber: 1;
  deliverable: "Launch Brief";
  status: "in-progress" | "ready";
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  title: string;
  isPrimary: boolean;
  status: "active" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  body: string;
  source: "user" | "pi" | "server-guy";
  createdAt: string;
}

export interface DecisionRecord {
  id: string;
  workspaceId: string;
  sessionId: string | null;
  key: string;
  label: string;
  value: string;
  source: "launch-form" | "chat" | "product-default";
  createdAt: string;
  updatedAt: string;
}

export interface ObservationRecord {
  id: string;
  applicationId: string;
  workspaceId: string;
  kind: string;
  status: "passed" | "failed" | "unavailable";
  summary: string;
  sourceLabel: string;
  sourceUrl: string | null;
  raw: unknown;
  observedAt: string;
}

export interface BlockerRecord {
  id: string;
  workspaceId: string;
  key: string;
  label: string;
  status: "open" | "resolved";
  owner: "engineer" | "server-guy" | "pi";
  resolutionPath: string;
  requiredBeforePhase: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  kind: string;
  summary: string;
  detail: string;
  createdAt: string;
}

export interface GateCheck {
  key: string;
  label: string;
  status: GateStatus;
  result: string;
  definition: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  observationId: string | null;
  observedAt: string | null;
  canRerun: boolean;
}

export interface PhaseOneView {
  application: ApplicationRecord | null;
  workspace: PhaseWorkspace | null;
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  checks: GateCheck[];
  decisions: DecisionRecord[];
  observations: ObservationRecord[];
  blockers: BlockerRecord[];
  activity: ActivityEvent[];
  changes: Array<{
    id: string;
    label: string;
    summary: string;
    createdAt: string;
  }>;
}

export interface CreateApplicationInput {
  repositoryUrl: string;
  environment: "production";
  approvalMode: ApprovalMode;
}

export interface PiDecision {
  key: "approval_mode" | "target_environment" | "launch_priority" | "domain_starting_state";
  value: string;
}

export interface PiReply {
  message: string;
  decisions: PiDecision[];
}
