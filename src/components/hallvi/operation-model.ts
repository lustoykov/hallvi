// Words and ordering for operations as History draws them, built from records
// and executions by `history-records.ts`. Pure.
import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";
import type {
  ApplicationOperation,
  OperationState,
} from "@/server/operation-record";

export const stateLabel: Record<OperationState, string> = {
  proposed: "Waiting for you",
  working: "Working",
  queued: "Queued",
  declined: "Not run",
  stopped: "Stopped",
  cancelled: "Cancelled",
  inspected: "Inspected",
  verified: "Verified",
  failed: "Failed",
};

export function labelOf(section: ApplicationSection) {
  return (
    applicationSections.find((item) => item.id === section)?.label ?? section
  );
}

/** Newest change first; on a tie, the operation recorded later wins. */
function newestFirst(operations: ApplicationOperation[]) {
  return operations
    .map((operation, index) => ({ operation, index }))
    .sort(
      (a, b) =>
        b.operation.updatedAt.localeCompare(a.operation.updatedAt) ||
        b.index - a.index,
    )
    .map((item) => item.operation);
}

/** A failure counts until the operation that addressed it has been verified. */
export function unresolved(
  operation: ApplicationOperation,
  operations: ApplicationOperation[],
) {
  if (operation.state !== "failed" || operation.carriedOn) return false;
  const resolver = operation.resolvedById
    ? operations.find((item) => item.id === operation.resolvedById)
    : undefined;
  return !(resolver && resolver.state === "verified");
}

export function attentionItems(operations: ApplicationOperation[]) {
  return newestFirst(
    operations.filter(
      (operation) =>
        operation.state === "proposed" || unresolved(operation, operations),
    ),
  );
}
