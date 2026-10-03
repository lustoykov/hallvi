"use client";

// Overview for an application that is deployed.
//
// It leads with the people using it. The head says how the address reads, in
// words, beside the application. The lead card is visitors: today against a
// usual day, thirty days with each release marked on its day, and one live
// line that follows the proxy's access log while the page is open. Under it
// sit four facts, then what was recorded and what Hallvi has checked, each
// saying when it was true. What is unresolved comes first, one row a thing,
// named for the thing and never for the reader. Chosen from a switchable
// prototype of five directions on the real route; the options and the
// verdict are on the `prototype/overview-directions` branch.

import { ArrowRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { Collection } from "@/server/traffic/contract";

import type { ApplicationSection } from "../application-sections";
import { ago } from "../architecture-prototype/model";
import {
  PageHead,
  isTunnel,
  type PageChrome,
  type Reachability,
} from "../deployment-prototype/page-head";
import type { Usage } from "../monitoring-records";
import type { NeedItem, Overview } from "../overview-prototype/overview-model";
import { Tag, UnresolvedMarks, unresolvedWords } from "../presentation";
import { agedAs, usePulse, type Pulse } from "../pulse";
import { revealKeyboardControl } from "../reveal-keyboard-control";
import type { ReleaseView } from "../release-records";
import { NowWords, Pulse as Arriving } from "../traffic/live";
import { hasTotals, milliseconds, trafficListed } from "../traffic/model";
import { VisitorsToday } from "../traffic/overview-visitors";
import { useCollection, useHistory } from "../traffic/source";
import { useTraffic } from "./use-traffic";
import "./overview-live.css";

const count = (value: number) => value.toLocaleString("en-US");
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const plural = (value: number, word: string, many = `${word}s`) =>
  `${count(value)} ${value === 1 ? word : many}`;
const sentence = (words: string) =>
  /[.!?]$/.test(words) ? words : `${words}.`;

const tone = {
  verified: "verified",
  // An aged pass is calm; amber is Pi's own warning. See `pulse.tsx`.
  stale: "aged",
  failed: "failed",
  warning: "stale",
  absent: "absent",
  unknown: "unknown",
  planned: "unknown",
} as const;

/** How many open things are listed before the rest is left to History. */
const LISTED = 3;

/**
 * A lane as it reads right now.
 *
 * The record says when Pi last looked. The pulse says what answered a moment
 * ago. Where every aged check in a lane asked exactly what the pulse asks —
 * did the address answer, did the server accept SSH — an answer makes the
 * lane current again, and silence is the one thing here worth amber. A lane
 * holding anything else keeps its own age.
 */
function liveReading(
  vital: {
    id: string;
    value: string;
    status: { certainty: keyof typeof tone; text: string };
    reasked?: "app" | "server" | null;
  },
  pulse: Pulse,
  /** What the page's own check of the address found closed, when it did. */
  closed: "tunnel" | "address" | null,
) {
  // The records still call a closed address a failed check, so nothing reads
  // as reassuring beside it. Here it is said for what it is. A tunnel this
  // computer dropped is the connection, not the application, and is stated
  // without colour. A published address that was asked and said nothing is
  // the one thing in this list worth amber.
  if (vital.id === "access" && closed === "tunnel")
    return {
      tone: "unknown" as const,
      word: "Closed",
      text: vital.status.text,
    };
  if (vital.id === "access" && closed === "address")
    return {
      tone: "stale" as const,
      word: "No answer",
      text: "The address did not answer",
    };
  // Not by lane. The Checks lane also holds container and volume checks, and
  // a page that loads says nothing about those. The projection names the
  // question only when every aged check in the lane asked it.
  const beat = vital.reasked ? pulse[vital.reasked] : undefined;
  // What the pulse asked that belongs to this lane, whatever else is in it.
  const own =
    vital.id === "server"
      ? pulse.server
      : vital.id === "checks" || vital.id === "access"
        ? pulse.app
        : undefined;
  if (vital.status.certainty === "stale") {
    const aged = agedAs(beat);
    if (aged === "verified")
      return {
        tone: "verified" as const,
        word: "Verified",
        text: "Answered just now",
      };
    if (aged === "silent")
      return {
        tone: "stale" as const,
        word: "No answer",
        text: `Did not answer just now · ${vital.status.text.toLowerCase()}`,
      };
  }
  // The lane holds more than the pulse asked. So the tag says only what was
  // just proved — it answers — and the line keeps the date of everything
  // else. Nothing unasked is called verified.
  if (vital.status.certainty === "stale" && own === "answering")
    return {
      tone: "verified" as const,
      word: "Answering",
      text: `Answered just now · other checks ${vital.status.text.replace(/^Last checked /, "")}`,
    };
  if (vital.status.certainty === "stale" && own === "silent")
    return {
      tone: "stale" as const,
      word: "No answer",
      text: `Did not answer just now · ${vital.status.text.toLowerCase()}`,
    };
  return {
    tone: tone[vital.status.certainty],
    word: vital.value,
    text: vital.status.text,
  };
}

/** A way to another page, or a question for the conversation. */
function Go({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="ovl-go" onClick={onClick}>
      {children}
      <ArrowRight weight="bold" />
    </button>
  );
}

/**
 * What is open: a decision awaiting approval, or something that failed. One
 * row a thing, drawn with its mark and named for the thing and its state.
 * With nothing open nothing is drawn, and no line says so.
 */
function Unresolved({
  needs,
  onAsk,
  onOpenDestination,
}: {
  needs: NeedItem[];
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}) {
  if (!needs.length) return null;
  return (
    <ul
      className="ovl-open"
      aria-label={unresolvedWords(needs.map((need) => need.tone))}
    >
      {needs.slice(0, LISTED).map((need) => (
        <li key={need.id}>
          <UnresolvedMarks tones={[need.tone]} silent />
          <p>
            <b>{need.title}</b>
            <span>
              {need.tone === "waiting" ? "Awaiting approval" : "Failed"}
            </span>
          </p>
          {need.detail && (
            <p className="ovl-open-detail" title={need.detail}>
              {need.detail}
            </p>
          )}
          {(need.primary.open || need.primary.draft) && (
            <Go
              onClick={need.primary.open ?? (() => onAsk(need.primary.draft!))}
            >
              {need.primary.label}
            </Go>
          )}
        </li>
      ))}
      {needs.length > LISTED && (
        <li className="ovl-open-rest">
          <Go onClick={() => onOpenDestination("history")}>
            {count(needs.length - LISTED)} more in History
          </Go>
        </li>
      )}
    </ul>
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

/**
 * Where traffic history is not kept, the card is the last day Hallvi read
 * when it was asked, or says that nobody has read one.
 */
function LastDay({
  day,
  collection,
  name,
  onAsk,
  onOpenDestination,
}: {
  day: NonNullable<Usage["traffic"]> | null;
  collection: Collection | null;
  name: string;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}) {
  if (day)
    return (
      <>
        <p className="ovl-number">
          {count(sum(day.requests))}
          <small>
            {sum(day.requests) === 1 ? "request" : "requests"}
            {day.visitors !== undefined &&
              ` · ${plural(day.visitors, "visitor")}`}
            {sum(day.serverErrors) > 0 &&
              ` · ${count(sum(day.serverErrors))} failed`}
          </small>
        </p>
        <Area values={day.requests} />
        <p className="ovl-foot">{day.source}</p>
      </>
    );
  return (
    <>
      <p className="ovl-empty">
        Hallvi has not read a day of traffic yet. That is not a claim that there
        was none.
      </p>
      {/* Once the choice can be read, the offer is the standing one: keep
          traffic history, on the page that holds it. */}
      {collection ? (
        <Go onClick={() => onOpenDestination("traffic")}>
          Keep traffic history
        </Go>
      ) : (
        <Go
          onClick={() =>
            onAsk(
              `Read the last 24 hours of ${name}'s access log and its server's CPU and memory, and record what you find.`,
            )
          }
        >
          Ask Hallvi to read it
        </Go>
      )}
    </>
  );
}

/** One fact under the card: what it is, how it reads, and its page. */
function Fact({
  label,
  value,
  note,
  reads,
  onOpen,
}: {
  label: string;
  value: ReactNode;
  note: string;
  /** `unread` is nobody having looked; `bad` is something a visitor met. */
  reads?: "unread" | "bad";
  onOpen: () => void;
}) {
  return (
    <li data-reads={reads}>
      <button
        type="button"
        onClick={onOpen}
        onFocus={(event) => revealKeyboardControl(event.currentTarget)}
      >
        <span>{label}</span>
        <b>{value}</b>
        <small>{note}</small>
      </button>
    </li>
  );
}

export function OverviewLive({
  applicationId,
  name,
  title,
  mapped,
  built,
  usage,
  releases,
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
  /** Which release is running, and the ones before it. */
  releases: Pick<ReleaseView, "running" | "latest" | "all">;
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
  const pulse = usePulse();
  // Where traffic history is kept, the card and the facts under it come from
  // stored totals rather than a day Pi read.
  const { collection } = useCollection(applicationId);
  const kept = trafficListed(collection);
  const month = useHistory(applicationId, "30d", kept).history;
  const counted = useHistory(applicationId, "24h", kept).history;
  const hourly = kept && hasTotals(counted) ? counted : null;
  const day = usage?.traffic ?? null;

  const p95 = (
    hourly ? hourly.series.map((point) => point.p95Ms ?? 0) : (day?.p95Ms ?? [])
  ).filter((value) => value > 0);
  const typical = [...p95].sort((a, b) => a - b)[Math.floor(p95.length / 2)];

  // Today, as the stored month's last day has it. A day nobody read is
  // unassessed, so its errors are never "none".
  const today =
    kept && month && hasTotals(month)
      ? [...month.series]
          .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
          .at(-1)
      : undefined;
  const counting = today && today.covered > 0 ? today : null;
  const readErrors = day ? sum(day.serverErrors) : null;

  const host = usage?.host;
  const average = (values: number[]) =>
    values.length ? Math.round(sum(values) / values.length) : 0;

  const { running, latest } = releases;
  const closed =
    reachable === "closed" ? (isTunnel(openUrl) ? "tunnel" : "address") : null;
  // Lanes nobody has looked at say so once, not four times.
  const unlooked = built.vitals.every(
    (vital) => vital.status.certainty === "unknown",
  );

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
        reading
      />
      <div className="ovl-body">
        <Unresolved
          needs={built.needs}
          onAsk={onAsk}
          onOpenDestination={onOpenDestination}
        />

        <section className="ovl-lead tf-scope" aria-labelledby="ovl-lead">
          <header>
            <h2 id="ovl-lead">
              {!kept && day ? (
                <>
                  The last day Hallvi read
                  {usage?.at && <small> · {ago(usage.at, now)}</small>}
                </>
              ) : (
                "Visitors"
              )}
            </h2>
            <p className="ovl-live">
              <Arriving traffic={traffic} />
              <NowWords traffic={traffic} />
              {traffic.state === "no-log" && (
                <Go
                  onClick={() =>
                    onAsk(
                      "Turn on JSON access logging on the proxy in front of this application, confirm a request shows up in it, and record where the log is so Overview can follow it.",
                    )
                  }
                >
                  Ask Hallvi to set it up
                </Go>
              )}
            </p>
            {kept ? (
              <Go onClick={() => onOpenDestination("traffic")}>Traffic</Go>
            ) : (
              day && (
                <Go onClick={() => onOpenDestination("monitoring")}>
                  Monitoring
                </Go>
              )
            )}
          </header>
          {kept ? (
            <VisitorsToday
              month={month}
              day={hourly}
              // A release that did not start did not go out.
              released={releases.all.filter(
                (release) => release.outcome !== "failed",
              )}
            />
          ) : (
            <LastDay
              day={day}
              collection={collection}
              name={name}
              onAsk={onAsk}
              onOpenDestination={onOpenDestination}
            />
          )}
        </section>

        <ul className="ovl-facts">
          <Fact
            label="Speed"
            value={typical !== undefined ? milliseconds(typical) : "Not read"}
            note={
              typical !== undefined
                ? "The slowest 1 in 20 requests, in a typical hour."
                : "No response times have been read yet."
            }
            reads={typical === undefined ? "unread" : undefined}
            onOpen={() => onOpenDestination("monitoring")}
          />
          {counting ? (
            <Fact
              label="Server errors"
              value={
                counting.errors
                  ? `${count(counting.errors)} today`
                  : "None today"
              }
              note={
                !counting.errors
                  ? "No request has failed on the server today."
                  : counting.errorVisitors > 0
                    ? `About ${plural(counting.errorVisitors, "visitor")} saw one.`
                    : "No visitor saw one."
              }
              // A scanner tripping an error nobody saw is not a red number.
              reads={counting.errorVisitors > 0 ? "bad" : undefined}
              onOpen={() => onOpenDestination("traffic")}
            />
          ) : readErrors !== null ? (
            <Fact
              label="Server errors"
              value={readErrors ? count(readErrors) : "None"}
              note="In the last day Hallvi read."
              onOpen={() => onOpenDestination("monitoring")}
            />
          ) : (
            <Fact
              label="Server errors"
              value="Not counted"
              note={
                kept
                  ? "Nothing is counted for today yet."
                  : "Hallvi counts them once traffic history is kept."
              }
              reads="unread"
              onOpen={() => onOpenDestination("traffic")}
            />
          )}
          <Fact
            label="Server"
            value={
              host
                ? `CPU ${average(host.cpu)}% · memory ${average(host.memory)}%`
                : "Not read"
            }
            note={
              host
                ? `The average when Hallvi last read it${usage?.at ? `, ${ago(usage.at, now)}` : ""}.${host.memoryTotal ? ` ${host.memoryTotal} of memory.` : ""}`
                : "Hallvi has not read the server's load yet."
            }
            reads={host ? undefined : "unread"}
            onOpen={() => onOpenDestination("monitoring")}
          />
          <Fact
            label="Running"
            value={running ? <code>{running.short}</code> : "Not established"}
            note={
              running
                ? `Released ${ago(running.at, now)}.${running.changes[0] ? ` ${sentence(running.changes[0])}` : ""}`
                : latest
                  ? `Nothing on record proves that ${latest.short} is running.`
                  : "No release is on record."
            }
            reads={running ? undefined : "unread"}
            onOpen={() => onOpenDestination("deployment")}
          />
        </ul>

        <div className="ovl-lower">
          <section aria-labelledby="ovl-recent">
            <header>
              <h2 id="ovl-recent">Recent</h2>
              <Go onClick={() => onOpenDestination("history")}>History</Go>
            </header>
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
          </section>

          <section aria-labelledby="ovl-checked">
            <header>
              <h2 id="ovl-checked">Checked by Hallvi</h2>
            </header>
            {unlooked ? (
              <p className="ovl-empty">
                Hallvi has not checked {name}, its server or its backups yet.
                That is not a claim that anything is wrong.{" "}
                <Go
                  onClick={() =>
                    onAsk(
                      "Check the application, its server, what can reach it and whether its data is copied anywhere, and record what you find.",
                    )
                  }
                >
                  Ask Hallvi to check
                </Go>
              </p>
            ) : (
              <ul className="ovl-vitals">
                {built.vitals.map((vital) => {
                  const seen = liveReading(vital, pulse, closed);
                  return (
                    <li key={vital.id}>
                      <button
                        type="button"
                        onClick={() => onOpenDestination(vital.destination)}
                      >
                        {/* Read aloud as certainty, subject, sentence; drawn
                            with the subject first. */}
                        <Tag tone={seen.tone}>{seen.word}</Tag>
                        <b>{vital.label}</b>
                        <span>{seen.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!mapped && (
              <p className="ovl-foot ovl-unmapped">
                <span>
                  The deployment is recorded, but its architecture has not been
                  mapped yet.
                </span>{" "}
                <Go
                  onClick={() =>
                    onAsk(
                      "Work out how this application is put together — its pieces, how they connect, and what you can verify about each — and record it.",
                    )
                  }
                >
                  Ask Hallvi to map this application
                </Go>
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
