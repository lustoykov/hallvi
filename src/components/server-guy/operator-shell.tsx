"use client";

import { useCallback, useState } from "react";

import { APPROVAL_MODE_LABELS, PHASE_ONE_CHECKS } from "@/server/phase-one-spec";
import type { GateCheck, PhaseOneOperatorView } from "@/server/types";

import { api } from "./api";
import { ChatList } from "./chat-list";
import { ChatPane } from "./chat-pane";
import type { CreateApplicationInput } from "./chat-pane";
import { CheckDrawer } from "./check-drawer";
import { Inspector } from "./inspector";
import { PhaseRail } from "./phase-rail";

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

export function OperatorShell({ initialView }: { initialView: PhaseOneOperatorView }) {
  const [view, setView] = useState(initialView);
  const [selectedCheckKey, setSelectedCheckKey] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const application = view.application;
  const checks = view.checks.length ? view.checks : initialChecks();
  const activeSession = view.sessions.find((session) => session.id === view.activeSessionId) ?? null;
  const selectedCheck = checks.find((check) => check.key === selectedCheckKey) ?? null;
  const closeCheck = useCallback(() => setSelectedCheckKey(null), []);

  // Every action asks the server for the next whole view and replaces the current one.
  async function run(
    label: string,
    work: () => Promise<PhaseOneOperatorView>,
    recover?: () => Promise<void>,
  ) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      setView(await work());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Server Guy could not complete that request.");
      await recover?.();
    } finally {
      setBusy(null);
    }
  }

  function createApplication(input: CreateApplicationInput) {
    void run("create", () => api.createApplication(input));
  }

  function selectSession(sessionId: string) {
    if (!application || sessionId === view.activeSessionId) return;
    void run("session", () => api.view(application.id, sessionId));
  }

  function createOperatorSession() {
    if (!application) return;
    void run("new-chat", () => api.createSession(application.id));
  }

  function archiveActiveSession() {
    if (!application || !activeSession || activeSession.isPrimary) return;
    void run("archive", () => api.archiveSession(application.id, activeSession.id));
  }

  function sendMessage() {
    const message = composer.trim();
    if (busy || !application || !activeSession || !message) return;
    setComposer("");
    void run(
      "message",
      () => api.sendMessage(application.id, activeSession.id, message),
      async () => {
        setComposer((current) => current || message);
        const refreshed = await api.view(application.id, activeSession.id).catch(() => null);
        if (refreshed) setView(refreshed);
      },
    );
  }

  function rerunRepositoryCheck() {
    if (!application) return;
    void run("rerun", async () => {
      const next = await api.rerunRepositoryCheck(application.id);
      setSelectedCheckKey("repository-readable");
      return next;
    });
  }

  function askAboutCheck(check: GateCheck) {
    setSelectedCheckKey(null);
    setComposer(`Explain “${check.label}”, its current result, and what I can verify myself.`);
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#pi-composer")?.focus());
  }

  return (
    <main className="sg-shell">
      <header className="sg-topbar">
        <div className="sg-app-identity">
          <span className="sg-app-mark">SG</span>
          <div>
            <strong>{application?.name ?? "New application"}</strong>
            <span>Production · Application Launch</span>
          </div>
        </div>
        <div className="sg-topbar-meta">
          <span className="sg-eyebrow">Permission policy</span>
          <strong>{application ? APPROVAL_MODE_LABELS[application.approvalMode] : "Set during Start"}</strong>
          <span className={`sg-status ${view.workspace?.status === "ready" ? "ready" : "working"}`}>
            {view.workspace?.status === "ready" ? "Launch Brief ready" : "Phase 1"}
          </span>
        </div>
      </header>

      <PhaseRail checks={checks} />

      <section className="sg-workspace">
        <ChatList
          activeSessionId={view.activeSessionId}
          busy={busy !== null}
          hasApplication={application !== null}
          onCreate={createOperatorSession}
          onSelect={selectSession}
          sessions={view.sessions}
        />
        <ChatPane
          activeSession={activeSession}
          busy={busy}
          checks={checks}
          composer={composer}
          error={error}
          onArchive={archiveActiveSession}
          onComposerChange={setComposer}
          onCreateApplication={createApplication}
          onSend={sendMessage}
          view={view}
        />
        <Inspector checks={checks} onSelectCheck={setSelectedCheckKey} view={view} />
      </section>

      {selectedCheck && (
        <CheckDrawer
          busy={busy !== null}
          check={selectedCheck}
          onAsk={askAboutCheck}
          onClose={closeCheck}
          onRerun={rerunRepositoryCheck}
        />
      )}
    </main>
  );
}
