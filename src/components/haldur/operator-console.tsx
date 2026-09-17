"use client";
import { Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { plainText, whereItRan } from "./execution-text";
import type {
  ExecutionRecord,
  OperatorSettings,
} from "@/server/operator-execution";
import "./operator-console.css";
import { Tag, Working, type Tone } from "./presentation";
import { StreamingOutput } from "./streaming-output";

/**
 * The permission boundary, and what each setting actually does.
 *
 * The control used to be three words in a segmented pill with nothing saying
 * what any of them meant. "Bypass" was selected on a real application and
 * looked exactly like a view filter — the most consequential setting in the
 * product, styled as a preference. The words do not change; what changes is
 * that the current one states its consequence, because a reader should not
 * have to try a setting to find out what it does.
 */
const modes = [
  {
    id: "always-ask",
    label: "Always ask",
    means: "Every command waits for you.",
  },
  {
    id: "pi-decides",
    label: "Pi decides",
    means: "Pi asks before anything consequential.",
  },
  {
    id: "bypass",
    label: "Bypass",
    means: "Pi runs commands without asking.",
  },
] as const;

/** What a command's state is called, and how sure that state is. */
const states: Record<
  ExecutionRecord["status"],
  { tone: Tone; word: string } | null
> = {
  succeeded: { tone: "verified", word: "Completed" },
  failed: { tone: "failed", word: "Failed" },
  // Declining is a decision the product supports, not a thing that failed to
  // happen. The receipt says whose decision it was.
  declined: { tone: "absent", word: "You declined" },
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
    <div className="hd-operator-console">
      {settingsOnly && settings && (
        <>
          <div className="hd-operator-toolbar">
            {main && (
              <div className="hd-modes">
                <span id="hd-modes-label">Permissions</span>
                <div role="radiogroup" aria-labelledby="hd-modes-label">
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
                <span
                  className="hd-modes-means"
                  data-loud={settings.permissionMode === "bypass" || undefined}
                >
                  {settings.permissionMode === "bypass" && (
                    <Warning weight="fill" aria-hidden="true" />
                  )}
                  {modes.find((mode) => mode.id === settings.permissionMode)
                    ?.means ?? ""}
                </span>
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
          .map((item) => {
            const where = whereItRan(item);
            return (
              <article
                id={`execution-${item.id}`}
                key={item.id}
                className={`hd-execution ${item.status}`}
              >
                <header>
                  <strong>
                    {item.tool === "request_approval"
                      ? "Approval requested"
                      : item.tool === "server_bash"
                        ? "Run on server"
                        : item.tool}
                  </strong>
                  {/* Which machine, said as a machine.
                    "on your server" was printed over `server_bash` and the
                    recorded target verbatim over everything else, so a
                    workspace container, a tunnel on this Mac and a call to
                    Hetzner all arrived as prose a reader had to decode — and
                    the one thing that could break the application read like
                    the rest. "root@192.0.2.10:22" is a login string, not how
                    anyone refers to a machine; the address is the half a
                    person recognises and the whole of it stays on hover. */}
                  <span className="hd-execution-where" title={item.target}>
                    {where ? where.said : item.target}
                    {where?.detail && ` · ${where.detail}`}
                    {" · "}
                    {new Date(item.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span role="status" className="hd-execution-state">
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
                    <pre>{plainText(item.input)}</pre>
                    {item.output && <pre>{item.output}</pre>}
                  </details>
                )}
                {item.status === "awaiting-approval" && main && (
                  <div className="hd-execution-actions">
                    <button
                      type="button"
                      className="hd-primary-button"
                      disabled={busy !== null}
                      onClick={() => void decide(item.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="hd-secondary-button"
                      disabled={busy !== null}
                      onClick={() => void decide(item.id, false)}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </article>
            );
          })}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
