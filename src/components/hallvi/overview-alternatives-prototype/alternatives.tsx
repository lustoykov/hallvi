"use client";

// THROWAWAY: three hierarchies for Overview's hero, on the existing
// /applications/[id]?variant=A|B|C route. Evidence stays in the existing
// projections.
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  Info,
  Plug,
  WarningCircle,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Overview, Vital } from "../overview-prototype/overview-model";
import type { Timeline } from "../overview-prototype/timeline-model";
import type { ArchitectureModel } from "../architecture-prototype/model";
import "./alternatives.css";

type Direction = "A" | "B" | "C";
type Props = {
  overview: Overview;
  timeline: Timeline;
  model: ArchitectureModel;
  variant: Direction;
};
const names = {
  A: "At a glance",
  B: "A useful briefing",
  C: "Evidence explorer",
};
const labels = {
  checks: "Application",
  backups: "Backups",
  server: "Server",
  access: "Access",
};
const rank = {
  failed: 0,
  stale: 1,
  warning: 2,
  unknown: 3,
  absent: 4,
  planned: 5,
  verified: 6,
};

function summary(vital: Vital) {
  if (vital.id === "backups") return vital.status.text;
  if (vital.id === "access" && vital.status.text === "Tunnel is closed")
    return "Connection closed";
  const words = {
    verified: "Passed at last check",
    stale: "Needs a fresh check",
    failed: "Check failed",
    unknown: "Not established",
    absent: "Not set up",
    planned: "Planned",
    warning: "Has a limitation",
  };
  return words[vital.status.certainty];
}
function Mark({ vital }: { vital: Vital }) {
  const tone = vital.status.certainty;
  const Icon =
    tone === "failed"
      ? WarningCircle
      : tone === "stale"
        ? Clock
        : tone === "verified"
          ? CheckCircle
          : Info;
  return (
    <Icon className="ovp-mark" data-tone={tone} size={19} aria-hidden="true" />
  );
}
function stamp(at: number) {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function friendly(text: string) {
  return (
    (
      {
        ssh: "Server connection",
        written: "Backup copy",
        configured: "Backup configuration",
        valid: "Certificate checked",
        answering: "Service response",
        reachable: "Connection check",
      } as Record<string, string>
    )[text] ?? text
  );
}
function Evidence({ vital, timeline }: { vital: Vital; timeline: Timeline }) {
  const events =
    timeline.lanes.find((lane) => lane.id === vital.id)?.events ?? [];
  return (
    <div className="ovp-evidence">
      <p>
        {vital.id === "access" && vital.status.text === "Tunnel is closed"
          ? "Private access from this computer is closed. The server and application need their own checks."
          : vital.plain}
      </p>
      {events.length ? (
        <ol>
          {events.toReversed().map((event) => (
            <li key={event.id}>
              <time dateTime={new Date(event.at).toISOString()}>
                {stamp(event.at)}
              </time>
              <div>
                {event.lines.length > 1 && (
                  <strong>{friendly(event.title)}</strong>
                )}
                <ul>
                  {event.lines.map((line) => (
                    <li key={line.id}>
                      {line.tone === "fail"
                        ? "Failed"
                        : line.tone === "pass"
                          ? "Passed"
                          : "Recorded"}
                      : {friendly(line.text)}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>No dated checks on record.</p>
      )}
    </div>
  );
}
function Action({ label, request }: { label: string; request: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="ovp-action">
      <button
        className="ovp-primary"
        onClick={() => setShow(!show)}
        aria-expanded={show}
      >
        {label}
        <ArrowRight size={15} />
      </button>
      {show && (
        <div className="ovp-request" role="status">
          <strong>Preview of the request</strong>
          <p>{request}</p>
          <small>Nothing was sent or changed.</small>
        </div>
      )}
    </div>
  );
}
function lead(overview: Overview, model: ArchitectureModel) {
  const closed = overview.vitals.some(
    (v) => v.id === "access" && v.status.text === "Tunnel is closed",
  );
  const failure = overview.vitals.find((v) => v.status.certainty === "failed");
  if (closed)
    return {
      title: "Your connection is closed.",
      detail:
        "Reopen private access, then check how the application is doing. A closed connection alone does not tell us whether the app has stopped.",
      action: "Reopen connection",
      request:
        "Reopen this application's private connection, then check that the application responds.",
    };
  if (failure)
    return {
      title: `${labels[failure.id]} needs attention.`,
      detail: failure.plain,
      action: "Review the problem",
      request: failure.ask,
    };
  if (model.condition.certainty === "stale")
    return {
      title: "Time for a fresh check.",
      detail: model.condition.text,
      action: "Check the application",
      request: "Check the application now and record what you find.",
    };
  return {
    title: "The latest picture.",
    detail: model.condition.text,
    action: "Check the application",
    request: "Check the application now and record what you find.",
  };
}
function Log({ model }: { model: ArchitectureModel }) {
  return (
    <details className="ovp-log">
      <summary>
        Recorded work <span>{model.log.length} entries</span>
      </summary>
      <div>
        {model.log.length ? (
          model.log.toReversed().map((line) => (
            <p key={line.id}>
              <time>{stamp(Date.parse(line.at))}</time>
              <span>{friendly(line.text)}</span>
            </p>
          ))
        ) : (
          <p>No work recorded yet.</p>
        )}
      </div>
    </details>
  );
}

export function VariantA({ overview, timeline, model }: Props) {
  const next = lead(overview, model);
  return (
    <div className="ovp-a">
      <div className="ovp-connection">
        <Plug size={24} />
        <div>
          <h2>{next.title}</h2>
          <p>{next.detail}</p>
        </div>
        <Action label={next.action} request={next.request} />
      </div>
      <div className="ovp-table-head">
        <h3>Last known state</h3>
        <span>Open a row for its evidence</span>
      </div>
      <div className="ovp-rows">
        {overview.vitals.map((vital) => (
          <details key={vital.id} className="ovp-row">
            <summary>
              <span className="ovp-area">
                <Mark vital={vital} />
                {labels[vital.id]}
              </span>
              <strong>{summary(vital)}</strong>
              <span className="ovp-meta">
                {vital.id === "backups"
                  ? "Recovery evidence"
                  : vital.status.text}
              </span>
              <ArrowRight size={15} />
            </summary>
            <Evidence vital={vital} timeline={timeline} />
          </details>
        ))}
      </div>
      <p className="ovp-caption">
        Checks describe a moment in time. They do not establish continuous
        uptime.
      </p>
      <Log model={model} />
    </div>
  );
}

export function VariantB({ overview, timeline, model }: Props) {
  const next = lead(overview, model);
  return (
    <div className="ovp-b">
      <div className="ovp-brief">
        <h2>{next.title}</h2>
        <p>{next.detail}</p>
        <Action label={next.action} request={next.request} />
        <div className="ovp-follow">
          <h3>After that</h3>
          <p>
            Review the fresh result before deciding whether anything on the
            server needs changing.
          </p>
        </div>
      </div>
      <div className="ovp-support">
        <h3>What we know</h3>
        {overview.vitals
          .filter(
            (v) => v.id !== "access" || v.status.text !== "Tunnel is closed",
          )
          .map((vital) => (
            <details key={vital.id}>
              <summary>
                <Mark vital={vital} />
                <span>
                  <b>{labels[vital.id]}</b>
                  <strong>{summary(vital)}</strong>
                  <small className="ovp-support-time">
                    {vital.id === "backups"
                      ? "Open for recovery evidence"
                      : vital.status.text}
                  </small>
                </span>
                <ArrowRight size={15} />
              </summary>
              <Evidence vital={vital} timeline={timeline} />
            </details>
          ))}
        <p className="ovp-caption">
          Last observed results, not live monitoring.
        </p>
      </div>
      <div className="ovp-b-footer">
        <Log model={model} />
      </div>
    </div>
  );
}

export function VariantC({ overview, timeline, model }: Props) {
  const ordered = overview.vitals.toSorted(
    (a, b) => rank[a.status.certainty] - rank[b.status.certainty],
  );
  const [selected, setSelected] = useState<Vital["id"]>(
    ordered[0]?.id ?? "checks",
  );
  const vital = overview.vitals.find((v) => v.id === selected) ?? ordered[0];
  if (!vital) return <p>No observations recorded.</p>;
  const next = lead(overview, model);
  return (
    <div className="ovp-c">
      <div className="ovp-explorer-title">
        <h2>Last known state</h2>
        <p>Select an area to see what supports its status.</p>
      </div>
      <div className="ovp-explorer">
        <div className="ovp-index" aria-label="Evidence areas">
          {ordered.map((item) => (
            <button
              key={item.id}
              aria-pressed={item.id === vital.id}
              onClick={() => setSelected(item.id)}
            >
              <Mark vital={item} />
              <span>
                <b>{labels[item.id]}</b>
                <small>{summary(item)}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
        <section
          className="ovp-detail"
          aria-label={`${labels[vital.id]} evidence`}
        >
          <div className="ovp-detail-heading">
            <Mark vital={vital} />
            <h3>{labels[vital.id]}</h3>
          </div>
          <h2>{summary(vital)}</h2>
          <p className="ovp-detail-time">{vital.status.text}</p>
          <Evidence vital={vital} timeline={timeline} />
          <Action
            label={
              vital.id === "access" && vital.status.text === "Tunnel is closed"
                ? next.action
                : `Ask about ${labels[vital.id].toLowerCase()}`
            }
            request={
              vital.id === "access" && vital.status.text === "Tunnel is closed"
                ? next.request
                : vital.ask
            }
          />
        </section>
      </div>
      <Log model={model} />
    </div>
  );
}

export function OverviewAlternatives(props: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const change = (direction: number) => {
    const keys: Direction[] = ["A", "B", "C"];
    const value =
      keys[
        (keys.indexOf(props.variant) + direction + keys.length) % keys.length
      ];
    const params = new URLSearchParams(search.toString());
    params.set("variant", value);
    router.replace(`?${params.toString()}${window.location.hash}`, {
      scroll: false,
    });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"]',
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        change(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (process.env.NODE_ENV === "production") return null;
  const Component = { A: VariantA, B: VariantB, C: VariantC }[props.variant];
  return (
    <section className="ovp" aria-label="Overview design prototype">
      <p className="ovp-notice">
        Design preview · {names[props.variant]} · Actions only preview a request
      </p>
      <Component key={props.variant} {...props} />
      <nav className="ovp-switcher" aria-label="Prototype variants">
        <button onClick={() => change(-1)} aria-label="Previous variant">
          <ArrowLeft size={18} />
        </button>
        <span>
          <small>PROTOTYPE · {props.variant} / C</small>
          <b>{names[props.variant]}</b>
        </span>
        <button onClick={() => change(1)} aria-label="Next variant">
          <ArrowRight size={18} />
        </button>
      </nav>
    </section>
  );
}
