"use client";

import {
  ArrowRight,
  ArrowSquareOut,
  CaretRight,
  Check,
  GithubLogo,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { useId, useState } from "react";

import type {
  ActivityEvent,
  GateCheck,
  InspectAppEvidence,
  LaunchBriefEvidence,
  OperatorView,
} from "@/server/types";

import {
  ConformanceRecord,
  type ConformanceAction,
} from "./conformance-record";
import { ContractRecord } from "./contract-record";
import { statusLabel } from "./format";
import { LocalTime } from "./local-time";

type InspectorTab = "record" | "activity" | "changes" | "receipts";
const tabs = ["record", "activity", "changes", "receipts"] as const;

// A verification result colors its marker; requirement and workspace events
// keep the neutral one.
function eventTone(kind: string) {
  if (
    kind === "repository-observed" ||
    kind === "repository-inspected" ||
    kind === "phase-completed" ||
    kind === "contract-established" ||
    kind === "change-published" ||
    kind === "candidate-recorded" ||
    kind === "conformance-passed" ||
    kind === "acceptance-accepted" ||
    kind === "publication-granted"
  )
    return "passed";
  if (
    kind === "repository-unavailable" ||
    kind === "repository-inspection-failed" ||
    kind === "repository-verification-invalidated" ||
    kind === "repository-inspection-invalidated" ||
    kind === "conformance-failed" ||
    kind === "conformance-incomplete" ||
    kind === "change-publication-failed" ||
    kind === "change-withdrawn"
  )
    return "attention";
  return "";
}

/**
 * What happened to this application: saved or changed requirements,
 * repository checks and inspections, phase transitions, contracts and
 * connection consequences. How a reply was produced is not an event here;
 * local logs and traces hold its diagnostics.
 */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="sg-inspector-section">
      <p className="sg-inspector-hint">
        What happened to this application: saved requirements, repository checks
        and inspections, phase transitions, contracts, proposed and published
        changes, candidates, conformance runs and connection changes.
      </p>
      {events.length ? (
        events.map((event) => (
          <article className="sg-event" key={event.id}>
            <span className={`sg-event-dot ${eventTone(event.kind)}`} />
            <div>
              <strong>{event.summary}</strong>
              <p>{event.detail}</p>
              <LocalTime value={event.createdAt} />
            </div>
          </article>
        ))
      ) : (
        <p>No application events yet.</p>
      )}
    </section>
  );
}

export function CheckIcon({ status }: { status: GateCheck["status"] }) {
  return (
    <span aria-hidden="true" className={`sg-check-icon ${status}`}>
      {status === "passed" && <Check weight="bold" />}
      {status === "blocked" && <Warning weight="bold" />}
    </span>
  );
}

export function Inspector({
  view,
  checks,
  busy,
  onSelectCheck,
  onContinue,
  onConformance,
}: {
  view: OperatorView;
  checks: GateCheck[];
  busy: string | null;
  onSelectCheck: (key: string) => void;
  /** The explicit transition into the next phase from a ready deliverable. */
  onContinue: () => void;
  onConformance: (action: ConformanceAction) => void;
}) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("record");
  const tabId = useId();
  const passed = checks.filter((check) => check.status === "passed").length;
  const workspace = view.workspace;
  const completed = workspace?.status === "completed";
  const ready = workspace?.status === "ready";
  const canContinue = Boolean(
    workspace?.current &&
    ready &&
    (workspace.phaseKey === "start" || workspace.phaseKey === "inspect-app"),
  );
  const evidence = completed
    ? (workspace?.deliverableEvidence as Partial<
        LaunchBriefEvidence | InspectAppEvidence
      > | null)
    : null;
  const proposal = view.conformance?.proposal ?? null;

  return (
    <aside className="sg-inspector">
      <div
        className="sg-inspector-tabs"
        role="tablist"
        aria-label="Application record views"
      >
        {tabs.map((tab, index) => (
          <button
            id={`${tabId}-${tab}`}
            aria-controls={`${tabId}-panel`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            className={activeTab === tab ? "selected" : ""}
            key={tab}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setActiveTab(tabs[next]);
              document.getElementById(`${tabId}-${tabs[next]}`)?.focus();
            }}
            role="tab"
            type="button"
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div
        className="sg-inspector-body"
        id={`${tabId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === "record" && (
          <>
            <div className="sg-record-heading">
              <div>
                <strong>{workspace?.deliverable ?? "Launch Brief"}</strong>
                <span className={ready || completed ? "ready" : undefined}>
                  {completed
                    ? "Completed"
                    : ready
                      ? workspace?.phaseKey === "start"
                        ? "Launch Brief ready"
                        : "Ready for review"
                      : `${passed} of ${checks.length} checks complete`}
                </span>
              </div>
              <div
                className="sg-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={checks.length}
                aria-valuenow={passed}
                aria-label={`${passed} of ${checks.length} checks complete`}
              >
                <i
                  style={{
                    transform: `scaleX(${checks.length ? passed / checks.length : 0})`,
                  }}
                />
              </div>
            </div>
            {completed && evidence?.completedAt && (
              <p className="sg-record-notice" role="note">
                Completed <LocalTime value={evidence.completedAt} />. These
                checks are retained as recorded then; they are not re-evaluated.
                Later changes appear in the current phase.
              </p>
            )}
            {canContinue && (
              <div className="sg-phase-continue">
                <p>
                  {workspace?.phaseKey === "start"
                    ? "All four checks pass. Continue to Phase 2, where Server Guy inspects the repository and proposes the Application Contract. Phase 1 chats become read-only."
                    : "All four checks pass. Continue to Phase 3, where the contract's required changes are made, published for your review and verified in an isolated runner. Phase 2 chats become read-only."}
                </p>
                <button
                  className="sg-primary-button"
                  disabled={busy !== null}
                  onClick={onContinue}
                  type="button"
                >
                  {busy === "continue" ? (
                    <SpinnerGap className="spin" aria-hidden="true" />
                  ) : (
                    <ArrowRight aria-hidden="true" weight="bold" />
                  )}
                  {workspace?.phaseKey === "start"
                    ? "Continue to Inspect app"
                    : "Continue to Make launch-ready"}
                </button>
              </div>
            )}
            {workspace?.current &&
              ready &&
              workspace.phaseKey === "make-launch-ready" && (
                <p className="sg-record-notice" role="note">
                  The Conformance Result checks pass for the exact candidate.
                  Phase 4, Review launch plan, is not available in this build.
                </p>
              )}
            <div className="sg-check-list">
              {checks.map((check, index) => (
                <button
                  className="sg-check"
                  key={check.key}
                  onClick={() => onSelectCheck(check.key)}
                  type="button"
                >
                  <CheckIcon status={check.status} />
                  <span className="sg-check-copy">
                    <small>Check {index + 1}</small>
                    <strong>{check.label}</strong>
                    <span className="sg-check-result">{check.result}</span>
                  </span>
                  <span className={`sg-check-status ${check.status}`}>
                    {statusLabel(check.status)}
                  </span>
                  <CaretRight aria-hidden="true" />
                </button>
              ))}
            </div>
            {workspace?.phaseKey === "inspect-app" && view.application && (
              <ContractRecord
                application={view.application}
                contract={view.contract}
                inspection={view.inspection}
              />
            )}
            {workspace?.phaseKey === "make-launch-ready" &&
              view.application &&
              view.conformance && (
                <ConformanceRecord
                  application={view.application}
                  approvalMode={view.application.approvalMode}
                  busy={busy}
                  conformance={view.conformance}
                  onAction={onConformance}
                  readOnly={completed}
                />
              )}
            {view.decisions.length > 0 && (
              <details className="sg-saved-requirements">
                <summary>Saved requirements ({view.decisions.length})</summary>
                <div className="sg-decision-list">
                  {view.decisions.map((decision) => (
                    <a
                      href={`/api/decisions/${decision.id}`}
                      key={decision.id}
                      rel="noreferrer"
                      target="_blank"
                      title="Open the saved requirement"
                    >
                      <strong>{decision.value}</strong>
                      <ArrowSquareOut aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {activeTab === "activity" && <ActivityFeed events={view.activity} />}

        {activeTab === "changes" &&
          (proposal ? (
            <section className="sg-inspector-section">
              <span className="sg-eyebrow">Repository changes</span>
              <article className="sg-receipt">
                <div>
                  <GithubLogo weight="fill" />
                  <span>
                    <strong>
                      {proposal.origin === "external"
                        ? "Returned change"
                        : proposal.origin === "no-change"
                          ? "No change required"
                          : "Server Guy's proposed change"}
                    </strong>
                    <small>
                      <LocalTime value={proposal.createdAt} />
                    </small>
                  </span>
                  <em className={proposal.candidate ? "passed" : "unavailable"}>
                    {proposal.candidate ? "merged" : proposal.status}
                  </em>
                </div>
                <p>{proposal.summary}</p>
                <ul className="sg-changed-files">
                  {proposal.changes.map((change) => (
                    <li key={change.path}>
                      <code>{change.path}</code>
                      {change.content === null && <small>deleted</small>}
                    </li>
                  ))}
                </ul>
                <div className="sg-receipt-actions">
                  <a
                    href={`/api/conformance/proposals/${proposal.id}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Complete diff <ArrowSquareOut aria-hidden="true" />
                  </a>
                  {(proposal.publication?.pullRequestUrl ??
                    proposal.external?.pullRequestUrl) && (
                    <a
                      href={
                        proposal.publication?.pullRequestUrl ??
                        proposal.external?.pullRequestUrl ??
                        ""
                      }
                      rel="noreferrer"
                      target="_blank"
                    >
                      Pull request <ArrowSquareOut aria-hidden="true" />
                    </a>
                  )}
                </div>
              </article>
              <p className="sg-inspector-hint">
                Server Guy publishes a branch and pull request; it never merges.
                The candidate is the exact revision observed on the default
                branch after your merge.
              </p>
            </section>
          ) : (
            <section className="sg-empty-state">
              <div className="sg-empty-icon">
                <GithubLogo />
              </div>
              <strong>No external changes yet</strong>
              <p>
                Server Guy has only read the repository and written to its own
                local record. A proposed change appears here before it is
                published as a branch and pull request for your review.
              </p>
            </section>
          ))}

        {activeTab === "receipts" && (
          <section className="sg-inspector-section">
            <span className="sg-eyebrow">Source receipts</span>
            {view.observations.length ? (
              view.observations.map((observation) => (
                <article className="sg-receipt" key={observation.id}>
                  <div>
                    <GithubLogo weight="fill" />
                    <span>
                      <strong>{observation.sourceLabel}</strong>
                      <small>
                        <LocalTime value={observation.observedAt} />
                      </small>
                    </span>
                    <em className={observation.status}>{observation.status}</em>
                  </div>
                  <p>{observation.summary}</p>
                  <div className="sg-receipt-actions">
                    <a
                      href={`/api/observations/${observation.id}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Raw receipt <ArrowSquareOut aria-hidden="true" />
                    </a>
                    {observation.sourceUrl && (
                      <a
                        href={observation.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open source <ArrowSquareOut aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p>No external source has been checked yet.</p>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
