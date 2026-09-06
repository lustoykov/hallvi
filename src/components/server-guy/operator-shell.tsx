"use client";

import Link from "next/link";
import {
  CaretDown,
  Check,
  Plus,
  ShieldCheck,
  Trash,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { PiSetupStatus } from "@/server/pi-setup";
import { APPROVAL_MODES } from "@/server/types";
import type {
  ApplicationRecord,
  ChatRunSnapshot,
  GateCheck,
  PhaseOneOperatorView,
  PiRun,
  ChatMessage,
} from "@/server/types";

import { api } from "./api";
import { ChatList } from "./chat-list";
import { ChatPane } from "./chat-pane";
import { CheckDrawer } from "./check-drawer";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { Inspector } from "./inspector";
import { PhaseRail } from "./phase-rail";

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  const received = new Set(incoming.map((message) => message.id));
  return [
    ...incoming.map((message) => {
      const previous = byId.get(message.id);
      return previous && previous.revision > message.revision
        ? previous
        : message;
    }),
    ...current.filter((message) => !received.has(message.id)),
  ];
}

function readSubmission(chatId: string) {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`pi-submission:${chatId}`) ?? "null",
    );
    return value &&
      typeof value.message === "string" &&
      typeof value.key === "string"
      ? (value as { message: string; key: string })
      : null;
  } catch {
    return null;
  }
}

export function OperatorShell({
  initialView,
  initialPiSetup,
  applications,
}: {
  initialView: PhaseOneOperatorView;
  initialPiSetup: PiSetupStatus;
  applications: Pick<
    ApplicationRecord,
    "id" | "repositoryOwner" | "repositoryName"
  >[];
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [selectedCheckKey, setSelectedCheckKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [runs, setRuns] = useState<PiRun[]>([]);
  const [executions, setExecutions] = useState<ChatRunSnapshot["executions"]>(
    {},
  );
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const applicationPicker = useRef<HTMLButtonElement>(null);
  const focusComposerAfterClose = useRef(false);
  const submittingChat = useRef<string | null>(null);

  const application = view.application;
  const checks = view.checks;
  const activeChat =
    view.chats.find((chat) => chat.id === view.selectedChatId) ?? null;
  const composer = activeChat ? (drafts[activeChat.id] ?? "") : "";
  const selectedCheck =
    checks.find((check) => check.key === selectedCheckKey) ?? null;
  const closeCheck = useCallback(() => setSelectedCheckKey(null), []);
  const policy = application ? APPROVAL_MODES[application.approvalMode] : null;
  const { selection } = initialPiSetup;
  const applicationId = application?.id;
  const selectedChatId = view.selectedChatId;

  useEffect(() => {
    if (!applicationId || !selectedChatId) return;
    let active = true;
    let outcomeVersion = "";
    const stream = new EventSource(
      `/api/applications/${applicationId}/chats/${selectedChatId}/events`,
    );
    stream.onopen = () => setReconnecting(false);
    stream.onerror = () => setReconnecting(true);
    stream.onmessage = (event) => {
      if (!active) return;
      const snapshot = JSON.parse(event.data) as ChatRunSnapshot;
      setRuns(snapshot.runs);
      setExecutions(snapshot.executions ?? {});
      setView((current) =>
        current.selectedChatId === selectedChatId
          ? {
              ...current,
              messages: mergeMessages(current.messages, snapshot.messages),
              activity: snapshot.activity ?? current.activity,
            }
          : current,
      );
      const pending = readSubmission(selectedChatId);
      if (pending) {
        if (snapshot.runs.some((run) => run.requestKey === pending.key)) {
          // SSE can confirm acceptance before the POST response arrives.
          // Retire the optimistic copy as soon as durable intent is visible.
          setPendingMessage(null);
          sessionStorage.removeItem(`pi-submission:${selectedChatId}`);
          setDrafts((current) =>
            current[selectedChatId] === pending.message
              ? { ...current, [selectedChatId]: "" }
              : current,
          );
        } else if (submittingChat.current !== selectedChatId) {
          setDrafts((current) =>
            current[selectedChatId]
              ? current
              : { ...current, [selectedChatId]: pending.message },
          );
        }
      }
      const nextVersion = snapshot.runs
        .filter((run) => run.finishedAt)
        .map((run) => `${run.id}:${run.revision}`)
        .join(";");
      if (nextVersion !== outcomeVersion) {
        outcomeVersion = nextVersion;
        void api
          .view(applicationId, selectedChatId)
          .then((next) => {
            if (active)
              setView((current) =>
                current.selectedChatId === selectedChatId
                  ? {
                      ...next,
                      messages: mergeMessages(current.messages, next.messages),
                    }
                  : current,
              );
          })
          .catch(() => {
            if (active) setReconnecting(true);
          });
      }
    };
    return () => {
      active = false;
      stream.close();
    };
  }, [applicationId, selectedChatId]);

  useLayoutEffect(() => {
    if (selectedCheckKey !== null || !focusComposerAfterClose.current) return;
    focusComposerAfterClose.current = false;
    document.querySelector<HTMLTextAreaElement>("#pi-composer")?.focus();
  }, [selectedCheckKey]);

  function setComposer(value: string) {
    if (!activeChat) return;
    setDrafts((current) => ({ ...current, [activeChat.id]: value }));
  }

  // The menu lives in the top layer, so it cannot be positioned by its parent;
  // hang it under the picker.
  function positionApplicationMenu(menu: HTMLElement) {
    const anchor = applicationPicker.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = 320;
    menu.style.top = `${anchor.bottom + 6}px`;
    menu.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
    menu.style.minWidth = `${anchor.width}px`;
  }

  function applyView(next: PhaseOneOperatorView) {
    setView((current) =>
      current.selectedChatId === next.selectedChatId
        ? { ...next, messages: mergeMessages(current.messages, next.messages) }
        : next,
    );
    // The transcript is navigable state; keep it when this page is refreshed.
    const url = new URL(window.location.href);
    if (next.selectedChatId) url.searchParams.set("chat", next.selectedChatId);
    else url.searchParams.delete("chat");
    window.history.replaceState(null, "", url);
  }

  async function removeApplication() {
    if (!application || busy) return;
    setBusy("remove");
    setRemoveError(null);
    try {
      await api.removeApplication(
        application.id,
        `${application.repositoryOwner}/${application.repositoryName}`,
      );
      router.replace("/applications/new");
      router.refresh();
    } catch (caught) {
      setRemoveError(
        caught instanceof Error
          ? caught.message
          : "Could not remove this application. Try again.",
      );
      setBusy(null);
    }
  }

  // Every action asks the server for the next whole view and replaces the
  // current one.
  async function run(
    label: string,
    work: () => Promise<PhaseOneOperatorView>,
    recover?: () => Promise<void>,
  ) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      applyView(await work());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Server Guy could not complete that request.",
      );
      await recover?.();
    } finally {
      if (label === "message") {
        setPendingMessage(null);
        submittingChat.current = null;
      }
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
    if (
      busy ||
      !initialPiSetup.ready ||
      !application ||
      !activeChat ||
      !message
    )
      return;
    setPendingMessage(message);
    submittingChat.current = activeChat.id;
    setComposer("");
    const previous = readSubmission(activeChat.id);
    const key =
      previous?.message === message ? previous.key : crypto.randomUUID();
    let accepted = false;
    void run(
      "message",
      async () => {
        // Keep the key across a lost HTTP response and reload. Resubmitting the
        // same draft cannot create two accepted requests.
        sessionStorage.setItem(
          `pi-submission:${activeChat.id}`,
          JSON.stringify({ key, message }),
        );
        await api.sendMessage(application.id, activeChat.id, message, key);
        accepted = true;
        setPendingMessage(null);
        sessionStorage.removeItem(`pi-submission:${activeChat.id}`);
        return api.view(application.id, activeChat.id);
      },
      async () => {
        const snapshot = await api
          .runSnapshot(application.id, activeChat.id)
          .catch(() => null);
        accepted ||= Boolean(
          snapshot?.runs.some((run) => run.requestKey === key),
        );
        if (accepted) {
          sessionStorage.removeItem(`pi-submission:${activeChat.id}`);
          setError("Your message was saved. Reconnecting to its progress…");
        } else
          setDrafts((current) => ({
            ...current,
            [activeChat.id]: current[activeChat.id] || message,
          }));
        const refreshed = await api
          .view(application.id, activeChat.id)
          .catch(() => null);
        if (refreshed) applyView(refreshed);
      },
    );
  }

  function runAction(runId: string, action: "cancel" | "retry") {
    if (!application || !activeChat) return;
    void run(action, async () => {
      await api.runAction(application.id, activeChat.id, runId, action);
      return api.view(application.id, activeChat.id);
    });
  }

  function rerunRepositoryCheck() {
    if (!application) return;
    void run("rerun", async () => {
      const next = await api.rerunRepositoryCheck(application.id);
      setSelectedCheckKey("repository-readable");
      return activeChat && next.selectedChatId !== activeChat.id
        ? api.view(application.id, activeChat.id)
        : next;
    });
  }

  async function askAboutCheck(check: GateCheck) {
    const question = `Explain “${check.label}”, its current result, and what I can verify myself.`;
    if (application && activeChat?.archivedAt) {
      const primary = view.chats.find(
        (chat) => chat.isPrimary && !chat.archivedAt,
      );
      if (!primary) return;
      await run("chat", async () => {
        const next = await api.view(application.id, primary.id);
        setDrafts((current) => ({ ...current, [primary.id]: question }));
        return next;
      });
    } else {
      setComposer(question);
    }
    focusComposerAfterClose.current = true;
    setSelectedCheckKey(null);
  }

  return (
    <main className="sg-shell">
      <header className="sg-topbar">
        <div className="sg-app-identity">
          <Link
            className="sg-brand"
            href="/applications"
            aria-label="Server Guy, all applications"
          >
            <span className="sg-app-mark">SG</span>
          </Link>
          {/* Breadcrumb: the current application is the last crumb and doubles
              as the switcher. */}
          <div className="sg-breadcrumb">
            <Link className="sg-crumb" href="/applications">
              Applications
            </Link>
            <span aria-hidden="true" className="sg-crumb-separator">
              /
            </span>
            <button
              ref={applicationPicker}
              className="sg-application-picker"
              type="button"
              popoverTarget="application-picker"
              disabled={busy !== null}
              aria-label={`Switch application: ${application?.name}`}
            >
              <strong>{application?.name}</strong>
              <CaretDown aria-hidden="true" weight="bold" />
            </button>
            <span className="sg-environment-label">Production</span>
            <nav
              id="application-picker"
              popover="auto"
              className="sg-application-menu"
              aria-label="Applications"
              onBeforeToggle={(event) => {
                if (event.newState === "open")
                  positionApplicationMenu(event.currentTarget);
              }}
            >
              <span className="sg-eyebrow sg-application-menu-label">
                Switch application
              </span>
              {applications.map((item) => (
                <Link
                  key={item.id}
                  href={`/applications/${item.id}`}
                  aria-current={
                    item.id === application?.id ? "page" : undefined
                  }
                  onClick={(event) =>
                    event.currentTarget
                      .closest<HTMLElement>("[popover]")
                      ?.hidePopover()
                  }
                >
                  <span aria-hidden="true" className="sg-application-menu-mark">
                    {item.repositoryName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{item.repositoryName}</strong>
                    <small>
                      {item.repositoryOwner}/{item.repositoryName}
                    </small>
                  </div>
                  {item.id === application?.id && (
                    <Check aria-label="Current application" weight="bold" />
                  )}
                </Link>
              ))}
              <Link
                className="sg-application-menu-action"
                href="/applications/new"
              >
                <Plus /> Add application
              </Link>
              <hr />
              <button
                type="button"
                className="sg-remove-application"
                disabled={busy !== null}
                onClick={(event) => {
                  event.currentTarget
                    .closest<HTMLElement>("[popover]")
                    ?.hidePopover();
                  setRemoveError(null);
                  setConfirmRemove(true);
                }}
              >
                <Trash /> Remove application…
              </button>
            </nav>
          </div>
        </div>
        <div className="sg-topbar-meta">
          {policy && (
            <span
              className="sg-chip"
              title={`Permission policy · ${policy.hint}`}
            >
              <ShieldCheck aria-hidden="true" weight="bold" />
              <span>Policy</span>
              <strong>{policy.label}</strong>
            </span>
          )}
          <Link
            className="sg-chip"
            href="/setup/pi"
            title={
              initialPiSetup.ready
                ? `ChatGPT connected · ${selection.model}, ${selection.reasoningEffort} reasoning`
                : "Connect ChatGPT to chat with Server Guy"
            }
          >
            <span
              aria-hidden="true"
              className={`sg-dot${initialPiSetup.ready ? " ready" : ""}`}
            />
            {initialPiSetup.ready ? "Settings" : "Settings · Connect ChatGPT"}
          </Link>
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
          runs={runs.filter((run) => run.chatId === activeChat?.id)}
          executions={executions}
          reconnecting={reconnecting}
          onRunAction={runAction}
          onNewChat={createChat}
          view={view}
        />
        <Inspector
          checks={checks}
          onSelectCheck={setSelectedCheckKey}
          view={view}
        />
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
      {confirmRemove && application && (
        <ConfirmActionDialog
          title={`Remove ${application.name}?`}
          description="Permanently removes this application’s chats, decisions, observations, and activity from Server Guy. Your repository, other applications, and login stay unchanged. You can then add the same repository again to start fresh."
          action="Remove application"
          confirmation={`${application.repositoryOwner}/${application.repositoryName}`}
          busy={busy === "remove"}
          error={removeError}
          onCancel={() => {
            setConfirmRemove(false);
            requestAnimationFrame(() => applicationPicker.current?.focus());
          }}
          onConfirm={() => void removeApplication()}
        />
      )}
    </main>
  );
}
