import type { ApplicationOperation } from "./operation-record";

/** Executable intents are chosen by the server, never arbitrary agent code. */
export type OperationCommand =
  | { type: "deployment"; deploymentId: string }
  | { type: "recreate-deployment"; deploymentId: string }
  | { type: "collect-logs"; deploymentId: string }
  | { type: "run-backup" | "test-restore"; deploymentId: string }
  | {
      type: "configure-backups";
      deploymentId: string;
      schedule: "daily" | "six-hourly";
      keep: number;
    }
  | { type: "start-preparation" }
  | { type: "publish-proposal"; proposalId: string }
  | { type: "publish-checkpoint"; proposalId: string }
  | { type: "refresh-preparation" }
  | { type: "refresh-candidate" }
  | { type: "return-change"; reference: string }
  | { type: "grant-publication" };

export interface StoredOperation extends ApplicationOperation {
  applicationId: string;
  target: string;
  preconditions: Record<string, string | null>;
  command: OperationCommand | null;
  approvedAt: string | null;
  /** Execution ownership only; operation state owns mutual exclusion. */
  executorPid: number | null;
  executionId: string | null;
  /** A lost remote outcome must be reconciled before another change starts. */
  blocksQueue: boolean;
  queuedAt: string | null;
  /** Bounded result of a trusted executor; never exposed to model context. */
  result?: unknown;
}
