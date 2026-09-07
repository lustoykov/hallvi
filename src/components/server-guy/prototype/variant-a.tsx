"use client";

// PROTOTYPE — Variant A: "Now panel + focused details".
//   Top bar: identity only (app switcher with repository beneath), the
//   environment and policy demoted to a muted context line; phase appears
//   only in the strip. Settings names its connection state in words.
//   Right column: a "Now" panel — phase purpose, what is happening, who is
//   waited on, the distinct next actions, Phase 3 stages, then compact checks.
//   Everything else (contract, versions, sources, changes, runs, history)
//   opens in one wide focused Details overlay with a left section nav.
//   Actions live only in the Now panel; the chat stays a plain transcript.
import {
  ArrowRight,
  CaretDown,
  ChatCircleDots,
  GearSix,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";

import type { PiSetupStatus } from "@/server/pi-setup";
import type { GateCheck, OperatorView } from "@/server/types";

import { ChatList } from "../chat-list";
import { ChatPane } from "../chat-pane";
import { CheckDrawer } from "../check-drawer";
import { PhaseRail } from "../phase-rail";
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
  RunRows,
  StageList,
  VersionHistory,
  WaitingPill,
  orderedProposals,
  policyLabel,
  type HistoryFilter,
} from "./shared";
import { usePrototypeAction } from "./switcher";

type Section =
  "checks" | "contract" | "versions" | "changes" | "runs" | "history";

export function VariantA({
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
  const [section, setSection] = useState<Section | null>(null);
  const activeChat =
    view.chats.find((chat) => chat.id === view.selectedChatId) ?? null;
  const selectedCheck =
    view.checks.find((check) => check.key === checkKey) ?? null;
  const phaseThree = view.workspace?.phaseKey === "make-launch-ready";
  const tone =
    step.waitingOn === "none"
      ? p.aStatusDone
      : step.waitingOn === "server-guy"
        ? p.aStatusIdle
        : "";

  return (
    <main className={p.aShell}>
      <header className={p.aTopbar}>
        <div className={p.aIdentity}>
          <Link
            className={p.aBrand}
            href="/applications"
            aria-label="Server Guy, all applications"
          >
            <span className="sg-app-mark">SG</span>
          </Link>
          <button
            className={p.aPicker}
            type="button"
            onClick={() => act("Open application switcher")}
          >
            <strong>{application?.name}</strong>
            <small>
              {application?.repositoryOwner}/{application?.repositoryName}
            </small>
            <CaretDown weight="bold" aria-hidden="true" />
          </button>
          <span
            className={p.aContext}
            title="Saved in Phase 1; the server is chosen in Phase 5"
          >
            <b>Production</b>
            <i aria-hidden="true" />
            <span>{policyLabel(view)}</span>
          </span>
        </div>
        <div className={p.aRight}>
          <Link className={p.aSettings} href="/setup/pi">
            <GearSix aria-hidden="true" />
            {piSetup.ready
              ? "Settings · ChatGPT connected"
              : "Settings · Connect ChatGPT"}
          </Link>
        </div>
      </header>

      <PhaseRail
        busy={false}
        checks={view.checks}
        onSelectPhase={(key) => act(`View phase ${key}`)}
        viewedPhaseKey={view.workspace?.phaseKey ?? null}
        workspaces={view.workspaces}
      />

      <section className={p.aWorkspace}>
        <ChatList
          busy={false}
          chats={view.chats}
          hasApplication={application !== null}
          onCreate={() => act("New chat")}
          onSelect={(id) => act(`Open chat ${id.slice(0, 8)}`)}
          selectedChatId={view.selectedChatId}
          workspace={view.workspace}
        />
        <ChatPane
          activeChat={activeChat}
          busy={null}
          composer={composer}
          error={null}
          pendingMessage={null}
          piReady={piSetup.ready}
          onArchive={() => act("Archive chat")}
          onComposerChange={setComposer}
          onSend={() => act(`Send: ${composer}`)}
          runs={[]}
          reconnecting={false}
          onRunAction={() => act("Run action")}
          onNewChat={() => act("New chat")}
          view={view}
        />

        <aside className={p.aNow} aria-label="Current step">
          <div className={p.aNowBody}>
            <DemoBanner view={view} />
            <div className={p.aPhase}>
              <span>
                <span className={p.aEyebrow}>
                  Phase {step.phaseNumber} of 9 · {step.deliverable}
                </span>
                <WaitingPill waitingOn={step.waitingOn} />
              </span>
              <h2>{step.phaseName}</h2>
              <p>{step.purpose}</p>
            </div>

            <div className={`${p.aStatus} ${tone}`}>
              <p>{step.now}</p>
              <ActionButtons
                actions={step.actions}
                onLink={(action) => {
                  // Review before deciding: approvals and acceptances open the
                  // change itself; the buttons there are the real ones.
                  if (
                    action.key.startsWith("approve:") ||
                    action.key.startsWith("accept-checks:")
                  )
                    setSection("changes");
                }}
              />
              {step.remaining && step.waitingOn !== "you" && (
                <p className={p.aRemaining}>{step.remaining}</p>
              )}
            </div>

            {step.stages.length > 0 && (
              <div className={p.aSection}>
                <header>
                  <strong>Stages</strong>
                </header>
                <StageList stages={step.stages} />
              </div>
            )}

            <div className={p.aSection}>
              <header>
                <strong>
                  Checks · {step.passed} of {step.total}
                </strong>
                <button onClick={() => setSection("checks")} type="button">
                  What each check means
                </button>
              </header>
              <div className={p.aProgress} aria-hidden="true">
                <i
                  style={{
                    transform: `scaleX(${step.total ? step.passed / step.total : 0})`,
                  }}
                />
              </div>
              <CheckRows checks={view.checks} onOpen={setCheckKey} />
            </div>

            {phaseThree && (
              <div className={p.aSection}>
                <header>
                  <strong>Environment</strong>
                </header>
                <EnvironmentLine view={view} />
                <PublishingLine view={view} />
              </div>
            )}

            <button
              className={`sg-secondary-button ${p.aDetailsButton}`}
              onClick={() => setSection(phaseThree ? "changes" : "contract")}
              type="button"
            >
              {phaseThree
                ? `Details · change, behavior checks, runs, contract v${view.contract?.version ?? "?"}, history`
                : `Details · contract v${view.contract?.version ?? "?"}, sources, history`}
              <ArrowRight weight="bold" aria-hidden="true" />
            </button>
          </div>
        </aside>
      </section>

      {selectedCheck && (
        <CheckDrawer
          busy={false}
          check={selectedCheck}
          onAsk={(check: GateCheck) => {
            setComposer(
              `Explain “${check.label}”, its current result, and what I can verify myself.`,
            );
            setCheckKey(null);
          }}
          onClose={() => setCheckKey(null)}
          onRerun={(key) => act(`Re-run ${key}`)}
        />
      )}
      {section && (
        <DetailsOverlay
          view={view}
          section={section}
          onSection={setSection}
          onClose={() => setSection(null)}
        />
      )}
    </main>
  );
}

function DetailsOverlay({
  view,
  section,
  onSection,
  onClose,
}: {
  view: OperatorView;
  section: Section;
  onSection: (section: Section) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const conformance = view.conformance;
  const phaseThree = view.workspace?.phaseKey === "make-launch-ready";
  const proposals = orderedProposals(view);
  const sections: Array<{ key: Section; label: string; count?: string }> = [
    {
      key: "checks",
      label: "Checks",
      count: `${view.checks.filter((c) => c.status === "passed").length}/${view.checks.length}`,
    },
    {
      key: "contract",
      label: "Contract",
      count: view.contract ? `v${view.contract.version}` : undefined,
    },
    { key: "versions", label: "Versions" },
    ...(phaseThree
      ? [
          {
            key: "changes" as const,
            label: "Change & checks",
            count: proposals.length ? String(proposals.length) : undefined,
          },
          {
            key: "runs" as const,
            label: "Runs",
            count: conformance?.runs.length
              ? String(conformance.runs.length)
              : undefined,
          },
        ]
      : []),
    {
      key: "history",
      label: "History",
      count: String(view.activity.length + view.observations.length),
    },
  ];
  return (
    <dialog
      ref={dialogRef}
      className={p.aDialog}
      aria-label="Details"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={p.aDetails}>
        <header className={p.aDetailsHead}>
          <div>
            <h2>
              {view.application?.name} · Phase {view.workspace?.phaseNumber} ·{" "}
              {view.workspace?.deliverable}
            </h2>
            <small>
              Saved records for this phase. Nothing here is a model’s claim.
            </small>
          </div>
          <button
            aria-label="Close details"
            className="sg-icon-button"
            onClick={onClose}
            type="button"
          >
            <X />
          </button>
        </header>
        <nav className={p.aDetailsNav} aria-label="Detail sections">
          {sections.map((item) => (
            <button
              aria-current={section === item.key}
              key={item.key}
              onClick={() => onSection(item.key)}
              type="button"
            >
              {item.label}
              {item.count && <small>{item.count}</small>}
            </button>
          ))}
        </nav>
        <div className={p.aDetailsBody}>
          {section === "checks" && (
            <>
              <h3>What each check means</h3>
              {view.checks.map((check, index) => (
                <div className={p.card} key={check.key}>
                  <header>
                    <span>
                      <strong>
                        {index + 1}. {check.label}
                      </strong>
                      <small>{check.result}</small>
                    </span>
                    <em
                      className={
                        check.status === "passed"
                          ? p.badge_approved
                          : check.status === "blocked"
                            ? p.badgeReplaced
                            : p.badge_proposed
                      }
                    >
                      {check.status === "passed"
                        ? "Passed"
                        : check.status === "blocked"
                          ? "Blocked"
                          : "Not yet"}
                    </em>
                  </header>
                  <p>{check.definition}</p>
                </div>
              ))}
            </>
          )}
          {section === "contract" && (
            <>
              <h3>Application Contract</h3>
              <ContractCompact view={view} open showVersions={false} />
            </>
          )}
          {section === "versions" && (
            <>
              <h3>Saved versions</h3>
              <p className={p.muted}>
                Earlier versions stay read-only. Each entry says what changed
                and why.
              </p>
              <VersionHistory view={view} />
            </>
          )}
          {section === "changes" && conformance && (
            <>
              <h3>Change and behavior checks</h3>
              <AcceptanceCard view={view} />
              {proposals.length ? (
                proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    view={view}
                  />
                ))
              ) : (
                <p className={p.muted}>No change proposed yet.</p>
              )}
            </>
          )}
          {section === "runs" && conformance && (
            <>
              <h3>Runs</h3>
              <RunRows
                runs={conformance.runs}
                definitions={conformance.brief?.acceptance.checks ?? []}
              />
            </>
          )}
          {section === "history" && (
            <>
              <h3>History</h3>
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
                      ? "Everything"
                      : item === "changes"
                        ? "Decisions & changes"
                        : item === "checks"
                          ? "Checks & phases"
                          : "Source reads"}
                  </button>
                ))}
              </div>
              <HistoryList view={view} filter={filter} />
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

export const VariantAHint = ChatCircleDots;
