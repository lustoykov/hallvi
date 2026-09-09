"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { applicationOperations } from "@/server/operation-record";
import { stackOf } from "@/server/application-stack";

import type { PiSetupStatus } from "@/server/pi-setup";
import type {
  ApplicationRecord,
  ChatRunSnapshot,
  GateCheck,
  OperatorView,
  PhaseKey,
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
  visibleSections,
  type ApplicationSection,
} from "./application-sections";
import { ApplicationNavigation } from "./application-navigation";
import { DeploymentPanel } from "./deployment-panel";
import { OperationControls } from "./operation-controls";
import { DeploymentDecision } from "./deployment-decision";
import type { DeploymentRecord } from "@/server/deployment-types";
import "./application-shell.css";
import "./views.css";
import { ChatPane, type MessageHighlight } from "./chat-pane";
import {
  conversationMarks,
  featuredOperation,
  labelOf,
  navigationIndicators,
  stepDetail,
} from "./operation-model";
import { StateChip } from "./operation-receipt";
import { CheckDrawer } from "./check-drawer";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import type { ConformanceAction } from "./conformance-record";
import { describeCurrentStep, type StepAction } from "./current-step";
import { CurrentStepBar } from "./current-step-bar";
import { DemoContext } from "./external-link";
import { SetupDialog } from "./setup-dialog";
import { RevisionDialog } from "./revision-dialog";
import { Inspector } from "./inspector";
import { recordReferences, type RecordSection } from "./record-references";

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
  demo = false,
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
  /** Where the application identity sits; the prototype compares placements. */
  identityVariant?: IdentityVariant;
}) {
  const router = useRouter();
  const showDeployment = !demo;
  const [deployment, setDeployment] = useState<DeploymentRecord | null>(null);
  // Until the first response arrives a view cannot honestly say a resource
  // is absent, so it shows the shape of the answer instead.
  const [recordLoaded, setRecordLoaded] = useState(demo);
  const [hetznerConnected, setHetznerConnected] = useState(false);
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
  // The preparation Record lives with Deployment.
  function setRecordVisible(visible: boolean) {
    selectSection(visible ? "deployment" : null);
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
  const [recordWide, setRecordWide] = useState(false);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [view, setView] = useState(initialView);
  const [selectedCheckKey, setSelectedCheckKey] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{
    section: RecordSection;
    nonce: number;
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [runs, setRuns] = useState<PiRun[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const focusComposerAfterClose = useRef(false);
  const submittingChat = useRef<string | null>(null);

  const application = view.application;
  const checks = view.checks
    .filter((check) => check.key !== "target-environment")
    .map((check) =>
      check.key === "application-identity"
        ? { ...check, result: check.result.replace(" · Production", "") }
        : check,
    );
  const activeChat =
    view.chats.find((chat) => chat.id === view.selectedChatId) ?? null;
  const composer = activeChat ? (drafts[activeChat.id] ?? "") : "";
  const selectedCheck =
    checks.find((check) => check.key === selectedCheckKey) ?? null;
  const closeCheck = useCallback(() => setSelectedCheckKey(null), []);
  const applicationId = application?.id;
  const selectedChatId = view.selectedChatId;
  const refreshDeployment = useCallback(async () => {
    if (!applicationId || !selectedChatId || demo) return;
    const response = await fetch(
      `/api/applications/${applicationId}/deployment`,
    );
    setRecordLoaded(true);
    if (!response.ok) return;
    const value = await response.json();
    setDeployment(value.deployment);
    setHetznerConnected(value.connected);
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
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshDeployment().catch(() => setRecordLoaded(true));
    }, 0);
    const timer = setInterval(
      () => void refreshDeployment().catch(() => undefined),
      2500,
    );
    return () => {
      window.clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refreshDeployment]);
  // The current-step bar, the Record and the reply references all read the
  // same view, so a reload and a reply say the same thing.
  const step = describeCurrentStep(view, { demo });
  if (
    view.workspace?.current &&
    ["inspect-app", "make-launch-ready"].includes(view.workspace.phaseKey)
  )
    step.actions.push({
      key: "change-revision",
      label: "Change selected revision",
      explanation: "Review the impact before adopting another commit.",
      kind: "link",
    });
  if (
    application &&
    ["start", "inspect-app", "make-launch-ready"].includes(
      view.workspaces.find((w) => w.current)?.phaseKey ?? "",
    )
  )
    step.actions.push({
      key: "edit-setup",
      label: "Edit application setup",
      explanation:
        "Review the impact before changing the repository or permission policy.",
      kind: "link",
    });
  const references = recordReferences(view);
  const operations = useMemo(
    () => view.operations ?? applicationOperations(deployment),
    [deployment, view.operations],
  );
  const stack = useMemo(() => stackOf(deployment), [deployment]);
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

  function revealSection(section: RecordSection) {
    setRecordVisible(true);
    setReveal((current) => ({ section, nonce: (current?.nonce ?? 0) + 1 }));
  }

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

  const previewActive =
    view.preview?.status === "starting" || view.preview?.status === "ready";
  const conformancePending = view.conformance?.runs.some((item) =>
    ["queued", "running"].includes(item.status),
  );
  useEffect(() => {
    if (
      !applicationId ||
      !selectedChatId ||
      (!previewActive && !conformancePending)
    )
      return;
    let active = true;
    const timer = setInterval(() => {
      void api
        .view(applicationId, selectedChatId)
        .then((next) => {
          if (active) setView(next);
        })
        .catch(() => {});
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [applicationId, selectedChatId, previewActive, conformancePending]);

  useLayoutEffect(() => {
    if (selectedCheckKey !== null || !focusComposerAfterClose.current) return;
    focusComposerAfterClose.current = false;
    document.querySelector<HTMLTextAreaElement>("#pi-composer")?.focus();
  }, [selectedCheckKey]);

  function setComposer(value: string) {
    if (!activeChat) return;
    setDrafts((current) => ({ ...current, [activeChat.id]: value }));
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
    setRecordVisible(false);
    if (!application || chatId === view.selectedChatId) return;
    void run("chat", () => api.view(application.id, chatId));
  }

  // The phase strip switches the viewed phase; a completed phase opens its
  // read-only chats and retained evidence, never a re-evaluation.
  function selectPhase(phaseKey: PhaseKey) {
    if (!application || view.workspace?.phaseKey === phaseKey) return;
    void run("chat", () => api.viewPhase(application.id, phaseKey));
  }

  // The explicit Continue from a ready deliverable into the next phase.
  function continueToNextPhase() {
    if (!application) return;
    const phase = view.workspace?.phaseKey;
    void run("continue", () =>
      phase === "inspect-app"
        ? api.continueToMakeLaunchReady(application.id)
        : api.continueToInspectApp(application.id),
    );
  }

  // Phase 3 actions: every one asks the server for the whole view again. A
  // returned view for the phase's primary chat replaces the current selection
  // only when the current chat belongs to that phase.
  function conformanceAction(action: ConformanceAction) {
    if (!application) return;
    const conformance = api.conformance(application.id);
    const work = () => {
      switch (action.type) {
        case "continue":
          return conformance.continueWithServerGuy();
        case "return":
          return conformance.returnChange(action.reference);
        case "select-current":
          return conformance.selectCurrentRevision();
        case "refresh":
          return conformance.refresh();
        case "verify":
          return conformance.verify();
        case "approve":
          return conformance.approve(action.proposalId);
        case "publish":
          return conformance.publish(action.proposalId);
        case "withdraw":
          return conformance.withdraw(action.proposalId);
        case "accept-checks":
          return conformance.acceptChecks(action.acceptanceId);
        case "cancel-run":
          return conformance.cancelRun(action.runId);
        case "grant":
          return conformance.grant();
        case "revoke":
          return conformance.revoke();
      }
    };
    void run(action.type, async () => {
      const next = await work();
      return activeChat && next.selectedChatId !== activeChat.id
        ? api.view(application.id, activeChat.id)
        : next;
    });
  }

  function createChat() {
    setRecordVisible(false);
    if (!application) return;
    void run("new-chat", () => api.createChat(application.id));
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
    setRecordVisible(false);
    if (!application || chatId === view.selectedChatId) {
      reveal();
      return;
    }
    void run("chat", () => api.view(application.id, chatId)).then(reveal);
  }

  // Drafts a message in a conversation without sending it.
  function askInConversation(chatId: string | null, draft: string) {
    const target = chatId ?? view.selectedChatId;
    if (!target) return;
    setDrafts((current) => ({ ...current, [target]: draft }));
    focusComposerAfterClose.current = true;
    if (application && target !== view.selectedChatId)
      void run("chat", () => api.view(application.id, target));
    setRecordVisible(false);
    setSelectedCheckKey(null);
  }

  // Every current-step action is one of the existing operations; nothing here
  // keeps state of its own.
  function stepAction(action: StepAction) {
    const [kind, id = ""] = action.key.split(":");
    switch (kind) {
      case "preparation-start":
        return setPreparationOpen(true);
      case "preparation-refresh":
        return (
          applicationId &&
          void run("preparation-refresh", () =>
            api.preparation(applicationId, "refresh"),
          )
        );
      case "preview-start":
        return (
          applicationId &&
          void run("preview-start", () => api.preview(applicationId, "start"))
        );
      case "preview-stop":
        return (
          applicationId &&
          void run("preview-stop", () => api.preview(applicationId, "stop", id))
        );
      case "preview-confirm":
        return (
          applicationId &&
          void run("preview-confirm", () =>
            api.preview(applicationId, "confirm", id),
          )
        );
      case "edit-setup":
        setSetupOpen(true);
        return;
      case "change-revision":
        return setRevisionOpen(true);
      case "continue":
        return continueToNextPhase();
      case "rerun":
        return rerunCheck(id as NonNullable<GateCheck["rerun"]>["key"]);
      case "phase":
        return selectPhase(id as PhaseKey);
      case "reveal":
        return revealSection(id as RecordSection);
      case "ask":
        return document
          .querySelector<HTMLTextAreaElement>("#pi-composer")
          ?.focus();
      case "continue-with-server-guy":
        return conformanceAction({ type: "continue" });
      case "select-current":
        return conformanceAction({ type: "select-current" });
      case "accept-checks":
        return conformanceAction({ type: "accept-checks", acceptanceId: id });
      case "approve":
        return conformanceAction({ type: "approve", proposalId: id });
      case "publish":
        return conformanceAction({ type: "publish", proposalId: id });
      case "withdraw":
        return conformanceAction({ type: "withdraw", proposalId: id });
      case "grant":
        return conformanceAction({ type: "grant" });
      case "refresh":
        return conformanceAction({ type: "refresh" });
      case "verify":
        return conformanceAction({ type: "verify" });
      case "cancel-run":
        return conformanceAction({ type: "cancel-run", runId: id });
    }
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

  function rerunCheck(key: NonNullable<GateCheck["rerun"]>["key"]) {
    if (!application) return;
    void run("rerun", async () => {
      const next = await api.rerunCheck(application.id, key);
      setSelectedCheckKey(
        key === "repository-readable"
          ? "repository-readable"
          : key === "repository-inspection"
            ? "profile-resolved"
            : key === "conformance-refresh"
              ? "candidate-identified"
              : "conformance-passed",
      );
      return activeChat && next.selectedChatId !== activeChat.id
        ? api.view(application.id, activeChat.id)
        : next;
    });
  }

  // A conformance run progresses in the worker; while one is queued or
  // running, the view is refreshed so its progress and outcome appear.
  const runInProgress = Boolean(
    view.conformance?.runs.some(
      (item) => item.status === "queued" || item.status === "running",
    ),
  );
  useEffect(() => {
    if (!runInProgress || !applicationId || !selectedChatId) return;
    const timer = window.setInterval(() => {
      void api
        .view(applicationId, selectedChatId)
        .then((next) => applyView(next))
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
    // applyView is stable enough for a poll; the interval is short-lived.
  }, [runInProgress, applicationId, selectedChatId]);

  async function askAboutCheck(check: GateCheck) {
    const question = `Explain “${check.label}”, its current result, and what I can verify myself.`;
    const readOnly =
      activeChat?.archivedAt || view.workspace?.status === "completed";
    if (application && readOnly) {
      // From read-only history, ask in the current phase's main chat.
      const current = view.workspaces.find((item) => item.current);
      const primary =
        current && current.id === view.workspace?.id
          ? view.chats.find((chat) => chat.isPrimary && !chat.archivedAt)
          : null;
      await run("chat", async () => {
        const next = primary
          ? await api.view(application.id, primary.id)
          : await api.viewPhase(application.id, current?.phaseKey ?? "start");
        const target = primary?.id ?? next.selectedChatId;
        if (target)
          setDrafts((current) => ({ ...current, [target]: question }));
        return next;
      });
    } else {
      setComposer(question);
    }
    setRecordVisible(false);
    focusComposerAfterClose.current = true;
    setSelectedCheckKey(null);
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
      <main className="sg-shell sg-adaptive-shell">
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
          sections={visibleSections(stack, activeSection)}
          hidden={hiddenSections(stack, activeSection)}
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
              deployment={deployment}
              stack={stack}
              operations={operations}
              now={now}
              loading={!recordLoaded}
              onRefresh={refreshDeployment}
              decisionFor={(operation) =>
                (operation.source.type !== "deployment" ||
                  operation.state === "queued") &&
                applicationId ? (
                  <OperationControls
                    key={operation.id}
                    applicationId={applicationId}
                    operation={operation}
                    onRefresh={refreshDeployment}
                  />
                ) : null
              }
              onOpenDestination={selectSection}
              onOpenConversation={openConversation}
              onAsk={askInConversation}
              onRevealStack={() => setStackRevealed(true)}
              bar={
                <div className="sg-view-bar">
                  <button
                    type="button"
                    className="sg-view-back"
                    onClick={() => setRecordVisible(false)}
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
              {activeSection === "deployment" &&
                showDeployment &&
                applicationId &&
                selectedChatId && (
                  <DeploymentPanel
                    applicationId={applicationId}
                    chatId={selectedChatId}
                    record={deployment}
                    connected={hetznerConnected}
                    onRefresh={refreshDeployment}
                  />
                )}
            </ApplicationSectionView>
          )}
          <div
            className={`sg-chat-column${recordVisible ? " sg-chat-parked" : ""}`}
            inert={recordVisible || undefined}
          >
            <details className="sg-legacy-preparation">
              <summary>Repository preparation details</summary>
              <CurrentStepBar
                busy={busy}
                demo={demo}
                onAction={stepAction}
                repository={
                  application
                    ? `${application.repositoryOwner}/${application.repositoryName}`
                    : null
                }
                step={step}
              />
            </details>
            {preparationOpen && applicationId && (
              <ConfirmActionDialog
                title="Work on a shared GitHub branch?"
                destructive={false}
                description="Server Guy may create a preparation branch and publish source checkpoints to a draft PR for the current contract. You can follow along and commit there too. You review and merge the PR on GitHub when ready."
                action="Start shared preparation"
                busy={busy !== null}
                error={error}
                onCancel={() => setPreparationOpen(false)}
                onConfirm={() =>
                  void run("preparation-start", async () => {
                    const next = await api.preparation(applicationId, "start");
                    setPreparationOpen(false);
                    return next;
                  })
                }
              />
            )}
            {setupOpen && application && (
              <SetupDialog
                application={application}
                onClose={() => setSetupOpen(false)}
                onApplied={async (phase) =>
                  applyView(await api.viewPhase(application.id, phase))
                }
              />
            )}
            {revisionOpen && applicationId && (
              <RevisionDialog
                applicationId={applicationId}
                onClose={() => setRevisionOpen(false)}
                onApplied={async () =>
                  applyView(await api.viewPhase(applicationId, "inspect-app"))
                }
              />
            )}
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
              reconnecting={reconnecting}
              onRunAction={runAction}
              onNewChat={createChat}
              onReveal={revealSection}
              references={references}
              view={view}
              operations={operations}
              now={now}
              onOpenDestination={selectSection}
              onOpenConversation={openConversation}
              highlight={highlight}
              decisionFor={(operation) =>
                operation.source.type === "deployment" &&
                operation.state !== "queued" &&
                deployment &&
                operation.id ===
                  (deployment.operationId ?? `deployment:${deployment.id}`) &&
                applicationId &&
                showDeployment ? (
                  <DeploymentDecision
                    applicationId={applicationId}
                    record={deployment}
                    connected={hetznerConnected}
                    onRefresh={refreshDeployment}
                    onOpen={selectSection}
                  />
                ) : (operation.source.type !== "deployment" ||
                    operation.state === "queued") &&
                  applicationId ? (
                  <OperationControls
                    key={operation.id}
                    applicationId={applicationId}
                    operation={operation}
                    onRefresh={refreshDeployment}
                  />
                ) : null
              }
            />
          </div>
          <div
            className="sg-dashboard-record"
            hidden={activeSection !== "deployment"}
          >
            <h2 className="sg-record-heading">Preparation record</h2>
            <Inspector
              key={view.workspace?.id ?? "record"}
              hidden={activeSection !== "deployment"}
              wide={recordWide}
              onToggleWidth={() => setRecordWide((wide) => !wide)}
              onHide={() => {
                setRecordVisible(false);
              }}
              busy={busy}
              checks={checks}
              offerGrant={step.actions.some((action) => action.key === "grant")}
              onConformance={conformanceAction}
              onSelectCheck={setSelectedCheckKey}
              reveal={reveal}
              view={view}
            />{" "}
          </div>
        </section>

        {selectedCheck && (
          <CheckDrawer
            busy={busy !== null}
            check={selectedCheck}
            onAsk={askAboutCheck}
            onClose={closeCheck}
            onRerun={rerunCheck}
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
      </main>
    </DemoContext.Provider>
  );
}
