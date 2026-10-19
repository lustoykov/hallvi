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

/** Addresses carried by a call row, checked again against Pi's own entries. */
export interface CallReference {
  entryId?: number;
  resultEntryId?: number;
  executionId?: string;
}

export interface CallDetail {
  activity?: Pick<
    ActivityRecord,
    "id" | "args" | "preview" | "result" | "truncated"
  >;
  execution?: ExecutionRecord;
}
