import type { ApplicationOperation } from "./operation-record";

/** Executable intents are chosen by the server, never arbitrary agent code. */
export type OperationCommand =
  | { type: "deployment"; deploymentId: string }
  | {
      type: "release-deployment";
      scope: import("./release-scope").ReleaseScope;
      requirements: string;
    }
  | { type: "recreate-deployment"; deploymentId: string }
  /** A fresh, read-only runtime inspection: container state and logs. */
  | {
      type: "collect-logs";
      deploymentId: string;
      service?: string;
      lines?: number;
    }
  | { type: "run-backup"; deploymentId: string }
  | {
      type: "test-restore";
      deploymentId: string;
      /** Commands Pi chose to run inside the restored copy. */
      checks?: import("./command-checks").CommandCheck[];
    }
  | {
      type: "configure-backups";
      deploymentId: string;
      schedule: "daily" | "six-hourly";
      keep: number;
    };

export interface StoredOperation extends ApplicationOperation {
  applicationId: string;
  target: string;
  preconditions: Record<string, string | null>;
  /** Null for inspections and for work whose capability was retired. */
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
