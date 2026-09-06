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
  LaunchBriefEvidence,
  OperatorView,
} from "@/server/types";

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
    kind === "contract-established"
  )
    return "passed";
  if (
    kind === "repository-unavailable" ||
    kind === "repository-inspection-failed" ||
    kind === "repository-verification-invalidated" ||
    kind === "repository-inspection-invalidated"
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
        and inspections, phase transitions, contracts and connection changes.
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
}: {
  view: OperatorView;
  checks: GateCheck[];
  busy: string | null;
  onSelectCheck: (key: string) => void;
  /** The explicit transition from a ready Launch Brief into Inspect app. */
  onContinue: () => void;
}) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("record");
  const tabId = useId();
  const passed = checks.filter((check) => check.status === "passed").length;
  const workspace = view.workspace;
  const completed = workspace?.status === "completed";
  const ready = workspace?.status === "ready";
  const canContinue = Boolean(
    workspace?.current && ready && workspace.phaseKey === "start",
  );
  const evidence = completed
    ? (workspace?.deliverableEvidence as Partial<LaunchBriefEvidence> | null)
    : null;

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
                  All four checks pass. Continue to Phase 2, where Server Guy
                  inspects the repository and proposes the Application Contract.
                  Phase 1 chats become read-only.
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
                  Continue to Inspect app
                </button>
              </div>
            )}
            {workspace?.current &&
              ready &&
              workspace.phaseKey === "inspect-app" && (
                <p className="sg-record-notice" role="note">
                  The Application Contract checks pass. Phase 3, Make
                  launch-ready, is not available in this build; its conformance
                  work is recorded below.
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

        {activeTab === "changes" && (
          <section className="sg-empty-state">
            <div className="sg-empty-icon">
              <GithubLogo />
            </div>
            <strong>No external changes yet</strong>
            <p>
              Server Guy has only read the repository and written to its own
              local record. Code and infrastructure remain untouched;
              conformance work is recorded for Phase 3.
            </p>
          </section>
        )}

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
