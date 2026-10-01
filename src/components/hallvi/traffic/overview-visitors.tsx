"use client";

// Overview's visitors card: today's estimated visitors against a usual day,
// thirty days of bars with today in blue and the usual day drawn across
// them, each release marked on the day it went out, and what today's
// visitors opened, where they came from and where they were. Overview draws
// the heading, the live line and the link to Traffic around it.

import { useState } from "react";

import {
  OTHER,
  UNKNOWN,
  type Ranked,
  type TrafficHistory,
} from "@/server/traffic/contract";

import {
  count,
  countryName,
  hasTotals,
  isQuiet,
  plural,
  usualDay,
} from "./model";
import "./traffic.css";

/** A release, as far as the chart needs it: when, and what to call it. */
export interface Released {
  at: string;
  short: string;
}

const dayWords = (at: string, timeZone: string) => {
  const options = { day: "numeric", month: "short" } as const;
  try {
    return new Date(at).toLocaleDateString(undefined, { ...options, timeZone });
  } catch {
    return new Date(at).toLocaleDateString(undefined, options);
  }
};

function Days({
  month,
  usual,
  released,
}: {
  month: TrafficHistory;
  usual: number | null;
  released: Released[];
}) {
  const [pointed, setPointed] = useState<number | null>(null);
  const days = [...month.series].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const last = days.length - 1;
  const top = Math.max(1, usual ?? 0, ...days.map((day) => day.visitors));
  // The day each release went out on: the last one that had started by then.
  const marks = new Map<number, string[]>();
  for (const release of released) {
    const at = Date.parse(release.at);
    if (!(at >= Date.parse(days[0].at))) continue;
    const index = days.findLastIndex((day) => Date.parse(day.at) <= at);
    marks.set(index, [...(marks.get(index) ?? []), release.short]);
  }
  const day = pointed === null ? null : days[pointed];
  return (
    <div
      className="tf-ov-chart"
      // A small application is not drawn as a wall of bars.
      data-quiet={isQuiet(month) || undefined}
      onPointerLeave={() => setPointed(null)}
    >
      <p className="tf-ov-readout">
        {day && pointed !== null && (
          <>
            <b>
              {pointed === last ? "Today" : dayWords(day.at, month.timeZone)}
            </b>
            {day.covered > 0
              ? `${plural(day.visitors, "visitor")}${pointed === last ? " so far" : ""}`
              : "Not counted"}
            {marks.has(pointed) &&
              ` · released ${marks.get(pointed)!.join(" and ")}`}
          </>
        )}
      </p>
      <div
        className="tf-ov-plot"
        role="img"
        aria-label={`Estimated visitors on each of the last ${days.length} days, today last.`}
      >
        {/* A usual day of nobody is no line to measure today against. */}
        {usual !== null && usual >= 1 && (
          <span
            className="tf-ov-usual"
            style={{ bottom: `${(usual / top) * 100}%` }}
          >
            <em>usual day</em>
          </span>
        )}
        {days.map((one, index) => (
          <span
            key={one.at}
            className="tf-ov-day"
            data-today={index === last || undefined}
            // Nobody read that day: a gap, never an empty bar.
            data-gap={!one.covered || undefined}
            data-pointed={index === pointed || undefined}
            onPointerEnter={() => setPointed(index)}
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
      <div className="tf-ov-axis" aria-hidden="true">
        {days.map((one, index) => (
          <span key={one.at} data-today={index === last || undefined}>
            {marks.has(index) && <i className="tf-ov-release" />}
            {(last - index) % 7 === 0 && (
              <small>
                {index === last ? "Today" : dayWords(one.at, month.timeZone)}
              </small>
            )}
          </span>
        ))}
      </div>
      {marks.size > 0 && (
        <p className="tf-ov-legend">
          <i className="tf-ov-release" aria-hidden="true" /> a release went out
        </p>
      )}
    </div>
  );
}

function Top({
  title,
  rows,
  name,
}: {
  title: string;
  rows: Ranked[];
  /** How a key reads; absent for pages, which are drawn as paths. */
  name?: (key: string) => string;
}) {
  // What did not fit a list, or could not be told, is not a place or a page.
  const named = rows
    .filter((row) => row.count > 0 && row.key !== OTHER && row.key !== UNKNOWN)
    .slice(0, 4);
  if (!named.length) return null;
  const most = named[0].count;
  return (
    <div className="tf-ov-top">
      <h3>{title}</h3>
      <ol>
        {named.map((row) => (
          <li key={row.key}>
            {name ? (
              <span>{name(row.key)}</span>
            ) : (
              <code title={row.key}>{row.key}</code>
            )}
            <b>{count(row.count)}</b>
            <i style={{ width: `${(row.count / most) * 100}%` }} />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function VisitorsToday({
  month,
  day = null,
  released = [],
}: {
  /** The 30-day history: a daily series whose last point is today. */
  month: TrafficHistory | null;
  /** The 24-hour history, whose lists are today's. Null while unread. */
  day?: TrafficHistory | null;
  /** The releases to mark on the day they went out. */
  released?: Released[];
}) {
  if (!month)
    return <p className="ovl-empty">Reading what Hallvi has counted…</p>;
  if (!hasTotals(month))
    return (
      <p className="ovl-empty">
        Nothing is counted yet. Traffic fills in once the server&apos;s log has
        been read.
      </p>
    );
  const usual = usualDay(month.series);
  const today = [...month.series]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .at(-1)!;
  return (
    <div className="tf-ov">
      <div className="tf-ov-figures">
        {today.covered ? (
          <p className="tf-ov-today">
            <b>{count(today.visitors)}</b>
            <span>
              estimated {today.visitors === 1 ? "visitor" : "visitors"} today
            </span>
          </p>
        ) : (
          // Nobody read today: that is unassessed, never nobody came.
          <p className="ovl-empty">
            {month.collection.enabledAt
              ? "Nothing is counted for today yet."
              : "History is off, so today is not counted."}
          </p>
        )}
        <p className="tf-ov-usual-words">
          {usual?.busier
            ? `Busier than a usual day, which has about ${count(usual.usual!)}.`
            : usual?.usual !== null && usual?.usual !== undefined
              ? usual.usual >= 1
                ? `A usual day has about ${count(usual.usual)}.`
                : "A usual day has had none so far."
              : "Not enough days yet to say what a usual one is."}
        </p>
      </div>
      <Days month={month} usual={usual?.usual ?? null} released={released} />
      {day && hasTotals(day) && day.pages.some((row) => row.count > 0) && (
        <div className="tf-ov-tops">
          <p>Page views today</p>
          <Top title="Pages" rows={day.pages} />
          <Top title="Came from" rows={day.sources} name={(key) => key} />
          <Top title="Countries" rows={day.countries} name={countryName} />
        </div>
      )}
    </div>
  );
}
