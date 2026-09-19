// One piece of work as History draws it. A shape and nothing else:
// `historyFromRecords` builds it from the records Pi saves and the executions
// that ran around them.
import type { ApplicationSection } from "@/components/hallvi/application-sections";

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
  startedAt: string;
  updatedAt: string;
  summary: string;
  steps?: OperationStep[];
  /** What the user is asked to decide while the operation is proposed. */
  approval?: { note: string; action: string };
  evidence?: string;
  /** What has to happen next after a failure. */
  next?: string;
  /** A later operation that addressed this failure. */
  resolvedById?: string;
  waitingForId?: string | null;
  waitingForTitle?: string | null;
}
