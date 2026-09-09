"use client";

import { ArrowClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import { useState } from "react";

import { Facts, When, type ViewProps } from "./bits";

/**
 * A collected snapshot of the application's output, per service, with the
 * stream facts when a collector records them. Refreshing is an inspection:
 * read-only, recorded with its time.
 */
export function LogsView(
  props: ViewProps & { applicationId: string; onRefresh: () => Promise<void> },
) {
  const { deployment, facts, now, onAction, busy } = props;
  const [query, setQuery] = useState("");
  const [service, setService] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const logMarker = "--- Application logs ---\n";
  const recordedStart = deployment?.logs.lastIndexOf(logMarker) ?? -1;
  const snapshot = facts.logs?.snapshot
    ? facts.logs.snapshot.lines
    : recordedStart >= 0
      ? deployment!.logs.slice(recordedStart + logMarker.length).split("\n")
      : [];
  const collectedAt =
    facts.logs?.snapshot?.at ?? deployment?.logsCollectedAt ?? null;
  const streams = facts.logs?.streams ?? [];
  const shown = snapshot.filter(
    (line) =>
      line.toLowerCase().includes(query.toLowerCase()) &&
      (!service || line.startsWith(`${service} |`)),
  );
  async function refresh() {
    if (onAction) {
      onAction({ type: "refresh-logs", service: service ?? undefined });
      return;
    }
    if (!deployment || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch(
        `/api/applications/${props.applicationId}/deployment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logs", deploymentId: deployment.id }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not collect logs.");
      await props.onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not collect logs. Try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  const canRefresh = onAction
    ? busy !== "refresh-logs"
    : deployment?.status === "live" && !refreshing;
  return (
    <>
      {streams.length > 0 && (
        <div className="sg-streams">
          <button
            type="button"
            className={`sg-stream${service === null ? " selected" : ""}`}
            onClick={() => setService(null)}
          >
            <strong>All services</strong>
            <small>{facts.logs?.retention}</small>
          </button>
          {streams.map((stream) => (
            <button
              type="button"
              key={stream.service}
              className={`sg-stream${service === stream.service ? " selected" : ""}${stream.level === "errors" ? " errors" : ""}`}
              onClick={() => setService(stream.service)}
            >
              <strong>{stream.service}</strong>
              <small>
                {stream.lines.toLocaleString()} lines · last{" "}
                <When at={stream.lastAt} now={now} />
                {stream.level === "errors" ? " · errors" : ""}
              </small>
            </button>
          ))}
        </div>
      )}
      <div className="sg-log-toolbar">
        <label>
          <MagnifyingGlass aria-hidden="true" />
          <input
            aria-label="Filter log lines"
            placeholder="Filter collected logs…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button disabled={!canRefresh} onClick={() => void refresh()}>
          <ArrowClockwise />
          {refreshing || busy === "refresh-logs"
            ? "Collecting…"
            : "Refresh logs"}
        </button>
      </div>
      {error && (
        <p role="alert" className="sg-deployment-error">
          {error}
        </p>
      )}
      <div className="sg-log-context">
        <span>
          Application host · collected snapshot · read-only
          {service ? ` · ${service}` : ""}
        </span>
        <span>
          {collectedAt ? (
            <>
              Collected <When at={collectedAt} now={now} />
            </>
          ) : (
            "No live stream"
          )}
        </span>
      </div>
      <pre
        className="sg-logs-output"
        tabIndex={0}
        aria-label="Collected application logs"
      >
        {shown.length
          ? shown.join("\n")
          : snapshot.length
            ? "No lines match your filter."
            : "No logs collected yet. After a verified deployment, refresh to collect the latest host output."}
      </pre>
      {facts.logs ? (
        <Facts
          rows={[
            ["Retention on the host", facts.logs.retention],
            [
              "Secrets",
              "Known secrets are redacted before anything leaves the host",
            ],
          ]}
        />
      ) : (
        <p className="sg-section-note">
          Build progress stays in Deployment. Continuous log collection, job and
          worker log filters and long-term retention are not implemented yet.
        </p>
      )}
    </>
  );
}
