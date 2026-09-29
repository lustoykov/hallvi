"use client";

// How the application answered its visitors: the errors they hit, how long
// the slowest answers took, and the bots that are never counted as visitors.
// Errors show only when there are some; a range without any says nothing
// about them rather than drawing a card of zeros.

import type { TrafficHistory } from "@/server/traffic/contract";

import { Ask } from "../register";
import {
  atLeast,
  count,
  errorsAcrossMidnight,
  errorsHitVisitors,
  milliseconds,
  plural,
  todayCovered,
} from "./model";

export function Errors({
  history,
  name,
  onAsk,
}: {
  history: TrafficHistory;
  name: string;
  onAsk: (draft: string) => void;
}) {
  const oneDay = history.range === "24h";
  // The 24-hour range starts yesterday, while its visitor estimates and its
  // lists are today's: today's errors are the ones they describe, and what
  // came before midnight is said apart.
  const split = oneDay ? errorsAcrossMidnight(history) : null;
  const hit = split
    ? split.todayHit || split.earlierHit
    : errorsHitVisitors(history);
  const listed = split ? split.todayHit : hit;
  const failing = listed ? history.errors.filter((row) => row.count > 0) : [];
  const script = history.scriptErrors.filter((row) => row.count > 0);
  // Only what reached somebody earns a card; the rest is small print under
  // Responses.
  if (!hit && !script.length) return null;
  // Visitor estimates are per day. Over one day a list can say "about 9
  // visitors"; over a week it can only say how many days errors reached
  // anyone, and which day was worst.
  const days = history.series.filter((point) => point.errorVisitors > 0);
  const worst = [...days].sort((a, b) => b.errorVisitors - a.errorVisitors)[0];
  const says = !hit
    ? null
    : split
      ? split.todayHit
        ? `${plural(split.today, "server error")} today, hitting about ${plural(history.totals.errorVisitors, "visitor")}.${split.earlier ? ` ${count(split.earlier)} more before midnight.` : ""}`
        : `${plural(split.earlier, "server error")} before midnight reached visitors; ${todayCovered(history) ? "none has today" : "today has not been counted yet"}.`
      : !worst
        ? `${plural(history.totals.errors, "server error")}, hitting about ${plural(history.totals.errorVisitors, "visitor")}.`
        : `${plural(history.totals.errors, "server error")} reached visitors on ${plural(days.length, "day")}, most ${worst === history.series.at(-1) ? "today" : `on ${new Date(worst.at).toLocaleDateString("en-GB", { weekday: "long", timeZone: history.timeZone })}`} (about ${plural(worst.errorVisitors, "visitor")}).`;
  const top = failing[0];
  return (
    <section className="tf-card tf-errors" data-wide aria-label="Errors">
      <header className="tf-card-head">
        <h3>{hit ? "Errors visitors hit" : "Errors in the browser"}</h3>
      </header>
      {says && <p className="tf-card-say">{says}</p>}
      {failing.length > 0 && (
        <ol className="tf-error-list">
          {failing.slice(0, 6).map((row) => (
            <li key={row.key}>
              <code title={row.key}>{row.key}</code>
              <b>
                {history.partialLists.includes("errors") ? "≥ " : ""}
                {plural(row.count, "error")}
              </b>
              <span>
                {oneDay && row.visitors
                  ? `about ${plural(row.visitors, "visitor")}`
                  : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      {script.length > 0 && (
        <p className="tf-card-quiet">
          In the browser, Hallvi&apos;s script counted JavaScript errors on{" "}
          {script
            .slice(0, 3)
            .map(
              (row) =>
                `${row.path} (${atLeast(count(row.count), history.partialLists.includes("scriptErrors"))})`,
            )
            .join(", ")}
          .
        </p>
      )}
      {top && (
        <div className="tf-card-asks">
          <Ask
            onAsk={onAsk}
            tone="bad"
            prompt={`${name} answered ${top.key} with ${plural(top.count, "server error")} ${oneDay ? "today" : history.range === "7d" ? "in the last 7 days" : "in the last 30 days"}. Read the application's output from then and tell me what went wrong.`}
          >
            Why is {top.key} failing?
          </Ask>
        </div>
      )}
    </section>
  );
}

/** The slowest 1 in 20 answers over the range, and the bots. */
export function Responses({ history }: { history: TrafficHistory }) {
  const points = [...history.series].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const values = points.map((point) =>
    point.covered > 0 ? point.p95Ms : null,
  );
  const measured = values.filter((value): value is number => value !== null);
  // From the fastest to the slowest reading, so a change shows as a change.
  const low = Math.min(...measured) * 0.8;
  const high = Math.max(low + 1, ...measured);
  const span = Math.max(1, points.length - 1);
  // One line per stretch the log covered; a gap stays a gap.
  const runs: string[] = [];
  let run: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (run.length) runs.push(run.join(" "));
      run = [];
      return;
    }
    run.push(
      `${((index / span) * 100).toFixed(2)},${(38 - ((value - low) / (high - low)) * 34).toFixed(2)}`,
    );
  });
  if (run.length) runs.push(run.join(" "));
  const bots = history.totals.bots;
  return (
    <section className="tf-card tf-responses" aria-label="Responses">
      <header className="tf-card-head">
        <h3>Responses</h3>
      </header>
      {history.totals.p95Ms !== null ? (
        <p className="tf-figure">
          {atLeast(
            milliseconds(history.totals.p95Ms),
            history.totals.p95AtLeast,
          )}
          <small>for the slowest 1 in 20</small>
        </p>
      ) : (
        <p className="tf-rank-empty">No response was timed in this range.</p>
      )}
      {measured.length > 1 && (
        <svg
          className="tf-spark"
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {runs.map((points) =>
            points.includes(" ") ? (
              <polyline key={points} points={points} />
            ) : null,
          )}
        </svg>
      )}
      <p className="tf-card-quiet">
        {plural(history.totals.requests, "request")} in all
        {bots
          ? `, ${count(bots)} of them from bots and scanners, which are never counted as visitors.`
          : ", none from bots or scanners."}
        {history.totals.errors > 0 &&
          !errorsHitVisitors(history) &&
          ` ${plural(history.totals.errors, "server error")}, none reaching a visitor.`}
      </p>
    </section>
  );
}
