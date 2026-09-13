"use client";

import {
  ArrowRight,
  ArrowSquareOut,
  ChartLine,
  CloudArrowUp,
  HardDrives,
  ShieldCheck,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { SavedInformation } from "@/server/operator-data";
import type { ApplicationSection } from "./application-sections";
import { InformationCard } from "./information-card";
import { LocalTime } from "./local-time";
import { Tag, toneOf } from "./presentation";
import "./architecture-prototype/prototype.css";
import "./overview-prototype/overview.css";
import "./overview-prototype/timeline.css";
import "./record-overview.css";

const LittleServer = dynamic(
  () => import("./home/mascot-scene").then((m) => m.MascotScene),
  { ssr: false },
);
const HOUR = 3_600_000;
const lanes = [
  { id: "application", label: "Checks", icon: ChartLine },
  { id: "backups", label: "Backups", icon: CloudArrowUp },
  { id: "server", label: "Server", icon: HardDrives },
  { id: "access", label: "Access", icon: ShieldCheck },
] as const;
const timeOf = (record: SavedInformation) =>
  Date.parse(record.establishedAt ?? record.updatedAt);
const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** The selected Overview, reading shared records. */
export function RecordOverview({
  records,
  now,
  bar,
  onOpen,
}: {
  records: SavedInformation[];
  now: number;
  bar?: ReactNode;
  onOpen: (section: ApplicationSection) => void;
}) {
  const active = records
    .filter((r) => !r.retiredAt && r.presentation)
    .sort((a, b) => timeOf(b) - timeOf(a));
  const access = active.find(
    (r) => r.presentation?.content?.kind === "application-access",
  );
  const deployment = active.find(
    (r) => r.presentation?.content?.kind === "deployment",
  );
  const accessContent = access?.presentation?.content;
  const deploymentContent = deployment?.presentation?.content;
  const [selected, setSelected] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(true);
  const selectedRecord = active.find((r) => r.id === selected);
  const attention = active.filter(
    (r) =>
      r.presentation?.views.includes("overview") &&
      ["failed", "warning"].includes(r.presentation.status),
  );
  const events = active.flatMap((record) =>
    (record.presentation?.checks ?? []).flatMap((check, index) =>
      check.subject && record.establishedAt
        ? [{ record, check, id: `${record.id}:${index}`, at: timeOf(record) }]
        : [],
    ),
  );
  // A point is an observation, never continuous uptime or backup coverage.
  const start = now - 36 * HOUR;
  const end = now + 12 * HOUR;
  const x = (at: number) =>
    Math.max(0, Math.min(100, ((at - start) / (end - start)) * 100));
  const ticks: number[] = [];
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  while (first.getHours() % 6 !== 0 || first.getTime() < start)
    first.setTime(first.getTime() + HOUR);
  for (let at = first.getTime(); at <= end; at += 6 * HOUR) ticks.push(at);
  const days = [start, ...ticks.filter((at) => new Date(at).getHours() === 0)];
  const log = active
    .flatMap((record) =>
      record.presentation?.checks.length
        ? record.presentation.checks.map((check, index) => ({
            record,
            check,
            id: `${record.id}:${index}`,
          }))
        : [
            {
              record,
              check: { label: record.title, status: "info" as const },
              id: record.id,
            },
          ],
    )
    .sort((a, b) => timeOf(a.record) - timeOf(b.record))
    .slice(-6);
  const openUrl = access?.presentation?.url;
  const privateAccess =
    accessContent?.kind === "application-access" &&
    accessContent.mode === "private";
  const headline = attention.length
    ? "There’s something that needs your attention."
    : deployment
      ? deployment.title
      : "Nothing has been established here yet.";
  return (
    <div className="sg-section-page sg-section-overview">
      <div className="ax-root sg-record-overview">
        <section className="axo" aria-label="Overview">
          <header className="sg-overview-head">
            {bar && <div className="sg-overview-back">{bar}</div>}
            <div className="sg-overview-title">
              <h1>Overview</h1>
              {openUrl && (
                <div className="sg-overview-open">
                  <small>
                    <ShieldCheck aria-hidden="true" />
                    {privateAccess ? "Only on this PC" : "Public access"}
                  </small>
                  <a href={openUrl} target="_blank" rel="noreferrer">
                    Open application <ArrowSquareOut aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
          </header>
          <section className="axt" aria-label="How it is doing">
            <div className="axt-top">
              <div>
                <h2 className="axt-say">{headline}</h2>
                <p className="axt-sub">
                  {deployment?.establishedAt ? (
                    <>
                      Deployment established{" "}
                      <LocalTime value={deployment.establishedAt} />. The marks
                      below show when Pi checked each area.
                    </>
                  ) : (
                    "Ask in the conversation. This view fills in as Pi records what it finds."
                  )}
                </p>
              </div>
            </div>
            {attention.map((record) => (
              <button
                className="sg-overview-attention"
                key={record.id}
                onClick={() => setSelected(record.id)}
              >
                <Tag tone={toneOf(record).tone}>{toneOf(record).word}</Tag>
                {record.title}
                <ArrowRight aria-hidden="true" />
              </button>
            ))}
            <div className="sg-overview-timeline-scroll">
              <div
                className="axt-time"
                style={{ "--now": "75%" } as CSSProperties}
              >
                <div className="axt-field" aria-hidden="true">
                  {ticks.map((at) => (
                    <i
                      key={at}
                      className={`axt-grid${new Date(at).getHours() === 0 ? " is-midnight" : ""}`}
                      style={{ left: `${x(at)}%` }}
                    />
                  ))}
                  {days.map((at) => (
                    <span
                      key={at}
                      className="axt-day"
                      style={{ left: `${x(at)}%` }}
                    >
                      {new Date(at).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                      })}
                    </span>
                  ))}
                  <div className="axt-future" />
                  <div className="axt-now" />
                </div>
                <div className="axt-over">
                  <div className="axt-stand" style={{ left: "75%" }}>
                    <div
                      className="sg-overview-mascot"
                      aria-label="Little Server"
                    >
                      <LittleServer mood="resting" paused />
                    </div>
                  </div>
                </div>
                {lanes.map((lane) => {
                  const found = events
                    .filter((e) => e.check.subject === lane.id)
                    .sort((a, b) => b.at - a.at);
                  const latest = found[0];
                  const atLatest = latest
                    ? found.filter((e) => e.at === latest.at)
                    : [];
                  const result = atLatest.some(
                    (e) => e.check.status === "failed",
                  )
                    ? "failed"
                    : atLatest.length &&
                        atLatest.every((e) => e.check.status === "passed")
                      ? "verified"
                      : "unknown";
                  const Icon = lane.icon;
                  // One point per record and evidence time.
                  const grouped = [
                    ...new Map(
                      found
                        .filter((e) => e.at >= start && e.at <= now)
                        .map((e) => [e.record.id, e]),
                    ).values(),
                  ];
                  return (
                    <div key={lane.id} className="axt-lane" data-c={result}>
                      <div className="axt-lane-head">
                        <button
                          type="button"
                          className="axt-lane-name"
                          onClick={() =>
                            setSelected(
                              latest?.record.id ?? `missing:${lane.id}`,
                            )
                          }
                          aria-expanded={
                            selected ===
                            (latest?.record.id ?? `missing:${lane.id}`)
                          }
                        >
                          <span className="axt-lane-icon">
                            <Icon aria-hidden="true" />
                          </span>
                          <span className="axt-lane-text">
                            <b>{lane.label}</b>
                            <small>
                              <i aria-hidden="true" />
                              <span>
                                {latest
                                  ? `${result === "verified" ? "Passed" : result === "failed" ? "Failed" : "Recorded"} · ${clock(latest.at)}`
                                  : "Not established"}
                              </span>
                            </small>
                          </span>
                        </button>
                      </div>
                      <div className="axt-track">
                        {!latest && (
                          <span className="sg-overview-unread">
                            No evidence recorded
                          </span>
                        )}
                        {latest && latest.at < start && (
                          <span className="sg-overview-unread">
                            Last established{" "}
                            <LocalTime value={latest.record.establishedAt!} />
                          </span>
                        )}
                        {grouped.map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            className="axt-ev"
                            data-tone={
                              found.some(
                                (e) =>
                                  e.record.id === event.record.id &&
                                  e.check.status === "failed",
                              )
                                ? "fail"
                                : found
                                      .filter(
                                        (e) => e.record.id === event.record.id,
                                      )
                                      .every((e) => e.check.status === "passed")
                                  ? "pass"
                                  : "info"
                            }
                            style={{ left: `${x(event.at)}%` }}
                            onClick={() => setSelected(event.record.id)}
                            aria-label={`${lane.label}: ${event.record.title}, ${clock(event.at)}`}
                            title={`${lane.label} · ${clock(event.at)}`}
                          >
                            <span aria-hidden="true">·</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="axt-axis" aria-hidden="true">
                  <div className="axt-ticks">
                    {ticks
                      .filter((at) => Math.abs(x(at) - 75) > 7)
                      .map((at) => (
                        <span key={at} style={{ left: `${x(at)}%` }}>
                          {clock(at)}
                        </span>
                      ))}
                    <b style={{ left: "75%" }}>Now · {clock(now)}</b>
                  </div>
                </div>
              </div>
            </div>
            {selectedRecord && (
              <div className="sg-overview-detail">
                <button
                  type="button"
                  className="ax-textlink"
                  onClick={() => setSelected(null)}
                >
                  Close details
                </button>
                <InformationCard
                  record={selectedRecord}
                  currentView="overview"
                  onOpen={onOpen}
                />
              </div>
            )}
            {selected?.startsWith("missing:") && (
              <p className="axt-sub">
                Pi has not saved evidence for this area. That does not establish
                whether it is working.{" "}
                <button
                  type="button"
                  className="ax-textlink"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </p>
            )}
            <div className="sg-overview-loghead">
              <em>Recorded checks, not continuous monitoring</em>
              <button
                type="button"
                onClick={() => setLogOpen(!logOpen)}
                aria-expanded={logOpen}
              >
                ✦ &nbsp; What I did last {logOpen ? "⌃" : "⌄"}
              </button>
            </div>
            {logOpen && (
              <div className="sg-overview-log" aria-label="What Pi recorded">
                {!log.length && <p>No work recorded yet.</p>}
                {log.map((line) => (
                  <button
                    type="button"
                    key={line.id}
                    data-status={line.check.status}
                    onClick={() => setSelected(line.record.id)}
                  >
                    <time
                      title={line.record.establishedAt ?? line.record.updatedAt}
                    >
                      {new Date(timeOf(line.record)).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}{" "}
                      · {clock(timeOf(line.record))}
                    </time>
                    <b aria-hidden="true">
                      {line.check.status === "passed"
                        ? "✓"
                        : line.check.status === "failed"
                          ? "✗"
                          : "·"}
                    </b>
                    <span>{line.check.label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <div className="axo-lower">
            <button
              type="button"
              className="axo-map sg-overview-map"
              onClick={() => onOpen("architecture")}
              aria-label="Open Architecture"
            >
              <svg
                viewBox="0 0 600 245"
                role="img"
                aria-label="Recorded application and access connection"
              >
                <path className="axo-map-wire" d="M134 108H238" />
                <rect
                  className="axo-map-server"
                  x="234"
                  y="25"
                  width="342"
                  height="200"
                  rx="18"
                />
                <text className="sg-overview-map-label" x="251" y="53">
                  {accessContent?.kind === "application-access"
                    ? accessContent.server
                    : "Server not established"}
                </text>
                <path className="axo-map-rule" d="M234 70H576" />
                <g className="axo-map-card">
                  <rect x="18" y="82" width="118" height="52" rx="9" />
                  <text className="sg-overview-map-label" x="32" y="114">
                    {privateAccess ? "This PC" : "Browser"}
                  </text>
                </g>
                <text className="sg-overview-map-note" x="158" y="96">
                  {accessContent
                    ? privateAccess
                      ? "SSH"
                      : "HTTP"
                    : "Unestablished"}
                </text>
                <g className="axo-map-card">
                  <rect x="265" y="96" width="282" height="96" rx="12" />
                  <text className="sg-overview-map-label" x="283" y="123">
                    {deploymentContent?.kind === "deployment"
                      ? "Application container"
                      : "Application not established"}
                  </text>
                  <text className="sg-overview-map-note" x="283" y="148">
                    {privateAccess
                      ? `Loopback port ${accessContent.remotePort}`
                      : "See recorded access"}
                  </text>
                  <text className="sg-overview-map-note" x="283" y="170">
                    {deploymentContent?.kind === "deployment"
                      ? `Revision ${deploymentContent.revision.slice(0, 12)}`
                      : "No deployment record"}
                  </text>
                </g>
              </svg>
              <span className="axo-map-open">
                Open Architecture <ArrowRight aria-hidden="true" />
              </span>
            </button>
            <div className="axo-recent">
              <h2>Recent work</h2>
              {!active.length && (
                <p className="axo-recent-empty">No work recorded yet.</p>
              )}
              {active
                .filter((r) => r.presentation?.role !== "recommendation")
                .slice(0, 4)
                .map((record) => (
                  <button
                    type="button"
                    key={record.id}
                    className="axo-recent-row"
                    onClick={() => setSelected(record.id)}
                  >
                    <Tag tone={toneOf(record).tone}>{toneOf(record).word}</Tag>
                    <b>{record.title}</b>
                    <small>
                      {record.establishedAt ? "Established" : "Saved"}{" "}
                      <LocalTime
                        value={record.establishedAt ?? record.updatedAt}
                        variant="compact"
                      />
                    </small>
                  </button>
                ))}
              <button
                type="button"
                className="ax-textlink"
                onClick={() => onOpen("history")}
              >
                Open History <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
          {active.some(
            (r) =>
              r.presentation?.role === "recommendation" &&
              r.presentation.views.includes("overview"),
          ) && (
            <details>
              <summary>Ideas from Pi</summary>
              {active
                .filter(
                  (r) =>
                    r.presentation?.role === "recommendation" &&
                    r.presentation.views.includes("overview"),
                )
                .map((record) => (
                  <InformationCard
                    key={record.id}
                    record={record}
                    currentView="overview"
                    onOpen={onOpen}
                  />
                ))}
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
