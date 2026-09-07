"use client";

import {
  ArrowSquareOut,
  CaretRight,
  Check,
  GithubLogo,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";

import type {
  ActivityEvent,
  GateCheck,
  InspectAppEvidence,
  LaunchBriefEvidence,
  Observation,
  OperatorView,
} from "@/server/types";

import {
  ConformanceChange,
  ConformanceEnvironment,
  ConformanceRuns,
  type ConformanceAction,
} from "./conformance-record";
import { ContractRecord } from "./contract-record";
import { describeCurrentStep } from "./current-step";
import { ExternalLink } from "./external-link";
import { statusLabel } from "./format";
import { LocalTime } from "./local-time";
import type { RecordSection } from "./record-references";

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

export type HistoryFilter = "all" | "changes" | "checks" | "sources";

function matchesFilter(kind: string, filter: HistoryFilter) {
  if (filter === "all") return true;
  if (filter === "sources") return false;
  const change = /decision|contract|change|acceptance|publication|candidate/;
  return filter === "changes" ? change.test(kind) : !change.test(kind);
}

/**
 * What happened to this application: saved or changed requirements,
 * repository checks and inspections, phase transitions, contracts, proposed
 * and published changes, runs and connection consequences, together with the
 * source reads they cite. How a reply was produced is not an event here;
 * local logs and traces hold its diagnostics.
 */
export function HistoryList({
  events,
  observations,
  filter = "all",
}: {
  events: ActivityEvent[];
  observations: Observation[];
  filter?: HistoryFilter;
}) {
  const entries = [
    ...events
      .filter((event) => matchesFilter(event.kind, filter))
      .map((event) => ({ at: event.createdAt, event, observation: null })),
    ...(filter === "all" || filter === "sources"
      ? observations.map((observation) => ({
          at: observation.observedAt,
          event: null,
          observation,
        }))
      : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <section className="sg-inspector-section">
      <p className="sg-inspector-hint">
        What happened to this application: saved requirements, repository checks
        and inspections, phase transitions, contracts, proposed and published
        changes, candidates, conformance runs and connection changes, with the
        source reads they cite.
      </p>
      {entries.length ? (
        entries.map((entry) =>
          entry.event ? (
            <article className="sg-event" key={entry.event.id}>
              <span className={`sg-event-dot ${eventTone(entry.event.kind)}`} />
              <div>
                <strong>{entry.event.summary}</strong>
                <p>{entry.event.detail}</p>
                <LocalTime value={entry.event.createdAt} />
              </div>
            </article>
          ) : (
            <article className="sg-source-read" key={entry.observation!.id}>
              <span className="sg-event-dot source" />
              <div>
                <strong>
                  Source read · {entry.observation!.sourceLabel}
                  <em className={entry.observation!.status}>
                    {entry.observation!.status}
                  </em>
                </strong>
                <p>{entry.observation!.summary}</p>
                <span className="sg-receipt-actions">
                  <a
                    href={`/api/observations/${entry.observation!.id}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Saved record <ArrowSquareOut aria-hidden="true" />
                  </a>
                  {entry.observation!.sourceUrl && (
                    <ExternalLink href={entry.observation!.sourceUrl}>
                      Open on GitHub
                    </ExternalLink>
                  )}
                  <LocalTime value={entry.observation!.observedAt} />
                </span>
              </div>
            </article>
          ),
        )
      ) : (
        <p>
          {filter === "sources"
            ? "No external source has been read yet."
            : "No application events yet."}
        </p>
      )}
    </section>
  );
}

/** Application events only; retained for callers that show no source reads. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return <HistoryList events={events} observations={[]} />;
}

export function CheckIcon({ status }: { status: GateCheck["status"] }) {
  return (
    <span aria-hidden="true" className={`sg-check-icon ${status}`}>
      {status === "passed" && <Check weight="bold" />}
      {status === "blocked" && <Warning weight="bold" />}
    </span>
  );
}

interface SectionSpec {
  key: RecordSection;
  title: string;
  summary: string;
  badge?: { text: string; tone: "good" | "attention" | "" };
  defaultOpen: boolean;
}

function RecordSectionShell({
  spec,
  open,
  onToggle,
  children,
}: {
  spec: SectionSpec;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const id = `record-${spec.key}`;
  return (
    <section className={`sg-record-section${open ? " open" : ""}`} id={id}>
      <button
        aria-controls={`${id}-body`}
        aria-expanded={open}
        className="sg-record-toggle"
        onClick={onToggle}
        type="button"
      >
        <CaretRight aria-hidden="true" weight="bold" />
        <strong>{spec.title}</strong>
        <small>{spec.summary}</small>
        {spec.badge && <em className={spec.badge.tone}>{spec.badge.text}</em>}
      </button>
      {open && (
        <div
          aria-label={spec.title}
          className="sg-record-body"
          id={`${id}-body`}
          role="region"
        >
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * The Record: one outline of the phase's saved state with a jump nav. It
 * reads the same view as the current-step bar and carries no primary
 * decision buttons of its own; deep evidence opens in drawers or saved
 * records. A completed phase shows what was recorded then.
 */
export function Inspector({
  view,
  checks,
  busy,
  onSelectCheck,
  onConformance,
  reveal = null,
  offerGrant = false,
}: {
  view: OperatorView;
  checks: GateCheck[];
  busy: string | null;
  onSelectCheck: (key: string) => void;
  onConformance: (action: ConformanceAction) => void;
  /** Open and scroll to a section, e.g. from a reply's reference line. */
  reveal?: { section: RecordSection; nonce: number } | null;
  /** The current-step bar already offers the publishing grant. */
  offerGrant?: boolean;
}) {
  const workspace = view.workspace;
  const phaseKey = workspace?.phaseKey ?? "start";
  const completed = workspace?.status === "completed";
  const ready = workspace?.status === "ready";
  const passed = checks.filter((check) => check.status === "passed").length;
  const step = describeCurrentStep(view);
  const evidence = completed
    ? (workspace?.deliverableEvidence as Partial<
        LaunchBriefEvidence | InspectAppEvidence
      > | null)
    : null;
  const contract = view.contract;
  const conformance = view.conformance;
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const filterId = useId();

  const sections: SectionSpec[] = [
    {
      key: "checks",
      title: "Checks",
      summary: completed
        ? `Completed · ${workspace?.deliverable ?? ""}`
        : ready
          ? phaseKey === "start"
            ? "Launch Brief ready"
            : phaseKey === "inspect-app"
              ? "Ready for review"
              : "Conformance Result ready"
          : `${passed} of ${checks.length} checks complete`,
      badge:
        passed === checks.length && checks.length
          ? { text: "All pass", tone: "good" }
          : checks.some((check) => check.status === "blocked")
            ? { text: "Blocked", tone: "attention" }
            : undefined,
      defaultOpen: true,
    },
  ];
  if (contract && phaseKey !== "start")
    sections.push({
      key: "contract",
      title: "Application Contract",
      summary: `v${contract.version} · ${contract.body.fields.length} fields · commit ${contract.commitSha.slice(0, 8)}`,
      badge: contract.gaps.blockers.length
        ? {
            text: `${contract.gaps.blockers.length} need${contract.gaps.blockers.length === 1 ? "s" : ""} a decision`,
            tone: "attention",
          }
        : {
            text: `${contract.gaps.conformance.length} required change${contract.gaps.conformance.length === 1 ? "" : "s"}`,
            tone: "",
          },
      defaultOpen: phaseKey === "inspect-app",
    });
  else if (phaseKey === "inspect-app")
    sections.push({
      key: "contract",
      title: "Application Contract",
      summary: "not proposed yet",
      defaultOpen: true,
    });
  if (phaseKey === "make-launch-ready" && conformance) {
    const proposal = conformance.proposal;
    sections.push(
      {
        key: "change",
        title: "Change and behavior checks",
        summary: proposal
          ? `${
              proposal.origin === "no-change"
                ? "no change"
                : `${proposal.changes.length} file${proposal.changes.length === 1 ? "" : "s"}`
            } · ${proposal.status}${
              conformance.acceptance
                ? ` · behavior v${conformance.acceptance.version} accepted`
                : conformance.proposedAcceptance
                  ? ` · behavior v${conformance.proposedAcceptance.version} proposed`
                  : ""
            }`
          : conformance.brief
            ? `${conformance.brief.requiredChanges.length} required change${conformance.brief.requiredChanges.length === 1 ? "" : "s"} · nothing proposed yet`
            : "waiting for the brief",
        badge:
          conformance.proposals.length > 1
            ? {
                text: `${conformance.proposals.length - 1} replaced`,
                tone: "",
              }
            : undefined,
        defaultOpen: true,
      },
      {
        key: "runs",
        title: "Runs",
        summary: conformance.runs.length
          ? `${conformance.runs.length} · latest ${conformance.runs[0].kind} ${conformance.runs[0].status}`
          : "none yet",
        defaultOpen: conformance.runs.length > 0,
      },
      {
        key: "environment",
        title: "Environment",
        summary: `Docker ${
          conformance.environment
            ? conformance.environment.ready
              ? "ready"
              : "needs attention"
            : "not checked"
        } · publishing ${conformance.grant ? "allowed" : "not allowed"}`,
        badge:
          conformance.environment && !conformance.environment.ready
            ? { text: "Needs attention", tone: "attention" }
            : undefined,
        defaultOpen: true,
      },
    );
  }
  sections.push({
    key: "history",
    title: "History",
    summary: `${view.activity.length} event${view.activity.length === 1 ? "" : "s"} · ${view.observations.length} source read${view.observations.length === 1 ? "" : "s"}`,
    defaultOpen: false,
  });

  const [open, setOpen] = useState<Partial<Record<RecordSection, boolean>>>({});
  const isOpen = (spec: SectionSpec) => open[spec.key] ?? spec.defaultOpen;
  const toggle = (key: RecordSection) =>
    setOpen((current) => ({
      ...current,
      [key]: !(
        current[key] ?? sections.find((s) => s.key === key)?.defaultOpen
      ),
    }));
  const bodyRef = useRef<HTMLDivElement>(null);
  const revealed = useRef<number>(0);
  useEffect(() => {
    if (!reveal || reveal.nonce === revealed.current) return;
    revealed.current = reveal.nonce;
    setOpen((current) => ({ ...current, [reveal.section]: true }));
    // Let the section render open before scrolling to it.
    requestAnimationFrame(() => {
      document
        .getElementById(`record-${reveal.section}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [reveal]);

  return (
    <aside className="sg-inspector" aria-label="Record">
      <nav className="sg-record-nav" aria-label="Record sections">
        {sections.map((spec) => (
          <a
            href={`#record-${spec.key}`}
            key={spec.key}
            onClick={(event) => {
              event.preventDefault();
              setOpen((current) => ({ ...current, [spec.key]: true }));
              requestAnimationFrame(() =>
                document
                  .getElementById(`record-${spec.key}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" }),
              );
            }}
          >
            {spec.title}
          </a>
        ))}
      </nav>
      <div className="sg-inspector-body" ref={bodyRef}>
        {sections.map((spec) => (
          <RecordSectionShell
            key={spec.key}
            onToggle={() => toggle(spec.key)}
            open={isOpen(spec)}
            spec={spec}
          >
            {spec.key === "checks" && (
              <>
                {completed && evidence?.completedAt && (
                  <p className="sg-record-notice" role="note">
                    Completed <LocalTime value={evidence.completedAt} />. These
                    checks are retained as recorded then; they are not
                    re-evaluated. Later changes appear in the current phase.
                  </p>
                )}
                {workspace?.current &&
                  ready &&
                  phaseKey === "make-launch-ready" && (
                    <p className="sg-record-notice" role="note">
                      The Conformance Result checks pass for the exact
                      candidate. Phase 4, Review launch plan, is not available
                      in this build.
                    </p>
                  )}
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
                {step.remaining && (
                  <p className="sg-record-remaining">{step.remaining}</p>
                )}
              </>
            )}
            {spec.key === "contract" && view.application && (
              <ContractRecord
                application={view.application}
                contract={contract}
                inspection={view.inspection}
              />
            )}
            {spec.key === "change" && view.application && conformance && (
              <ConformanceChange
                application={view.application}
                approvalMode={view.application.approvalMode}
                busy={busy}
                conformance={conformance}
                onAction={onConformance}
                readOnly={completed}
              />
            )}
            {spec.key === "runs" && conformance && (
              <ConformanceRuns conformance={conformance} />
            )}
            {spec.key === "environment" && view.application && conformance && (
              <ConformanceEnvironment
                application={view.application}
                busy={busy}
                conformance={conformance}
                offerGrant={offerGrant}
                onAction={onConformance}
                readOnly={completed}
              />
            )}
            {spec.key === "history" && (
              <>
                <div
                  className="sg-history-filters"
                  role="group"
                  aria-label="Filter history"
                  id={filterId}
                >
                  {(["all", "changes", "checks", "sources"] as const).map(
                    (item) => (
                      <button
                        aria-pressed={filter === item}
                        key={item}
                        onClick={() => setFilter(item)}
                        type="button"
                      >
                        {item === "all"
                          ? "Everything"
                          : item === "changes"
                            ? "Decisions and changes"
                            : item === "checks"
                              ? "Checks and phases"
                              : "Source reads"}
                      </button>
                    ),
                  )}
                </div>
                <HistoryList
                  events={view.activity}
                  filter={filter}
                  observations={view.observations}
                />
              </>
            )}
          </RecordSectionShell>
        ))}
        {view.decisions.length > 0 && (
          <div id="record-requirements">
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
          </div>
        )}
        {view.observations.length === 0 && view.activity.length === 0 && (
          <section className="sg-empty-state">
            <div className="sg-empty-icon">
              <GithubLogo />
            </div>
            <strong>Nothing recorded yet</strong>
            <p>
              Server Guy has only read the repository and written to its own
              local record. Checks, contracts and changes appear here as they
              are saved.
            </p>
          </section>
        )}
      </div>
    </aside>
  );
}
