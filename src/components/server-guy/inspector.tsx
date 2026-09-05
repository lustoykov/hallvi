"use client";

import {
  ArrowSquareOut,
  CaretRight,
  Check,
  Circle,
  GithubLogo,
} from "@phosphor-icons/react";
import { useId, useState } from "react";

import type { GateCheck, PhaseOneOperatorView } from "@/server/types";

import { formatTimestamp, statusLabel } from "./format";

type InspectorTab = "record" | "activity" | "changes" | "receipts";
const tabs = ["record", "activity", "changes", "receipts"] as const;

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
              <span className="sg-eyebrow">Launch Brief</span>
              <div>
                <strong>
                  {passed} of {checks.length} checks complete
                </strong>
                <span>
                  {view.workspace?.status === "ready"
                    ? "Ready for review"
                    : "Working toward the exit gate"}
                </span>
              </div>
              <div
                className="sg-progress"
                aria-label={`${passed} of ${checks.length} checks complete`}
              >
                <i style={{ width: `${(passed / checks.length) * 100}%` }} />
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
                  <span className={`sg-check-icon ${check.status}`}>
                    {check.status === "passed" ? (
                      <Check weight="bold" />
                    ) : (
                      <Circle weight="bold" />
                    )}
                  </span>
                  <span className="sg-check-copy">
                    <small>Check {index + 1}</small>
                    <strong>{check.label}</strong>
                  </span>
                  <span className={`sg-check-status ${check.status}`}>
                    {statusLabel(check.status)}
                  </span>
                  <CaretRight />
                </button>
              ))}
            </div>
            <section className="sg-record-section">
              <span className="sg-eyebrow">Recorded decisions</span>
              {view.decisions.length ? (
                <div className="sg-decision-list">
                  {view.decisions.map((decision) => (
                    <a
                      href={`/api/decisions/${decision.id}`}
                      key={decision.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span>{decision.label}</span>
                      <strong>{decision.value}</strong>
                      <ArrowSquareOut />
                    </a>
                  ))}
                </div>
              ) : (
                <p>No decisions recorded yet.</p>
              )}
            </section>
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
                    <time dateTime={event.createdAt}>
                      {formatTimestamp(event.createdAt)}
                    </time>
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
                      <small>{formatTimestamp(observation.observedAt)}</small>
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
                      Raw receipt <ArrowSquareOut />
                    </a>
                    {observation.sourceUrl && (
                      <a
                        href={observation.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open source <ArrowSquareOut />
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
