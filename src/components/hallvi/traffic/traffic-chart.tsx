"use client";

// Visitors and page views over the range, with what happened around them.
//
// Page views are the soft bars and estimated visitors the line. A release is
// a hairline with a small mark on top; the moment Hallvi's script took over
// counting is a dashed one. A stretch the log did not cover is hatched and
// holds no bar and no line: a gap is a gap, never a zero; a bucket covered in
// part is hatched lightly. The bucket still in progress — this hour, today —
// is drawn lighter, because it is, and only its future is exempt from gaps.

import { useMemo, useState, type PointerEvent } from "react";

import type { SeriesPoint, TrafficHistory } from "@/server/traffic/contract";

import {
  atLeast,
  compact,
  count,
  gapWords,
  milliseconds,
  plural,
} from "./model";

/**
 * How far the collector's written coverage may trail the clock: it writes
 * at least once a minute, and the page reads a little after that.
 */
const UNWRITTEN_MS = 2 * 60_000;

export interface ReleaseMark {
  at: string;
  short: string;
}

/** A round number at or above the largest value, for the one grid line. */
const ceiling = (max: number) => {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  const units = Math.ceil(max / step);
  return (units <= 2 ? units : units <= 5 ? 5 : 10) * step;
};

function formats(timeZone: string) {
  const make = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("en-GB", { ...options, timeZone });
    } catch {
      return new Intl.DateTimeFormat("en-GB", options);
    }
  };
  return {
    hour: make({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    weekday: make({ weekday: "short" }),
    day: make({ day: "numeric", month: "short" }),
    long: make({ weekday: "short", day: "numeric", month: "short" }),
  };
}

export function TrafficChart({
  history,
  releases,
  scriptSince,
  now,
}: {
  history: TrafficHistory;
  releases: ReleaseMark[];
  /** The first script event: views and visitors come from it after this. */
  scriptSince: string | null;
  now: number;
}) {
  const hourly = history.range === "24h";
  const format = useMemo(() => formats(history.timeZone), [history.timeZone]);
  const points = useMemo(
    () =>
      [...history.series].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    [history.series],
  );
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;

  const starts = points.map((point) => Date.parse(point.at));
  const step = hourly ? 36e5 : 864e5;
  const ends = starts.map((start, index) => starts[index + 1] ?? start + step);
  const start = starts[0];
  const end = ends.at(-1)!;
  const place = (at: number) => ((at - start) / (end - start)) * 100;
  const shown = points.filter((point) => point.covered > 0);
  const top = ceiling(
    Math.max(0, ...shown.map((point) => Math.max(point.views, point.visitors))),
  );
  const y = (value: number) => 100 - (value / top) * 100;
  const last = points.length - 1;
  // The bucket the clock is inside is still being counted.
  const running = now < ends[last];

  // The visitors line, broken wherever the log did not cover a bucket.
  const runs: { index: number; x: number; y: number }[][] = [];
  points.forEach((point, index) => {
    if (!point.covered) return;
    const dot = {
      index,
      x: (place(starts[index]) + place(ends[index])) / 2,
      y: y(point.visitors),
    };
    const run = runs.at(-1);
    if (run && run.at(-1)!.index === index - 1) run.push(dot);
    else runs.push([dot]);
  });
  const line = (run: { x: number; y: number }[]) =>
    run.map((dot) => `${dot.x.toFixed(3)},${dot.y.toFixed(3)}`).join(" ");

  const label = (index: number) => {
    const at = new Date(starts[index]);
    if (hourly)
      return `${format.hour.format(at)}–${format.hour.format(new Date(ends[index]))}`;
    return index === last && running
      ? `${format.long.format(at)}, so far`
      : format.long.format(at);
  };
  const ticks = points
    .map((_, index) => index)
    .filter((index) => {
      if (hourly)
        return Number(format.hour.format(new Date(starts[index]))) % 6 === 0;
      if (history.range === "7d") return true;
      return (last - index) % 7 === 0;
    });
  const tick = (index: number) => {
    const at = new Date(starts[index]);
    if (hourly) return format.hour.format(at);
    if (history.range === "7d") return format.weekday.format(at);
    return format.day.format(at);
  };

  const marks = releases
    .map((release) => ({ ...release, x: place(Date.parse(release.at)) }))
    .filter((mark) => mark.x >= 0 && mark.x <= 100);
  const switchAt = scriptSince ? place(Date.parse(scriptSince)) : null;
  // Coverage is a share of the time that has passed, so the bucket still
  // being counted is short of it only where the log missed a stretch: its
  // future is no gap, and neither are the last moments the collector has
  // yet to write down.
  const short = (index: number) => {
    const { covered } = points[index];
    if (covered >= 1) return false;
    if (!(index === last && running)) return true;
    const elapsed = Math.max(0, now - starts[index]);
    return (1 - covered) * elapsed > UNWRITTEN_MS;
  };
  // A gap in the running bucket reaches only as far as now.
  const until = (index: number) =>
    index === last && running ? Math.min(ends[index], now) : ends[index];
  const gaps = points
    .map((point, index) => ({ point, index }))
    .filter(({ index }) => short(index));

  const whyNot = (index: number) => {
    const bucket = { from: starts[index], to: ends[index] };
    const gap = history.coverage.gaps.find(
      (one) =>
        Date.parse(one.from) < bucket.to && Date.parse(one.to) > bucket.from,
    );
    if (gap) return gapWords(gap);
    const { from, to } = history.coverage;
    if (from && bucket.to <= Date.parse(from))
      return "it is before the first line Hallvi counted";
    if (to && bucket.from >= Date.parse(to))
      return "history was not being kept";
    return "the log did not cover it";
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = start + ((event.clientX - box.left) / box.width) * (end - start);
    const index = ends.findIndex((bucketEnd) => at < bucketEnd);
    setHover(index < 0 ? last : index);
  };

  const hovered: SeriesPoint | null = hover === null ? null : points[hover];
  const hoveredReleases =
    hover === null
      ? []
      : marks.filter((mark) => {
          const at = Date.parse(mark.at);
          return at >= starts[hover] && at < ends[hover];
        });

  return (
    <figure className="tf-chart">
      <span className="tf-chart-grid" aria-hidden="true">
        {compact(top)}
      </span>
      <div
        className="tf-chart-plot"
        role="img"
        aria-label={`Estimated visitors and page views, ${history.range === "24h" ? "hour by hour" : "day by day"}.${gaps.length ? " Some of this period was not counted." : ""}`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        {gaps.map(({ point, index }) => (
          <span
            key={`gap-${index}`}
            className="tf-chart-gap"
            data-part={point.covered > 0 || undefined}
            style={{
              left: `${place(starts[index])}%`,
              width: `${place(until(index)) - place(starts[index])}%`,
            }}
          />
        ))}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {points.map((point, index) => {
            if (!point.covered || !point.views) return null;
            const left = place(starts[index]);
            const width = place(ends[index]) - left;
            const inset = Math.min(0.9, width * 0.16);
            return (
              <rect
                key={index}
                className="tf-chart-bar"
                data-now={(index === last && running) || undefined}
                data-hover={hover === index || undefined}
                x={left + inset}
                width={Math.max(0.2, width - inset * 2)}
                y={y(point.views)}
                height={100 - y(point.views)}
              />
            );
          })}
          {runs
            .filter((run) => run.length > 1)
            .map((run) => (
              <polygon
                key={`area-${run[0].index}`}
                className="tf-chart-area"
                points={`${run[0].x},100 ${line(run)} ${run.at(-1)!.x},100`}
              />
            ))}
          {runs.map((run) => {
            // The last stretch into a bucket still being counted is dashed.
            const open = running && run.at(-1)!.index === last;
            const settled = open ? run.slice(0, -1) : run;
            return (
              <g key={`line-${run[0].index}`}>
                {settled.length > 1 && (
                  <polyline className="tf-chart-line" points={line(settled)} />
                )}
                {open && run.length > 1 && (
                  <polyline
                    className="tf-chart-line"
                    data-now
                    points={line(run.slice(-2))}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {runs
          .filter((run) => run.length === 1)
          .map((run) => (
            // A visitors reading with no neighbour is still a reading.
            <span
              key={`lone-${run[0].index}`}
              className="tf-chart-lone"
              style={{ left: `${run[0].x}%`, top: `${run[0].y}%` }}
            />
          ))}
        {marks.map((mark) => (
          <span
            key={`release-${mark.at}`}
            className="tf-chart-release"
            style={{ left: `${mark.x}%` }}
            title={`Release ${mark.short}`}
          >
            <i />
          </span>
        ))}
        {switchAt !== null && switchAt >= 0 && switchAt <= 100 && (
          <span
            className="tf-chart-switch"
            style={{ left: `${switchAt}%` }}
            title="From here, views and visitors come from Hallvi's script"
          >
            <em>script</em>
          </span>
        )}
        {hovered && hover !== null && (
          <>
            <span
              className="tf-chart-cross"
              style={{
                left: `${(place(starts[hover]) + place(ends[hover])) / 2}%`,
              }}
            />
            <div
              className="tf-chart-tip"
              data-side={place(starts[hover]) > 58 ? "left" : "right"}
              style={{
                left: `${(place(starts[hover]) + place(ends[hover])) / 2}%`,
              }}
            >
              <time>{label(hover)}</time>
              {hovered.covered ? (
                <>
                  <span>
                    <i data-series="visitors" />
                    {atLeast(
                      plural(hovered.visitors, "estimated visitor"),
                      hovered.visitorsAtLeast,
                    )}
                  </span>
                  <span>
                    <i data-series="views" />
                    {plural(hovered.views, "page view")}
                  </span>
                  {hovered.errors > 0 && (
                    <span data-bad>
                      {plural(hovered.errors, "error")}
                      {hovered.errorVisitors > 0 &&
                        `, about ${plural(hovered.errorVisitors, "visitor")}`}
                    </span>
                  )}
                  {hovered.p95Ms !== null && (
                    <span className="tf-chart-quiet">
                      Slowest 1 in 20:{" "}
                      {atLeast(milliseconds(hovered.p95Ms), hovered.p95AtLeast)}
                    </span>
                  )}
                  {short(hover) && (
                    <span className="tf-chart-quiet">
                      The log covered {Math.round(hovered.covered * 100)}% of it
                      {hover === last && running ? " so far" : ""}:{" "}
                      {whyNot(hover)}
                    </span>
                  )}
                </>
              ) : (
                <span className="tf-chart-quiet">
                  {short(hover)
                    ? `Not counted: ${whyNot(hover)}`
                    : "Nothing counted yet"}
                </span>
              )}
              {hoveredReleases.map((mark) => (
                <span key={mark.at} className="tf-chart-quiet">
                  Release {mark.short}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="tf-chart-axis" aria-hidden="true">
        {ticks.map((index) => (
          <span
            key={index}
            style={{
              left: `${(place(starts[index]) + place(ends[index])) / 2}%`,
            }}
          >
            {tick(index)}
          </span>
        ))}
      </div>
      <figcaption className="tf-chart-legend">
        <span>
          <i data-series="views" />
          Page views
        </span>
        <span>
          <i data-series="visitors" />
          Estimated visitors
        </span>
        {marks.length > 0 && (
          <span>
            <i data-series="release" />
            {marks.length === 1
              ? "A release"
              : `${count(marks.length)} releases`}
          </span>
        )}
        {gaps.some(({ point }) => !point.covered) && (
          <span>
            <i data-series="gap" />
            Not counted
          </span>
        )}
      </figcaption>
    </figure>
  );
}
