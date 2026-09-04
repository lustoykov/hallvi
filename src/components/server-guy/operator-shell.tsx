"use client";

import Link from "next/link";
import { CaretDown, Check, Plus, Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import type { PiSetupStatus } from "@/server/pi-setup";
import { APPROVAL_MODES } from "@/server/types";
import type { ApplicationRecord, GateCheck, PhaseOneOperatorView } from "@/server/types";

import { api } from "./api";
import { ChatList } from "./chat-list";
import { ChatPane } from "./chat-pane";
import { CheckDrawer } from "./check-drawer";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { Inspector } from "./inspector";
import { PhaseRail } from "./phase-rail";

export function OperatorShell({
  initialView,
  initialPiSetup,
  applications,
}: {
  initialView: PhaseOneOperatorView;
  initialPiSetup: PiSetupStatus;
  applications: Pick<ApplicationRecord, "id" | "repositoryOwner" | "repositoryName">[];
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [selectedCheckKey, setSelectedCheckKey] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const applicationPicker = useRef<HTMLButtonElement>(null);

  const application = view.application;
  const checks = view.checks;
  const activeChat = view.chats.find((chat) => chat.id === view.selectedChatId) ?? null;
  const selectedCheck = checks.find((check) => check.key === selectedCheckKey) ?? null;
  const closeCheck = useCallback(() => setSelectedCheckKey(null), []);

  async function removeApplication() {
    if (!application || busy) return;
    setBusy("remove"); setRemoveError(null);
    try {
      await api.removeApplication(application.id, `${application.repositoryOwner}/${application.repositoryName}`);
      router.replace("/applications/new");
      router.refresh();
    } catch (caught) {
      setRemoveError(caught instanceof Error ? caught.message : "Could not remove this application. Try again.");
      setBusy(null);
    }
  }

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
      if (label === "message") setPendingMessage(null);
      setBusy(null);
    }
  }

  function selectChat(chatId: string) {
    if (!application || chatId === view.selectedChatId) return;
    void run("chat", () => api.view(application.id, chatId));
  }

  function createChat() {
    if (!application) return;
    void run("new-chat", () => api.createChat(application.id));
  }

  function archiveActiveChat() {
    if (!application || !activeChat || activeChat.isPrimary) return;
    void run("archive", () => api.archiveChat(application.id, activeChat.id));
  }

  function sendMessage() {
    const message = composer.trim();
    if (busy || !initialPiSetup.ready || !application || !activeChat || !message) return;
    setPendingMessage(message);
    setComposer("");
    void run(
      "message",
      () => api.sendMessage(application.id, activeChat.id, message),
      async () => {
        setComposer((current) => current || message);
        const refreshed = await api.view(application.id, activeChat.id).catch(() => null);
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
          <Link className="sg-all-applications" href="/applications">All applications</Link>
          <button ref={applicationPicker} className="sg-application-picker" type="button" popoverTarget="application-picker" disabled={busy !== null} aria-label={`Switch application: ${application?.name}`}>
            <strong>{application?.name}</strong><CaretDown aria-hidden="true" />
          </button>
          <span className="sg-environment-label">Production</span>
          <nav id="application-picker" popover="auto" className="sg-application-menu" aria-label="Applications">
            <h2>Switch application</h2>
            {applications.map((item) => <Link key={item.id} href={`/applications/${item.id}`} aria-current={item.id === application?.id ? "page" : undefined} onClick={(event) => event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover()}>
              <div><strong>{item.repositoryName}</strong><small>{item.repositoryOwner}/{item.repositoryName}</small></div>
              {item.id === application?.id && <Check aria-label="Current application" />}
            </Link>)}
            <Link className="sg-application-menu-action" href="/applications/new"><Plus /> Add application</Link>
            <button type="button" className="sg-remove-application" disabled={busy !== null} onClick={(event) => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); setRemoveError(null); setConfirmRemove(true); }}><Trash /> Remove application…</button>
          </nav>
        </div>
        <div className="sg-topbar-meta">
          <Link
            className={`sg-pi-status ${initialPiSetup.ready ? "ready" : "attention"}`}
            href="/setup/pi"
          >
            <span aria-hidden="true" />
            {initialPiSetup.ready ? "Settings" : "Settings · Connect ChatGPT"}
          </Link>
          <span className="sg-eyebrow">Permission policy</span>
          <strong>{application ? APPROVAL_MODES[application.approvalMode].label : "Set during Start"}</strong>
          <span className={`sg-status ${view.workspace?.status === "ready" ? "ready" : "working"}`}>
            {view.workspace?.status === "ready" ? "Launch Brief ready" : "Phase 1"}
          </span>
        </div>
      </header>

      <PhaseRail checks={checks} />

      <section className="sg-workspace">
        <ChatList
          busy={busy !== null}
          chats={view.chats}
          hasApplication={application !== null}
          onCreate={createChat}
          onSelect={selectChat}
          selectedChatId={view.selectedChatId}
        />
        <ChatPane
          activeChat={activeChat}
          busy={busy}
          composer={composer}
          error={error}
          pendingMessage={pendingMessage}
          piReady={initialPiSetup.ready}
          onArchive={archiveActiveChat}
          onComposerChange={setComposer}
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
      {confirmRemove && application && <ConfirmActionDialog
        title={`Remove ${application.name}?`}
        description="Permanently removes this application’s chats, decisions, observations, and activity from Server Guy. Your repository, other applications, and login stay unchanged. You can then add the same repository again to start fresh."
        action="Remove application"
        confirmation={`${application.repositoryOwner}/${application.repositoryName}`}
        busy={busy === "remove"}
        error={removeError}
        onCancel={() => { setConfirmRemove(false); requestAnimationFrame(() => applicationPicker.current?.focus()); }}
        onConfirm={() => void removeApplication()}
      />}
    </main>
  );
}
