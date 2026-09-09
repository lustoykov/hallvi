import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout as delay } from "node:timers/promises";
import {
  applicationChangeActive,
  markOperationRemoteEffect,
  claimOperation,
  operation,
  proposeOperation,
  settleOperation,
  retryOperation,
  startChange,
} from "./operation-store";
import type { OperationCommand, StoredOperation } from "./operation-types";
import { redactSecrets } from "./secrets";

const executing = new AsyncLocalStorage<StoredOperation>();
export const hasApplicationOperation = applicationChangeActive;
export async function executeOperation<T>(
  record: StoredOperation,
  work: () => Promise<T>,
) {
  const claimed = claimOperation(record.id);
  if (!claimed) throw new Error("This operation is already being executed.");
  return runClaimedOperation(claimed, work);
}
async function runClaimedOperation<T>(
  claimed: StoredOperation,
  work: () => Promise<T>,
) {
  return executing.run(claimed, async () => {
    try {
      const result = await work();
      settleOperation(
        claimed.id,
        claimed.executionId!,
        claimed.kind === "change" ? "verified" : "inspected",
        result &&
          typeof result === "object" &&
          "evidence" in result &&
          typeof result.evidence === "string"
          ? result.evidence.slice(0, 12000)
          : `${claimed.title} completed. See its recorded source evidence.`,
        false,
        result,
      );
      return result;
    } catch (error) {
      settleOperation(
        claimed.id,
        claimed.executionId!,
        "failed",
        redactSecrets(
          error instanceof Error ? error.message : "Operation failed.",
        ).text,
        operation(claimed.id)?.blocksQueue ?? false,
      );
      throw error;
    }
  });
}

/** Existing source operations retain their own authority and result checks. */
export async function duringApplicationOperation<T>(
  applicationId: string,
  work: () => Promise<T>,
  specification: {
    command: OperationCommand;
    kind: "change" | "inspection";
    title: string;
  },
): Promise<T> {
  const active = executing.getStore();
  if (active?.applicationId === applicationId) return work();
  const intent = proposeOperation({
    applicationId,
    source: { type: "preparation", id: JSON.stringify(specification.command) },
    target: JSON.stringify(specification.command),
    kind: specification.kind,
    title: specification.title,
    summary: specification.title,
    destinations: ["deployment", "history"],
    command: specification.command,
  });
  const started =
    intent.state === "proposed"
      ? startChange(intent.id, intent.updatedAt)
      : intent.state === "failed"
        ? retryOperation(intent.id, intent.updatedAt)
        : intent;
  if (started.state === "working" && !started.executorPid) {
    const claimed = claimOperation(started.id);
    if (claimed) return runClaimedOperation(claimed, work);
    // Another process may have claimed it after approval. Follow its result.
  }
  // The worker owns queued commands even if this request disconnects.
  // Synchronous callers receive the saved result after it settles;
  // never replay an effect just to reconstruct its return value.
  if (started.state === "queued" || started.state === "working") {
    while (true) {
      await delay(250);
      const current = operation(started.id);
      if (!current) throw new Error("Operation disappeared.");
      if (current.state === "verified" || current.state === "inspected") {
        if (!("result" in current))
          throw new Error(
            "The operation completed; open its source view for the result.",
          );
        return current.result as T;
      }
      if (!["queued", "working"].includes(current.state))
        throw new Error(current.summary);
    }
  }
  throw new Error(started.summary);
}

export function recordOperationRemoteEffect() {
  const current = executing.getStore();
  if (current?.kind === "change")
    markOperationRemoteEffect(current.id, current.executionId!);
}
