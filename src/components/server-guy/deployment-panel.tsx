"use client";

import { useState } from "react";
import type { DeploymentRecord } from "@/server/deployment-types";

/**
 * The Deployment view's recorded facts and starting points: the Hetzner
 * connection, the button that requests a deployment, and the recorded event
 * history and logs. Approval, retry and cancel live in the conversation
 * receipt that started the deployment.
 */
export function DeploymentPanel({
  applicationId,
  chatId,
  record,
  connected,
  onRefresh,
}: {
  applicationId: string;
  chatId: string;
  record: DeploymentRecord | null;
  connected: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function post(
    body: unknown,
    url = `/api/applications/${applicationId}/deployment`,
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "The request could not be completed.");
      setToken("");
      await onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connection failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const working =
    record &&
    ["queued", "planning", "deploy-queued", "deploying"].includes(
      record.status,
    );
  return (
    <section className="sg-deployment-panel" aria-label="Deployment">
      {!connected && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void post({ token }, "/api/setup/hetzner");
          }}
        >
          <h2>Connect Hetzner</h2>
          <p>
            Use a Cloud API token with read and write access to your project.
            Server Guy will show the cost before creating a server.
          </p>
          <label>
            Hetzner API token
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
          </label>
          <button
            className="sg-primary-button"
            disabled={busy || !token}
            type="submit"
          >
            Connect Hetzner
          </button>
        </form>
      )}
      {connected && !record && (
        <>
          <h2>Let’s get it online</h2>
          <p>
            I’ll inspect the repository, prepare its deployment setup and
            recommend a small server. The recommendation appears in the current
            conversation, where you approve it.
          </p>
          <button
            className="sg-primary-button"
            disabled={busy}
            onClick={() => void post({ action: "prepare", chatId })}
          >
            Deploy application
          </button>
        </>
      )}
      {record && (
        <>
          <h2>
            {record.status === "live"
              ? "Deployment verified"
              : working
                ? "Working on your deployment"
                : record.status === "failed"
                  ? "Needs attention"
                  : "Recommendation waiting for your approval"}
          </h2>
          {record.error && (
            <p className="sg-deployment-error" role="alert">
              {record.error}
            </p>
          )}
          {record.events.length > 0 && (
            <details open={Boolean(working)}>
              <summary>
                {working
                  ? "Follow progress"
                  : `${record.events.length} recorded actions`}
              </summary>
              <ol className="sg-deployment-timeline">
                {(working ? record.events.slice(-5) : record.events).map(
                  (event, index) => (
                    <li
                      key={`${index}-${event.at}`}
                      className={
                        working &&
                        index === Math.min(record.events.length, 5) - 1
                          ? "active"
                          : ""
                      }
                    >
                      <span>{event.message}</span>
                      <time>
                        {new Date(event.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  ),
                )}
              </ol>
            </details>
          )}
          {record.logs && (
            <details>
              <summary>Deployment and application logs</summary>
              <pre className="sg-deployment-logs">{record.logs}</pre>
              {record.status === "live" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void post({ action: "logs", deploymentId: record.id })
                  }
                >
                  Refresh application logs
                </button>
              )}
            </details>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="sg-deployment-error">
          {error}
        </p>
      )}
    </section>
  );
}
