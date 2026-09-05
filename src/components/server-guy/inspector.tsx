"use client";

import {
  ArrowSquareOut,
  CaretRight,
  Check,
  GithubLogo,
  Warning,
} from "@phosphor-icons/react";
import { useId, useState } from "react";

import type { GateCheck, PhaseOneOperatorView } from "@/server/types";

import { statusLabel } from "./format";
import { LocalTime } from "./local-time";

type InspectorTab = "record" | "activity" | "changes" | "receipts";
const tabs = ["record", "activity", "changes", "receipts"] as const;

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
  onSelectCheck,
}: {
  view: PhaseOneOperatorView;
  checks: GateCheck[];
  onSelectCheck: (key: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("record");
  const tabId = useId();
  const passed = checks.filter((check) => check.status === "passed").length;
  const ready = view.workspace?.status === "ready";

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
                <strong>Launch Brief</strong>
                <span className={ready ? "ready" : undefined}>
                  {ready
                    ? "Ready for review"
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

        {activeTab === "activity" && (
          <section className="sg-inspector-section">
            <span className="sg-eyebrow">What happened</span>
            {view.activity.length ? (
              view.activity.map((event) => (
                <article className="sg-event" key={event.id}>
                  <span className="sg-event-dot" />
                  <div>
                    <strong>{event.summary}</strong>
                    <p>{event.detail}</p>
                    <LocalTime value={event.createdAt} />
                  </div>
                </article>
              ))
            ) : (
              <p>Activity will appear after the workspace is created.</p>
            )}
          </section>
        )}

        {activeTab === "changes" && (
          <section className="sg-empty-state">
            <div className="sg-empty-icon">
              <GithubLogo />
            </div>
            <strong>No external changes in Phase 1</strong>
            <p>
              Start reads GitHub and writes only to Server Guy’s local record.
              Code and infrastructure remain untouched.
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
