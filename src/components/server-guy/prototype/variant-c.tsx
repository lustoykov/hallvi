"use client";

// PROTOTYPE — Variant C: "Current-step bar + outline record" (hybrid).
//   Top bar: brand and app switcher only; environment and policy are a muted
//   subtitle under the application name; Settings on the right. Phase strip
//   unchanged beneath.
//   Chat column: a persistent current-step bar above the transcript —
//   phase purpose, what is happening, who is waited on, the next actions —
//   and, in Phase 3, the stages as a horizontal row. The transcript is the
//   production one; messages that produced records get small reference chips
//   ("Proposed change · Replaced") that jump to the record section.
//   Right column: no tabs. One scrollable outline with a jump nav — Now,
//   Checks, Contract (with versions), Change & checks, Runs, Environment,
//   History — each a collapsible section with a one-line summary.
import { CaretDown, GearSix } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import type { PiSetupStatus } from "@/server/pi-setup";
import type { OperatorView } from "@/server/types";

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
  policyHint,
  policyLabel,
  short,
} from "./shared";
import { usePrototypeAction } from "./switcher";

export function VariantC({
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
  const activeChat =
    view.chats.find((chat) => chat.id === view.selectedChatId) ?? null;
  const selectedCheck =
    view.checks.find((check) => check.key === checkKey) ?? null;
  const conformance = view.conformance;
  const phaseThree = view.workspace?.phaseKey === "make-launch-ready";
  const proposals = orderedProposals(view);
  const tone =
    step.waitingOn === "none"
      ? "done"
      : step.waitingOn === "server-guy"
        ? "idle"
        : "";

  return (
    <main className={p.cShell}>
      <header className={p.cTopbar}>
        <div className={p.cIdentity}>
          <Link
            href="/applications"
            aria-label="Server Guy, all applications"
            style={{ display: "inline-flex", color: "#fff" }}
          >
            <span className="sg-app-mark">SG</span>
          </Link>
          <button
            className={p.cPicker}
            type="button"
            onClick={() => act("Open application switcher")}
          >
            <strong>
              {application?.name} <CaretDown weight="bold" aria-hidden="true" />
            </strong>
            <small title={policyHint(view)}>
              {application?.repositoryOwner}/{application?.repositoryName} ·{" "}
              <b>Production</b> · {policyLabel(view)}
            </small>
          </button>
        </div>
        <Link className={p.cSettings} href="/setup/pi">
          <GearSix aria-hidden="true" />
          {piSetup.ready ? "Settings" : "Settings · Connect ChatGPT"}
        </Link>
      </header>

      <PhaseRail
        busy={false}
        checks={view.checks}
        onSelectPhase={(key) => act(`View phase ${key}`)}
        viewedPhaseKey={view.workspace?.phaseKey ?? null}
        workspaces={view.workspaces}
      />

      <section className={p.cWorkspace}>
        <ChatList
          busy={false}
          chats={view.chats}
          hasApplication={application !== null}
          onCreate={() => act("New chat")}
          onSelect={(id) => act(`Open chat ${id.slice(0, 8)}`)}
          selectedChatId={view.selectedChatId}
          workspace={view.workspace}
        />

        <div className={p.cChatColumn}>
          <section className={p.cStepBar} aria-label="Current step">
            <div className={p.cStepHead}>
              <h2>
                Phase {step.phaseNumber} · {step.phaseName}
                <small>{step.deliverable}</small>
              </h2>
              <WaitingPill waitingOn={step.waitingOn} />
            </div>
            <p className={p.cStepPurpose}>{step.purpose}</p>
            <div
              className={`${p.cStepNow} ${tone ? (p[tone] ?? tone) : ""}`}
              data-tone={tone}
            >
              <p>
                <b>Now</b>
                {step.now}
              </p>
              <ActionButtons actions={step.actions} compact />
            </div>
            {step.stages.length > 0 && (
              <StageList stages={step.stages} horizontal />
            )}
            <DemoBanner view={view} />
          </section>
          <div className={p.cChatInner}>
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
          </div>
        </div>

        <aside className={p.cRecord} aria-label="Application record">
          <nav className={p.cOutlineNav} aria-label="Record sections">
            <a href="#c-checks">
              Checks
              <small>
                {step.passed}/{step.total}
              </small>
            </a>
            {view.contract && (
              <a href="#c-contract">
                Contract<small>v{view.contract.version}</small>
              </a>
            )}
            {phaseThree && (
              <a href="#c-changes">
                Change<small>{proposals.length || ""}</small>
              </a>
            )}
            {phaseThree && (
              <a href="#c-runs">
                Runs<small>{conformance?.runs.length || ""}</small>
              </a>
            )}
            {phaseThree && <a href="#c-environment">Environment</a>}
            <a href="#c-history">
              History
              <small>{view.activity.length + view.observations.length}</small>
            </a>
          </nav>
          <div className={p.cOutlineBody}>
            <details className={p.cSection} id="c-checks" open>
              <summary>
                <strong>Checks</strong>
                <small>
                  {step.passed} of {step.total} pass
                </small>
                <em
                  className={step.passed === step.total ? p.status_passed : ""}
                >
                  {step.passed === step.total
                    ? "All pass"
                    : `${step.total - step.passed} open`}
                </em>
              </summary>
              <div className={p.cSectionBody}>
                <CheckRows checks={view.checks} onOpen={setCheckKey} />
                {step.remaining && <p>{step.remaining}</p>}
              </div>
            </details>

            {view.contract && (
              <details
                className={p.cSection}
                id="c-contract"
                open={!phaseThree}
              >
                <summary>
                  <strong>Application Contract</strong>
                  <small>
                    v{view.contract.version} ·{" "}
                    {view.contract.body.fields.length} fields · commit{" "}
                    {short(view.contract.commitSha)}
                  </small>
                  <em>
                    {view.contract.gaps.blockers.length
                      ? `${view.contract.gaps.blockers.length} need a decision`
                      : `${view.contract.gaps.conformance.length} required change${view.contract.gaps.conformance.length === 1 ? "" : "s"}`}
                  </em>
                </summary>
                <div className={p.cSectionBody}>
                  <ContractCompact view={view} showVersions={false} />
                  <details>
                    <summary className={p.muted}>Saved versions</summary>
                    <VersionHistory view={view} />
                  </details>
                </div>
              </details>
            )}

            {phaseThree && conformance && (
              <details className={p.cSection} id="c-changes" open>
                <summary>
                  <strong>Change and behavior checks</strong>
                  <small>
                    {conformance.proposal
                      ? `${conformance.proposal.origin === "no-change" ? "no change" : `${conformance.proposal.changes.length} file${conformance.proposal.changes.length === 1 ? "" : "s"}`} · ${conformance.proposal.status}`
                      : "nothing proposed yet"}
                    {conformance.acceptance
                      ? ` · behavior v${conformance.acceptance.version} accepted`
                      : conformance.proposedAcceptance
                        ? ` · behavior v${conformance.proposedAcceptance.version} proposed`
                        : ""}
                  </small>
                  {proposals.length > 1 && (
                    <em>{proposals.length - 1} replaced</em>
                  )}
                </summary>
                <div className={p.cSectionBody}>
                  {conformance.brief && (
                    <p>
                      Brief · base {short(conformance.brief.baseSha)} ·{" "}
                      {conformance.brief.requiredChanges.length} required change
                      {conformance.brief.requiredChanges.length === 1
                        ? ""
                        : "s"}
                      {conformance.brief.requiredChanges.length
                        ? `: ${conformance.brief.requiredChanges.map((item) => item.label).join(", ")}`
                        : ""}{" "}
                      · allowed scope: {conformance.brief.scope.allowed}
                    </p>
                  )}
                  <AcceptanceCard view={view} compact />
                  {proposals.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      view={view}
                      compact
                      showActions={false}
                    />
                  ))}
                  {!proposals.length && (
                    <p>
                      No change proposed yet. Use the actions above the chat.
                    </p>
                  )}
                </div>
              </details>
            )}

            {phaseThree && conformance && (
              <details className={p.cSection} id="c-runs">
                <summary>
                  <strong>Runs</strong>
                  <small>
                    {conformance.runs.length
                      ? `${conformance.runs.length} · latest ${conformance.runs[0]?.kind} ${conformance.runs[0]?.status}`
                      : "none yet"}
                  </small>
                </summary>
                <div className={p.cSectionBody}>
                  <RunRows
                    runs={conformance.runs}
                    definitions={conformance.brief?.acceptance.checks ?? []}
                  />
                </div>
              </details>
            )}

            {phaseThree && (
              <details className={p.cSection} id="c-environment">
                <summary>
                  <strong>Environment</strong>
                  <small>
                    Docker{" "}
                    {conformance?.environment
                      ? conformance.environment.ready
                        ? "ready"
                        : "needs attention"
                      : "not checked"}{" "}
                    · publishing{" "}
                    {conformance?.grant ? "allowed" : "not allowed"}
                  </small>
                </summary>
                <div className={p.cSectionBody}>
                  <EnvironmentLine view={view} />
                  <PublishingLine view={view} />
                </div>
              </details>
            )}

            <details className={p.cSection} id="c-history">
              <summary>
                <strong>History</strong>
                <small>
                  {view.activity.length} events · {view.observations.length}{" "}
                  source reads
                </small>
              </summary>
              <div className={p.cSectionBody}>
                <p>
                  What happened to this application. Ordinary replies are not
                  here; source reads are.
                </p>
                <HistoryList view={view} />
              </div>
            </details>
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
