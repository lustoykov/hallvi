// The application-level operation record: one shape for every piece of agent
// work. Chat receipts, view activity cards, navigation marks, Overview and
// History all read it; none keeps its own copy.
//
// It is a shape and nothing else now. The builders that made one out of a
// deployment record are gone with that model; what produces operations today
// is `historyFromRecords`, out of the records Pi saves.
import type { ApplicationSection } from "@/components/server-guy/application-sections";

/**
 * An inspection goes working → inspected. A change goes proposed → queued
 * (when another change owns the slot) → working → verified or failed.
 * Views show confirmed facts; the operation carries the rest.
 */
export type OperationState =
  | "proposed"
  | "queued"
  | "working"
  | "inspected"
  | "verified"
  | "failed"
  /** You were asked and said no. Nothing ran. */
  | "declined"
  /** It was running and was stopped. How far it got is not known. */
  | "stopped"
  | "cancelled";

export interface OperationStep {
  label: string;
  state: "done" | "active" | "pending" | "failed";
  at?: string;
}

/**
 * What the user is asked to do while an operation waits. An approval may
 * need protected inputs; a failure offers recovery. Generic, so any
 * capability's record can carry one; the deployment keeps its own form.
 */
export type OperationDecision =
  | {
      kind: "approval";
      note: string;
      /** A cost or scope line shown beside the action. */
      cost?: string | null;
      inputs: { name: string; hint?: string; secret?: boolean }[];
      action: string;
    }
  | {
      kind: "recovery";
      note?: string | null;
      retry?: string | null;
      cancel?: string | null;
      inputs?: { name: string; hint?: string; secret?: boolean }[];
    };

export interface ApplicationOperation {
  id: string;
  /** The durable record this operation is projected from. */
  source: {
    type:
      | "deployment"
      | "logs"
      | "backup"
      | "restore"
      | "job"
      | "release"
      | "domain"
      | "variables"
      | "check"
      | "inspection"
      | "issue"
      | "preparation";
    id: string;
  };
  kind: "inspection" | "change";
  title: string;
  state: OperationState;
  /** The stable views this operation reads or changes; the first is primary. */
  destinations: ApplicationSection[];
  /**
   * The conversation and reply that started the work. Null for work that no
   * conversation started, such as a snapshot taken from a view.
   */
  origin: { chatId: string; messageId: string | null } | null;
  /** Replies elsewhere that referred to this operation instead of repeating. */
  mentions: { chatId: string; messageId: string; at: string }[];
  startedAt: string;
  updatedAt: string;
  summary: string;
  steps?: OperationStep[];
  /** What the user is asked to decide while the operation is proposed. */
  approval?: { note: string; action: string };
  /** Decision controls for the generic card; absent for the deployment. */
  decision?: OperationDecision | null;
  evidence?: string;
  /** What has to happen next after a failure. */
  next?: string;
  /** A later operation that addressed this failure. */
  resolvedById?: string;
  waitingForId?: string | null;
  waitingForTitle?: string | null;
  preconditions?: Record<string, string | null>;
}
