// What the traffic pages draw from stored totals and the live stream, where
// a figure could claim more than was measured: a day nobody read, a range
// whose errors straddle midnight, a percentile past the last bound, a list a
// day kept only in part, and a script's view in the request counts.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MonitoringUsage } from "@/components/hallvi/monitoring-usage";
import {
  summarise,
  type SeenLine,
  type Traffic,
} from "@/components/hallvi/overview-live/use-traffic";
import { Breakdowns } from "@/components/hallvi/traffic/breakdowns";
import { Errors, Responses } from "@/components/hallvi/traffic/health";
import { VisitorsToday } from "@/components/hallvi/traffic/overview-tile";
import { Strip } from "@/components/hallvi/traffic/traffic-page";
import { TrafficChart } from "@/components/hallvi/traffic/traffic-chart";
import type {
  Collection,
  RangeTotals,
  SeriesPoint,
  TrafficHistory,
  TrafficRange,
} from "@/server/traffic/contract";

const HOUR = 36e5;
const DAY = 864e5;
const NOW = Date.parse("2026-09-29T01:30:00.000Z");

const collection = (input: Partial<Collection> = {}): Collection => ({
  enabledAt: "2026-09-01T10:00:00.000Z",
  disabledAt: null,
  state: "live",
  detail: null,
  lastLineAt: null,
  oldestRetainedAt: null,
  scriptSince: null,
  scriptSilentSince: null,
  source: null,
  storedFrom: "2026-09-01T00:00:00.000Z",
  logMisses: [],
  ...input,
});

const point = (at: number, input: Partial<SeriesPoint> = {}): SeriesPoint => ({
  at: new Date(at).toISOString(),
  requests: 40,
  views: 12,
  visitors: 4,
  errors: 0,
  errorVisitors: 0,
  visitorsAtLeast: false,
  bots: 0,
  p95Ms: 120,
  p95AtLeast: false,
  covered: 1,
  ...input,
});

const totals = (input: Partial<RangeTotals> = {}): RangeTotals => ({
  requests: 400,
  views: 120,
  errors: 0,
  errorVisitors: 0,
  visitorsAtLeast: false,
  bots: 0,
  p95Ms: 120,
  p95AtLeast: false,
  visitors: 4,
  visitorsPer: "today",
  ...input,
});

const history = (
  range: TrafficRange,
  series: SeriesPoint[],
  input: Partial<TrafficHistory> = {},
): TrafficHistory => ({
  range,
  timeZone: "UTC",
  collection: collection(),
  series,
  totals: totals(),
  previous: null,
  pages: [],
  sources: [],
  campaigns: [],
  countries: [],
  devices: [],
  browsers: [],
  systems: [],
  errors: [],
  goals: [],
  bots: [],
  engagement: [],
  vitals: [],
  partialLists: [],
  partialSamples: [],
  scriptErrors: [],
  coverage: { from: null, to: null, gaps: [] },
  viewSource: "log",
  ...input,
});

/** The last 24 hours at 01:30 UTC: 22 hours of yesterday, two of today. */
const hours = (edit: (at: number) => Partial<SeriesPoint> = () => ({})) =>
  Array.from({ length: 24 }, (_, index) => {
    const at = Date.parse("2026-09-28T02:00:00.000Z") + index * HOUR;
    return point(at, edit(at));
  });

const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("the 24-hour error card", () => {
  it("does not describe yesterday's errors with today's visitors", () => {
    const lateLastNight = Date.parse("2026-09-28T23:00:00.000Z");
    const html = text(
      renderToStaticMarkup(
        <Errors
          history={history(
            "24h",
            hours((at) =>
              at === lateLastNight ? { errors: 1, errorVisitors: 1 } : {},
            ),
            { totals: totals({ errors: 1, errorVisitors: 0 }) },
          )}
          name="Shop"
          onAsk={() => undefined}
        />,
      ),
    );
    expect(html).toContain(
      "1 server error before midnight reached visitors; none has today.",
    );
    expect(html).not.toContain("0 visitors");

    // Collection stopped before midnight: today was never looked at, so
    // nothing is said about its errors.
    const unread = text(
      renderToStaticMarkup(
        <Errors
          history={history(
            "24h",
            hours((at) =>
              at === lateLastNight
                ? { errors: 1, errorVisitors: 1 }
                : at >= Date.parse("2026-09-29T00:00:00.000Z")
                  ? { covered: 0, requests: 0, p95Ms: null }
                  : {},
            ),
            { totals: totals({ errors: 1, errorVisitors: 0 }) },
          )}
          name="Shop"
          onAsk={() => undefined}
        />,
      ),
    );
    expect(unread).toContain(
      "1 server error before midnight reached visitors; today has not been counted yet.",
    );
    expect(unread).not.toContain("none has today");
  });

  it("names today's errors apart from those before midnight", () => {
    const html = text(
      renderToStaticMarkup(
        <Errors
          history={history(
            "24h",
            hours((at) =>
              at === Date.parse("2026-09-28T22:00:00.000Z")
                ? { errors: 3, errorVisitors: 2 }
                : at === Date.parse("2026-09-29T01:00:00.000Z")
                  ? { errors: 5, errorVisitors: 4 }
                  : {},
            ),
            {
              totals: totals({ errors: 8, errorVisitors: 4 }),
              errors: [{ key: "/checkout", count: 5, visitors: 4 }],
            },
          )}
          name="Shop"
          onAsk={() => undefined}
        />,
      ),
    );
    expect(html).toContain(
      "5 server errors today, hitting about 4 visitors. 3 more before midnight.",
    );
  });
});

describe("a day nobody read", () => {
  const traffic = {
    state: "live",
    onArrival: () => () => undefined,
    openNow: null,
    recentVisitors: 0,
  } as unknown as Traffic;
  const month = (input: Partial<Collection>) =>
    history(
      "30d",
      Array.from({ length: 30 }, (_, index) =>
        point(
          Date.parse("2026-08-31T00:00:00.000Z") + index * DAY,
          index === 29 ? { visitors: 0, views: 0, covered: 0 } : {},
        ),
      ),
      { collection: collection(input) },
    );

  it("is never zero visitors on Overview", () => {
    const off = text(
      renderToStaticMarkup(
        <VisitorsToday
          month={month({
            enabledAt: null,
            disabledAt: "2026-09-28T20:00:00.000Z",
          })}
          traffic={traffic}
        />,
      ),
    );
    expect(off).toContain("History is off, so today is not counted.");
    expect(off).not.toMatch(/0\s*estimated/);
    expect(
      text(
        renderToStaticMarkup(
          <VisitorsToday month={month({})} traffic={traffic} />,
        ),
      ),
    ).toContain("Nothing is counted for today yet.");
  });
});

describe("the chart's running bucket", () => {
  it("marks a stretch of today the log missed, not the hours still to come", () => {
    const at = Date.parse("2026-09-29T18:00:00.000Z");
    const week = Array.from({ length: 7 }, (_, index) =>
      point(Date.parse("2026-09-23T00:00:00.000Z") + index * DAY),
    );
    const render = (covered: number) =>
      renderToStaticMarkup(
        <TrafficChart
          history={history("7d", [
            ...week.slice(0, 6),
            { ...week[6], covered },
          ])}
          releases={[]}
          scriptSince={null}
          now={at}
        />,
      );
    // Counted only from noon: the morning is missing.
    expect(render(1 / 3)).toContain("Some of this period was not counted.");
    // Everything but the last minute the collector has yet to write down.
    expect(render(1 - 60_000 / (18 * HOUR))).not.toContain(
      "Some of this period was not counted.",
    );
  });
});

describe("floors", () => {
  it("read as at least, from Monitoring's merged percentile to a truncated list", () => {
    // A thousand quick answers in one hour and one slow one in another: the
    // range's p95 is the merged one, never the median of the hours'.
    const merged = history(
      "24h",
      hours((at) =>
        at === Date.parse("2026-09-28T10:00:00.000Z")
          ? { p95Ms: 9000 }
          : at === Date.parse("2026-09-28T11:00:00.000Z")
            ? { p95Ms: 10 }
            : { covered: 0, p95Ms: null, requests: 0 },
      ),
      { totals: totals({ p95Ms: 10 }) },
    );
    const monitoring = text(
      renderToStaticMarkup(
        <MonitoringUsage
          usage={null}
          history={merged}
          name="Shop"
          now={NOW}
          onAsk={() => undefined}
        />,
      ),
    );
    expect(monitoring).toContain("Response, p95");
    expect(monitoring).toMatch(/Response, p9510 ms/);

    const slow = history("7d", hours(), {
      totals: totals({ p95Ms: 10_000, p95AtLeast: true }),
      vitals: [
        { path: "/", metric: "LCP", p75: 10_000, atLeast: true, samples: 9 },
      ],
      pages: [{ key: "/pricing", count: 110, visitors: 40 }],
      partialLists: ["pages"],
    });
    expect(text(renderToStaticMarkup(<Responses history={slow} />))).toContain(
      "≥ 10 s",
    );
    const lists = text(
      renderToStaticMarkup(
        <Breakdowns history={slow} script locked={() => null} />,
      ),
    );
    expect(lists).toContain("≥ 110");
    expect(lists).toContain("≥ 10 s");
  });

  it("read as at least where a day was counted in parts, on every page", () => {
    const parts = history(
      "7d",
      Array.from({ length: 7 }, (_, index) =>
        point(
          Date.parse("2026-09-23T00:00:00.000Z") + index * DAY,
          index === 3 ? { visitors: 30, visitorsAtLeast: true } : {},
        ),
      ),
      {
        totals: totals({
          visitors: 9,
          visitorsPer: "day",
          visitorsAtLeast: true,
        }),
        pages: [{ key: "/pricing", count: 110, visitors: 40 }],
        errors: [{ key: "/pricing", count: 3, visitors: 2 }],
        engagement: [{ path: "/pricing", averageMs: 30_000, samples: 4 }],
        vitals: [
          { path: "/", metric: "LCP", p75: 1200, atLeast: false, samples: 9 },
        ],
        scriptErrors: [{ path: "/pricing", count: 2 }],
        partialLists: ["pages", "errors", "scriptErrors"],
        partialSamples: ["engagement", "vitals"],
      },
    );
    const monitoring = text(
      renderToStaticMarkup(
        <MonitoringUsage
          usage={null}
          history={history("24h", hours(), {
            pages: parts.pages,
            errors: parts.errors,
            partialLists: parts.partialLists,
          })}
          name="Shop"
          now={NOW}
          onAsk={() => undefined}
        />,
      ),
    );
    expect(monitoring).toContain("≥ 110");
    expect(monitoring).toContain("≥ 3 failed");
    const lists = text(
      renderToStaticMarkup(
        <Breakdowns history={parts} script locked={() => null} />,
      ),
    );
    expect(lists).toContain("some days measured only part of their visits");
    expect(
      text(
        renderToStaticMarkup(
          <Errors history={parts} name="Shop" onAsk={() => undefined} />,
        ),
      ),
    ).toContain("/pricing (≥ 2)");
    const strip = text(renderToStaticMarkup(<Strip history={parts} />));
    expect(strip).toContain("≥ ~9");
    expect(strip).toContain("some days counted only in part");
    expect(strip).toContain("on average, from part of some days");
  });
});

describe("the live stream", () => {
  it("counts a script's view as a view, never as a request", () => {
    const line = (input: Partial<SeenLine>): SeenLine => ({
      id: 0,
      at: NOW - 1000,
      kind: "request",
      script: false,
      path: "/pricing",
      status: 200,
      ms: 40,
      country: null,
      source: null,
      device: null,
      visitor: "a",
      ...input,
    });
    const seen = summarise(
      [line({}), line({ id: 1, kind: "view", script: true })],
      NOW,
    );
    expect(seen.requests).toBe(1);
    expect(seen.perMinute).toBe(1);
    expect(seen.lanes).toEqual([{ name: "/pricing", requests: 1, failed: 0 }]);
    expect(seen.viewers).toBe(1);
  });
});
