"use client";

import { useState } from "react";

import type { ApplicationOperation } from "@/server/operation-record";

export interface DecisionChoice {
  action: "approve" | "retry" | "cancel";
  inputs: Record<string, string>;
}

/**
 * The one place an operation is decided, rendered from its decision record:
 * an approval with its scope, cost and protected inputs, or recovery after a
 * failure. The same card serves backups, jobs, releases and domains; the
 * deployment keeps its own form because its approval binds a priced
 * recommendation.
 */
export function OperationDecisionCard({
  operation,
  busy = false,
  error = null,
  onDecide,
}: {
  operation: ApplicationOperation;
  busy?: boolean;
  error?: string | null;
  onDecide: (operationId: string, choice: DecisionChoice) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const decision = operation.decision;
  if (!decision) return null;
  const fields = decision.inputs ?? [];
  const complete = fields.every((field) => (inputs[field.name] ?? "").trim());
  const field = (input: { name: string; hint?: string; secret?: boolean }) => (
    <label key={input.name}>
      {input.name}
      {input.hint && <small>{input.hint}</small>}
      <input
        type={input.secret === false ? "text" : "password"}
        autoComplete="off"
        value={inputs[input.name] ?? ""}
        onChange={(event) =>
          setInputs((current) => ({
            ...current,
            [input.name]: event.target.value,
          }))
        }
        required
      />
    </label>
  );
  if (decision.kind === "approval")
    return (
      <form
        className="sg-op-approval"
        aria-label={`Approval: ${operation.title}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && complete)
            onDecide(operation.id, { action: "approve", inputs });
        }}
      >
        <strong>Your approval is needed</strong>
        <p>{decision.note}</p>
        {decision.cost && (
          <p className="sg-op-cost">
            <span>Cost and scope</span>
            {decision.cost}
          </p>
        )}
        {fields.map(field)}
        {error && (
          <p role="alert" className="sg-deployment-error">
            {error}
          </p>
        )}
        <div className="sg-op-approval-actions">
          <button
            className="sg-primary-button"
            disabled={busy || !complete}
            type="submit"
          >
            {decision.action}
          </button>
          <span>Nothing changes until you approve.</span>
        </div>
      </form>
    );
  return (
    <form
      className="sg-op-approval"
      role="group"
      aria-label={`Recovery: ${operation.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && complete)
          onDecide(operation.id, { action: "retry", inputs });
      }}
    >
      {decision.note && <p>{decision.note}</p>}
      {fields.map(field)}
      {error && (
        <p role="alert" className="sg-deployment-error">
          {error}
        </p>
      )}
      <div className="sg-op-approval-actions">
        {decision.retry && (
          <button
            className="sg-primary-button"
            disabled={busy || !complete}
            type="submit"
          >
            {decision.retry}
          </button>
        )}
        {decision.cancel && (
          <button
            className="sg-secondary-button"
            disabled={busy}
            type="button"
            onClick={() => onDecide(operation.id, { action: "cancel", inputs })}
          >
            {decision.cancel}
          </button>
        )}
        <span>A retry is a new attempt; nothing is repeated blindly.</span>
      </div>
    </form>
  );
}
