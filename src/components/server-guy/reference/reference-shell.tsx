"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CaretDown,
  Check,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ViewAction } from "@/server/application-facts";
import { stackOf } from "@/server/application-stack";
import type { OperatorView } from "@/server/types";

import "../application-shell.css";
import "./reference.css";
import { ApplicationNavigation } from "../application-navigation";
import { ApplicationSectionView } from "../application-section-view";
import {
  applicationSections,
  hiddenStackSections,
  sectionFromHash,
  visibleSections,
  type ApplicationSection,
} from "../application-sections";
import { ChatPane, type MessageHighlight } from "../chat-pane";
import { ConfirmActionDialog } from "../confirm-action-dialog";
import {
  OperationDecisionCard,
  type DecisionChoice,
} from "../operation-decision";
import {
  conversationMarks,
  featuredOperation,
  labelOf,
  navigationIndicators,
  stepDetail,
} from "../operation-model";
import { StateChip } from "../operation-receipt";
import type { ReferenceState } from "./data";
import {
  acknowledgeIssue,
  archiveChat,
  allOperations,
  investigateIssue,
  measureDatabase,
  newConversation,
  pauseJob,
  refreshLogs,
  runBackup,
  runJob,
  send,
  stateAt,
  stepAfterDecision,
  stepAfterInvestigation,
  testRestore,
  tick,
} from "./engine";
import type { Scenario } from "./scenario";
import { ScenarioBar } from "./scenario-bar";
import { richScenario } from "./scenario-rich";
import { simpleScenario } from "./scenario-simple";

export const scenarios: Scenario[] = [simpleScenario, richScenario];

function latestChat(state: ReferenceState) {
  const open = state.chats.filter((item) => !item.archivedAt);
  return [...(open.length ? open : state.chats)].sort((a, b) =>
    b.lastActivityAt.localeCompare(a.lastActivityAt),
  )[0];
}

/**
 * The application workspace of the product, composed from the same
 * components the shell uses, fed by a scenario instead of the API. The
 * scenario bar at the bottom is the only prototype-specific surface.
 */
export function ReferenceShell({
  scenarioId,
  initialStep,
  initialSection = null,
  initialChat = null,
}: {
  scenarioId: Scenario["id"];
  initialStep: number;
  /** A section id from the URL; anything else opens the conversation. */
  initialSection?: string | null;
  initialChat?: string | null;
}) {
  const [scenarioKey, setScenarioKey] = useState<Scenario["id"]>(scenarioId);
  const scenario =
    scenarios.find((item) => item.id === scenarioKey) ?? scenarios[0];
  const [step, setStep] = useState(() =>
    Math.max(0, Math.min(initialStep, scenario.steps.length - 1)),
  );
  const [overlay, setOverlay] = useState<ReferenceState | null>(null);
  const base = useMemo(() => stateAt(scenario, step), [scenario, step]);
  const state = overlay ?? base;
  const now = Date.parse(state.clock);
  const [chatChoice, setChatChoice] = useState<string | null>(initialChat);
  const chat =
    state.chats.find((item) => item.id === chatChoice) ?? latestChat(state);
  const [section, setSection] = useState<ApplicationSection | null>(() =>
    sectionFromHash(`#${initialSection ?? ""}`),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState<Partial<Record<ApplicationSection, string>>>(
    () =>
      Object.fromEntries(
        applicationSections.map((item) => [item.id, scenario.steps[0].clock]),
      ),
  );
  const [revealed, setRevealed] = useState(false);
  const [highlight, setHighlight] = useState<MessageHighlight | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dialog, setDialog] = useState<"remove" | null>(null);
  const picker = useRef<HTMLButtonElement>(null);

  const operations = useMemo(() => allOperations(state), [state]);
  const stack = useMemo(() => stackOf(state.deployment), [state.deployment]);
  const indicators = navigationIndicators(operations, seen);
  if (section && indicators[section]?.tone === "updated")
    delete indicators[section];
  const chatMarks = conversationMarks(operations, state.chats);
  const featured = featuredOperation(operations, section, chat?.id ?? null);

  // The URL carries the scenario, step, view and conversation.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", scenario.id);
    url.searchParams.set("step", String(step));
    if (section) url.searchParams.set("section", section);
    else url.searchParams.delete("section");
    if (chat) url.searchParams.set("chat", chat.id);
    window.history.replaceState(null, "", url);
  }, [scenario.id, step, section, chat]);
  const last = scenario.steps.length - 1;
  useEffect(() => {
    if (!playing || step >= last) return;
    const timer = window.setTimeout(() => {
      setOverlay(null);
      setStep(step + 1);
      if (step + 1 >= last) setPlaying(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [playing, step, last]);
  const ticking = Boolean(
    overlay?.operations.some(
      (item) => item.origin === null && item.state === "working" && item.steps,
    ),
  );
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(
      () => setOverlay((current) => (current ? tick(current) : current)),
      1400,
    );
    return () => window.clearInterval(timer);
  }, [ticking]);

  function goToStep(next: number) {
    setOverlay(null);
    setBusy(null);
    setStep(next);
  }
  function chooseScenario(id: Scenario["id"]) {
    setScenarioKey(id);
    setOverlay(null);
    setStep(0);
    setChatChoice(null);
    setSection(null);
    setRevealed(false);
    const fresh = scenarios.find((item) => item.id === id) ?? scenarios[0];
    setSeen(
      Object.fromEntries(
        applicationSections.map((item) => [item.id, fresh.steps[0].clock]),
      ),
    );
  }
  function selectSection(next: ApplicationSection | null) {
    setSection((current) => {
      if (current && current !== next)
        setSeen((value) => ({ ...value, [current]: state.clock }));
      return next;
    });
  }
  function selectChat(id: string) {
    setChatChoice(id);
    selectSection(null);
  }
  function openConversation(chatId: string, messageId: string | null) {
    selectChat(chatId);
    if (messageId)
      setHighlight((current) => ({
        messageId,
        nonce: (current?.nonce ?? 0) + 1,
      }));
  }
  function ask(chatId: string | null, draft: string) {
    const target = chatId ?? chat?.id;
    if (!target) return;
    setDrafts((current) => ({ ...current, [target]: draft }));
    selectChat(target);
  }
  function decide(operationId: string, choice: DecisionChoice) {
    const later = stepAfterDecision(scenario, step, operationId);
    if (later !== null && choice.action !== "cancel") {
      goToStep(later);
      return;
    }
    setOverlay((current) => {
      const next = structuredClone(current ?? base);
      const found = next.operations.find((item) => item.id === operationId);
      if (choice.action === "cancel") {
        if (operationId.startsWith("deployment:")) next.deployment = null;
        else if (found) {
          found.state = "inspected";
          found.summary = "Cancelled before anything was applied.";
          found.decision = null;
        }
      } else if (found) {
        found.state = "working";
        found.decision = null;
        found.steps = found.steps ?? [
          { label: "Apply the change", state: "active" },
          { label: "Verify", state: "pending" },
        ];
      }
      return next;
    });
  }
  function viewAction(action: ViewAction) {
    const apply = (next: ReferenceState) => setOverlay(next);
    switch (action.type) {
      case "run-job":
        return apply(runJob(state, action.job));
      case "pause-job":
        return apply(pauseJob(state, action.job, true));
      case "resume-job":
        return apply(pauseJob(state, action.job, false));
      case "acknowledge-issue":
        return apply(acknowledgeIssue(state, action.issue));
      case "investigate-issue": {
        const later = stepAfterInvestigation(scenario, step, action.issue);
        if (later !== null) {
          const target = stateAt(scenario, later).facts.monitoring?.issues.find(
            (item) => item.id === action.issue,
          )?.conversationId;
          goToStep(later);
          if (target) selectChat(target);
          return;
        }
        const result = investigateIssue(state, action.issue);
        apply(result.state);
        if (result.chatId) selectChat(result.chatId);
        return;
      }
      case "measure-database":
        return apply(measureDatabase(state));
      case "refresh-logs":
        return apply(refreshLogs(state));
      case "run-backup":
        return apply(runBackup(state));
      case "test-restore":
        return apply(testRestore(state));
      case "deploy-candidate": {
        for (let later = step + 1; later < scenario.steps.length; later += 1) {
          const candidate = stateAt(scenario, later).operations.find(
            (item) => item.source.type === "release" && item.kind === "change",
          );
          if (candidate) {
            goToStep(later);
            if (candidate.origin) selectChat(candidate.origin.chatId);
            return;
          }
        }
        return ask(
          null,
          `Deploy revision ${action.revision.slice(0, 12)} now.`,
        );
      }
      default:
        return;
    }
  }
  const view: OperatorView = {
    application: state.application,
    workspace: null,
    workspaces: [],
    chats: state.chats,
    selectedChatId: chat?.id ?? null,
    messages: state.messages.filter((item) => item.chatId === chat?.id),
    checks: [],
    decisions: [],
    observations: [],
    upcomingRequirements: [],
    activity: [],
    inspection: null,
    contract: null,
    conformance: null,
    preview: null,
    preparation: null,
  };
  const other = scenarios.find((item) => item.id !== scenario.id)!;
  const otherApplication = other.initial().application;
  return (
    <>
      <main className="sg-shell sg-adaptive-shell sg-reference-shell">
        <header className="sg-topbar">
          <div className="sg-app-identity">
            <button
              ref={picker}
              className="sg-application-picker"
              type="button"
              popoverTarget="reference-picker"
              aria-label={`Switch application: ${state.application.name}`}
            >
              <span>
                <strong>{state.application.name}</strong>
                <small>
                  {state.application.repositoryOwner}/
                  {state.application.repositoryName}
                </small>
              </span>
              <CaretDown aria-hidden="true" weight="bold" />
            </button>
            <nav
              id="reference-picker"
              popover="auto"
              className="sg-application-menu"
              aria-label="Applications"
              onBeforeToggle={(event) => {
                if (event.newState !== "open") return;
                const anchor = picker.current?.getBoundingClientRect();
                if (!anchor) return;
                event.currentTarget.style.top = `${anchor.bottom + 6}px`;
                event.currentTarget.style.left = `${Math.max(12, anchor.left)}px`;
                event.currentTarget.style.minWidth = `${anchor.width}px`;
              }}
            >
              <span className="sg-eyebrow sg-application-menu-label">
                Switch application
              </span>
              {[state.application, otherApplication].map((item) => (
                <Link
                  key={item.id}
                  href={`/prototype/app?scenario=${item.id === state.application.id ? scenario.id : other.id}`}
                  aria-current={
                    item.id === state.application.id ? "page" : undefined
                  }
                  onClick={(event) => {
                    event.currentTarget
                      .closest<HTMLElement>("[popover]")
                      ?.hidePopover();
                    if (item.id !== state.application.id) {
                      event.preventDefault();
                      chooseScenario(other.id);
                    }
                  }}
                >
                  <span aria-hidden="true" className="sg-application-menu-mark">
                    {item.repositoryName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.repositoryOwner}/{item.repositoryName}
                    </small>
                  </div>
                  {item.id === state.application.id && (
                    <Check aria-label="Current application" weight="bold" />
                  )}
                </Link>
              ))}
              <Link
                className="sg-application-menu-action"
                href="/prototype/new"
              >
                <Plus /> Add application
              </Link>
              <hr />
              <button
                type="button"
                className="sg-remove-application"
                onClick={(event) => {
                  event.currentTarget
                    .closest<HTMLElement>("[popover]")
                    ?.hidePopover();
                  setDialog("remove");
                }}
              >
                <Trash /> Remove application…
              </button>
            </nav>
          </div>
          {section && featured && (
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
          chats={state.chats}
          selectedChatId={chat?.id ?? null}
          section={section}
          busy={false}
          onSection={selectSection}
          onChat={selectChat}
          onCreate={() => {
            const result = newConversation(state);
            setOverlay(result.state);
            selectChat(result.chatId);
          }}
          indicators={indicators}
          chatMarks={chatMarks}
          sections={visibleSections(stack, section)}
          hidden={hiddenStackSections(stack, section)}
          revealed={revealed}
          onReveal={setRevealed}
        />
        <section
          className={`sg-workspace${section ? " sg-dashboard-open" : ""}`}
        >
          {section && (
            <ApplicationSectionView
              key={`${scenario.id}:${section}`}
              section={section}
              view={view}
              deployment={state.deployment}
              stack={stack}
              facts={state.facts}
              operations={operations}
              now={now}
              onRefresh={async () => setOverlay(refreshLogs(state))}
              onOpenDestination={selectSection}
              onOpenConversation={openConversation}
              onAsk={ask}
              onRevealStack={() => setRevealed(true)}
              onAction={viewAction}
              busy={busy}
              bar={
                <div className="sg-view-bar">
                  <button
                    type="button"
                    className="sg-view-back"
                    onClick={() => selectSection(null)}
                  >
                    <ArrowLeft aria-hidden="true" />
                    Back to {chat?.title ?? "the conversation"}
                  </button>
                  {featured && !featured.destinations.includes(section) && (
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
            />
          )}
          <div
            className={`sg-chat-column${section ? " sg-chat-parked" : ""}`}
            inert={section ? true : undefined}
          >
            {chat && (
              <ChatPane
                key={`${scenario.id}:${chat.id}`}
                view={view}
                activeChat={chat}
                busy={null}
                error={null}
                pendingMessage={null}
                piReady
                composer={drafts[chat.id] ?? ""}
                onComposerChange={(value) =>
                  setDrafts((current) => ({ ...current, [chat.id]: value }))
                }
                onSend={() => {
                  const text = (drafts[chat.id] ?? "").trim();
                  if (!text) return;
                  setOverlay(send(state, chat.id, text));
                  setDrafts((current) => ({ ...current, [chat.id]: "" }));
                }}
                onArchive={() => {
                  // Stay on the archived conversation; it reads as history.
                  setOverlay(archiveChat(state, chat.id));
                  setChatChoice(chat.id);
                }}
                runs={[]}
                reconnecting={false}
                onRunAction={() => {}}
                onNewChat={() => {}}
                operations={operations}
                now={now}
                onOpenDestination={selectSection}
                onOpenConversation={openConversation}
                highlight={highlight}
                decisionFor={(operation) =>
                  operation.decision ? (
                    <OperationDecisionCard
                      operation={operation}
                      onDecide={decide}
                    />
                  ) : null
                }
              />
            )}
          </div>
        </section>
        {dialog === "remove" && (
          <ConfirmActionDialog
            title={`Remove ${state.application.name}?`}
            description="Permanently removes this application’s conversations, records and history from Server Guy. Its host, repository and data on the instance stay unchanged; remove those separately if you no longer need them."
            action="Remove application"
            confirmation={`${state.application.repositoryOwner}/${state.application.repositoryName}`}
            busy={false}
            error={null}
            onCancel={() => setDialog(null)}
            onConfirm={() => setDialog(null)}
          />
        )}
      </main>
      <ScenarioBar
        scenarios={scenarios}
        scenario={scenario}
        step={step}
        playing={playing}
        onScenario={chooseScenario}
        onStep={goToStep}
        onPlaying={setPlaying}
        onReplay={() => setOverlay(null)}
      />
    </>
  );
}
