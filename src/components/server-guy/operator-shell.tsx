"use client";

import {
  ArrowClockwise,
  ArrowSquareOut,
  Archive,
  CaretRight,
  Check,
  ChatCircleDots,
  Circle,
  GithubLogo,
  Plus,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PHASE_ONE_CHECKS, PHASES } from "@/server/phase-one-spec";
import type { ApprovalMode, GateCheck, PhaseOneOperatorView } from "@/server/types";

type InspectorTab = "record" | "activity" | "changes" | "receipts";

const permissionOptions: Array<{ value: ApprovalMode; label: string; hint: string }> = [
  {
    value: "pi-decides",
    label: "Pi decides",
    hint: "Pi asks when the consequence warrants it.",
  },
  { value: "always-ask", label: "Always ask", hint: "Ask before every external change." },
  {
    value: "full-autonomy",
    label: "Full autonomy",
    hint: "Act within the launch scope without asking.",
  },
];

function initialChecks(): GateCheck[] {
  return PHASE_ONE_CHECKS.map((check) => ({
    ...check,
    status: "not-yet",
    result: "Create the application workspace to evaluate this check.",
    sourceLabel: null,
    sourceUrl: null,
    observationId: null,
    observedAt: null,
    canRerun: false,
  }));
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await response.text();
  let body: (T & { error?: string }) | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T & { error?: string };
    } catch {
      if (response.ok) throw new Error("Server Guy returned an unreadable response.");
    }
  }
  if (!response.ok) {
    throw new Error(body?.error ?? (text || "Server Guy could not complete that request."));
  }
  if (!body) throw new Error("Server Guy returned an empty response.");
  return body;
}

function statusLabel(status: GateCheck["status"]) {
  if (status === "passed") return "Passed";
  if (status === "blocked") return "Blocked";
  return "Not yet";
}

function formatTimestamp(value: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function OperatorShell({ initialView }: { initialView: PhaseOneOperatorView }) {
  const [view, setView] = useState(initialView);
  const [repositoryUrl, setRepositoryUrl] = useState(
    initialView.application?.repositoryUrl ?? "https://github.com/lustoykov/todo-fastapi",
  );
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(
    initialView.application?.approvalMode ?? "pi-decides",
  );
  const [activeTab, setActiveTab] = useState<InspectorTab>("record");
  const [selectedCheckKey, setSelectedCheckKey] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checks = view.checks.length ? view.checks : initialChecks();
  const passed = checks.filter((check) => check.status === "passed").length;
  const activeSession = view.sessions.find((session) => session.id === view.activeSessionId) ?? null;
  const effectiveApprovalMode = view.application?.approvalMode ?? approvalMode;
  const selectedPermission = permissionOptions.find(
    (option) => option.value === effectiveApprovalMode,
  )!;
  const selectedCheck = checks.find((check) => check.key === selectedCheckKey) ?? null;

  useEffect(() => {
    if (!selectedCheckKey) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedCheckKey(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCheckKey]);

  async function createApplication(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("create");
    setError(null);
    try {
      const next = await jsonRequest<PhaseOneOperatorView>("/api/applications", {
        method: "POST",
        body: JSON.stringify({ repositoryUrl, approvalMode }),
      });
      setView(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the application.");
    } finally {
      setBusy(null);
    }
  }

  async function selectSession(sessionId: string) {
    if (!view.application || sessionId === view.activeSessionId || busy) return;
    setBusy("session");
    setError(null);
    try {
      const next = await jsonRequest<PhaseOneOperatorView>(
        `/api/applications/${view.application.id}?session=${encodeURIComponent(sessionId)}`,
      );
      setView(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the chat.");
    } finally {
      setBusy(null);
    }
  }

  async function createOperatorSession() {
    if (!view.application || busy) return;
    setBusy("new-chat");
    setError(null);
    try {
      const next = await jsonRequest<PhaseOneOperatorView>(
        `/api/applications/${view.application.id}/sessions`,
        { method: "POST", body: "{}" },
      );
      setView(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the chat.");
    } finally {
      setBusy(null);
    }
  }

  async function archiveActiveOperatorSession() {
    if (!view.application || !activeSession || activeSession.isPrimary || busy) return;
    setBusy("archive");
    setError(null);
    try {
      const next = await jsonRequest<PhaseOneOperatorView>(
        `/api/applications/${view.application.id}/sessions/${activeSession.id}/archive`,
        { method: "POST", body: "{}" },
      );
      setView(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive the chat.");
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!view.application || !activeSession || !composer.trim() || busy) return;
    const message = composer.trim();
    setComposer("");
    setBusy("message");
    setError(null);
    try {
      const next = await jsonRequest<PhaseOneOperatorView>(
        `/api/applications/${view.application.id}/sessions/${activeSession.id}/messages`,
        { method: "POST", body: JSON.stringify({ message }) },
      );
      setView(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pi could not respond.");
      setComposer((current) => current || message);
      const refreshed = await jsonRequest<PhaseOneOperatorView>(
        `/api/applications/${view.application.id}?session=${encodeURIComponent(activeSession.id)}`,
      ).catch(() => null);
      if (refreshed) setView(refreshed);
    } finally {
      setBusy(null);
    }
  }

  async function rerunRepositoryCheck() {
    if (!view.application || busy) return;
    setBusy("rerun");
    setError(null);
    try {
      const next = await jsonRequest<PhaseOneOperatorView>(
        `/api/applications/${view.application.id}/checks/repository-readable/rerun`,
        { method: "POST", body: "{}" },
      );
      setView(next);
      setSelectedCheckKey("repository-readable");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rerun the check.");
    } finally {
      setBusy(null);
    }
  }

  function askAboutCheck(check: GateCheck) {
    setSelectedCheckKey(null);
    setComposer(`Explain “${check.label}”, its current result, and what I can verify myself.`);
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#pi-composer")?.focus());
  }

  const appName = view.application?.name ?? "New application";

  return (
    <main className="sg-shell">
      <header className="sg-topbar">
        <div className="sg-app-identity">
          <span className="sg-app-mark">SG</span>
          <div>
            <strong>{appName}</strong>
            <span>Production · Application Launch</span>
          </div>
        </div>
        <div className="sg-topbar-meta">
          <span className="sg-eyebrow">Permission policy</span>
          <strong>{view.application ? selectedPermission.label : "Set during Start"}</strong>
          <span className={`sg-status ${view.workspace?.status === "ready" ? "ready" : "working"}`}>
            {view.workspace?.status === "ready" ? "Launch Brief ready" : "Phase 1"}
          </span>
        </div>
      </header>

      <section className="sg-phase-rail" aria-label="Application launch progress">
        <div className="sg-phase-list">
          {PHASES.map((phase) => (
            <div className={`sg-phase ${phase.number === 1 ? "active" : "future"}`} key={phase.number}>
              <span className="sg-phase-number">{phase.number}</span>
              <span className="sg-phase-copy">
                <strong>{phase.name}</strong>
                {phase.number === 1 && <small>{phase.deliverable}</small>}
              </span>
              {phase.number === 1 && (
                <span className="sg-phase-dots" aria-label={`${passed} of ${checks.length} checks complete`}>
                  {checks.map((check) => (
                    <i className={check.status} key={check.key} />
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="sg-phase-groups" aria-hidden="true">
          <span>Plan</span>
          <span>Setup · not live yet</span>
          <span>Live</span>
        </div>
      </section>

      <section className="sg-workspace">
        <aside className="sg-chat-list">
          <div className="sg-pane-title sg-chat-list-title">
            <div>
              <span className="sg-eyebrow">Phase 1 chats</span>
              <strong>Start</strong>
            </div>
            <button
              aria-label="Start a new phase chat"
              className="sg-icon-button primary"
              disabled={!view.application || busy !== null}
              onClick={createOperatorSession}
              type="button"
            >
              <Plus weight="bold" />
            </button>
          </div>
          <div className="sg-session-list">
            {view.sessions.length ? (
              view.sessions.map((session) => (
                <button
                  className={`sg-session ${session.id === view.activeSessionId ? "selected" : ""}`}
                  disabled={busy !== null}
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  type="button"
                >
                  <span className="sg-session-mark">Pi</span>
                  <span>
                    <strong>{session.title}</strong>
                    <small>{session.isPrimary ? "Main phase chat" : "Separate transcript"}</small>
                    <em>{session.status === "active" ? "Active" : "Archived"}</em>
                  </span>
                </button>
              ))
            ) : (
              <div className="sg-session selected muted">
                <span className="sg-session-mark">Pi</span>
                <span>
                  <strong>Launch Brief</strong>
                  <small>Starts with the application</small>
                  <em>Not started</em>
                </span>
              </div>
            )}
          </div>
          <div className="sg-chat-list-footer">
            <button disabled={!view.application || busy !== null} onClick={createOperatorSession} type="button">
              <Plus /> New phase chat
            </button>
            <p>Chats share this phase’s Record. Their transcripts stay separate.</p>
          </div>
        </aside>

        <section className="sg-chat-pane">
          <header className="sg-pane-title sg-chat-title">
            <div>
              <span className="sg-eyebrow">Working toward</span>
              <strong>Launch Brief</strong>
            </div>
            {activeSession && !activeSession.isPrimary && activeSession.status === "active" && (
              <button className="sg-text-button" disabled={busy !== null} onClick={archiveActiveOperatorSession} type="button">
                <Archive /> Archive chat
              </button>
            )}
          </header>

          <Conversation className="sg-conversation">
            <ConversationContent className="sg-messages">
              {!view.application && (
                <Message from="assistant">
                  <div className="sg-message-heading">
                    <span className="sg-avatar">Pi</span>
                    <strong>Pi</strong>
                    <span className="sg-message-state">Needs input</span>
                  </div>
                  <MessageContent>
                    <MessageResponse>
                      Welcome. Give me the GitHub repository and choose how I should ask for permission. I’ll create a durable Launch Brief and verify the exact repository revision. This step does not change code or create paid infrastructure.
                    </MessageResponse>
                  </MessageContent>
                </Message>
              )}

              {view.messages.map((message) => (
                <Message from={message.role === "user" ? "user" : "assistant"} key={message.id}>
                  <div className="sg-message-heading">
                    <span className={`sg-avatar ${message.role === "user" ? "user" : ""}`}>
                      {message.role === "user" ? "You" : "Pi"}
                    </span>
                    <strong>{message.role === "user" ? "You" : "Pi"}</strong>
                    {message.source === "server-guy" && <span className="sg-source-tag">Recorded event</span>}
                    <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
                  </div>
                  <MessageContent>
                    <MessageResponse>{message.body}</MessageResponse>
                  </MessageContent>
                </Message>
              ))}

              {!view.application && (
                <form className="sg-launch-card" onSubmit={createApplication}>
                  <div className="sg-card-heading">
                    <div>
                      <span className="sg-eyebrow">Phase deliverable</span>
                      <h2>Launch Brief</h2>
                    </div>
                    <span>{passed} of {checks.length} checks</span>
                  </div>
                  <label className="sg-field">
                    <span>GitHub repository</span>
                    <span className="sg-input-with-icon">
                      <GithubLogo weight="fill" />
                      <input
                        autoComplete="url"
                        onChange={(event) => setRepositoryUrl(event.target.value)}
                        required
                        type="url"
                        value={repositoryUrl}
                      />
                    </span>
                  </label>
                  <div className="sg-fixed-fact">
                    <span>Target environment</span>
                    <strong>Production</strong>
                    <small>Journey 1 launches one production application.</small>
                  </div>
                  <fieldset className="sg-permission-field">
                    <legend>How should Pi ask for permission?</legend>
                    <div className="sg-segmented-control">
                      {permissionOptions.map((option) => (
                        <button
                          aria-pressed={approvalMode === option.value}
                          className={approvalMode === option.value ? "selected" : ""}
                          key={option.value}
                          onClick={() => setApprovalMode(option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p>{selectedPermission.hint} Applies to this application launch.</p>
                  </fieldset>
                  <div className="sg-default-priorities">
                    <span className="sg-eyebrow">Built into every production launch</span>
                    <div><Check weight="bold" /> Protect database data</div>
                    <div><Check weight="bold" /> Minimize downtime</div>
                    <div><Check weight="bold" /> Keep infrastructure cost low</div>
                  </div>
                  {error && <div className="sg-error" role="alert">{error}</div>}
                  <button className="sg-primary-button" disabled={busy !== null} type="submit">
                    {busy === "create" ? <SpinnerGap className="spin" /> : null}
                    {busy === "create" ? "Checking repository…" : "Create application workspace"}
                  </button>
                </form>
              )}

              {view.application && view.workspace?.status === "ready" && (
                <div className="sg-ready-card">
                  <span className="sg-ready-icon"><Check weight="bold" /></span>
                  <div>
                    <strong>Launch Brief ready</strong>
                    <p>All five checks pass. Phase 2 is intentionally not implemented in this pull request.</p>
                  </div>
                </div>
              )}
              {error && view.application && <div className="sg-error" role="alert">{error}</div>}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <form className="sg-composer" onSubmit={sendMessage}>
            <textarea
              disabled={!view.application || activeSession?.status !== "active"}
              id="pi-composer"
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!busy) event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={view.application ? "Ask Pi, correct a decision, or add context…" : "Create the application workspace to start chatting"}
              rows={2}
              value={composer}
            />
            <div>
              <span>Decisions Pi recognizes are saved to the shared Record.</span>
              <button disabled={!composer.trim() || busy !== null || !view.application} type="submit">
                {busy === "message" ? <SpinnerGap className="spin" /> : "Send"}
              </button>
            </div>
          </form>
        </section>

        <aside className="sg-inspector">
          <nav className="sg-inspector-tabs" aria-label="Application record views">
            {(["record", "activity", "changes", "receipts"] as const).map((tab) => (
              <button
                aria-selected={activeTab === tab}
                className={activeTab === tab ? "selected" : ""}
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                type="button"
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>

          <div className="sg-inspector-body">
            {activeTab === "record" && (
              <>
                <div className="sg-record-heading">
                  <span className="sg-eyebrow">Launch Brief</span>
                  <div>
                    <strong>{passed} of {checks.length} checks complete</strong>
                    <span>{view.workspace?.status === "ready" ? "Ready for review" : "Working toward the exit gate"}</span>
                  </div>
                  <div className="sg-progress" aria-label={`${passed} of ${checks.length} checks complete`}>
                    <i style={{ width: `${(passed / checks.length) * 100}%` }} />
                  </div>
                </div>
                <div className="sg-check-list">
                  {checks.map((check, index) => (
                    <button className="sg-check" key={check.key} onClick={() => setSelectedCheckKey(check.key)} type="button">
                      <span className={`sg-check-icon ${check.status}`}>
                        {check.status === "passed" ? <Check weight="bold" /> : <Circle weight="bold" />}
                      </span>
                      <span className="sg-check-copy">
                        <small>Check {index + 1}</small>
                        <strong>{check.label}</strong>
                      </span>
                      <span className={`sg-check-status ${check.status}`}>{statusLabel(check.status)}</span>
                      <CaretRight />
                    </button>
                  ))}
                </div>
                <section className="sg-record-section">
                  <span className="sg-eyebrow">Recorded decisions</span>
                  {view.decisions.length ? (
                    <div className="sg-decision-list">
                      {view.decisions.map((decision) => (
                        <a href={`/api/decisions/${decision.id}`} key={decision.id} rel="noreferrer" target="_blank">
                          <span>{decision.label}</span>
                          <strong>{decision.value}</strong>
                          <ArrowSquareOut />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p>No decisions recorded yet.</p>
                  )}
                </section>
                <section className="sg-record-section">
                  <span className="sg-eyebrow">Later prerequisites</span>
                  {view.blockers.length ? (
                    <div className="sg-prerequisite-list">
                      {view.blockers.map((blocker) => (
                        <article key={blocker.id}>
                          <span className={blocker.status}>{blocker.status}</span>
                          <strong>{blocker.label}</strong>
                          <small>{blocker.resolutionPath} Owner: {blocker.owner}.</small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>Prerequisites are recorded when the workspace is created.</p>
                  )}
                </section>
              </>
            )}

            {activeTab === "activity" && (
              <section className="sg-inspector-section">
                <span className="sg-eyebrow">What happened</span>
                {view.activity.length ? (
                  view.activity.map((event) => (
                    <article className="sg-event" key={event.id}>
                      <span className="sg-event-dot" />
                      <div><strong>{event.summary}</strong><p>{event.detail}</p><time dateTime={event.createdAt}>{formatTimestamp(event.createdAt)}</time></div>
                    </article>
                  ))
                ) : (
                  <p>Activity will appear after the workspace is created.</p>
                )}
              </section>
            )}

            {activeTab === "changes" && (
              <section className="sg-empty-state">
                <div className="sg-empty-icon"><GithubLogo /></div>
                <strong>No external changes in Phase 1</strong>
                <p>Start reads GitHub and writes only to Server Guy’s local record. Code and infrastructure remain untouched.</p>
              </section>
            )}

            {activeTab === "receipts" && (
              <section className="sg-inspector-section">
                <span className="sg-eyebrow">Source receipts</span>
                {view.observations.length ? (
                  view.observations.map((observation) => (
                    <article className="sg-receipt" key={observation.id}>
                      <div>
                        <GithubLogo weight="fill" />
                        <span><strong>{observation.sourceLabel}</strong><small>{formatTimestamp(observation.observedAt)}</small></span>
                        <em className={observation.status}>{observation.status}</em>
                      </div>
                      <p>{observation.summary}</p>
                      <div className="sg-receipt-actions">
                        <a href={`/api/observations/${observation.id}`} rel="noreferrer" target="_blank">Raw receipt <ArrowSquareOut /></a>
                        {observation.sourceUrl && <a href={observation.sourceUrl} rel="noreferrer" target="_blank">Open source <ArrowSquareOut /></a>}
                      </div>
                    </article>
                  ))
                ) : (
                  <p>No external source has been checked yet.</p>
                )}
              </section>
            )}
          </div>
        </aside>
      </section>

      {selectedCheck && (
        <div className="sg-drawer-layer" role="presentation" onMouseDown={() => setSelectedCheckKey(null)}>
          <aside
            aria-label={`${selectedCheck.label} details`}
            aria-modal="true"
            className="sg-detail-drawer"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div><span className="sg-eyebrow">Launch Brief check</span><h2>{selectedCheck.label}</h2></div>
              <button aria-label="Close details" className="sg-icon-button" onClick={() => setSelectedCheckKey(null)} type="button"><X /></button>
            </header>
            <section className="sg-drawer-summary">
              <span className={`sg-check-icon ${selectedCheck.status}`}>
                {selectedCheck.status === "passed" ? <Check weight="bold" /> : <Circle weight="bold" />}
              </span>
              <div><span>Current result</span><strong>{statusLabel(selectedCheck.status)}</strong><p>{selectedCheck.result}</p></div>
            </section>
            <section>
              <span className="sg-eyebrow">What this checks</span>
              <p>{selectedCheck.definition}</p>
            </section>
            <section>
              <span className="sg-eyebrow">Verify it yourself</span>
              <p>Open the underlying record or external source. Server Guy’s status is derived from that source and can be rechecked.</p>
              <div className="sg-drawer-actions">
                {selectedCheck.sourceUrl && (
                  <a href={selectedCheck.sourceUrl} rel="noreferrer" target="_blank">
                    {selectedCheck.sourceLabel ?? "Open source"} <ArrowSquareOut />
                  </a>
                )}
                {selectedCheck.observationId && (
                  <a href={`/api/observations/${selectedCheck.observationId}`} rel="noreferrer" target="_blank">
                    Raw receipt <ArrowSquareOut />
                  </a>
                )}
              </div>
              {selectedCheck.observedAt && <small>Recorded {formatTimestamp(selectedCheck.observedAt)}</small>}
            </section>
            <section>
              <span className="sg-eyebrow">Take control</span>
              <button className="sg-secondary-button" onClick={() => askAboutCheck(selectedCheck)} type="button">
                <ChatCircleDots /> Ask Pi about this check
              </button>
              {selectedCheck.canRerun && (
                <button className="sg-primary-button" disabled={busy !== null} onClick={rerunRepositoryCheck} type="button">
                  {busy === "rerun" ? <SpinnerGap className="spin" /> : <ArrowClockwise />}
                  Re-run repository check
                </button>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
