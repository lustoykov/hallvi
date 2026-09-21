"use client";

import { PulseContext, QUIET_PULSE, type Pulse } from "./pulse";
import { ArrowLeft, TerminalWindow } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Reachability } from "./deployment-prototype/page-head";

import type { ApplicationFacts } from "@/server/application-facts";

import type { PiSetupStatus } from "@/server/pi-setup";
import type {
  ApplicationRecord,
  ChatSnapshot,
  OperatorView,
} from "@/server/types";

import { api } from "./api";
import {
  ApplicationIdentity,
  type IdentityVariant,
} from "./application-identity";
import { ApplicationSectionView } from "./application-section-view";
import {
  hiddenSections,
  sectionFromHash,
  recordedSections,
  visibleSections,
  type ApplicationSection,
} from "./application-sections";
import { ApplicationNavigation } from "./application-navigation";
import "./application-shell.css";
import "./views.css";
import { OperatorConsole } from "./operator-console";
import { TerminalPanel } from "./terminal/terminal-panel";
import { ChatPane, type MessageHighlight } from "./chat-pane";
import { labelOf } from "./operation-model";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { RenameApplicationDialog } from "./rename-application-dialog";
import { DemoContext } from "./external-link";
import {
  acceptedDraftCanClear,
  clearPendingSubmission,
  readConversationContext,
  readConversationDraft,
  readPendingSubmission,
  sectionContext,
  writeConversationContext,
  writeConversationDraft,
  writePendingSubmission,
  type ConversationContext,
} from "./conversation-continuity";

/**
 * An unsent draft, kept per conversation in this browser.
 *
 * A composer that cannot send yet points at Settings, and going there used to
 * throw the message away — the reader came back to an empty box and had to
 * remember what they were about to ask. The text stays in this tab's storage
 * under the conversation it belongs to; it is never put in a URL and never
 * sent anywhere, and it is dropped the moment the message goes.
 */
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
  // Until the first response arrives a view cannot honestly say a resource
  // is absent, so it shows the shape of the answer instead.
  const [activeSection, setActiveSection] = useState<ApplicationSection | null>(
    null,
  );
  const recordVisible = activeSection !== null;
  const [highlight, setHighlight] = useState<MessageHighlight | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  function selectSection(section: ApplicationSection | null) {
    setActiveSection(section);
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
    focusComposer();
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
  const [contexts, setContexts] = useState<
    Record<string, ConversationContext | null>
  >({});
  // What this browser kept while the reader was away — connecting ChatGPT,
  // for instance. Anything typed since wins over it.
  const chatIds = view.chats.map((chat) => chat.id).join(" ");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const kept: Record<string, string> = {};
      const restoredContexts: Record<string, ConversationContext | null> = {};
      const appId = initialView.application?.id;
      for (const id of chatIds.split(" ").filter(Boolean)) {
        if (!appId) continue;
        const draft = readConversationDraft(appId, id);
        if (draft) kept[id] = draft;
        restoredContexts[id] = readConversationContext(appId, id);
      }
      setDrafts((current) => ({ ...kept, ...current }));
      setContexts((current) => ({ ...restoredContexts, ...current }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chatIds, initialView.application?.id]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
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
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const submittingChat = useRef<string | null>(null);
  const submittingKey = useRef<string | null>(null);
  const editedAfterSubmission = useRef(new Set<string>());

  const application = view.application;
  const activeChat =
    view.chats.find((chat) => chat.id === view.selectedChatId) ?? null;
  const composer = activeChat ? (drafts[activeChat.id] ?? "") : "";
  const applicationId = application?.id;
  const selectedChatId = view.selectedChatId;
  const refreshDeployment = useCallback(async () => {
    if (!applicationId || !selectedChatId || demo) return;
    {
      const next = await api.view(applicationId, selectedChatId);
      setView((current) =>
        current.selectedChatId === next.selectedChatId ? next : current,
      );
    }
  }, [applicationId, selectedChatId, demo]);
  // Whether anything is actually happening. An idle page re-read every
  // record and every execution off disk every 2.5 seconds to learn nothing,
  // for as long as the tab stayed open.
  const working =
    view.messages.some(
      (message) => message.status === "waiting" || message.status === "running",
    ) ||
    (view.executions ?? []).some(
      (execution) =>
        execution.status === "running" ||
        execution.status === "awaiting-approval",
    );
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshDeployment().catch(() => undefined);
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
  // Which hideable destinations the records establish.
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
    pulse: Pulse;
  } | null>(null);
  const applicationIdForAccess = view.application?.id;
  const reachable: Reachability =
    answered && answered.id === applicationIdForAccess
      ? answered.state
      : "checking";
  const pulse: Pulse =
    answered && answered.id === applicationIdForAccess
      ? answered.pulse
      : QUIET_PULSE;
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
          // Stricter than `state`: only an address that was asked and
          // answered vouches for anything. No address at all is `unknown`.
          pulse: {
            app:
              body.open === true
                ? "answering"
                : body.open === false
                  ? "silent"
                  : "unknown",
            server: body.server ?? "unknown",
          },
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
      const snapshot = JSON.parse(event.data) as ChatSnapshot;
      setView((current) =>
        current.selectedChatId === selectedChatId
          ? {
              ...current,
              messages: snapshot.messages,
              information: snapshot.information,
              executions: snapshot.executions,
              worker: snapshot.worker,
              piActivity: snapshot.piActivity,
            }
          : current,
      );
      const pending = readPendingSubmission(applicationId, selectedChatId);
      if (pending) {
        if (snapshot.messages.some((sent) => sent.requestKey === pending.key)) {
          // SSE can confirm acceptance before the POST response arrives.
          // Retire the optimistic copy as soon as durable intent is visible.
          setPendingMessage(null);
          clearPendingSubmission(applicationId, selectedChatId);
          setDrafts((current) => {
            const latest = current[selectedChatId] ?? "";
            if (
              !acceptedDraftCanClear(
                latest,
                pending.message,
                editedAfterSubmission.current.has(pending.key),
              )
            )
              return current;
            writeConversationDraft(applicationId, selectedChatId, "");
            return { ...current, [selectedChatId]: "" };
          });
        } else if (submittingChat.current !== selectedChatId) {
          setDrafts((current) => {
            if (current[selectedChatId]) return current;
            writeConversationDraft(
              applicationId,
              selectedChatId,
              pending.message,
            );
            return { ...current, [selectedChatId]: pending.message };
          });
        }
      }
      const nextVersion = snapshot.messages
        .filter((settled) => settled.finishedAt)
        .map((settled) => `${settled.id}:${settled.revision}`)
        .join(";");
      if (nextVersion !== outcomeVersion) {
        outcomeVersion = nextVersion;
        void api
          .view(applicationId, selectedChatId)
          .then((next) => {
            if (active)
              setView((current) =>
                current.selectedChatId === selectedChatId ? next : current,
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
    if (!activeChat || !applicationId) return;
    const pending = readPendingSubmission(applicationId, activeChat.id);
    const pendingKey =
      pending?.key ??
      (submittingChat.current === activeChat.id ? submittingKey.current : null);
    if (pendingKey) editedAfterSubmission.current.add(pendingKey);
    setDrafts((current) => ({ ...current, [activeChat.id]: value }));
    writeConversationDraft(applicationId, activeChat.id, value);
  }

  function applyView(next: OperatorView) {
    setView(next);
    // The transcript is navigable state; keep it when this page is refreshed.
    const url = new URL(window.location.href);
    if (next.selectedChatId) url.searchParams.set("chat", next.selectedChatId);
    else url.searchParams.delete("chat");
    window.history.replaceState(null, "", url);
  }

  async function renameApplication(name: string) {
    if (!application || busy) return;
    setBusy("rename");
    setRenameError(null);
    try {
      await api.renameApplication(application.id, name);
      setRenaming(false);
      setBusy(null);
      router.refresh();
      if (activeChat) applyView(await api.view(application.id, activeChat.id));
    } catch (caught) {
      setRenameError(
        caught instanceof Error ? caught.message : "Could not rename it.",
      );
      setBusy(null);
    }
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
          : "Hallvi could not complete that request.",
      );
      await recover?.();
    } finally {
      if (label === "message") {
        setPendingMessage(null);
        submittingChat.current = null;
        submittingKey.current = null;
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
  function askInConversation(
    chatId: string | null,
    draft: string,
    section: ApplicationSection | null = activeSection,
  ) {
    if (!application) return;
    const target = chatId ?? view.selectedChatId;
    if (!target) {
      // Every destination's primary action goes through here. Returning
      // quietly made all of them dead buttons for an application whose only
      // conversation had been archived — the page invites the question and
      // then swallows it. Start one instead.
      void run("chat", async () => {
        const next = await api.createChat(application.id);
        const started = next.selectedChatId;
        if (started) {
          setDrafts((current) => ({ ...current, [started]: draft }));
          writeConversationDraft(application.id, started, draft);
          if (section) {
            const context = sectionContext(section);
            setContexts((current) => ({ ...current, [started]: context }));
            writeConversationContext(application.id, started, context);
          }
        }
        return next;
      });
      closeSection();
      focusComposer();
      return;
    }
    setDrafts((current) => {
      // A destination may suggest a useful question, but text the owner has
      // already written wins. The context chip still arrives and explains
      // where they came from without rewriting their words.
      const existing =
        current[target] ?? readConversationDraft(application.id, target);
      if (existing.trim()) return { ...current, [target]: existing };
      writeConversationDraft(application.id, target, draft);
      return { ...current, [target]: draft };
    });
    if (section) {
      const context = sectionContext(section);
      setContexts((current) => ({ ...current, [target]: context }));
      writeConversationContext(application.id, target, context);
    }
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
      if (application) writeConversationDraft(application.id, target, next);
      return { ...current, [target]: next };
    });
    if (application && target !== view.selectedChatId)
      void run("chat", () => api.view(application.id, target));
    focusComposer();
  }

  function archiveChat(chatId: string) {
    if (!application) return;
    void run("archive", async () => {
      const next = await api.archiveChat(application.id, chatId);
      // A sidebar action on another conversation must not navigate away from
      // the conversation being read. Archiving the active chat returns home.
      return view.selectedChatId && view.selectedChatId !== chatId
        ? api.view(application.id, view.selectedChatId)
        : next;
    });
  }

  function archiveActiveChat() {
    if (activeChat) archiveChat(activeChat.id);
  }

  /** `told` is a message a card sends for the owner; the draft is kept. */
  function sendMessage(told?: string, delivery: "next" | "steer" = "next") {
    const message = (told ?? composer).trim();
    if (!message) return;
    if (busy || !piReady || !application || !activeChat) {
      // Not sendable right now: leave it where the owner can send it.
      if (told) setComposer(told);
      return;
    }
    setPendingMessage(message);
    submittingChat.current = activeChat.id;
    // Clear the field optimistically, but keep its durable copy until the
    // server accepts it. Text typed after this point is a newer draft and
    // wins in both React state and storage.
    if (!told) setDrafts((current) => ({ ...current, [activeChat.id]: "" }));
    const previous = readPendingSubmission(application.id, activeChat.id);
    const key =
      previous?.message === message ? previous.key : crypto.randomUUID();
    submittingKey.current = key;
    editedAfterSubmission.current.delete(key);
    if (told) editedAfterSubmission.current.add(key);
    const context = contexts[activeChat.id];
    const draftContext = told || context?.requestKey ? null : context;
    if (draftContext) {
      const sentContext = { ...draftContext, requestKey: key };
      setContexts((current) => ({
        ...current,
        [activeChat.id]: sentContext,
      }));
      writeConversationContext(application.id, activeChat.id, sentContext);
    }
    let accepted = false;
    void run(
      "message",
      async () => {
        // Keep the key across a lost HTTP response and reload. Resubmitting the
        // same draft cannot create two accepted requests.
        writePendingSubmission(application.id, activeChat.id, {
          message,
          key,
        });
        await api.sendMessage(
          application.id,
          activeChat.id,
          message,
          key,
          delivery,
        );
        accepted = true;
        setPendingMessage(null);
        clearPendingSubmission(application.id, activeChat.id);
        setDrafts((current) => {
          if (
            !acceptedDraftCanClear(
              current[activeChat.id] ?? "",
              message,
              editedAfterSubmission.current.has(key),
            )
          )
            return current;
          writeConversationDraft(application.id, activeChat.id, "");
          return current;
        });
        return api.view(application.id, activeChat.id);
      },
      async () => {
        const snapshot = await api
          .runSnapshot(application.id, activeChat.id)
          .catch(() => null);
        accepted ||= Boolean(
          snapshot?.messages.some((sent) => sent.requestKey === key),
        );
        if (accepted) {
          clearPendingSubmission(application.id, activeChat.id);
          setDrafts((current) => {
            if (
              !acceptedDraftCanClear(
                current[activeChat.id] ?? "",
                message,
                editedAfterSubmission.current.has(key),
              )
            )
              return current;
            writeConversationDraft(application.id, activeChat.id, "");
            return current;
          });
          setError("Your message was saved. Reconnecting to its progress…");
        } else {
          if (draftContext) {
            setContexts((current) => ({
              ...current,
              [activeChat.id]: draftContext,
            }));
            writeConversationContext(
              application.id,
              activeChat.id,
              draftContext,
            );
          }
          setDrafts((current) => {
            const next = current[activeChat.id] || message;
            writeConversationDraft(application.id, activeChat.id, next);
            return { ...current, [activeChat.id]: next };
          });
        }
        const refreshed = await api
          .view(application.id, activeChat.id)
          .catch(() => null);
        if (refreshed) applyView(refreshed);
      },
    );
  }

  function stopConversation() {
    if (!application || !activeChat) return;
    void run("stop", async () => {
      await api.stopConversation(application.id, activeChat.id);
      return api.view(application.id, activeChat.id);
    });
  }

  function continueConversation() {
    if (!application || !activeChat) return;
    void run("continue", async () => {
      await api.continueConversation(application.id, activeChat.id);
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
      onRename={() => {
        setRenameError(null);
        setRenaming(true);
      }}
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
      <PulseContext.Provider value={pulse}>
        <main
          className="hv-shell hv-adaptive-shell"
          data-terminal={terminal.open ? "open" : undefined}
        >
          <header className="hv-topbar">
            {identityVariant !== "navigation" && identity}
            <div className="hv-topbar-where">
              <strong>{where.title}</strong>
              {where.detail && <span>{where.detail}</span>}
            </div>
            {applicationId && (
              <button
                type="button"
                className="hv-topbar-terminal"
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
              <span className="hv-topbar-debug">
                {process.env.NEXT_PUBLIC_HALLVI_DASHBOARD_PORT && (
                  <a
                    href={`http://127.0.0.1:${process.env.NEXT_PUBLIC_HALLVI_DASHBOARD_PORT}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Tests, development state, and releases in this checkout's dashboard"
                  >
                    Developer
                  </a>
                )}
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
            settingsHref={
              applicationId && view.selectedChatId
                ? `/setup/connections?application=${applicationId}&chat=${view.selectedChatId}`
                : "/setup/connections"
            }
            section={activeSection}
            busy={busy !== null}
            onSection={selectSection}
            onChat={selectChat}
            onCreate={createChat}
            onArchive={archiveChat}
            sections={visibleSections(activeSection, recordedHere)}
            hidden={hiddenSections(activeSection, recordedHere)}
            revealed={stackRevealed}
            onReveal={setStackRevealed}
          />
          <section
            className={`hv-workspace${recordVisible ? " hv-dashboard-open" : ""}`}
          >
            {activeSection && (
              <ApplicationSectionView
                key={`${applicationId}:${activeSection}`}
                section={activeSection}
                view={view}
                reachable={reachable}
                onReopen={askToReopen}
                now={now}
                facts={facts}
                onRefresh={refreshDeployment}
                onOpenDestination={selectSection}
                onOpenConversation={openConversation}
                onAsk={askInConversation}
                bar={
                  <div className="hv-view-bar">
                    <button
                      type="button"
                      className="hv-view-back"
                      onClick={closeSection}
                    >
                      <ArrowLeft aria-hidden="true" />
                      Back to {activeChat?.title ?? "the conversation"}
                    </button>
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
              className={`hv-chat-column${recordVisible ? " hv-chat-parked" : ""}`}
              inert={recordVisible || undefined}
            >
              <ChatPane
                onModelConnected={() => setConnectedSince(true)}
                checkingRepository={busy === "repository"}
                onCheckRepository={checkRepository}
                activeChat={activeChat}
                reachable={reachable}
                busy={busy}
                composer={composer}
                context={activeChat ? (contexts[activeChat.id] ?? null) : null}
                error={error}
                pendingMessage={pendingMessage}
                piReady={piReady}
                onArchive={archiveActiveChat}
                onComposerChange={setComposer}
                onDismissContext={() => {
                  if (!activeChat || !application) return;
                  setContexts((current) => ({
                    ...current,
                    [activeChat.id]: null,
                  }));
                  writeConversationContext(application.id, activeChat.id, null);
                  focusComposer();
                }}
                onReturnToContext={(section) => {
                  selectSection(section);
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLButtonElement>(
                        '.hv-application-navigation button[aria-current="page"]',
                      )
                      ?.focus({ preventScroll: true }),
                  );
                }}
                onSend={(delivery) => sendMessage(undefined, delivery)}
                onTell={(told) => sendMessage(told)}
                reconnecting={reconnecting}
                workerAlive={view.worker?.alive}
                onStop={stopConversation}
                onContinue={continueConversation}
                onNewChat={createChat}
                view={view}
                now={now}
                onOpenDestination={selectSection}
                highlight={highlight}
              />
            </div>
          </section>

          {renaming && application && (
            <RenameApplicationDialog
              current={application.name}
              busy={busy === "rename"}
              error={renameError}
              onCancel={() => setRenaming(false)}
              onRename={(name) => void renameApplication(name)}
            />
          )}
          {confirmRemove && application && (
            <ConfirmActionDialog
              title={`Remove ${application.name}?`}
              description="Permanently removes this application’s chats, decisions, observations, and activity from Hallvi. Your repository, other applications, and login stay unchanged. You can then add the same repository again to start fresh."
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
              piBusy={view.messages.some((item) =>
                ["waiting", "running"].includes(item.status),
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
      </PulseContext.Provider>
    </DemoContext.Provider>
  );
}
