"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  ExecutionRecord,
  OperatorSettings,
} from "@/server/operator-execution";
import "./operator-console.css";
import { Tag, Working, type Tone } from "./presentation";
import { StreamingOutput } from "./streaming-output";

const modes = [
  { id: "always-ask", label: "Always ask" },
  { id: "pi-decides", label: "Pi decides" },
  { id: "bypass", label: "Bypass" },
] as const;

/** What a command's state is called, and how sure that state is. */
const states: Record<
  ExecutionRecord["status"],
  { tone: Tone; word: string } | null
> = {
  succeeded: { tone: "verified", word: "Completed" },
  failed: { tone: "failed", word: "Failed" },
  declined: { tone: "absent", word: "Not run" },
  interrupted: { tone: "stale", word: "Interrupted" },
  "awaiting-approval": { tone: "stale", word: "Waiting for you" },
  running: null,
};

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "The request failed.");
  return value;
}
export function OperatorConsole({
  applicationId,
  chatId,
  main,
  settingsOnly = false,
  executionId,
  excludeIds = [],
  records,
}: {
  applicationId: string;
  chatId: string;
  main: boolean;
  settingsOnly?: boolean;
  executionId?: string;
  excludeIds?: string[];
  records?: ExecutionRecord[];
}) {
  const url = `/api/applications/${applicationId}/operator`;
  const [settings, setSettings] = useState<OperatorSettings | null>(null);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const state = await request<{
      settings: OperatorSettings;
      executions: ExecutionRecord[];
    }>(url);
    setSettings(state.settings);
    setExecutions(state.executions);
  }, [url]);
  useEffect(() => {
    if (records !== undefined && !settingsOnly) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      // Fast while something is running or waiting on the owner, slow
      // otherwise. Polling every second at idle read every execution record
      // off disk 3,600 times an hour to learn that nothing had changed.
      let again = 10_000;
      try {
        const state = await request<{
          settings: OperatorSettings;
          executions: ExecutionRecord[];
        }>(url);
        if (alive) {
          setSettings(state.settings);
          setExecutions(state.executions);
        }
        if (
          state.executions.some(
            (execution) =>
              execution.status === "running" ||
              execution.status === "awaiting-approval",
          )
        )
          again = 1000;
      } catch (error) {
        if (alive) setError((error as Error).message);
      }
      if (alive) timer = setTimeout(poll, again);
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url, records, settingsOnly]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("execution");
    if (!id) return;
    const card = document.getElementById(`execution-${id}`);
    if (card) {
      card.querySelector("details")?.setAttribute("open", "");
      card.scrollIntoView({ block: "center" });
    }
  }, [executions.length]);
  async function save(next: OperatorSettings) {
    setBusy("settings");
    setError(null);
    try {
      await request(url, next);
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function decide(id: string, approved: boolean) {
    setBusy(id);
    setError(null);
    try {
      await request(
        `/api/applications/${applicationId}/executions/${id}/decision`,
        { approved },
      );
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="sg-operator-console">
      {settingsOnly && settings && (
        <>
          <div className="sg-operator-toolbar">
            {main && (
              <div className="sg-modes">
                <span id="sg-modes-label">Permissions</span>
                <div role="radiogroup" aria-labelledby="sg-modes-label">
                  {modes.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      role="radio"
                      aria-checked={settings.permissionMode === mode.id}
                      disabled={busy !== null}
                      onClick={() =>
                        void save({ ...settings, permissionMode: mode.id })
                      }
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {!settingsOnly &&
        (records ?? executions)
          .filter(
            (item) =>
              item.chatId === chatId &&
              (!executionId || item.id === executionId) &&
              !excludeIds.includes(item.id),
          )
          .map((item) => (
            <article
              id={`execution-${item.id}`}
              key={item.id}
              className={`sg-execution ${item.status}`}
            >
              <header>
                <strong>
                  {item.tool === "request_approval"
                    ? "Approval requested"
                    : item.tool === "server_bash"
                      ? "Run on server"
                      : item.tool}
                </strong>
                <span className="sg-execution-where">
                  {item.target} ·{" "}
                  {new Date(item.createdAt).toLocaleTimeString()}
                </span>
                <span role="status" className="sg-execution-state">
                  {states[item.status] ? (
                    <Tag tone={states[item.status]!.tone}>
                      {states[item.status]!.word}
                    </Tag>
                  ) : (
                    <Working>Running</Working>
                  )}
                  {typeof item.exitCode === "number" && (
                    <em>exit {item.exitCode}</em>
                  )}
                </span>
              </header>
              {item.tool === "server_bash" ? (
                <StreamingOutput item={item} />
              ) : (
                <details
                  open={
                    item.status === "awaiting-approval" ||
                    item.status === "running"
                  }
                >
                  <summary>
                    {item.status === "awaiting-approval"
                      ? "Review this action"
                      : "Command and output"}
                  </summary>
                  <pre>{item.input}</pre>
                  {item.output && <pre>{item.output}</pre>}
                </details>
              )}
              {item.status === "awaiting-approval" && main && (
                <div className="sg-execution-actions">
                  <button
                    type="button"
                    className="sg-primary-button"
                    disabled={busy !== null}
                    onClick={() => void decide(item.id, true)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="sg-secondary-button"
                    disabled={busy !== null}
                    onClick={() => void decide(item.id, false)}
                  >
                    Decline
                  </button>
                </div>
              )}
            </article>
          ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
