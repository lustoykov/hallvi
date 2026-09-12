"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  ExecutionRecord,
  OperatorSettings,
} from "@/server/operator-execution";
import "./operator-console.css";

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
}: {
  applicationId: string;
  chatId: string;
  main: boolean;
  settingsOnly?: boolean;
}) {
  const url = `/api/applications/${applicationId}/operator`;
  const [settings, setSettings] = useState<OperatorSettings | null>(null);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const refresh = useCallback(async () => {
    const state = await request<{
      settings: OperatorSettings;
      executions: ExecutionRecord[];
    }>(url);
    setSettings(state.settings);
    setExecutions(state.executions);
  }, [url]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const state = await request<{
          settings: OperatorSettings;
          executions: ExecutionRecord[];
        }>(url);
        if (alive) {
          setSettings(state.settings);
          setExecutions(state.executions);
        }
      } catch (error) {
        if (alive) setError((error as Error).message);
      }
      if (alive) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url]);
  async function save(next: OperatorSettings) {
    setBusy("settings");
    setError(null);
    try {
      await request(url, next);
      await refresh();
      setEditing(false);
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
            <strong>{main ? "Main operator" : "Read-only side chat"}</strong>
            {main && (
              <label>
                Permissions{" "}
                <select
                  aria-label="Operator permissions"
                  value={settings.permissionMode}
                  disabled={busy !== null}
                  onChange={(event) =>
                    void save({
                      ...settings,
                      permissionMode: event.target
                        .value as OperatorSettings["permissionMode"],
                    })
                  }
                >
                  <option value="always-ask">Always ask</option>
                  <option value="pi-decides">Pi decides</option>
                  <option value="bypass">Bypass</option>
                </select>
              </label>
            )}
            {main && (
              <button type="button" onClick={() => setEditing(!editing)}>
                {settings.host
                  ? `${settings.host.user}@${settings.host.address}`
                  : "Connect existing server"}
              </button>
            )}
          </div>
          {main && editing && (
            <form
              className="sg-host-form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void save({
                  ...settings,
                  host: {
                    address: String(data.get("address")),
                    user: String(data.get("user")),
                    port: Number(data.get("port")),
                    privateKeyPath: String(data.get("privateKeyPath")),
                    knownHostsPath: String(data.get("knownHostsPath")),
                  },
                });
              }}
            >
              <p>
                Connect an existing server using an SSH key and known-hosts file
                on the machine running Server Guy. Verify the host through SSH
                first.
              </p>
              <label>
                Host address
                <input
                  name="address"
                  required
                  defaultValue={settings.host?.address ?? ""}
                  placeholder="203.0.113.10"
                />
              </label>
              <label>
                SSH user
                <input
                  name="user"
                  required
                  defaultValue={settings.host?.user ?? "root"}
                />
              </label>
              <label>
                SSH port
                <input
                  name="port"
                  type="number"
                  min={1}
                  max={65535}
                  required
                  defaultValue={settings.host?.port ?? 22}
                />
              </label>
              <label>
                Private key file
                <input
                  name="privateKeyPath"
                  required
                  defaultValue={settings.host?.privateKeyPath ?? ""}
                  placeholder="/absolute/path/to/ssh-key"
                />
              </label>
              <label>
                Known-hosts file
                <input
                  name="knownHostsPath"
                  required
                  defaultValue={settings.host?.knownHostsPath ?? ""}
                  placeholder="/absolute/path/to/known_hosts"
                />
              </label>
              <button className="sg-primary-button" disabled={busy !== null}>
                Save connection
              </button>
            </form>
          )}
        </>
      )}
      {!settingsOnly &&
        executions
          .filter((item) => item.chatId === chatId)
          .map((item) => (
            <article key={item.id} className={`sg-execution ${item.status}`}>
              <header>
                <strong>
                  {item.tool === "request_approval"
                    ? "Approval requested"
                    : item.tool}
                </strong>
                <span>{item.status.replaceAll("-", " ")}</span>
              </header>
              <p>
                {item.target} · {new Date(item.createdAt).toLocaleTimeString()}
              </p>
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
