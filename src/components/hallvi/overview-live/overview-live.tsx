"use client";

// Overview for an application that is deployed.
//
// A page built on a last-known state is stale between looks, so the largest
// thing here is not a state at all: it is the proxy's access log, followed
// while the page is open. Around it sit the things Hallvi has actually
// recorded — the way in, what wants the owner, the last day it read, what it
// has assessed — each saying when it was true. Chosen from a switchable
// prototype on the real route; the options and the verdict are on the
// `prototype/landing-page-directions` branch.

import type { ReactNode } from "react";

import type { ApplicationSection } from "../application-sections";
import { ago } from "../architecture-prototype/model";
import {
  PageHead,
  type PageChrome,
  type Reachability,
} from "../deployment-prototype/page-head";
import type { Usage } from "../monitoring-records";
import type { Overview } from "../overview-prototype/overview-model";
import { Tag } from "../presentation";
import { RequestFlow } from "./request-flow";
import { useTraffic, WINDOW_MINUTES, type Traffic } from "./use-traffic";
import "./overview-live.css";

const count = (value: number) => value.toLocaleString("en-US");
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const plural = (value: number, word: string) =>
  `${count(value)} ${word}${value === 1 ? "" : "s"}`;

const tone = {
  verified: "verified",
  stale: "stale",
  failed: "failed",
  warning: "stale",
  absent: "absent",
  unknown: "unknown",
  planned: "unknown",
} as const;

function Tile({
  label,
  wide,
  className,
  onOpen,
  children,
}: {
  label: ReactNode;
  wide?: boolean;
  className?: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={`ovl-tile${wide ? " is-wide" : ""}${className ? ` ${className}` : ""}`}
    >
      <h2>
        {label}
        {onOpen && (
          <button type="button" onClick={onOpen}>
            Open →
          </button>
        )}
      </h2>
      {children}
    </section>
  );
}

/** What the flow says when there are no requests to draw, and why. */
function FlowNote({
  traffic,
  onAsk,
}: {
  traffic: Traffic;
  onAsk: (draft: string) => void;
}) {
  if (traffic.state === "live" && traffic.requests > 0) return null;
  const note =
    traffic.state === "connecting"
      ? { title: "Opening the access log…", detail: null }
      : traffic.state === "live"
        ? {
            title: "Live, and quiet",
            detail: `Nobody has asked for anything in the last ${WINDOW_MINUTES} minutes.`,
          }
        : traffic.state === "lost"
          ? {
              title: "The log stopped. Trying again…",
              // Only a reason is worth a second line.
              detail:
                traffic.detail === "The log stopped." ? null : traffic.detail,
            }
          : traffic.state === "no-server"
            ? {
                title: "No server is connected",
                detail: "There is nowhere to read requests from yet.",
              }
            : {
                title: "Nobody has looked for an access log yet",
                detail:
                  "Hallvi draws requests as they arrive once it has recorded where the proxy writes them. That is not a claim that there is no traffic.",
              };
  return (
    <div className="ovl-note" data-state={traffic.state}>
      <b className={traffic.state === "connecting" ? "hv-sheen" : undefined}>
        {note.title}
      </b>
      {note.detail && <p>{note.detail}</p>}
      {traffic.state === "no-log" && (
        <button
          type="button"
          className="hv-primary-button"
          onClick={() =>
            onAsk(
              "Turn on JSON access logging on the proxy in front of this application, confirm a request shows up in it, and record where the log is so Overview can follow it.",
            )
          }
        >
          Ask Hallvi to turn it on
        </button>
      )}
    </div>
  );
}

function Area({ values }: { values: number[] }) {
  const peak = Math.max(...values, 1);
  const step = 400 / Math.max(values.length - 1, 1);
  const line = values
    .map((value, index) => `${index * step},${80 - (value / peak) * 76}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 400 80"
      className="ovl-area"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={`0,80 ${line} 400,80`} />
      <polyline points={line} />
    </svg>
  );
}

export function OverviewLive({
  applicationId,
  name,
  title,
  mapped,
  built,
  usage,
  condition,
  now,
  chrome,
  openUrl,
  restricted,
  reachable,
  onReopen,
  onAsk,
  onOpenDestination,
}: {
  applicationId: string;
  name: string;
  title: string;
  /** Whether Pi has recorded how the application is put together. */
  mapped: boolean;
  built: Overview;
  usage: Usage | null;
  condition: { certainty: keyof typeof tone; text: string };
  now: number;
  chrome: PageChrome;
  openUrl: string | null;
  restricted: boolean;
  reachable: Reachability;
  onReopen?: () => void;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}) {
  const traffic = useTraffic(applicationId);
  const day = usage?.traffic ?? null;
  const p95 = (day?.p95Ms ?? []).filter((value) => value > 0);
  const typical = [...p95].sort((a, b) => a - b)[Math.floor(p95.length / 2)];
  const health =
    reachable === "open"
      ? { word: "Answering", state: "well" }
      : reachable === "closed"
        ? { word: "The way in is closed", state: "bad" }
        : { word: "Asking…", state: "asking" };

  return (
    <div className="hv-section-page hv-section-overview ovl">
      <PageHead
        bar={chrome.bar}
        title={title}
        name={name}
        openUrl={openUrl}
        restricted={restricted}
        reachable={reachable}
        onReopen={onReopen}
      />
      <div className="ovl-grid">
        <Tile
          className="ovl-now"
          label={
            traffic.state === "live" && traffic.requests > 0 ? (
              <>
                Right now · {plural(traffic.visitors, "visitor")} and{" "}
                {plural(traffic.requests, "request")} in the last{" "}
                {WINDOW_MINUTES} minutes
              </>
            ) : (
              "Right now"
            )
          }
        >
          <div className="ovl-now-flow" data-live={traffic.state === "live"}>
            {/* Nothing is drawn that is not there: no log, no picture. */}
            {(traffic.state === "live" || traffic.requests > 0) && (
              <RequestFlow traffic={traffic} name={name} />
            )}
            <FlowNote traffic={traffic} onAsk={onAsk} />
          </div>
        </Tile>

        <Tile label="The way in" className={`ovl-health is-${health.state}`}>
          <div className="ovl-beat" aria-hidden="true">
            <i />
            <i />
            <b />
          </div>
          <p className="ovl-health-word">{health.word}</p>
          {condition.certainty !== "unknown" && (
            <p className="ovl-foot">{condition.text}</p>
          )}
        </Tile>

        <Tile label="As it is written" onOpen={() => onOpenDestination("logs")}>
          {traffic.recent.length ? (
            <ol className="ovl-tape">
              {traffic.recent.map((line) => (
                <li key={line.id} data-failed={line.status >= 500 || undefined}>
                  <span>
                    {new Date(line.at).toLocaleTimeString(undefined, {
                      hour12: false,
                    })}
                  </span>
                  <b>{line.path}</b>
                  <i>{line.status}</i>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ovl-empty">
              {traffic.state === "live"
                ? "No requests yet."
                : "Nothing to show until the log is open."}
            </p>
          )}
        </Tile>

        <Tile
          wide
          label={
            day && usage?.at ? (
              <>The last day Hallvi read · {ago(usage.at, now)}</>
            ) : (
              "The last day"
            )
          }
          onOpen={() => onOpenDestination("monitoring")}
        >
          {day ? (
            <>
              <p className="ovl-number">
                {count(sum(day.requests))}
                <small>
                  requests
                  {day.visitors !== undefined &&
                    ` · ${plural(day.visitors, "visitor")}`}
                  {sum(day.serverErrors) > 0 &&
                    ` · ${count(sum(day.serverErrors))} failed`}
                </small>
              </p>
              <Area values={day.requests} />
              <p className="ovl-foot">{day.source}</p>
            </>
          ) : (
            <>
              <p className="ovl-empty">
                Hallvi has not read a day of traffic yet. That is not a claim
                that there was none.
              </p>
              <button
                type="button"
                className="ovl-ask"
                onClick={() =>
                  onAsk(
                    `Read the last 24 hours of ${name}'s access log and its server's CPU and memory, and record what you find.`,
                  )
                }
              >
                Ask Hallvi to read it →
              </button>
            </>
          )}
        </Tile>

        <Tile label="What wants you">
          {built.needs.length ? (
            <ul className="ovl-needs">
              {built.needs.slice(0, 2).map((need) => (
                <li key={need.id} data-tone={need.tone}>
                  <b>{need.title}</b>
                  <span>{need.detail}</span>
                  {need.primary.draft && (
                    <button
                      type="button"
                      className="ovl-ask"
                      onClick={() => onAsk(need.primary.draft!)}
                    >
                      {need.primary.label} →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ovl-empty">Nothing needs you right now.</p>
          )}
        </Tile>

        <Tile label="Speed" onOpen={() => onOpenDestination("monitoring")}>
          {typical !== undefined ? (
            <>
              <p className="ovl-number is-small">
                {count(Math.round(typical))}
                <small>ms, slowest 1 in 20, typical hour</small>
              </p>
              <div className="ovl-bars" aria-hidden="true">
                {(day?.p95Ms ?? []).map((value, index) => (
                  <i
                    key={index}
                    style={{ height: `${(value / Math.max(...p95)) * 100}%` }}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="ovl-empty">No response times have been read yet.</p>
          )}
        </Tile>

        <Tile wide label="What has been assessed">
          <ul className="ovl-vitals">
            {built.vitals.map((vital) => (
              <li key={vital.id}>
                <button
                  type="button"
                  onClick={() => onOpenDestination(vital.destination)}
                >
                  {/* Read aloud as certainty, subject, sentence; drawn with
                      the subject first. */}
                  <Tag tone={tone[vital.status.certainty]}>{vital.value}</Tag>
                  <b>{vital.label}</b>
                  <span>{vital.status.text}</span>
                </button>
              </li>
            ))}
          </ul>
          {!mapped && (
            <p className="ovl-foot ovl-unmapped">
              <span>
                The deployment is recorded, but its architecture has not been
                mapped yet.
              </span>{" "}
              <button
                type="button"
                className="ovl-ask"
                onClick={() =>
                  onAsk(
                    "Work out how this application is put together — its pieces, how they connect, and what you can verify about each — and record it.",
                  )
                }
              >
                Ask Hallvi to map this application →
              </button>
            </p>
          )}
        </Tile>

        <Tile
          wide
          label="What happened"
          onOpen={() => onOpenDestination("history")}
        >
          {built.recent.length ? (
            <ul className="ovl-recent">
              {built.recent.map((item) => (
                <li key={item.id}>
                  {item.open ? (
                    <button type="button" onClick={item.open}>
                      {item.title}
                    </button>
                  ) : (
                    <b>{item.title}</b>
                  )}
                  <span>{item.when}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ovl-empty">No work is recorded yet.</p>
          )}
        </Tile>
      </div>
    </div>
  );
}
