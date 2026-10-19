import type { ExecutionRecord } from "@/server/operator-execution";
import type { ActivityRecord } from "@/server/pi-activity";

/** A compact conversation row; full text stays behind its disclosure. */
export type ExecutionSummary = ExecutionRecord & {
  detailVersion?: string;
  hasOutput?: boolean;
};
export type ActivitySummary = ActivityRecord & {
  detailVersion?: string;
  hasOutput?: boolean;
  hasResult?: boolean;
};

export interface CallDetail {
  activity?: ActivityRecord;
  execution?: ExecutionRecord;
}
