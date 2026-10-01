"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// A · Visitors first. The tile the owner liked gets the page: thirty days of
// visitors with today in blue, the usual day drawn as a line across them and
// each release marked on the day it went out. Under it sit four facts, then
// what was recorded and what Hallvi has checked. No tiles.

import { useState } from "react";

import type { Ranked } from "@/server/traffic/contract";

import { Tag, UnresolvedMarks } from "../presentation";
import { NowWords, Pulse } from "../traffic/live";
import { countryName, milliseconds } from "../traffic/model";
import { ago, count, dayName, plural, span, type Facts } from "./facts";
import {
  DirectionsHead,
  OpenAction,
  PageLink,
  firstSentence,
  openWord,
  type VariantProps,
} from "./head";

function Days({ facts }: { facts: Facts }) {
  const { days, usual } = facts.visitors;
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(1, usual ?? 0, ...days.map((day) => day.visitors));
  // The day each release went out on.
  const released = new Map<number, string[]>();
  for (const release of facts.releases.all) {
    const at = Date.parse(release.at);
    if (!days.length || at < days[0].at) continue;
    let index = 0;
    days.forEach((day, position) => {
      if (day.at <= at) index = position;
    });
    released.set(index, [...(released.get(index) ?? []), release.short]);
  }
  const last = days.length - 1;
  const day = hover === null ? null : days[hover];
  // A small application is not drawn as a wall: no day reached ten visitors.
  const quiet = days.every((one) => !one.covered || one.visitors < 10);
  return (
    <div
      className="ova-chart"
      data-quiet={quiet || undefined}
      onPointerLeave={() => setHover(null)}
    >
      <p className="ova-readout">
        {day && hover !== null && (
          <>
            <b>{hover === last ? "Today" : dayName(day.at)}</b>
            {day.covered
              ? `${plural(day.visitors, "visitor")}${hover === last ? " so far" : ""}`
              : "Not counted"}
            {released.has(hover) &&
              ` · released ${released.get(hover)!.join(" and ")}`}
          </>
        )}
      </p>
      <div
        className="ova-plot"
        role="img"
        aria-label={`Estimated visitors on each of the last ${days.length} days.`}
      >
        {usual !== null && (
          <span
            className="ova-usual-line"
            style={{ bottom: `${(usual / top) * 100}%` }}
          >
            <em>usual day</em>
          </span>
        )}
        {days.map((one, index) => (
          <span
            key={one.at}
            className="ova-col"
            data-today={index === last || undefined}
            data-gap={!one.covered || undefined}
            data-shown={(hover !== null && index === hover) || undefined}
            onPointerEnter={() => setHover(index)}
          >
            <i
              style={{
                height: one.covered
                  ? `${Math.max(1.5, (one.visitors / top) * 100)}%`
                  : "100%",
              }}
            />
          </span>
        ))}
      </div>
      <div className="ova-under" aria-hidden="true">
        {days.map((one, index) => (
          <span key={one.at} data-last={index === last || undefined}>
            {released.has(index) && <i className="ova-release" />}
            {(last - index) % 7 === 0 && (
              <small>{index === last ? "Today" : dayName(one.at)}</small>
            )}
          </span>
        ))}
      </div>
      {released.size > 0 && (
        <p className="ova-legend">
          <i className="ova-release" /> a release went out
        </p>
      )}
    </div>
  );
}

function Top({
  title,
  rows,
  name = (key) => key,
  code,
}: {
  title: string;
  rows: Ranked[];
  name?: (key: string) => string;
  code?: boolean;
}) {
  if (!rows.length) return null;
  const most = rows[0].count;
  return (
    <div className="ova-top">
      <h3>{title}</h3>
      <ol>
        {rows.slice(0, 4).map((row) => (
          <li key={row.key}>
            {code ? <code>{row.key}</code> : <span>{name(row.key)}</span>}
            <b>{count(row.count)}</b>
            <i style={{ width: `${(row.count / most) * 100}%` }} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Visitors({ facts }: { facts: Facts }) {
  const { visitors, traffic } = facts;
  return (
    <section className="ova-visitors" aria-labelledby="ova-visitors">
      <header>
        <h2 id="ova-visitors">Visitors</h2>
        <p className="ova-now">
          <Pulse traffic={traffic} />
          <NowWords traffic={traffic} />
        </p>
        <PageLink facts={facts} to="traffic">
          Traffic
        </PageLink>
      </header>
      {!visitors.kept ? (
        <p className="ova-quiet">
          Hallvi is not keeping traffic history for {facts.name}, so there are
          no days to draw. You can turn it on from Traffic.
        </p>
      ) : !visitors.counted ? (
        <p className="ova-quiet">
          {facts.collection?.state === "no-log"
            ? "There is no access log to count visitors from yet."
            : "Nothing is counted yet. The chart fills in once Hallvi has read the server's log."}
        </p>
      ) : (
        <>
          <div className="ova-figures">
            {visitors.today !== null ? (
              <p className="ova-today">
                <b>{count(visitors.today)}</b>
                <span>
                  estimated {visitors.today === 1 ? "visitor" : "visitors"}{" "}
                  today
                </span>
              </p>
            ) : (
              <p className="ova-quiet">Nothing is counted for today yet.</p>
            )}
            <p className="ova-usual">
              {visitors.busier
                ? `Busier than a usual day, which has about ${count(visitors.usual!)}.`
                : visitors.usual !== null
                  ? `A usual day has about ${count(visitors.usual)}.`
                  : "Not enough days yet to say what a usual one is."}
            </p>
          </div>
          <Days facts={facts} />
        </>
      )}
      {visitors.counted && visitors.pages.length > 0 && (
        <div className="ova-tops">
          <p>Page views in the last 24 hours</p>
          <Top title="Pages" rows={visitors.pages} code />
          <Top title="Came from" rows={visitors.sources} />
          <Top title="Countries" rows={visitors.countries} name={countryName} />
        </div>
      )}
    </section>
  );
}

function Fact({
  label,
  value,
  note,
  tone,
  onOpen,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "bad" | "unread";
  onOpen: () => void;
}) {
  return (
    <div className="ova-fact" data-tone={tone}>
      <dt>{label}</dt>
      <dd>
        <button type="button" onClick={onOpen}>
          <b>{value}</b>
          <span>{note}</span>
        </button>
      </dd>
    </div>
  );
}

function FourFacts({ facts }: { facts: Facts }) {
  const { speed, visitors, server, releases, now } = facts;
  const running = releases.running;
  const failedNewest =
    releases.latest &&
    releases.latest !== running &&
    releases.latest.outcome === "failed";
  return (
    <dl className="ova-facts">
      <Fact
        label="Speed"
        value={
          speed.typicalMs !== null ? milliseconds(speed.typicalMs) : "Not read"
        }
        note={
          speed.typicalMs !== null
            ? "The slowest 1 in 20 requests, in a typical hour."
            : "Hallvi has not read response times yet."
        }
        tone={speed.typicalMs === null ? "unread" : undefined}
        onOpen={() => facts.onOpenDestination("monitoring")}
      />
      <Fact
        label="Server errors"
        value={
          visitors.errors
            ? visitors.errors.today
              ? `${count(visitors.errors.today)} today`
              : "None today"
            : "Not counted"
        }
        note={
          !visitors.errors
            ? "Errors are counted once traffic history is kept."
            : !visitors.errors.today
              ? "No request has failed on the server today."
              : visitors.errors.visitorsHit
                ? `About ${plural(visitors.errors.visitorsHit, "visitor")} saw one.`
                : "No visitor saw one."
        }
        tone={
          !visitors.errors
            ? "unread"
            : visitors.errors.visitorsHit
              ? "bad"
              : undefined
        }
        onOpen={() => facts.onOpenDestination("traffic")}
      />
      <Fact
        label="Server"
        value={
          server
            ? `CPU ${Math.round(server.cpuAverage)}% · memory ${Math.round(server.memoryAverage)}%`
            : "Not read"
        }
        note={
          server
            ? `The average over the last day${server.memoryTotal ? `, of ${server.memoryTotal}` : ""}${server.readAt ? `. Read ${ago(server.readAt, now)}.` : "."}`
            : "Hallvi has not read the server's load yet."
        }
        tone={server ? undefined : "unread"}
        onOpen={() => facts.onOpenDestination("monitoring")}
      />
      <Fact
        label="Running"
        value={running ? running.short : "Not established"}
        note={
          running
            ? failedNewest
              ? `The newest release, ${releases.latest!.short}, did not start. This one still serves.`
              : `Released ${span(now - Date.parse(running.at))} ago${running.changes[0] ? `. ${running.changes[0]}.` : "."}`
            : "No release has been proved to be running."
        }
        tone={running ? (failedNewest ? "bad" : undefined) : "unread"}
        onOpen={() => facts.onOpenDestination("deployment")}
      />
    </dl>
  );
}

export function VariantA({ facts, bar }: VariantProps) {
  return (
    <div className="ova">
      <DirectionsHead facts={facts} bar={bar} />
      {facts.open.length > 0 && (
        <ul className="ova-open" aria-label="Unresolved">
          {facts.open.slice(0, 3).map((need) => (
            <li key={need.id}>
              <UnresolvedMarks tones={[need.tone]} />
              <b>{need.title}</b>
              <span>{openWord(need)}</span>
              <OpenAction need={need} facts={facts} />
            </li>
          ))}
        </ul>
      )}
      <Visitors facts={facts} />
      <FourFacts facts={facts} />
      <div className="ova-lower">
        <section aria-labelledby="ova-recent">
          <header>
            <h2 id="ova-recent">Recent</h2>
            <PageLink facts={facts} to="history">
              History
            </PageLink>
          </header>
          {facts.happened.length ? (
            <ol className="ova-recent">
              {facts.happened.slice(0, 6).map((one) => (
                <li key={one.id} data-state={one.state}>
                  {one.open ? (
                    <button type="button" onClick={one.open}>
                      {one.title}
                    </button>
                  ) : (
                    <span>{one.title}</span>
                  )}
                  <time>{ago(one.at, facts.now)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ova-quiet">No work is recorded yet.</p>
          )}
        </section>
        <section aria-labelledby="ova-checked">
          <header>
            <h2 id="ova-checked">Checked by Hallvi</h2>
          </header>
          {facts.lanes.every((lane) => lane.tone === "unknown") ? (
            <p className="ova-quiet">
              Hallvi has not checked {facts.name}, its server or its backups
              yet. That is not a claim that anything is wrong.{" "}
              <button
                type="button"
                className="ovx-link"
                onClick={() =>
                  facts.onAsk(
                    "Check the application, its server, what can reach it and whether its data is copied anywhere, and record what you find.",
                  )
                }
              >
                Ask Hallvi to check
              </button>
            </p>
          ) : (
            <ul className="ova-lanes">
              {facts.lanes.map((lane) => (
                <li key={lane.id}>
                  <button
                    type="button"
                    onClick={() => facts.onOpenDestination(lane.destination)}
                  >
                    <b>{lane.label}</b>
                    <Tag tone={lane.tone}>{lane.word}</Tag>
                    <span>
                      {lane.id === "backups"
                        ? firstSentence(lane.plain)
                        : lane.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
