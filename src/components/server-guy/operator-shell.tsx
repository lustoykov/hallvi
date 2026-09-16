"use client";

import { ArrowLeft, TerminalWindow } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Reachability } from "./deployment-prototype/page-head";

import { applicationOperations } from "@/server/operation-record";
import { stackOf } from "@/server/application-stack";
import type { ApplicationFacts } from "@/server/application-facts";

import type { PiSetupStatus } from "@/server/pi-setup";
import type {
  ApplicationRecord,
  ChatRunSnapshot,
  OperatorView,
  PiRun,
  ChatMessage,
} from "@/server/types";

import { api } from "./api";
import {
  ApplicationIdentity,
  type IdentityVariant,
} from "./application-identity";
import { ApplicationSectionView } from "./application-section-view";
import {
  applicationSections,
  hiddenSections,
  sectionFromHash,
  recordedSections,
  visibleSections,
  type ApplicationSection,
} from "./application-sections";
import { ApplicationNavigation } from "./application-navigation";
import type { DeploymentRecord } from "@/server/deployment-types";
import "./application-shell.css";
import "./views.css";
import { OperatorConsole } from "./operator-console";
import { TerminalPanel } from "./terminal/terminal-panel";
import { ChatPane, type MessageHighlight } from "./chat-pane";
import {
  conversationMarks,
  featuredOperation,
  labelOf,
  navigationIndicators,
  stepDetail,
} from "./operation-model";
import { StateChip } from "./operation-receipt";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { DemoContext } from "./external-link";
import { recordReferences } from "./record-references";

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

/**
 * When each destination was last looked at, per browser. A confirmed change
 * newer than this shows a mark until the destination is opened. A first
 * visit counts everything as seen, so old work does not glow.
 */
function readSeen(applicationId: string | undefined) {
  const all = () =>
    Object.fromEntries(
      applicationSections.map((section) => [
        section.id,
        new Date().toISOString(),
      ]),
    ) as Partial<Record<ApplicationSection, string>>;
  if (typeof window === "undefined" || !applicationId) return all();
  try {
    const stored = localStorage.getItem(`sg-seen:${applicationId}`);
    return stored
      ? (JSON.parse(stored) as Partial<Record<ApplicationSection, string>>)
      : all();
  } catch {
    return all();
  }
}

/**
 * An unsent draft, kept per conversation in this browser.
 *
 * A composer that cannot send yet points at Settings, and going there used to
 * throw the message away — the reader came back to an empty box and had to
 * remember what they were about to ask. The text stays in this tab's storage
 * under the conversation it belongs to; it is never put in a URL and never
 * sent anywhere, and it is dropped the moment the message goes.
 */
function draftKey(chatId: string) {
  return `sg-draft:${chatId}`;
}
function readDraft(chatId: string) {
  try {
    return sessionStorage.getItem(draftKey(chatId)) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(chatId: string, value: string) {
  try {
    if (value) sessionStorage.setItem(draftKey(chatId), value);
    else sessionStorage.removeItem(draftKey(chatId));
  } catch {
    /* a browser without storage simply forgets an unsent draft */
  }
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

function focusComposer() {
  requestAnimationFrame(() =>
    document.querySelector<HTMLTextAreaElement>("#pi-composer")?.focus(),
  );
}

export function OperatorShell({
  initialView,
  initialPiSetup,
  applications,
  demo = false,
  studioPort,
  identityVariant = "navigation",
}: {
  initialView: OperatorView;
  initialPiSetup: PiSetupStatus;
  applications: Pick<
    ApplicationRecord,
    "id" | "repositoryOwner" | "repositoryName"
  >[];
  /** The repository is synthetic: GitHub links are shown, never followed. */
  demo?: boolean;
  /** The Drizzle Studio `npm run dev` started on this database, if it did. */
  studioPort?: number;
  /** Where the application identity sits; the prototype compares placements. */
  identityVariant?: IdentityVariant;
}) {
  const router = useRouter();
  const [deployment] = useState<DeploymentRecord | null>(null);
  // Until the first response arrives a view cannot honestly say a resource
  // is absent, so it shows the shape of the answer instead.
  const [recordLoaded, setRecordLoaded] = useState(demo);
  const [activeSection, setActiveSection] = useState<ApplicationSection | null>(
    null,
  );
  const recordVisible = activeSection !== null;
  const [seen, setSeen] = useState<Partial<Record<ApplicationSection, string>>>(
    {},
  );
  const [seenApplicationId, setSeenApplicationId] = useState<string | null>(
    null,
  );
  const seenLoaded = seenApplicationId === initialView.application?.id;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSeen(readSeen(initialView.application?.id));
      setSeenApplicationId(initialView.application?.id ?? null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialView.application?.id]);
  const [highlight, setHighlight] = useState<MessageHighlight | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const id = initialView.application?.id;
    if (!id || !seenLoaded) return;
    try {
      localStorage.setItem(`sg-seen:${id}`, JSON.stringify(seen));
    } catch {
      /* a browser without storage simply forgets what was looked at */
    }
  }, [seen, seenLoaded, initialView.application?.id]);
  // Leaving a destination records that it was looked at; the marks derive
  // from that timestamp and the operations, and clear on their own.
  function selectSection(section: ApplicationSection | null) {
    setActiveSection((current) => {
      if (current && current !== section)
        setSeen((seen) => ({ ...seen, [current]: new Date().toISOString() }));
      return section;
    });
    const url = new URL(window.location.href);
    const hash = section ? `#${section}` : "";
    if (url.hash !== hash) {
      url.hash = hash;
      window.history.pushState(null, "", url);
    }
  }
  // Closing a destination returns to the conversation.
  function closeSection() {
    selectSection(null);
  }
  useEffect(() => {
    const restore = () =>
      setActiveSection(sectionFromHash(window.location.hash));
    const timer = window.setTimeout(restore, 0);
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);
  const [view, setView] = useState(initialView);
  /**
   * Whether a message can be sent at all. This arrives with the page, but
   * the reader may have just connected ChatGPT — in this tab or another one
   * — and the composer should not stay disabled until they think to reload.
   * Asking once when the tab comes back into view is enough.
   */
  const [connectedSince, setConnectedSince] = useState(false);
  const piReady = initialPiSetup.ready || connectedSince;
  useEffect(() => {
    if (piReady) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const status = await (
          await fetch("/api/pi/setup", { cache: "no-store" })
        ).json();
        if (!status?.ready) return;
        setConnectedSince(true);
        router.refresh();
      } catch {
        /* still disabled, and the page says why */
      }
    };
    void check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [piReady, router]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // What this browser kept while the reader was away — connecting ChatGPT,
  // for instance. Anything typed since wins over it.
  const chatIds = view.chats.map((chat) => chat.id).join(" ");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const kept: Record<string, string> = {};
      for (const id of chatIds.split(" ").filter(Boolean)) {
        const draft = readDraft(id);
        if (draft) kept[id] = draft;
      }
      setDrafts((current) => ({ ...kept, ...current }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chatIds]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [runs, setRuns] = useState<PiRun[]>([]);
  const [terminal, setTerminal] = useState({
    open: false,
    expanded: false,
    minimized: false,
  });
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const submittingChat = useRef<string | null>(null);

  const application = view.application;
  const activeChat =
    view.chats.find((chat) => chat.id === view.selectedChatId) ?? null;
  const composer = activeChat ? (drafts[activeChat.id] ?? "") : "";
  const applicationId = application?.id;
  const selectedChatId = view.selectedChatId;
  const refreshDeployment = useCallback(async () => {
    if (!applicationId || !selectedChatId || demo) return;
    setRecordLoaded(true);
    {
      const next = await api.view(applicationId, selectedChatId);
      setView((current) =>
        current.selectedChatId === next.selectedChatId
          ? {
              ...next,
              messages: mergeMessages(current.messages, next.messages),
            }
          : current,
      );
    }
  }, [applicationId, selectedChatId, demo]);
  // Whether anything is actually happening. An idle page re-read every
  // record and every execution off disk every 2.5 seconds to learn nothing,
  // for as long as the tab stayed open.
  const working =
    view.messages.some(
      (message) => message.status === "queued" || message.status === "running",
    ) ||
    (view.executions ?? []).some(
      (execution) =>
        execution.status === "running" ||
        execution.status === "awaiting-approval",
    );
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshDeployment().catch(() => setRecordLoaded(true));
    }, 0);
    // Fast while Pi is working, because that is when the page changes under
    // the reader; slow otherwise, because nothing else changes it.
    const timer = setInterval(
      () => void refreshDeployment().catch(() => undefined),
      working ? 2500 : 15_000,
    );
    return () => {
      window.clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refreshDeployment, working]);
  const references = recordReferences(view);
  const operations = useMemo(
    () => view.operations ?? applicationOperations(deployment),
    [deployment, view.operations],
  );
  const stack = useMemo(() => stackOf(deployment), [deployment]);
  // Which hideable destinations the records establish. The stack model above
  // is no longer written to, so without this every one of them stays dark
  // however much Pi records.
  // Whether the tunnel behind a private access record is still open. The
  // record is a claim about a moment; the tunnel is a process, and it dies
  // with a restart.
  //
  // It starts as "checking" rather than as "open". Starting at open meant
  // every page claimed a working way in for the frame before the answer
  // arrived — a false frame on every single load, and the loudest one, since
  // it is the link a reader is most likely to click.
  //
  // The answer is stored with the application it is about, so switching
  // applications reads as "checking" without the effect having to set state
  // on the way in — the last one's answer simply is not an answer to this
  // one's question.
  const [answered, setAnswered] = useState<{
    id: string;
    state: Reachability;
  } | null>(null);
  const applicationIdForAccess = view.application?.id;
  const reachable: Reachability =
    answered && answered.id === applicationIdForAccess
      ? answered.state
      : "checking";
  useEffect(() => {
    if (!applicationIdForAccess) return;
    let cancelled = false;
    const read = async () => {
      try {
        const response = await fetch(
          `/api/applications/${applicationIdForAccess}/access`,
        );
        if (!response.ok) return;
        const body = await response.json();
        if (cancelled) return;
        // A published address is asked the same question a tunnel is. It
        // used to be assumed open because it was public, which is the
        // unchecked claim the tunnel side exists to avoid. `open` is absent
        // only when there is no address to ask about, and then nothing is
        // offered to click either.
        setAnswered({
          id: applicationIdForAccess,
          state: body.open === false ? "closed" : "open",
        });
      } catch {
        // A page that cannot reach its own controller has louder problems,
        // and saying the tunnel is open is not one of the answers.
      }
    };
    void read();
    const timer = window.setInterval(read, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applicationIdForAccess]);

  /** Asks Pi, in the main conversation, about a way in that stopped working. */
  const askToReopen = useCallback(() => {
    const record = view.information
      ?.filter((item) => !item.retiredAt)
      .find(
        (item) => item.presentation?.content?.kind === "application-access",
      );
    const url = record?.presentation?.url ?? null;
    const content = record?.presentation?.content;
    const name = application?.name ?? "this application";
    // A published address and a tunnel fail for different reasons, so they
    // are different questions. Asking Pi to "reopen private access" for a
    // public name would have it undo the publishing.
    askInConversation(
      view.chats[0]?.id ?? null,
      content?.kind === "application-access" && content.mode === "public"
        ? `${url ?? name} is not answering. Check it from outside, find out what is broken between the name and the application, and fix it.`
        : `The tunnel to ${name} is closed${
            url ? ` — ${url} does not answer` : ""
          }. Reopen private access and tell me the URL.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.information, view.chats, application?.name]);

  const recordedHere = useMemo(
    () =>
      recordedSections(
        view.information ?? [],
        (view.secrets ?? []).some((secret) => !secret.establishedAt),
      ),
    [view.information, view.secrets],
  );
  // Facts the view already carries, refreshed by the same poll as the record,
  // under the facts a destination fetches for itself while it is open.
  const facts: ApplicationFacts = { ...view.facts };
  const [stackRevealed, setStackRevealed] = useState(false);
  // The open destination is being looked at: it never shows "updated".
  const indicators = navigationIndicators(operations, seen);
  // Browser read marks become available only after hydration. Keep the server
  // and first client render identical, and do not flash old work as new.
  if (!seenLoaded)
    for (const section of applicationSections)
      if (indicators[section.id]?.tone === "updated")
        delete indicators[section.id];
  if (activeSection && indicators[activeSection]?.tone === "updated")
    delete indicators[activeSection];
  const chatMarks = conversationMarks(operations, view.chats);
  const featured = featuredOperation(operations, activeSection, selectedChatId);

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
      setView((current) =>
        current.selectedChatId === selectedChatId
          ? {
              ...current,
              messages: mergeMessages(current.messages, snapshot.messages),
              activity: snapshot.activity ?? current.activity,
              information: snapshot.information ?? current.information,
              executions: snapshot.executions ?? current.executions,
              worker: snapshot.worker ?? current.worker,
              piActivity: snapshot.piActivity ?? current.piActivity,
              operations: snapshot.operations ?? current.operations,
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
          setDrafts((current) => {
            if (current[selectedChatId] !== pending.message) return current;
            writeDraft(selectedChatId, "");
            return { ...current, [selectedChatId]: "" };
          });
        } else if (submittingChat.current !== selectedChatId) {
          setDrafts((current) => {
            if (current[selectedChatId]) return current;
            writeDraft(selectedChatId, pending.message);
            return { ...current, [selectedChatId]: pending.message };
          });
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

  function setComposer(value: string) {
    if (!activeChat) return;
    setDrafts((current) => ({ ...current, [activeChat.id]: value }));
    writeDraft(activeChat.id, value);
  }

  function applyView(next: OperatorView) {
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
    work: () => Promise<OperatorView>,
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
    closeSection();
    if (!application || chatId === view.selectedChatId) return;
    void run("chat", () => api.view(application.id, chatId));
  }

  function createChat() {
    closeSection();
    if (!application) return;
    void run("new-chat", () => api.createChat(application.id));
  }

  // Checks the repository again after the owner changed GitHub access, and
  // keeps the conversation that is open.
  function checkRepository() {
    if (!application) return;
    const chatId = view.selectedChatId;
    void run("repository", async () => {
      const next = await api.checkRepository(application.id);
      return chatId ? api.view(application.id, chatId) : next;
    });
  }

  // A receipt link, an origin line or an Overview item opens the conversation
  // at the reply that started the work; the transcript scrolls there.
  function openConversation(chatId: string, messageId: string | null) {
    const reveal = () => {
      if (messageId)
        setHighlight((current) => ({
          messageId,
          nonce: (current?.nonce ?? 0) + 1,
        }));
    };
    closeSection();
    if (!application || chatId === view.selectedChatId) {
      reveal();
      return;
    }
    void run("chat", () => api.view(application.id, chatId)).then(reveal);
  }

  // Drafts a message in a conversation without sending it.
  function askInConversation(chatId: string | null, draft: string) {
    const target = chatId ?? view.selectedChatId;
    if (!target) {
      // Every destination's primary action goes through here. Returning
      // quietly made all of them dead buttons for an application whose only
      // conversation had been archived — the page invites the question and
      // then swallows it. Start one instead.
      if (!application) return;
      void run("chat", async () => {
        const next = await api.createChat(application.id);
        const started = next.selectedChatId;
        if (started) {
          setDrafts((current) => ({ ...current, [started]: draft }));
          writeDraft(started, draft);
        }
        return next;
      });
      closeSection();
      focusComposer();
      return;
    }
    setDrafts((current) => ({ ...current, [target]: draft }));
    writeDraft(target, draft);
    if (application && target !== view.selectedChatId)
      void run("chat", () => api.view(application.id, target));
    closeSection();
    focusComposer();
  }

  /** Appends terminal text to the main conversation's draft. Never sends. */
  function askAboutTerminalText(block: string) {
    const target = view.chats[0]?.id ?? view.selectedChatId;
    if (!target) return;
    setDrafts((current) => {
      const existing = current[target] ?? "";
      const next = existing.trim()
        ? `${existing.trimEnd()}\n\n${block}`
        : block;
      writeDraft(target, next);
      return { ...current, [target]: next };
    });
    if (application && target !== view.selectedChatId)
      void run("chat", () => api.view(application.id, target));
    focusComposer();
  }

  function archiveActiveChat() {
    if (!application || !activeChat) return;
    void run("archive", () => api.archiveChat(application.id, activeChat.id));
  }

  function sendMessage() {
    const message = composer.trim();
    if (busy || !piReady || !application || !activeChat || !message) return;
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
          setDrafts((current) => {
            const next = current[activeChat.id] || message;
            writeDraft(activeChat.id, next);
            return { ...current, [activeChat.id]: next };
          });
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

  const identity = (
    <ApplicationIdentity
      variant={identityVariant}
      application={application}
      applications={applications}
      menuId="application-picker"
      hrefFor={(item) => `/applications/${item.id}`}
      addHref="/applications/new"
      disabled={busy !== null}
      onRemove={() => {
        setRemoveError(null);
        setConfirmRemove(true);
      }}
    />
  );
  // The top bar says where you are: the open destination, or the
  // conversation you are in when none is.
  const where = activeSection
    ? { title: labelOf(activeSection), detail: null as string | null }
    : {
        title: activeChat?.title ?? "Conversation",
        detail: activeChat?.archivedAt ? "Archived" : null,
      };
  return (
    <DemoContext.Provider value={demo}>
      <main
        className="sg-shell sg-adaptive-shell"
        data-terminal={terminal.open ? "open" : undefined}
      >
        <header className="sg-topbar">
          {identityVariant !== "navigation" && identity}
          <div className="sg-topbar-where">
            <strong>{where.title}</strong>
            {where.detail && <span>{where.detail}</span>}
          </div>
          {activeSection && featured && (
            <button
              type="button"
              className="sg-workstrip"
              onClick={() =>
                featured.origin
                  ? openConversation(
                      featured.origin.chatId,
                      featured.origin.messageId,
                    )
                  : selectSection(featured.destinations[0])
              }
              aria-label={`Active work: ${featured.title}`}
            >
              <StateChip state={featured.state} detail={stepDetail(featured)} />
              <span>{featured.title}</span>
            </button>
          )}
          {applicationId && (
            <button
              type="button"
              className="sg-topbar-terminal"
              aria-pressed={terminal.open}
              onClick={() =>
                setTerminal((current) =>
                  current.open
                    ? { open: false, expanded: false, minimized: false }
                    : { open: true, expanded: false, minimized: false },
                )
              }
            >
              <TerminalWindow weight="bold" aria-hidden="true" />
              Terminal
            </button>
          )}
          {/* Development only, in their own tabs: Pi's recorded conversation
              for the chat you are reading, from the read-only viewer of
              `npm run inspect:conversation`, and this application's database
              in the Drizzle Studio that `npm run dev` started beside it.
              Studio has no address for a table or a row, so it opens whole
              and you find the application inside it. */}
          {process.env.NODE_ENV === "development" && applicationId && (
            <span className="sg-topbar-debug">
              {activeChat && (
                <a
                  href={`http://127.0.0.1:3001/?application=${applicationId}&chat=${activeChat.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Pi's recorded conversation, in the local viewer on port 3001"
                >
                  Transcript
                </a>
              )}
              {studioPort && (
                <a
                  href={`https://local.drizzle.studio/?port=${studioPort}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`This application's database, in the Drizzle Studio on port ${studioPort}`}
                >
                  Database
                </a>
              )}
            </span>
          )}
        </header>

        <ApplicationNavigation
          head={identityVariant === "navigation" ? identity : undefined}
          chats={view.chats}
          selectedChatId={view.selectedChatId}
          section={activeSection}
          busy={busy !== null}
          onSection={selectSection}
          onChat={selectChat}
          onCreate={createChat}
          indicators={indicators}
          chatMarks={chatMarks}
          sections={visibleSections(
            stack,
            activeSection,
            facts,
            Boolean(deployment?.serverId),
            recordedHere,
          )}
          hidden={hiddenSections(
            stack,
            activeSection,
            facts,
            Boolean(deployment?.serverId),
            recordedHere,
          )}
          revealed={stackRevealed}
          onReveal={setStackRevealed}
        />
        <section
          className={`sg-workspace${recordVisible ? " sg-dashboard-open" : ""}`}
        >
          {activeSection && (
            <ApplicationSectionView
              key={`${applicationId}:${activeSection}`}
              section={activeSection}
              view={view}
              reachable={reachable}
              onReopen={askToReopen}
              deployment={deployment}
              stack={stack}
              operations={operations}
              now={now}
              loading={!recordLoaded}
              facts={facts}
              onRefresh={refreshDeployment}
              onOpenDestination={selectSection}
              onOpenConversation={openConversation}
              onAsk={askInConversation}
              onRevealStack={() => setStackRevealed(true)}
              bar={
                <div className="sg-view-bar">
                  <button
                    type="button"
                    className="sg-view-back"
                    onClick={closeSection}
                  >
                    <ArrowLeft aria-hidden="true" />
                    Back to {activeChat?.title ?? "the conversation"}
                  </button>
                  {featured &&
                    !featured.destinations.includes(activeSection) && (
                      <button
                        type="button"
                        className="sg-suggest"
                        onClick={() => selectSection(featured.destinations[0])}
                      >
                        Server Guy is in {labelOf(featured.destinations[0])} ·
                        show
                      </button>
                    )}
                </div>
              }
            >
              {activeSection === "logs" && applicationId && (
                <OperatorConsole
                  applicationId={applicationId}
                  chatId={view.chats[0]?.id ?? ""}
                  main={false}
                />
              )}
            </ApplicationSectionView>
          )}
          <div
            className={`sg-chat-column${recordVisible ? " sg-chat-parked" : ""}`}
            inert={recordVisible || undefined}
          >
            {application &&
              view.repository &&
              view.repository.status !== "passed" && (
                <div className="sg-repository-notice" role="status">
                  <p>
                    <strong>Repository access:</strong> {view.repository.result}
                  </p>
                  {view.repository.connected ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={checkRepository}
                    >
                      {busy === "repository" ? "Checking…" : "Check again"}
                    </button>
                  ) : (
                    <Link href="/setup/github">Connect GitHub</Link>
                  )}
                </div>
              )}
            <ChatPane
              activeChat={activeChat}
              reachable={reachable}
              busy={busy}
              composer={composer}
              error={error}
              pendingMessage={pendingMessage}
              piReady={piReady}
              onArchive={archiveActiveChat}
              onComposerChange={setComposer}
              onSend={sendMessage}
              runs={runs.filter((run) => run.chatId === activeChat?.id)}
              reconnecting={reconnecting}
              workerAlive={view.worker?.alive}
              onRunAction={runAction}
              onNewChat={createChat}
              onReveal={() => selectSection("history")}
              references={references}
              view={view}
              operations={operations}
              now={now}
              onOpenDestination={selectSection}
              onOpenConversation={openConversation}
              highlight={highlight}
            />
          </div>
        </section>

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
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLButtonElement>(
                    '[popovertarget="application-picker"]',
                  )
                  ?.focus(),
              );
            }}
            onConfirm={() => void removeApplication()}
          />
        )}
        {applicationId && (
          <TerminalPanel
            applicationId={applicationId}
            open={terminal.open}
            expanded={terminal.expanded}
            minimized={terminal.minimized}
            piBusy={runs.some((item) =>
              ["queued", "running"].includes(item.status),
            )}
            onClose={() =>
              setTerminal({ open: false, expanded: false, minimized: false })
            }
            onToggleExpanded={() =>
              setTerminal((current) => ({
                ...current,
                expanded: !current.expanded,
              }))
            }
            onToggleMinimized={() =>
              setTerminal((current) => ({
                ...current,
                minimized: !current.minimized,
              }))
            }
            onAskAboutSelection={askAboutTerminalText}
          />
        )}
      </main>
    </DemoContext.Provider>
  );
}
