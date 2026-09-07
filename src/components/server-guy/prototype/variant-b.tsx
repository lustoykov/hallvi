"use client";

// PROTOTYPE — Variant B: "Chat cards + integrated header".
//   Header: two rows in one navy block. Row 1 is identity (name, repository)
//   and connection states named in words (ChatGPT, GitHub, Docker) plus
//   Settings. Row 2 replaces the separate phase strip with a compact phase
//   line: "Phase 2 of 9 · Inspect app" and nine small segments grouped
//   Plan / Setup / Live. (Explores the strip-in-header relationship item 22
//   asks about; the user earlier kept the strip out of the sidebar, not out
//   of the header.)
//   Chat: interactive cards appear right after the message that produced
//   the record (contract, behavior checks, change, publication). A replaced
//   proposal's card says so and loses its buttons. The chat header carries
//   the phase purpose and the current status line.
//   Record: two tabs only — Record (checks, contract, environment) and
//   History (activity + source reads with filters).
import { CaretDown, Check } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import { PHASES } from "@/server/phase-one-spec";
import type { PiSetupStatus } from "@/server/pi-setup";
import type { ChatMessage, OperatorView } from "@/server/types";

import { ChatList } from "../chat-list";
import { CheckDrawer } from "../check-drawer";
import { LocalTime } from "../local-time";
import { Markdown } from "../markdown";
import { describeCurrentStep } from "./phase-copy";
import p from "./prototype.module.css";
import {
  AcceptanceCard,
  ActionButtons,
  CheckRows,
  ContractCompact,
  DemoBanner,
  EnvironmentLine,
  HistoryList,
  ProposalCard,
  PublishingLine,
  StageList,
  WaitingPill,
  orderedProposals,
  policyLabel,
  short,
  type HistoryFilter,
} from "./shared";
import { usePrototypeAction } from "./switcher";

const GROUPS = [
  { key: "plan", label: "Plan" },
  { key: "setup", label: "Setup" },
  { key: "live", label: "Live" },
] as const;

export function VariantB({
  view,
  piSetup,
}: {
  view: OperatorView;
  piSetup: PiSetupStatus;
}) {
  const act = usePrototypeAction();
  const step = describeCurrentStep(view);
  const application = view.application;
  const [composer, setComposer] = useState("");
  const [checkKey, setCheckKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"record" | "history">("record");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const selectedCheck =
    view.checks.find((check) => check.key === checkKey) ?? null;
  const phaseThree = view.workspace?.phaseKey === "make-launch-ready";
  const githubConnected = view.observations.some(
    (observation) =>
      observation.kind.startsWith("github") && observation.status === "passed",
  );
  const docker = view.conformance?.environment ?? null;
  const cards = cardsByMessage(view);

  return (
    <main className={p.bShell}>
      <header className={p.bHeader}>
        <div className={p.bRow1}>
          <div className={p.bIdentity}>
            <Link
              href="/applications"
              aria-label="Server Guy, all applications"
              style={{ display: "inline-flex", color: "#fff" }}
            >
              <span className="sg-app-mark">SG</span>
            </Link>
            <button
              className={p.bPicker}
              type="button"
              onClick={() => act("Open application switcher")}
            >
              <strong>
                {application?.name}{" "}
                <CaretDown weight="bold" aria-hidden="true" />
              </strong>
              <small>
                {application?.repositoryOwner}/{application?.repositoryName} ·
                Production · {policyLabel(view)}
              </small>
            </button>
          </div>
          <div className={p.bStatuses}>
            <Link
              className={p.bStatus}
              href="/setup/pi"
              title={
                piSetup.ready
                  ? `${piSetup.selection.model}, ${piSetup.selection.reasoningEffort} reasoning`
                  : "Connect ChatGPT"
              }
            >
              <i className={piSetup.ready ? "on" : "off"} /> ChatGPT
            </Link>
            <Link className={p.bStatus} href="/setup/github">
              <i className={githubConnected ? "on" : "off"} /> GitHub
            </Link>
            <Link
              className={p.bStatus}
              href="/setup/execution"
              title={
                phaseThree
                  ? (docker?.summary ?? "Not checked")
                  : "Needed from Phase 3"
              }
            >
              <i className={!phaseThree ? "" : docker?.ready ? "on" : "off"} />{" "}
              Docker
            </Link>
            <Link className={p.bSettings} href="/setup/pi">
              Settings
            </Link>
          </div>
        </div>
        <div className={p.bRow2}>
          <span className={p.bPhaseNow}>
            <strong>
              Phase {step.phaseNumber} of 9 · {step.phaseName}
            </strong>
            <small>{step.deliverable}</small>
          </span>
          <div className={p.bSegments} role="list" aria-label="Launch phases">
            {GROUPS.map((group) => (
              <div className={p.bGroup} key={group.key}>
                <span className={p.bGroupLabel}>{group.label}</span>
                {PHASES.filter((phase) => phase.group === group.key).map(
                  (phase) => {
                    const workspace = view.workspaces.find(
                      (item) => item.phaseKey === phase.key,
                    );
                    const state =
                      workspace?.status === "completed"
                        ? "completed"
                        : workspace?.current
                          ? "current"
                          : "future";
                    return (
                      <button
                        className={p.bSeg}
                        data-state={state}
                        data-viewed={
                          workspace?.phaseKey === view.workspace?.phaseKey
                        }
                        data-workspace={Boolean(workspace)}
                        key={phase.key}
                        onClick={() =>
                          workspace && act(`View phase ${phase.key}`)
                        }
                        title={`${phase.name} · ${phase.deliverable}`}
                        type="button"
                      >
                        <b>
                          {state === "completed" ? (
                            <Check weight="bold" />
                          ) : (
                            phase.number
                          )}
                        </b>
                        {(group.key === "plan" || workspace) && phase.name}
                        {workspace?.current && (
                          <span
                            className={p.bSegDots}
                            aria-label={`${step.passed} of ${step.total} checks`}
                          >
                            {view.checks.map((check) => (
                              <i className={check.status} key={check.key} />
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  },
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className={p.bWorkspace}>
        <ChatList
          busy={false}
          chats={view.chats}
          hasApplication={application !== null}
          onCreate={() => act("New chat")}
          onSelect={(id) => act(`Open chat ${id.slice(0, 8)}`)}
          selectedChatId={view.selectedChatId}
          workspace={view.workspace}
        />

        <section className={p.bChat}>
          <header className={p.bChatHead}>
            <div>
              <strong>{step.deliverable}</strong>
              <WaitingPill waitingOn={step.waitingOn} />
            </div>
            <p>
              <b>
                Phase {step.phaseNumber} · {step.phaseName}.
              </b>{" "}
              {step.purpose}
            </p>
            <p>{step.now}</p>
          </header>
          <div className={p.bTranscript}>
            <div className={p.bMessages}>
              <DemoBanner view={view} />
              {view.messages.map((message) => (
                <Transcript
                  key={message.id}
                  message={message}
                  cards={cards.get(message.id) ?? []}
                  view={view}
                />
              ))}
              {cards.get("__end__")?.length ? (
                <div className={p.bCardWrap}>
                  <span className={p.bCardLabel}>Current</span>
                  {cards.get("__end__")}
                </div>
              ) : null}
              {step.actions.length > 0 && !cards.size && (
                <div className={p.bCardWrap}>
                  <span className={p.bCardLabel}>Next</span>
                  <div className={p.card}>
                    <p>{step.now}</p>
                    <ActionButtons actions={step.actions} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <form
            className={p.bComposer}
            onSubmit={(event) => {
              event.preventDefault();
              act(`Send: ${composer}`);
            }}
          >
            <textarea
              aria-label="Message Server Guy"
              onChange={(event) => setComposer(event.target.value)}
              placeholder="Ask Server Guy, correct a decision, or add context…"
              value={composer}
            />
          </form>
        </section>

        <aside className={p.bRecord} aria-label="Application record">
          <div className={p.bTabs} role="tablist">
            <button
              aria-selected={tab === "record"}
              onClick={() => setTab("record")}
              role="tab"
              type="button"
            >
              Record
            </button>
            <button
              aria-selected={tab === "history"}
              onClick={() => setTab("history")}
              role="tab"
              type="button"
            >
              History
            </button>
          </div>
          <div className={p.bRecordBody}>
            {tab === "record" ? (
              <>
                <div className={p.bRecordSection}>
                  <strong>
                    Checks · {step.passed} of {step.total}
                  </strong>
                  <CheckRows checks={view.checks} onOpen={setCheckKey} />
                  {step.remaining && <p>{step.remaining}</p>}
                </div>
                {step.stages.length > 0 && (
                  <div className={p.bRecordSection}>
                    <strong>Stages</strong>
                    <StageList stages={step.stages} />
                  </div>
                )}
                {phaseThree && (
                  <div className={p.bRecordSection}>
                    <strong>Environment</strong>
                    <EnvironmentLine view={view} />
                    <PublishingLine view={view} />
                  </div>
                )}
                {view.contract && (
                  <div className={p.bRecordSection}>
                    <strong>Application Contract</strong>
                    <ContractCompact view={view} />
                  </div>
                )}
                {view.conformance?.brief && (
                  <div className={p.bRecordSection}>
                    <strong>
                      Conformance brief · base{" "}
                      {short(view.conformance.brief.baseSha)}
                    </strong>
                    <p>
                      Check set v
                      {view.conformance.brief.acceptance.definitionVersion} ·{" "}
                      {view.conformance.brief.acceptance.checks.length} profile
                      checks · allowed scope:{" "}
                      {view.conformance.brief.scope.allowed}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div
                  className={p.aFilters}
                  role="group"
                  aria-label="Filter history"
                >
                  {(
                    ["all", "changes", "checks", "sources"] as HistoryFilter[]
                  ).map((item) => (
                    <button
                      aria-pressed={filter === item}
                      key={item}
                      onClick={() => setFilter(item)}
                      type="button"
                    >
                      {item === "all"
                        ? "All"
                        : item === "changes"
                          ? "Changes"
                          : item === "checks"
                            ? "Checks"
                            : "Sources"}
                    </button>
                  ))}
                </div>
                <HistoryList view={view} filter={filter} />
              </>
            )}
          </div>
        </aside>
      </section>

      {selectedCheck && (
        <CheckDrawer
          busy={false}
          check={selectedCheck}
          onAsk={(check) => {
            setComposer(
              `Explain “${check.label}”, its current result, and what I can verify myself.`,
            );
            setCheckKey(null);
          }}
          onClose={() => setCheckKey(null)}
          onRerun={(key) => act(`Re-run ${key}`)}
        />
      )}
    </main>
  );
}

/** Cards keyed by the message that produced their record; "__end__" for
 * records with no message (a no-change candidate, a returned change). */
function cardsByMessage(view: OperatorView) {
  const cards = new Map<string, React.ReactNode[]>();
  // A record's source message is the request; its card belongs after the
  // reply that produced it, so it is slotted at the first assistant message
  // from the source onwards.
  const push = (key: string | null, node: React.ReactNode) => {
    const index = key
      ? view.messages.findIndex((message) => message.id === key)
      : -1;
    const reply =
      index >= 0
        ? view.messages
            .slice(index)
            .find((message) => message.role === "assistant")
        : undefined;
    const slot = reply?.id ?? "__end__";
    cards.set(slot, [...(cards.get(slot) ?? []), node]);
  };
  const step = describeCurrentStep(view);
  if (view.workspace?.phaseKey === "inspect-app" && view.contract) {
    push(
      view.contract.sourceMessageId,
      <div className={p.card} key="contract">
        <header>
          <span>
            <strong>
              Application Contract v{view.contract.version} · commit{" "}
              {short(view.contract.commitSha)}
            </strong>
            <small>
              {view.contract.body.fields.length} fields ·{" "}
              {view.contract.gaps.blockers.length} need a decision ·{" "}
              {view.contract.gaps.conformance.length} required change
              {view.contract.gaps.conformance.length === 1 ? "" : "s"} for Phase
              3
            </small>
          </span>
          <em
            className={
              view.workspace.status === "ready"
                ? p.badge_approved
                : p.badge_proposed
            }
          >
            {view.workspace.status === "ready" ? "Ready" : "In progress"}
          </em>
        </header>
        <p>{view.contract.body.summary}</p>
        {step.remaining && <p>{step.remaining}</p>}
        <ActionButtons actions={step.actions} compact />
      </div>,
    );
  }
  const conformance = view.conformance;
  if (conformance) {
    const acceptance = conformance.proposedAcceptance ?? conformance.acceptance;
    if (acceptance)
      push(
        acceptance.sourceMessageId,
        <AcceptanceCard key="acceptance" view={view} />,
      );
    for (const proposal of orderedProposals(view).slice().reverse())
      push(
        proposal.sourceMessageId,
        <ProposalCard key={proposal.id} proposal={proposal} view={view} />,
      );
    if (!conformance.proposal && step.actions.length)
      push(
        null,
        <div className={p.card} key="choose">
          <p>{step.now}</p>
          <ActionButtons actions={step.actions} compact />
        </div>,
      );
    if (conformance.latestCandidateRun)
      push(
        null,
        <div
          className={`${p.card} ${conformance.latestCandidateRun.status === "passed" ? "" : p.cardReplaced}`}
          key="run"
        >
          <header>
            <span>
              <strong>
                Conformance run over candidate{" "}
                {short(conformance.latestCandidateRun.source.commitSha)}
              </strong>
              <small>
                <LocalTime
                  value={
                    conformance.latestCandidateRun.finishedAt ??
                    conformance.latestCandidateRun.createdAt
                  }
                  variant="compact"
                />
              </small>
            </span>
            <em
              className={
                conformance.latestCandidateRun.status === "passed"
                  ? p.badge_approved
                  : p.badgeReplaced
              }
            >
              {conformance.latestCandidateRun.status}
            </em>
          </header>
          <p>{conformance.latestCandidateRun.summary}</p>
          {step.waitingOn !== "none" && (
            <ActionButtons actions={step.actions} compact />
          )}
        </div>,
      );
  }
  return cards;
}

function Transcript({
  message,
  cards,
  view,
}: {
  message: ChatMessage;
  cards: React.ReactNode[];
  view: OperatorView;
}) {
  const engineer = message.role === "user" && message.source === "user";
  void view;
  return (
    <>
      <div className={`${p.bMessage} ${engineer ? p.bMessageUser : ""}`}>
        <div className={p.bMessageHead}>
          <span
            className={`${p.bAvatar} ${engineer ? p.bAvatarUser : ""}`}
            aria-hidden="true"
          >
            {engineer ? "You" : "SG"}
          </span>
          <strong>{engineer ? "You" : "Server Guy"}</strong>
          {message.source === "server-guy" && (
            <span className={p.bTag}>
              {message.role === "user"
                ? "Started automatically"
                : "Recorded event"}
            </span>
          )}
          <LocalTime value={message.createdAt} variant="compact" />
        </div>
        <div className={p.bBody}>
          <Markdown source={message.body} />
        </div>
      </div>
      {cards.length > 0 && (
        <div className={p.bCardWrap}>
          <span className={p.bCardLabel}>
            Saved from this reply · current status
          </span>
          {cards}
        </div>
      )}
    </>
  );
}
