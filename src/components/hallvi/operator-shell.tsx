"use client";

import { PulseContext } from "./pulse";
import { ReconnectActionContext } from "./reconnect-action";
import {
  reconnectProgress,
  reconnectReference,
  reconnectRequest,
} from "./reconnect-request";
import { ArrowLeft, TerminalWindow } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { currentAccessRecord } from "@/server/access-record";
import {
  applyChatFrame,
  initialChatBaseline,
  keepUnchanged,
  type ChatFrame,
} from "@/lib/chat-stream";
import { useAccessObservation } from "./use-access-observation";

import type { ApplicationFacts } from "@/server/application-facts";

import type { PiSetupStatus } from "@/server/pi-setup";
import type {
  ApplicationRecord,
  ChatSnapshot,
  OperatorMetadata,
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
  standings,
  visibleSections,
  type ApplicationSection,
} from "./application-sections";
import { ApplicationNavigation } from "./application-navigation";
import { useTrafficListed } from "./traffic/source";
import "./application-shell.css";
import "./views.css";
import { OperatorConsole } from "./operator-console";
import { TerminalPanel } from "./terminal/terminal-panel";
import { ChatPane, type MessageHighlight } from "./chat-pane";
import { labelOf } from "./operation-model";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { RenameApplicationDialog } from "./rename-application-dialog";
import { DemoContext } from "./external-link";
import type { ImageAttachment } from "./message-images";
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

/** A periodic read that says the same thing should leave the page alone. */
export function mergeOperatorMetadata(
  current: OperatorView,
  next: OperatorMetadata,
): OperatorView {
  const changed = Object.entries(next).filter(
    ([key, value]) =>
      JSON.stringify(value) !==
      JSON.stringify(current[key as keyof OperatorMetadata]),
  );
  return changed.length
    ? { ...current, ...Object.fromEntries(changed) }
    : current;
}

export function OperatorShell({
  initialView,
  initialPiSetup,
  applications,
  demo = false,
  studioPort,
  identityVariant = "navigation",
}: {
  /**
   * The view the page opens on, as JSON. A long conversation is megabytes of
   * records, and as a prop each of them is encoded by the server and rebuilt
   * here one value at a time. As one string it is copied and parsed once.
   */
  initialView: string;
  initialPiSetup: PiSetupStatus;
  applications: Pick<
    ApplicationRecord,
    "id" | "name" | "repositoryOwner" | "repositoryName"
  >[];
  /** The repository is synthetic: GitHub links are shown, never followed. */
  demo?: boolean;
  /** The Drizzle Studio `npm run dev` started on this database, if it did. */
  studioPort?: number;
  /** Where the application identity sits; the prototype compares placements. */
  identityVariant?: IdentityVariant;
}) {
  const router = useRouter();
  const [view, setView] = useState(
    () => JSON.parse(initialView) as OperatorView,
  );
  // A plain application link opens Overview; conversation and destination
  // links restore their explicit selection below.
  const [activeSection, setActiveSection] = useState<ApplicationSection | null>(
    "overview",
  );
  const recordVisible = activeSection !== null;
  const [highlight, setHighlight] = useState<MessageHighlight | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  function selectSection(section: ApplicationSection | null) {
    const initiatingControl = document.activeElement;
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.hash = section ? `#${section}` : "";
    if (!section) url.searchParams.set("chat", view.selectedChatId ?? "");
    if (url.href !== window.location.href) {
      window.history.pushState(null, "", url);
    }
    if (section)
      requestAnimationFrame(() => {
        // A button inside the previous destination goes away with that page.
        // Sidebar controls stay mounted and keep their ordinary keyboard focus.
        if (initiatingControl?.isConnected) return;
        const heading = document.querySelector<HTMLHeadingElement>(
          ".hv-workspace h1, .hv-workspace h2",
        );
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      });
  }
  // Closing a destination returns to the conversation.
  function closeSection() {
    selectSection(null);
    focusComposer();
  }
  useEffect(() => {
    const restore = () => {
      const url = new URL(window.location.href);
      const hash = url.hash;
      const section = sectionFromHash(hash);
      const conversation =
        hash.startsWith("#record-") ||
        (!hash &&
          (url.searchParams.has("chat") || url.searchParams.has("message")));
      // A hash that names no page would leave the URL saying one thing and
      // the screen another. Record links (`#record-…`) belong to the chat.
      if (!section && hash && !hash.startsWith("#record-")) {
        url.hash = "#overview";
        window.history.replaceState(null, "", url);
      }
      setActiveSection(section ?? (conversation ? null : "overview"));
    };
    const timer = window.setTimeout(restore, 0);
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);
  // Consume an exact HTTP/page baseline once. Its records stay paired with
  // the fingerprint even if another action or stream changes the held view.
  const bootstrap = useRef(initialChatBaseline(view));
  /**
   * Whether a message can be sent at all. This arrives with the page, but
   * the reader may have just connected a model — in this tab or another one
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
  // What this browser kept while the reader was away — connecting a model,
  // for instance. Anything typed since wins over it.
  const chatIds = view.chats.map((chat) => chat.id).join(" ");
  const openedId = view.application?.id;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const kept: Record<string, string> = {};
      const restoredContexts: Record<string, ConversationContext | null> = {};
      const appId = openedId;
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
  }, [chatIds, openedId]);
  const [pendingMessage, setPendingMessage] = useState<{
    body: string;
    images: ImageAttachment[];
  } | null>(null);
  /** Images waiting in each conversation's composer. Kept in memory only. */
  const [attachments, setAttachments] = useState<
    Record<string, ImageAttachment[]>
  >({});
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
  const streamSnapshots = useRef(new Map<string, ChatSnapshot>());
  /** What the page holds now, for full state arriving outside a render. */
  const held = useRef(view);
  useEffect(() => {
    held.current = view;
  });

  const application = view.application;
  const activeChat =
    view.chats.find((chat) => chat.id === view.selectedChatId) ?? null;
  const composer = activeChat ? (drafts[activeChat.id] ?? "") : "";
  const attached = activeChat ? (attachments[activeChat.id] ?? []) : [];
  const applicationId = application?.id;
  const selectedChatId = view.selectedChatId;
  const refreshDeployment = useCallback(async () => {
    if (!applicationId || !selectedChatId || demo) return;
    {
      const next = await api.metadata(applicationId, selectedChatId);
      setView((current) =>
        current.application?.id === applicationId &&
        current.selectedChatId === next.selectedChatId
          ? mergeOperatorMetadata(current, next)
          : current,
      );
    }
  }, [applicationId, selectedChatId, demo]);
  // Only application metadata is polled. Conversation, execution and shared
  // information updates come through the change-driven SSE subscription.
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
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshDeployment().catch(() => undefined);
    };
    const initial = window.setTimeout(refreshIfVisible, 0);
    // Preserve the cadence of background deployment/protection facts.
    const timer = setInterval(refreshIfVisible, working ? 2500 : 15_000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refreshDeployment, working]);
  const accessRecord = currentAccessRecord(
    view.information ?? [],
    view.application?.id,
  );
  const {
    reachable,
    pulse,
    reconnectable,
    refresh: refreshAccess,
  } = useAccessObservation(view.application?.id, accessRecord);

  const mainChat = view.chats.find(
    (chat) => chat.kind === "main" && !chat.archivedAt,
  );
  const [mainSnapshot, setMainSnapshot] = useState<{
    applicationId: string;
    chatId: string;
    snapshot: ChatSnapshot;
  } | null>(null);
  const mainConversation =
    view.selectedChatId === mainChat?.id
      ? view
      : mainSnapshot &&
          mainSnapshot.applicationId === applicationId &&
          mainSnapshot.chatId === mainChat?.id
        ? mainSnapshot.snapshot
        : null;
  const progress = reconnectProgress(
    mainConversation?.messages ?? [],
    mainConversation?.executions ?? [],
    accessRecord,
  );
  const [pendingReconnect, setPendingReconnect] =
    useState<ReturnType<typeof readPendingSubmission>>(null);
  const mainChatId = mainChat?.id;
  const privateRoute =
    accessRecord?.presentation?.content?.kind === "application-access" &&
    accessRecord.presentation.content.mode === "private";
  const observedMainId = privateRoute ? mainChatId : undefined;
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setPendingReconnect(
          applicationId && mainChatId
            ? readPendingSubmission(applicationId, mainChatId)
            : null,
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [applicationId, mainChatId]);
  const unknownReconnect =
    pendingReconnect?.preserveDraft &&
    reconnectReference(pendingReconnect.message);

  /** Reconnect is an ordinary, scoped Pi request in the actual main chat. */
  function askToReopen() {
    if (!mainChat) {
      setError("Main operator is unavailable. Reconnect was not sent.");
      return;
    }
    const url = accessRecord?.presentation?.url;
    const content = accessRecord?.presentation?.content;
    if (content?.kind === "application-access" && content.mode === "public") {
      askInConversation(
        mainChat.id,
        `${url ?? application?.name} is not answering. Check it from outside, find out what is broken between the name and the application, and fix it.`,
      );
    } else if (!reconnectable || !accessRecord) {
      askInConversation(
        mainChat.id,
        "Review the saved private access record and attached server. Explain what needs to be set up before this private connection can be reopened. Do not change the route or server without a separate request.",
      );
    } else if (!mainConversation) {
      setError(
        "Main operator progress is unavailable. Review it before reconnecting.",
      );
    } else if (!progress?.active) {
      sendMessage(reconnectRequest(accessRecord), "next", mainChat.id);
    }
  }

  // Traffic is listed on the owner's standing choice, which is not a record.
  const trafficKept = useTrafficListed(applicationId);
  const listedHere = useMemo(
    () =>
      standings(
        view.information ?? [],
        (view.secrets ?? []).some((secret) => !secret.establishedAt),
        trafficKept,
      ),
    [view.information, view.secrets, trafficKept],
  );
  // Facts the view already carries, refreshed by the same poll as the record,
  // under the facts a destination fetches for itself while it is open.
  const facts: ApplicationFacts = { ...view.facts };
  const [stackRevealed, setStackRevealed] = useState(false);

  useEffect(() => {
    if (!applicationId || !selectedChatId) return;
    let active = true;
    const observedSnapshots = streamSnapshots.current;
    const observedChats = new Set([selectedChatId]);
    if (observedMainId) observedChats.add(observedMainId);
    const subscriptions = [...observedChats].map((chatId) => {
      let outcomeVersion = "";
      // Each observed chat owns a stream baseline. The first connection can
      // reuse its page records; reconnect replaces them with fresh full state.
      let streamed: ChatSnapshot | null = null;
      let initialBaseline =
        bootstrap.current?.applicationId === applicationId &&
        bootstrap.current.chatId === chatId
          ? bootstrap.current
          : null;
      const stream = new EventSource(
        `/api/applications/${applicationId}/chats/${chatId}/events?changes=1${
          initialBaseline ? `&baseline=${initialBaseline.token}` : ""
        }`,
      );
      stream.onopen = () => setReconnecting(false);
      stream.onerror = () => setReconnecting(true);
      stream.onmessage = (event) => {
        if (!active) return;
        const frame = JSON.parse(event.data) as ChatFrame;
        // An acknowledgement reuses its exact page records. A full frame can
        // repeat held records after a reconnect, so retain their identities.
        const snapshot =
          "type" in frame
            ? applyChatFrame(streamed, frame, initialBaseline?.collections)
            : keepUnchanged(
                streamed ??
                  (held.current.selectedChatId === chatId
                    ? held.current
                    : null),
                frame,
              );
        // Consume only after receiving state, so a cancelled opening (including
        // Strict Mode's effect restart) can still use its exact page records.
        if (bootstrap.current === initialBaseline) bootstrap.current = null;
        initialBaseline = null;
        streamed = snapshot;
        observedSnapshots.set(`${applicationId}/${chatId}`, snapshot);
        if (chatId === mainChatId)
          setMainSnapshot({ applicationId, chatId, snapshot });
        setView((current) =>
          current.selectedChatId === chatId
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
        const pending = readPendingSubmission(applicationId, chatId);
        if (pending) {
          if (
            snapshot.messages.some((sent) => sent.requestKey === pending.key)
          ) {
            // SSE can confirm acceptance before the POST response arrives.
            // Retire the optimistic copy as soon as durable intent is visible.
            setPendingMessage(null);
            clearPendingSubmission(applicationId, chatId);
            setPendingReconnect(null);
            if (pending.preserveDraft) setError(null);
            if (!pending.preserveDraft)
              setDrafts((current) => {
                const latest = current[chatId] ?? "";
                if (
                  !acceptedDraftCanClear(
                    latest,
                    pending.message,
                    editedAfterSubmission.current.has(pending.key),
                  )
                )
                  return current;
                writeConversationDraft(applicationId, chatId, "");
                return { ...current, [chatId]: "" };
              });
          } else if (
            !pending.preserveDraft &&
            submittingChat.current !== chatId
          ) {
            setDrafts((current) => {
              if (current[chatId]) return current;
              writeConversationDraft(applicationId, chatId, pending.message);
              return { ...current, [chatId]: pending.message };
            });
          }
        }
        const nextVersion = snapshot.messages
          .filter((settled) => settled.finishedAt)
          .map((settled) => `${settled.id}:${settled.revision}`)
          .join(";");
        if (nextVersion !== outcomeVersion) {
          outcomeVersion = nextVersion;
          refreshAccess();
          void api
            .metadata(applicationId, chatId)
            .then((next) => {
              if (active)
                setView((current) =>
                  current.selectedChatId === chatId
                    ? mergeOperatorMetadata(current, next)
                    : current,
                );
            })
            .catch(() => {
              if (active) setReconnecting(true);
            });
        }
      };
      return () => {
        initialBaseline = null;
        streamed = null;
        stream.close();
      };
    });
    return () => {
      active = false;
      subscriptions.forEach((close) => close());
      observedSnapshots.clear();
    };
  }, [
    applicationId,
    selectedChatId,
    mainChatId,
    observedMainId,
    refreshAccess,
  ]);

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

  function applyView(
    next: OperatorView,
    observedBefore: Map<string, ChatSnapshot>,
  ) {
    // Keep a stream frame that arrived while this action awaited HTTP. An
    // unchanged baseline must not hide a newer HTTP view during a disconnect.
    const key = `${next.application?.id}/${next.selectedChatId}`;
    const snapshot = streamSnapshots.current.get(key);
    const applied =
      snapshot && snapshot !== observedBefore.get(key)
        ? { ...next, ...snapshot, chatStreamBaseline: undefined }
        : // The response repeats the conversation the stream delivered.
          keepUnchanged(snapshot, next);
    bootstrap.current =
      applied.selectedChatId !== held.current.selectedChatId
        ? initialChatBaseline(applied)
        : null;
    setView(applied);
    // The transcript is navigable state; keep it when this page is refreshed.
    const url = new URL(window.location.href);
    // Keep a plain application URL on Overview when an action finishes there.
    if (url.hash || url.searchParams.has("chat")) {
      if (next.selectedChatId)
        url.searchParams.set("chat", next.selectedChatId);
      else url.searchParams.delete("chat");
    }
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
      if (activeChat) {
        const observedBefore = new Map(streamSnapshots.current);
        applyView(
          await api.view(application.id, activeChat.id),
          observedBefore,
        );
      }
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
    const observedBefore = new Map(streamSnapshots.current);
    try {
      applyView(await work(), observedBefore);
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
  function sendMessage(
    told?: string,
    delivery: "next" | "steer" = "next",
    targetChatId?: string,
  ) {
    const targetChat = targetChatId
      ? view.chats.find((chat) => chat.id === targetChatId)
      : activeChat;
    const message = (told ?? composer).trim();
    const isReconnect = Boolean(told && reconnectReference(told));
    const images = told ? [] : attached;
    if (!message && !images.length) return;
    if (busy || submittingChat.current) return;
    if (
      !piReady ||
      !application ||
      !targetChat ||
      view.worker?.alive === false
    ) {
      if (told)
        setError(
          "Pi is unavailable. The request was not sent; your draft is kept.",
        );
      return;
    }
    const previous = readPendingSubmission(application.id, targetChat.id);
    if (
      previous &&
      (told || previous.preserveDraft) &&
      previous.message !== message
    ) {
      setError(
        "The earlier request has an unknown outcome. Review Main operator or retry that same request before sending another.",
      );
      return;
    }
    setPendingMessage({ body: message, images });
    submittingChat.current = targetChat.id;
    // Clear the field optimistically, but keep its durable copy until the
    // server accepts it. Text typed after this point is a newer draft and
    // wins in both React state and storage.
    if (!told) {
      setDrafts((current) => ({ ...current, [targetChat.id]: "" }));
      setAttachments((current) => ({ ...current, [targetChat.id]: [] }));
    }
    // Images are not kept across a reload, so a key is reused only for words.
    const key =
      previous?.message === message && !images.length
        ? previous.key
        : crypto.randomUUID();
    submittingKey.current = key;
    editedAfterSubmission.current.delete(key);
    if (told) editedAfterSubmission.current.add(key);
    const context = contexts[targetChat.id];
    const draftContext = told || context?.requestKey ? null : context;
    if (draftContext) {
      const sentContext = { ...draftContext, requestKey: key };
      setContexts((current) => ({
        ...current,
        [targetChat.id]: sentContext,
      }));
      writeConversationContext(application.id, targetChat.id, sentContext);
    }
    let accepted = false;
    void run(
      "message",
      async () => {
        // Keep the key across a lost HTTP response and reload. Resubmitting the
        // same draft cannot create two accepted requests.
        writePendingSubmission(application.id, targetChat.id, {
          message,
          key,
          ...(told ? { preserveDraft: true } : {}),
        });
        if (told) setPendingReconnect({ message, key, preserveDraft: true });
        await api.sendMessage(
          application.id,
          targetChat.id,
          message,
          key,
          delivery,
          images.map(({ mimeType, data }) => ({ mimeType, data })),
        );
        accepted = true;
        setPendingMessage(null);
        clearPendingSubmission(application.id, targetChat.id);
        setPendingReconnect(null);
        if (!told)
          setDrafts((current) => {
            if (
              !acceptedDraftCanClear(
                current[targetChat.id] ?? "",
                message,
                editedAfterSubmission.current.has(key),
              )
            )
              return current;
            writeConversationDraft(application.id, targetChat.id, "");
            return current;
          });
        return api.view(application.id, targetChat.id);
      },
      async () => {
        const snapshot = await api
          .runSnapshot(application.id, targetChat.id)
          .catch(() => null);
        accepted ||= Boolean(
          snapshot?.messages.some((sent) => sent.requestKey === key),
        );
        if (accepted) {
          clearPendingSubmission(application.id, targetChat.id);
          setPendingReconnect(null);
          if (!told)
            setDrafts((current) => {
              if (
                !acceptedDraftCanClear(
                  current[targetChat.id] ?? "",
                  message,
                  editedAfterSubmission.current.has(key),
                )
              )
                return current;
              writeConversationDraft(application.id, targetChat.id, "");
              return current;
            });
          setError(
            isReconnect
              ? "Reconnect was saved. Follow its progress in Main operator."
              : "Your message was saved. Reconnecting to its progress…",
          );
        } else {
          if (told)
            setError(
              isReconnect
                ? "Reconnect acceptance is unknown. Retry Reconnect with the same request, or review Main operator. Your draft is kept."
                : "Request acceptance is unknown. Review the conversation or retry the same request. Your draft is kept.",
            );
          if (draftContext) {
            setContexts((current) => ({
              ...current,
              [targetChat.id]: draftContext,
            }));
            writeConversationContext(
              application.id,
              targetChat.id,
              draftContext,
            );
          }
          if (!told)
            setDrafts((current) => {
              const next = current[targetChat.id] || message;
              writeConversationDraft(application.id, targetChat.id, next);
              return { ...current, [targetChat.id]: next };
            });
          if (images.length)
            setAttachments((current) => ({
              ...current,
              [targetChat.id]: [...images, ...(current[targetChat.id] ?? [])],
            }));
        }
        const observedBefore = new Map(streamSnapshots.current);
        const refreshed = await api
          .view(application.id, targetChat.id)
          .catch(() => null);
        if (refreshed) applyView(refreshed, observedBefore);
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
            {/* Development only, in their own tabs: the paired dashboard and
              this application's database in the Drizzle Studio that
              `npm run dev` started beside it.
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
            sections={visibleSections(activeSection, listedHere)}
            hidden={hiddenSections(activeSection, listedHere)}
            revealed={stackRevealed}
            onReveal={setStackRevealed}
          />
          <section
            className={`hv-workspace${recordVisible ? " hv-dashboard-open" : ""}`}
          >
            {activeSection && (progress || unknownReconnect || error) && (
              <div className="hv-reconnect-notice" role="status">
                <span>
                  {error ??
                    progress?.text ??
                    "Reconnect acceptance is unknown. Review Main operator or retry the same request."}
                </span>
                {mainChat && (
                  <button
                    type="button"
                    className="hv-reconnect-follow"
                    onClick={() =>
                      openConversation(mainChat.id, progress?.replyId ?? null)
                    }
                  >
                    Main operator
                  </button>
                )}
              </div>
            )}
            {activeSection && (
              <ReconnectActionContext.Provider
                value={{
                  label: unknownReconnect
                    ? "Retry Reconnect"
                    : reconnectable
                      ? "Reconnect"
                      : "Review private access",
                  disabled:
                    busy !== null ||
                    Boolean(progress?.active) ||
                    (reconnectable && !mainConversation),
                }}
              >
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
                        Open {activeChat?.title ?? "the conversation"}
                      </button>
                    </div>
                  }
                >
                  {activeSection === "logs" && applicationId && (
                    <OperatorConsole
                      applicationId={applicationId}
                      chatId={view.chats[0]?.id ?? ""}
                      main={false}
                      records={view.executions}
                    />
                  )}
                </ApplicationSectionView>
              </ReconnectActionContext.Provider>
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
                attachments={attached}
                onAttachmentsChange={(update) => {
                  if (activeChat)
                    setAttachments((current) => ({
                      ...current,
                      [activeChat.id]: update(current[activeChat.id] ?? []),
                    }));
                }}
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
                setTerminal({
                  open: false,
                  expanded: false,
                  minimized: false,
                })
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
