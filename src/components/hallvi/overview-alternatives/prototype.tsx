"use client";

/**
 * PROTOTYPE — five Overview compositions on the existing page, ?variant=A…E.
 * Question: can an owner understand traffic, current evidence and recent work
 * in one look, without urgent headings or an oversized empty request diagram?
 * A: balanced summary. B: written brief. C: evidence table. D: activity feed.
 * E: visitor trends. All inherit Hallvi's shell, tokens and record semantics.
 * No winner selected. Keep this branch out of main until the owner chooses.
 */
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CaretDown,
  Check,
  Clock,
  GitCommit,
  Minus,
  ChatCircleText,
} from "@phosphor-icons/react";
import type { ApplicationRecord } from "@/server/types";
import type { SavedInformation } from "@/server/operator-data";
import type { TrafficHistory } from "@/server/traffic/contract";
import type { ApplicationSection } from "../application-sections";
import type { Overview } from "../overview-prototype/overview-model";
import type { Usage } from "../monitoring-records";
import { ago } from "../architecture-prototype/model";
import {
  AccessLink,
  type PageChrome,
  type Reachability,
} from "../deployment-prototype/page-head";
import { useTraffic, type Traffic } from "../overview-live/use-traffic";
import { useCollection, useHistory } from "../traffic/source";
import { VisitorsToday } from "../traffic/overview-tile";
import { hasTotals, trafficListed, usualDay } from "../traffic/model";
import "./prototype.css";

const variants = [
  {
    key: "A",
    name: "At a glance",
    idea: "A balanced view of visitors, status and recent work.",
  },
  {
    key: "B",
    name: "Daily brief",
    idea: "A short readable account, with the evidence alongside.",
  },
  {
    key: "C",
    name: "Status sheet",
    idea: "Compare what is known, when it was checked and what is missing.",
  },
  {
    key: "D",
    name: "Activity first",
    idea: "Start with changes; keep current status close by.",
  },
  {
    key: "E",
    name: "Visitors first",
    idea: "Lead with usage over time, then explain what is running.",
  },
] as const;
export type OverviewVariant = (typeof variants)[number]["key"];
export function isOverviewVariant(
  value: string | null,
): value is OverviewVariant {
  return variants.some((variant) => variant.key === value);
}

type Props = {
  variant: OverviewVariant;
  application: ApplicationRecord;
  records: SavedInformation[];
  built: Overview;
  usage: Usage | null;
  now: number;
  chrome: PageChrome;
  openUrl: string | null;
  reachable: Reachability;
  restricted: boolean;
  onReopen?: () => void;
  onOpenDestination: (section: ApplicationSection) => void;
  onAsk: (draft: string) => void;
};
type View = Props & {
  traffic: Traffic;
  month: TrafficHistory | null;
  hourly: TrafficHistory | null;
  trafficError: string | null;
  collecting: boolean;
  collectionRead: boolean;
};
const count = (n: number) => n.toLocaleString("en-US");
const dayLabel = (at: string) =>
  new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const names: Record<string, string> = {
  checks: "Application",
  backups: "Backups",
  server: "Server",
  access: "Access",
};

function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="oa-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={14} />
    </button>
  );
}
function Heading({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="oa-section-heading">
      <h2>{children}</h2>
      {action}
    </div>
  );
}
function access(view: View) {
  const privateConnection =
    /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(
      view.openUrl ?? "",
    );
  if (view.reachable === "open")
    return {
      text: privateConnection ? "Private connection open" : "Address reachable",
      tone: "good",
    };
  if (view.reachable === "closed")
    return {
      text: privateConnection
        ? "Private connection closed"
        : "Address did not answer",
      tone: "issue",
    };
  return {
    text:
      view.reachable === "checking"
        ? "Checking access"
        : "Access not confirmed",
    tone: "neutral",
  };
}
function Address({ view }: { view: View }) {
  const status = access(view);
  return (
    <span className="oa-address">
      <span className="oa-dot" data-tone={status.tone} />
      {status.text}
      <span className="oa-muted">
        {view.reachable === "open" ? "just checked" : ""}
      </span>
    </span>
  );
}
function AppHeader({
  view,
  compact = false,
}: {
  view: View;
  compact?: boolean;
}) {
  return (
    <header className={"oa-app-header" + (compact ? " is-compact" : "")}>
      <div>
        <h1>{view.application.name}</h1>
        <p>
          {view.openUrl
            ? new URL(view.openUrl).host
            : view.application.repositoryName}
          <span className="oa-separator">/</span>
          <Address view={view} />
        </p>
      </div>
      <div className="oa-header-actions">
        <button
          type="button"
          className="oa-ask"
          onClick={() =>
            view.onAsk(
              "Summarize this application: current observations, recorded checks and recent changes.",
            )
          }
        >
          <ChatCircleText size={15} />
          Ask Hallvi
        </button>
        <AccessLink
          openUrl={view.openUrl}
          name={view.application.name}
          restricted={view.restricted}
          reachable={view.reachable}
          onReopen={view.onReopen}
        />
      </div>
    </header>
  );
}
function TrafficUnavailable({ view }: { view: View }) {
  const detail = view.trafficError
    ? "Traffic history could not be read."
    : !view.collectionRead
      ? "Reading traffic history…"
      : !view.collecting
        ? "Traffic history is off. No daily estimate is available."
        : "Traffic history has no counted days yet.";
  return (
    <div className="oa-empty">
      <p>{detail}</p>
      <TextLink onClick={() => view.onOpenDestination("traffic")}>
        View traffic
      </TextLink>
    </div>
  );
}
function Visitors({ view }: { view: View }) {
  return (
    <section className="oa-visitors">
      <Heading
        action={
          <TextLink onClick={() => view.onOpenDestination("traffic")}>
            Traffic
          </TextLink>
        }
      >
        Visitors
      </Heading>
      {view.month && hasTotals(view.month) ? (
        <>
          <VisitorsToday month={view.month} traffic={view.traffic} />
          <div className="oa-chart-dates">
            <span>{dayLabel(view.month.series.slice(-8)[0].at)}</span>
            <span>Today · partial day</span>
          </div>
        </>
      ) : (
        <TrafficUnavailable view={view} />
      )}
    </section>
  );
}
function Response({ view }: { view: View }) {
  const totals =
    view.hourly && hasTotals(view.hourly) ? view.hourly.totals : null;
  const values =
    view.hourly?.series.filter(
      (point) => point.covered > 0 && point.p95Ms !== null,
    ) ?? [];
  const max = Math.max(1, ...values.map((point) => point.p95Ms ?? 0));
  return (
    <section className="oa-response">
      <Heading
        action={
          <TextLink onClick={() => view.onOpenDestination("monitoring")}>
            Details
          </TextLink>
        }
      >
        Response time
      </Heading>
      <div className="oa-metric-line">
        <strong>
          {totals?.p95Ms != null
            ? (totals.p95AtLeast ? "≥ " : "") + count(Math.round(totals.p95Ms))
            : "—"}
        </strong>
        <span>
          {totals?.p95Ms != null
            ? "ms · 95% of requests were this fast or faster"
            : "No response times recorded"}
        </span>
      </div>
      {values.length > 0 && (
        <div
          className="oa-response-chart"
          aria-label="Hourly response time, last 24 hours"
        >
          {values.map((point) => (
            <i
              key={point.at}
              style={{
                height: Math.max(3, ((point.p95Ms ?? 0) / max) * 100) + "%",
              }}
              title={dayLabel(point.at) + ": " + point.p95Ms + " ms"}
            />
          ))}
        </div>
      )}
      <p className="oa-caption">
        {totals
          ? "Last 24 hours · server response, not full page load"
          : "Shown once traffic has been counted."}
      </p>
    </section>
  );
}
function RecordedChecks({
  view,
  horizontal = false,
}: {
  view: View;
  horizontal?: boolean;
}) {
  return (
    <section className={"oa-checks" + (horizontal ? " is-horizontal" : "")}>
      <Heading>Recorded status</Heading>
      <div className="oa-check-list">
        {view.built.vitals.map((vital) => (
          <details key={vital.id} className="oa-check">
            <summary>
              <span className="oa-check-name">{names[vital.id]}</span>
              <span
                className="oa-check-value"
                data-state={vital.status.certainty}
              >
                {vital.status.certainty === "verified" ? (
                  <Check size={14} />
                ) : vital.status.certainty === "unknown" ? (
                  <Minus size={14} />
                ) : (
                  <Clock size={14} />
                )}
                {vital.value === "Held"
                  ? "Passed earlier"
                  : vital.value === "Not assessed"
                    ? "Not checked"
                    : vital.value === "Verified"
                      ? "Passed"
                      : vital.value}
              </span>
              <span className="oa-check-time">{vital.status.text}</span>
              <CaretDown className="oa-caret" size={13} />
            </summary>
            <div className="oa-check-detail">
              <p>{vital.plain}</p>
              {vital.lines.slice(0, 2).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <TextLink
                onClick={() => view.onOpenDestination(vital.destination)}
              >
                View {names[vital.id].toLowerCase()}
              </TextLink>
            </div>
          </details>
        ))}
      </div>
      <p className="oa-caption">
        Recorded checks describe their last observation.
      </p>
    </section>
  );
}
function Deployment({ view }: { view: View }) {
  const record = view.records
    .filter(
      (item) =>
        !item.retiredAt &&
        item.applicationId === view.application.id &&
        item.presentation?.content?.kind === "deployment",
    )
    .sort(
      (a, b) =>
        Date.parse(b.establishedAt ?? b.createdAt) -
        Date.parse(a.establishedAt ?? a.createdAt),
    )[0];
  const content = record?.presentation?.content;
  return (
    <section className="oa-deployment">
      <Heading
        action={
          <TextLink onClick={() => view.onOpenDestination("deployment")}>
            Deployment
          </TextLink>
        }
      >
        Latest release
      </Heading>
      {content?.kind === "deployment" ? (
        <>
          <div className="oa-release-id">
            <GitCommit size={20} />
            <code>{content.revision.slice(0, 7)}</code>
            <span>
              {ago(record.establishedAt ?? record.createdAt, view.now)}
            </span>
          </div>
          <p className="oa-release-title">
            {content.changes[0] ?? record.title}
          </p>
          {content.changes.length > 1 && (
            <p className="oa-muted">
              {content.changes.length - 1} more recorded changes
            </p>
          )}
          <dl className="oa-release-meta">
            <div>
              <dt>Server</dt>
              <dd>{content.server}</dd>
            </div>
            <div>
              <dt>Result</dt>
              <dd>
                {record.presentation?.status === "verified"
                  ? "Verified at release"
                  : (record.presentation?.status ?? "Not verified")}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="oa-muted">No release is recorded yet.</p>
      )}
    </section>
  );
}
function Recent({
  view,
  timeline = false,
  limit = 5,
}: {
  view: View;
  timeline?: boolean;
  limit?: number;
}) {
  return (
    <section className={"oa-recent" + (timeline ? " is-timeline" : "")}>
      <Heading
        action={
          <TextLink onClick={() => view.onOpenDestination("history")}>
            History
          </TextLink>
        }
      >
        Recent work
      </Heading>
      {view.built.recent.length ? (
        <ol>
          {view.built.recent.slice(0, limit).map((item) => (
            <li key={item.id}>
              {timeline && (
                <span className="oa-event-icon">
                  <GitCommit size={16} />
                </span>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => view.onOpenDestination("history")}
                >
                  {item.title}
                  <ArrowUpRight size={14} />
                </button>
                {timeline && (
                  <p>
                    {item.state === "verified"
                      ? "Verification recorded"
                      : item.state === "working"
                        ? "In progress"
                        : item.state === "failed"
                          ? "Work stopped here"
                          : "Saved in application history"}
                  </p>
                )}
              </div>
              <time>{item.when}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="oa-muted">No work has been recorded yet.</p>
      )}
    </section>
  );
}
function OpenWork({ view }: { view: View }) {
  const totals =
    view.hourly && hasTotals(view.hourly) ? view.hourly.totals : null;
  if (!view.built.needs.length && !totals?.errors) return null;
  return (
    <section
      className={
        "oa-open-work" + (!view.built.needs.length ? " is-compact" : "")
      }
    >
      {view.built.needs.length > 0 && <Heading>Open items</Heading>}
      {view.built.needs.map((item) => (
        <div className="oa-open-row" key={item.id}>
          <div>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
          </div>
          <TextLink
            onClick={
              item.primary.open ??
              (() => view.onAsk(item.primary.draft ?? item.detail))
            }
          >
            {item.primary.label}
          </TextLink>
        </div>
      ))}
      {!!totals?.errors && (
        <div className="oa-open-row">
          <div>
            <h3>
              {count(totals.errors)} server{" "}
              {totals.errors === 1 ? "error" : "errors"} in the last 24 hours
            </h3>
            <p>Some requests failed. Traffic shows the affected pages.</p>
          </div>
          <TextLink onClick={() => view.onOpenDestination("traffic")}>
            View errors
          </TextLink>
        </div>
      )}
    </section>
  );
}
function RequestSummary({ view }: { view: View }) {
  const { traffic } = view;
  return (
    <section className="oa-requests">
      <Heading
        action={
          <TextLink onClick={() => view.onOpenDestination("traffic")}>
            Live traffic
          </TextLink>
        }
      >
        Recent requests
      </Heading>
      <div className="oa-request-total">
        <strong>
          {traffic.state === "live" ? count(traffic.requests) : "—"}
        </strong>
        <span>
          {traffic.state === "live"
            ? "requests · last 5 minutes"
            : traffic.state === "no-log"
              ? "Access log not connected"
              : traffic.state === "no-server"
                ? "Server not connected"
                : traffic.state === "lost"
                  ? "Connection interrupted"
                  : "Connecting to the log…"}
        </span>
      </div>
      {traffic.state === "live" && traffic.requests === 0 ? (
        <p className="oa-muted">No requests in this window.</p>
      ) : (
        <ul className="oa-paths">
          {traffic.lanes.slice(0, 3).map((lane) => (
            <li key={lane.name}>
              <code>{lane.name}</code>
              <span>{count(lane.requests)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function Resources({ view }: { view: View }) {
  const host = view.usage?.host;
  return (
    <section className="oa-resources">
      <Heading
        action={
          <TextLink onClick={() => view.onOpenDestination("monitoring")}>
            Server
          </TextLink>
        }
      >
        Server resources
      </Heading>
      {host ? (
        <>
          <dl>
            {[
              ["CPU", host.cpu.at(-1)],
              ["Memory", host.memory.at(-1)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value != null ? value + "%" : "Not read"}</dd>
              </div>
            ))}
          </dl>
          <p className="oa-caption">
            Last sample
            {view.usage?.at ? " · read " + ago(view.usage.at, view.now) : ""}
          </p>
        </>
      ) : (
        <p className="oa-muted">Resource usage has not been read.</p>
      )}
    </section>
  );
}

export function VariantA({ view }: { view: View }) {
  return (
    <div className="oa-layout oa-glance">
      <AppHeader view={view} />
      <OpenWork view={view} />
      <RecordedChecks view={view} horizontal />
      <div className="oa-glance-top">
        <Visitors view={view} />
        <div className="oa-glance-side">
          <Deployment view={view} />
          <Resources view={view} />
        </div>
      </div>
      <div className="oa-glance-bottom">
        <Recent view={view} limit={4} />
        <Response view={view} />
      </div>
    </div>
  );
}
export function VariantB({ view }: { view: View }) {
  const today = view.month?.series.at(-1);
  const status = access(view);
  const release = view.records
    .filter(
      (record) =>
        !record.retiredAt &&
        record.presentation?.content?.kind === "deployment",
    )
    .sort(
      (a, b) =>
        Date.parse(b.establishedAt ?? b.createdAt) -
        Date.parse(a.establishedAt ?? a.createdAt),
    )[0];
  const content = release?.presentation?.content;
  return (
    <div className="oa-layout oa-brief">
      <AppHeader view={view} compact />
      <div className="oa-brief-columns">
        <article className="oa-brief-main">
          <h2>A quick read on {view.application.name}.</h2>
          <p className="oa-lede">
            {status.text}.{" "}
            {today?.covered ? (
              <>
                <strong>{count(today.visitors)} estimated visitors</strong> have
                arrived today.
              </>
            ) : (
              "Today's visitor count is not available yet."
            )}
          </p>
          <p className="oa-brief-summary">
            {content?.kind === "deployment" ? (
              <>
                The latest recorded release was{" "}
                <strong>
                  {content.changes[0] ?? content.revision.slice(0, 7)}
                </strong>
                , {ago(release.establishedAt ?? release.createdAt, view.now)}.
              </>
            ) : (
              "A deployment has not been recorded yet."
            )}{" "}
            Detailed checks are listed alongside with their observation time.
          </p>
          <OpenWork view={view} />
          <Visitors view={view} />
          <Recent view={view} limit={4} />
        </article>
        <aside className="oa-brief-aside">
          <RecordedChecks view={view} />
          <Resources view={view} />
          <RequestSummary view={view} />
        </aside>
      </div>
    </div>
  );
}
export function VariantC({ view }: { view: View }) {
  return (
    <div className="oa-layout oa-sheet">
      <AppHeader view={view} compact />
      <OpenWork view={view} />
      <section className="oa-register">
        <Heading>Application status</Heading>
        <div className="oa-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>Last recorded result</th>
                <th>Evidence</th>
                <th>
                  <span className="oa-sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.built.vitals.map((vital) => (
                <tr key={vital.id}>
                  <th scope="row">{names[vital.id]}</th>
                  <td>
                    <span
                      className="oa-check-value"
                      data-state={vital.status.certainty}
                    >
                      {vital.value === "Held"
                        ? "Passed earlier"
                        : vital.value === "Not assessed"
                          ? "Not checked"
                          : vital.value === "Verified"
                            ? "Passed"
                            : vital.value}
                    </span>
                  </td>
                  <td>{vital.status.text}</td>
                  <td>
                    <TextLink
                      onClick={() => view.onOpenDestination(vital.destination)}
                    >
                      View
                    </TextLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="oa-caption">
          A missing check stays unknown. An older check keeps its date.
        </p>
      </section>
      <div className="oa-sheet-middle">
        <Visitors view={view} />
        <Response view={view} />
        <Resources view={view} />
      </div>
      <div className="oa-sheet-bottom">
        <Recent view={view} limit={4} />
        <Deployment view={view} />
      </div>
    </div>
  );
}
export function VariantD({ view }: { view: View }) {
  return (
    <div className="oa-layout oa-activity">
      <AppHeader view={view} />
      <div className="oa-activity-columns">
        <div className="oa-activity-main">
          <OpenWork view={view} />
          <Deployment view={view} />
          <Recent view={view} timeline limit={7} />
          <RequestSummary view={view} />
        </div>
        <aside className="oa-activity-aside">
          <Visitors view={view} />
          <RecordedChecks view={view} />
          <Resources view={view} />
        </aside>
      </div>
    </div>
  );
}
function VisitorTrend({ view }: { view: View }) {
  const [range, setRange] = useState(8);
  const [selected, setSelected] = useState<string | null>(null);
  const days = view.month?.series.slice(-range) ?? [];
  const active = days.find((point) => point.at === selected) ?? days.at(-1);
  const peak = Math.max(1, ...days.map((point) => point.visitors));
  const usual = view.month ? usualDay(view.month.series) : null;
  return (
    <section className="oa-trend">
      <Heading
        action={
          <div className="oa-range" aria-label="Visitor chart range">
            {[8, 30].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={range === value}
                onClick={() => {
                  setRange(value);
                  setSelected(null);
                }}
              >
                {value === 8 ? "Past week" : "30 days"}
              </button>
            ))}
          </div>
        }
      >
        Visitors over time
      </Heading>
      {view.month && hasTotals(view.month) && active ? (
        <>
          <div className="oa-trend-reading" aria-live="polite">
            <strong>
              {active.covered
                ? (active.visitorsAtLeast ? "≥ " : "") + count(active.visitors)
                : "—"}
            </strong>
            <div>
              <span>
                {active.covered ? "estimated visitors" : "No count available"} ·{" "}
                {active.at === days.at(-1)?.at
                  ? "today so far"
                  : dayLabel(active.at)}
              </span>
              <p>
                {usual?.usual != null
                  ? "A usual day has about " + count(usual.usual) + "."
                  : "More counted days are needed for a comparison."}
              </p>
            </div>
            <TextLink onClick={() => view.onOpenDestination("traffic")}>
              Explore traffic
            </TextLink>
          </div>
          <div className="oa-trend-bars">
            {days.map((point) => (
              <button
                type="button"
                key={point.at}
                className="oa-day"
                data-selected={point.at === active.at}
                data-gap={point.covered === 0}
                aria-label={
                  dayLabel(point.at) +
                  (point.covered
                    ? ": " + point.visitors + " estimated visitors"
                    : ": not counted")
                }
                aria-pressed={point.at === active.at}
                onClick={() => setSelected(point.at)}
              >
                <span
                  style={{
                    height: point.covered
                      ? Math.max(2, (point.visitors / peak) * 100) + "%"
                      : "5%",
                  }}
                />
              </button>
            ))}
          </div>
          <div className="oa-chart-dates">
            <span>{dayLabel(days[0].at)}</span>
            <span>Today · partial day</span>
          </div>
        </>
      ) : (
        <TrafficUnavailable view={view} />
      )}
    </section>
  );
}
export function VariantE({ view }: { view: View }) {
  return (
    <div className="oa-layout oa-audience">
      <AppHeader view={view} compact />
      <OpenWork view={view} />
      <VisitorTrend view={view} />
      <div className="oa-audience-band">
        <Response view={view} />
        <RequestSummary view={view} />
        <Deployment view={view} />
      </div>
      <div className="oa-audience-bottom">
        <RecordedChecks view={view} />
        <Recent view={view} limit={4} />
      </div>
    </div>
  );
}
function PrototypeSwitcher({ current }: { current: OverviewVariant }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const index = variants.findIndex((variant) => variant.key === current);
  const move = (key: OverviewVariant) => {
    const next = new URLSearchParams(params.toString());
    next.set("variant", key);
    router.replace(pathname + "?" + next.toString() + window.location.hash, {
      scroll: false,
    });
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "input, textarea, select, [contenteditable], [role='slider'], [role='tablist']",
          ))
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next =
        variants[
          (index + (event.key === "ArrowRight" ? 1 : -1) + variants.length) %
            variants.length
        ];
      const query = new URLSearchParams(params.toString());
      query.set("variant", next.key);
      router.replace(pathname + "?" + query.toString() + window.location.hash, {
        scroll: false,
      });
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [index, params, pathname, router]);
  if (process.env.NODE_ENV === "production") return null;
  return (
    <nav className="oa-switcher" aria-label="Overview prototype alternatives">
      <button
        type="button"
        aria-label="Previous alternative"
        onClick={() => move(variants[(index + 4) % 5].key)}
      >
        <ArrowLeft size={17} />
      </button>
      <span className="oa-prototype-label">Prototype</span>
      <select
        aria-label="Overview alternative"
        value={current}
        onChange={(event) => move(event.target.value as OverviewVariant)}
      >
        {variants.map((variant) => (
          <option key={variant.key} value={variant.key}>
            {variant.key} · {variant.name}
          </option>
        ))}
      </select>
      <span className="oa-switch-count">{index + 1} / 5</span>
      <button
        type="button"
        aria-label="Next alternative"
        onClick={() => move(variants[(index + 1) % 5].key)}
      >
        <ArrowRight size={17} />
      </button>
    </nav>
  );
}
export function OverviewAlternatives(props: Props) {
  const traffic = useTraffic(props.application.id);
  const { collection } = useCollection(props.application.id);
  const collecting = trafficListed(collection);
  const month = useHistory(props.application.id, "30d", collecting);
  const hourly = useHistory(props.application.id, "24h", collecting);
  const view: View = {
    ...props,
    traffic,
    month: month.current ? month.history : null,
    hourly: hourly.current ? hourly.history : null,
    trafficError: month.error,
    collecting,
    collectionRead: collection !== null,
  };
  const Component = {
    A: VariantA,
    B: VariantB,
    C: VariantC,
    D: VariantD,
    E: VariantE,
  }[props.variant];
  return (
    <div
      className="hv-section-page hv-section-overview oa"
      data-variant={props.variant}
    >
      <Component view={view} />
      <PrototypeSwitcher current={props.variant} />
    </div>
  );
}
