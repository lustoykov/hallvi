"use client";

import { useState } from "react";

import type { DeploymentRecord } from "@/server/deployment-types";
import { currentFacts } from "@/server/release-facts";

import type { ApplicationSection } from "./application-sections";

const decode = (base64: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
  );

/** The packaging files Pi authored, which the owner approves. */
function packaging(record: DeploymentRecord) {
  return (record.native?.files ?? [])
    .filter((file) => !file.path.startsWith(".server-guy/"))
    .map((file) => ({ path: file.path, content: decode(file.content) }));
}

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
  const [providerReference, setProviderReference] = useState("");
  const [providerConfirmed, setProviderConfirmed] = useState(false);
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
  const facts = currentFacts(record);
  if (record.status === "awaiting-approval" && facts && record.offer) {
    const reasons: Record<string, string> = record.native?.inputReasons ?? {};
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
        <p>{facts.summary}</p>
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
        {facts.inputs.map((name) => (
          <label key={name}>
            {name}
            {reasons[name] && <small>{reasons[name]}</small>}
            <input
              type="password"
              autoComplete="off"
              value={inputs[name] ?? ""}
              onChange={(event) =>
                setInputs((current) => ({
                  ...current,
                  [name]: event.target.value,
                }))
              }
              required
            />
          </label>
        ))}
        <details>
          <summary>Review deployment configuration</summary>
          <p>
            Revision {record.revision?.slice(0, 12)}
            {facts.exposure.map(
              (item) =>
                ` · ${item.service} serves HTTP on port ${item.published || item.target}`,
            )}
            {facts.database ? ` · PostgreSQL ${facts.database.version}` : ""}
          </p>
          <pre>
            {facts.services
              .map(
                (service) =>
                  `${service.name}: ${service.pinned ? `pinned image ${service.pinned}` : service.build ? "built from this revision" : service.sharesImageWith ? `runs the ${service.sharesImageWith} image` : "managed database image"}${service.command ? ` · ${service.command}` : ""}`,
              )
              .join("\n")}
            {facts.volumes
              .map(
                (volume) =>
                  `\nPersist ${volume.name} (${volume.kind}): ${volume.mounts.map((mount) => `${mount.service} ${mount.target}${mount.readOnly ? " read-only" : ""}`).join(", ")}`,
              )
              .join("")}
          </pre>
          {packaging(record).map((file) => (
            <details key={file.path}>
              <summary>{file.path}</summary>
              <pre>{file.content}</pre>
            </details>
          ))}
          <p>
            Repository: {record.repository} · ID {record.repositoryId}
          </p>
          <p>
            Public checks:{" "}
            {facts.criterion?.checks
              .map(
                (check) =>
                  `${check.name}: ${check.method} ${check.path} → HTTP ${check.expectedStatus}${check.contains ? `, contains “${check.contains}”` : ""}`,
              )
              .join("; ")}
          </p>
          <p>
            {facts.httpAccess === "controller"
              ? "HTTP will be restricted to this controller’s network for protected setup. "
              : ""}
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
  }
  if (record.status === "failed")
    return (
      <div
        className="sg-op-approval"
        role="group"
        aria-label="Deployment recovery"
      >
        {record.serverCreateAttempted && !record.serverId && (
          <details>
            <summary>Hetzner confirmed no server was created</summary>
            <p>
              Use this only after Hetzner has confirmed the original request
              finished without creating a server. An empty server list alone is
              not sufficient. This records your confirmation, checks the project
              again, and removes the old spending authority.
            </p>
            <label>
              Hetzner support or incident reference
              <input
                value={providerReference}
                maxLength={200}
                onChange={(e) => setProviderReference(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={providerConfirmed}
                onChange={(e) => setProviderConfirmed(e.target.checked)}
              />
              I confirmed with Hetzner that the request completed without
              creating a server.
            </label>
            <button
              type="button"
              className="sg-secondary-button"
              disabled={
                busy ||
                !providerConfirmed ||
                providerReference.trim().length < 5
              }
              onClick={() =>
                void post({
                  action: "resolve-purchase",
                  deploymentId: record.id,
                  confirmedNotCreated: true,
                  providerReference: providerReference.trim(),
                })
              }
            >
              Record Hetzner confirmation
            </button>
          </details>
        )}
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
