"use client";

// Overview's traffic tile: today's estimated visitors against a usual day,
// a pulse while visits arrive, and the errors visitors hit today — only
// when there are some. It opens Traffic.

import type { TrafficHistory } from "@/server/traffic/contract";

import type { Traffic } from "../overview-live/use-traffic";
import { count, hasTotals, plural, usualDay } from "./model";
import { NowWords, Pulse } from "./live";
import "./traffic.css";

export function VisitorsToday({
  month,
  traffic,
}: {
  /** The 30-day history: a daily series whose last point is today. */
  month: TrafficHistory | null;
  traffic: Traffic;
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
  const days = [...month.series]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-8);
  const usual = usualDay(month.series);
  const today = days.at(-1)!;
  const top = Math.max(1, ...days.map((day) => day.visitors));
  return (
    <div className="tf-tile">
      {today.covered ? (
        <p className="ovl-number">
          {count(today.visitors)}
          <small>
            estimated {today.visitors === 1 ? "visitor" : "visitors"} today
          </small>
        </p>
      ) : (
        // Nobody read today: that is unassessed, never nobody came.
        <p className="ovl-empty">
          {month.collection.enabledAt
            ? "Nothing is counted for today yet."
            : "History is off, so today is not counted."}
        </p>
      )}
      <p className="tf-tile-usual">
        {usual?.busier
          ? `Busier than a usual day, which has about ${count(usual.usual!)}.`
          : usual?.usual !== null && usual?.usual !== undefined
            ? `A usual day has about ${count(usual.usual)}.`
            : "Not enough days yet to say what a usual one is."}
      </p>
      <div className="tf-tile-days" aria-hidden="true">
        {days.map((day, index) => (
          <i
            key={day.at}
            data-today={index === days.length - 1 || undefined}
            data-gap={!day.covered || undefined}
            style={{
              height: day.covered
                ? `${Math.max(4, (day.visitors / top) * 100)}%`
                : "100%",
            }}
          />
        ))}
      </div>
      {today.covered > 0 && today.errorVisitors > 0 && (
        <p className="tf-tile-errors">
          {plural(today.errors, "server error")} today, hitting about{" "}
          {plural(today.errorVisitors, "visitor")}.
        </p>
      )}
      <p className="tf-tile-now">
        <Pulse traffic={traffic} />
        <NowWords traffic={traffic} />
      </p>
    </div>
  );
}
