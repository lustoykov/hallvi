"use client";

import { useState } from "react";

import type { DeploymentRecord } from "@/server/deployment-types";

import type { ApplicationSection } from "./application-sections";

/**
 * The one place a deployment is decided: the priced recommendation with its
 * missing inputs while approval is waiting, and retry or cancel after a
 * failure. It calls the existing deployment endpoint with the recommendation
 * identity and the spending bound; a changed price refreshes the card without
 * clearing what the user typed.
 */
export function DeploymentDecision({
  applicationId,
  record,
  connected,
  onRefresh,
  onOpen,
}: {
  applicationId: string;
  record: DeploymentRecord;
  connected: boolean;
  onRefresh: () => Promise<void>;
  onOpen: (destination: ApplicationSection) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [verificationObjectId, setVerificationObjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function post(body: unknown) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/deployment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "The request could not be completed.");
      setInputs({});
      await onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connection failed. Try again.",
      );
      // Repricing can update the recommendation even when approval fails.
      // Refresh the server state while preserving the values the user entered.
      try {
        await onRefresh();
      } catch {
        /* keep the original actionable error */
      }
    } finally {
      setBusy(false);
    }
  }
  if (record.status === "awaiting-approval" && record.plan && record.offer)
    return (
      <form
        className="sg-op-approval"
        aria-label="Deployment approval"
        onSubmit={(event) => {
          event.preventDefault();
          void post({
            action: "approve",
            deploymentId: record.id,
            recommendationId: record.recommendationId,
            maxMonthly: record.offer!.monthly,
            inputs,
          });
        }}
      >
        <strong>Your approval is needed</strong>
        <p>{record.plan.summary}</p>
        <div className="sg-host-recommendation">
          <strong>{record.offer.serverType.toUpperCase()} · Hetzner</strong>
          <span>
            {record.offer.cores} CPUs · {record.offer.memory} GB RAM ·{" "}
            {record.offer.location}
          </span>
          <strong>
            {record.offer.currency} {record.offer.monthly.toFixed(2)} / month
          </strong>
          <small>Hourly billing · IPv4 included · no backup add-on</small>
        </div>
        {record.plan.missingInputs.map((input) => (
          <label key={input.name}>
            {input.name}
            <small>{input.reason}</small>
            <input
              type="password"
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
        ))}
        <details>
          <summary>Review deployment configuration</summary>
          <p>
            Revision {record.revision?.slice(0, 12)} · HTTP port{" "}
            {record.plan.port}
            {record.plan.postgres
              ? ` · PostgreSQL ${record.plan.postgres.version}`
              : ""}
          </p>
          <pre>
            {record.plan.generatedDockerfile ??
              `Reuse ${record.plan.dockerfile}`}
          </pre>
          {record.inspectedRevision &&
            record.inspectedRevision !== record.revision && (
              <p>
                This revision differs from the earlier repository inspection (
                {record.inspectedRevision.slice(0, 12)}). This deployment uses
                the revision shown above.
              </p>
            )}
          <p>
            Repository: {record.repository} · ID {record.repositoryId}
          </p>
          <p>
            Public checks:{" "}
            {record.plan.checks
              .map(
                (check) =>
                  `${check.name}: ${check.method} ${check.path} → HTTP ${check.expectedStatus}${check.contains ? `, contains “${check.contains}”` : ""}`,
              )
              .join("; ")}
          </p>
          <p>
            Application code stays unchanged. This first release uses HTTP;
            domain and HTTPS setup comes next.
          </p>
        </details>
        {!connected && (
          <p className="sg-op-next">
            Connect Hetzner in{" "}
            <button
              type="button"
              className="sg-op-text-link"
              onClick={() => onOpen("deployment")}
            >
              Deployment
            </button>{" "}
            before approving.
          </p>
        )}
        {error && (
          <p role="alert" className="sg-deployment-error">
            {error}
          </p>
        )}
        <div className="sg-op-approval-actions">
          <button
            className="sg-primary-button"
            disabled={busy || !connected}
            type="submit"
          >
            Create server and deploy
          </button>
          <span>Nothing is purchased or changed until you approve.</span>
        </div>
      </form>
    );
  if (record.status === "failed")
    return (
      <div
        className="sg-op-approval"
        role="group"
        aria-label="Deployment recovery"
      >
        {record.verificationPending && !record.cleanup && (
          <label>
            Recover verification test object
            <p>
              Find the object containing{" "}
              <code>{record.verificationPending}</code> in your application and
              enter its ID. Server Guy verifies the marker before removing only
              that object and resuming checks. An empty result is not proof the
              earlier request had no effect.
            </p>
            <input
              value={verificationObjectId}
              maxLength={200}
              onChange={(event) => setVerificationObjectId(event.target.value)}
              placeholder="Test object ID"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="sg-deployment-error">
            {error}
          </p>
        )}
        <div className="sg-op-approval-actions">
          <button
            className="sg-primary-button"
            disabled={busy}
            type="button"
            onClick={() =>
              void post({
                action: "retry",
                deploymentId: record.id,
                ...(verificationObjectId.trim()
                  ? { verificationObjectId: verificationObjectId.trim() }
                  : {}),
              })
            }
          >
            Retry this deployment
          </button>
          {!record.serverId && !record.serverCreateAttempted && (
            <button
              className="sg-secondary-button"
              disabled={busy}
              type="button"
              onClick={() =>
                void post({ action: "cancel", deploymentId: record.id })
              }
            >
              Cancel deployment setup
            </button>
          )}
          <span>
            A retry reconciles this same deployment; no server is purchased
            blindly.
          </span>
        </div>
      </div>
    );
  return null;
}
