"use client";
import { useState } from "react";
import type { ApplicationOperation } from "@/server/operation-record";
import {
  OperationDecisionCard,
  type DecisionChoice,
} from "./operation-decision";

export function OperationControls({
  applicationId,
  operation,
  onRefresh,
}: {
  applicationId: string;
  operation: ApplicationOperation;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(_id: string, choice: DecisionChoice) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/operations/${encodeURIComponent(operation.id)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...choice, updatedAt: operation.updatedAt }),
        },
      );
      const result = await response.json();
      await onRefresh();
      if (!response.ok)
        throw new Error(result.error ?? "Could not decide this operation.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not decide this operation.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (operation.resolvedById) return null;
  if (operation.state === "queued")
    return (
      <div className="sg-op-links">
        <button
          type="button"
          className="sg-op-link"
          disabled={busy}
          onClick={() =>
            void decide(operation.id, { action: "cancel", inputs: {} })
          }
        >
          Cancel queued change
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  if (!["proposed", "failed"].includes(operation.state)) return null;
  return (
    <OperationDecisionCard
      operation={operation}
      busy={busy}
      error={error}
      onDecide={(id, choice) => void decide(id, choice)}
    />
  );
}
