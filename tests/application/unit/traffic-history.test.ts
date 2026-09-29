// The arithmetic of a range: what adds up, what never does, and a gap that
// stays a gap. And what a release changed, by fixed rules.

import { describe, expect, it } from "vitest";

import {
  LATENCY_BUCKETS_MS,
  type Collection,
  type HourTotals,
  type TrafficDay,
} from "@/server/traffic/contract";
import { dayBounds } from "@/server/traffic/days";
import { historyOf, releaseImpact } from "@/server/traffic/merge";

const ZONE = "Europe/Sofia";
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
/** A local hour of a day, as a moment. */
const local = (day: string, hour: number, minute = 0) =>
  dayBounds(day, ZONE).start + hour * HOUR + minute * 60_000;

const collection: Collection = {
  enabledAt: "2026-09-01T00:00:00.000Z",
  disabledAt: null,
  state: "live",
  detail: null,
  lastLineAt: null,
  oldestRetainedAt: null,
  scriptSince: null,
  scriptSilentSince: null,
  source: null,
  storedFrom: null,
  logMisses: [],
};

function hour(overrides: Partial<HourTotals> = {}): HourTotals {
  return {
    requests: 0,
    views: 0,
    visitors: 0,
    errors: 0,
    errorVisitors: 0,
    bots: 0,
    latency: new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0),
    errorPaths: [],
    ...overrides,
  };
}

/** Requests that all took about `ms`, as a latency histogram. */
function took(ms: number, requests: number) {
  const latency = new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);
  const index = LATENCY_BUCKETS_MS.findIndex((bound) => ms <= bound);
  latency[index < 0 ? LATENCY_BUCKETS_MS.length : index] = requests;
  return latency;
}

/** A stored day, covered in full unless it says otherwise. */
function stored(
  day: string,
  overrides: Partial<TrafficDay> & {
    hourly?: Record<number, Partial<HourTotals>>;
  } = {},
): TrafficDay {
  const { start, end } = dayBounds(day, ZONE);
  const { hourly = {}, ...rest } = overrides;
  return {
    day,
    timeZone: ZONE,
    computedAt: iso(end),
    final: true,
    coverage: { from: iso(start), to: iso(end), gaps: [] },
    viewSource: "log",
    hours: Array.from({ length: Math.ceil((end - start) / HOUR) }, (_, index) =>
      hour(hourly[index]),
    ),
    visitors: 0,
    errorVisitors: 0,
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
    browserOnlyPages: 0,
    engagement: [],
    vitals: [],
    scriptErrors: [],
    ...rest,
  };
}

describe("a range", () => {
  it("never adds days of visitors into people, and draws a missing day as a gap", () => {
    const now = local("2026-09-29", 12);
    const history = historyOf(
      [
        stored("2026-09-25", {
          visitors: 10,
          hourly: { 9: { requests: 20, views: 12, visitors: 10 } },
          pages: [{ key: "/", count: 12, visitors: 10 }],
        }),
        stored("2026-09-27", {
          visitors: 30,
          hourly: { 9: { requests: 50, views: 40, visitors: 30 } },
          pages: [{ key: "/", count: 40, visitors: 30 }],
        }),
      ],
      "7d",
      now,
      collection,
      ZONE,
    );
    expect(history.series.map((point) => point.visitors)).toEqual([
      0, 0, 10, 0, 30, 0, 0,
    ]);
    expect(history.series.map((point) => point.covered)).toEqual([
      0, 0, 1, 0, 1, 0, 0,
    ]);
    // About 20 a day — not 40 people.
    expect(history.totals).toMatchObject({
      requests: 70,
      views: 52,
      visitors: 20,
      visitorsPer: "day",
    });
    expect(history.pages).toEqual([{ key: "/", count: 52, visitors: 20 }]);
    // The day between the two is missing, and says so; the week before was
    // never counted, so there is nothing to compare against.
    expect(history.coverage).toEqual({
      from: iso(dayBounds("2026-09-25", ZONE).start),
      to: iso(dayBounds("2026-09-27", ZONE).end),
      gaps: [
        {
          from: iso(dayBounds("2026-09-26", ZONE).start),
          to: iso(dayBounds("2026-09-26", ZONE).end),
          why: "not-collecting",
        },
      ],
    });
    expect(history.previous).toBeNull();
  });

  it("never scales a day read in part up to a whole day of visitors", () => {
    // Proof B: collection began mid-day, and the log covered 28 minutes of
    // it, in which 10 browsers came. That is at least 10 that day, never
    // "~520 a day" — a distinct count does not grow with time.
    const { start } = dayBounds("2026-09-28", ZONE);
    const from = start + 15 * HOUR;
    const partly = stored("2026-09-28", {
      visitors: 10,
      coverage: {
        from: iso(from),
        to: iso(from + 28 * 60_000),
        gaps: [],
      },
      hourly: { 15: { requests: 40, views: 14, visitors: 10 } },
      pages: [{ key: "/", count: 14, visitors: 10 }],
    });
    // Today, read from midnight to now: only the hours that have happened.
    const now = local("2026-09-29", 6);
    const today = stored("2026-09-29", {
      visitors: 4,
      coverage: {
        from: iso(dayBounds("2026-09-29", ZONE).start),
        to: iso(now),
        gaps: [],
      },
      hourly: { 2: { requests: 9, views: 6, visitors: 4 } },
      pages: [{ key: "/", count: 6, visitors: 4 }],
    });
    const history = historyOf([partly, today], "7d", now, collection, ZONE);
    expect(history.totals).toMatchObject({ visitors: 7, visitorsPer: "day" });
    expect(history.pages).toEqual([{ key: "/", count: 20, visitors: 7 }]);
    const month = historyOf([partly], "30d", now, collection, ZONE);
    expect(month.totals.visitors).toBe(10);
    expect(month.pages).toEqual([{ key: "/", count: 14, visitors: 10 }]);
  });

  it("takes a response time from the merged histogram, never an average of percentiles", () => {
    const history = historyOf(
      [
        stored("2026-09-29", {
          hourly: {
            10: { requests: 100, latency: took(8, 100) },
            11: { requests: 100, latency: took(2000, 100) },
          },
        }),
      ],
      "24h",
      local("2026-09-29", 12, 30),
      collection,
      ZONE,
    );
    // Each hour alone: about 10 ms and 2,425 ms, which average to 1,218.
    // Together, 190 of 200 requests are answered within 2,350 ms.
    expect(history.totals).toMatchObject({ p95Ms: 2350, p95AtLeast: false });
  });

  it("says a percentile past the last bound is only a floor", () => {
    const day = stored("2026-09-29", {
      hourly: { 10: { requests: 50, latency: took(60_000, 50) } },
      vitals: [
        {
          path: "/",
          metric: "LCP",
          buckets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 4],
        },
      ],
    });
    const history = historyOf(
      [day],
      "7d",
      local("2026-09-29", 12),
      collection,
      ZONE,
    );
    expect(history.totals).toMatchObject({ p95Ms: 10_000, p95AtLeast: true });
    expect(history.series.at(-1)).toMatchObject({ p95AtLeast: true });
    expect(history.vitals).toEqual([
      { path: "/", metric: "LCP", p75: 10_000, atLeast: true, samples: 4 },
    ]);
    const impact = releaseImpact(
      [day],
      iso(local("2026-09-29", 9)),
      120,
      local("2026-09-29", 23),
    );
    expect(impact.after).toMatchObject({ p95Ms: 10_000, p95AtLeast: true });
  });

  it("says which lists a day kept only in part, and merges the rest exactly", () => {
    // Each day kept its top entries and folded the rest into "(other)".
    const pages = (top: string, count: number, other: number) => [
      { key: top, count, visitors: count },
      { key: "(other)", count: other, visitors: other },
    ];
    const history = historyOf(
      [
        stored("2026-09-28", {
          pages: pages("/", 500, 10),
          sources: [{ key: "Direct", count: 5, visitors: 5 }],
        }),
        stored("2026-09-29", {
          pages: pages("/pricing", 100, 30),
          sources: [{ key: "Direct", count: 7, visitors: 7 }],
        }),
      ],
      "7d",
      local("2026-09-29", 12),
      collection,
      ZONE,
    );
    // /pricing had views on the 28th too, folded into that day's "(other)":
    // 100 is only a floor. Sources were kept whole and merge exactly.
    expect(history.pages.find((row) => row.key === "/pricing")?.count).toBe(
      100,
    );
    expect(history.partialLists).toEqual(["pages"]);
    expect(history.sources[0].count).toBe(12);
    expect(history.partialSamples).toEqual([]);
    expect(history.totals.visitorsAtLeast).toBe(false);

    // A day put together from two partial counts: its figures that are not
    // hourly are floors, or samples, however complete its lists look.
    const parts = historyOf(
      [
        stored("2026-09-28", {
          visitors: 4,
          sources: [{ key: "Direct", count: 5, visitors: 4 }],
          scriptErrors: [{ path: "/", count: 2 }],
          engagement: [{ path: "/", ms: 10_000, samples: 1 }],
          partial: ["visitors", "sources", "scriptErrors", "engagement"],
        }),
        stored("2026-09-29", { visitors: 6 }),
      ],
      "7d",
      local("2026-09-29", 12),
      collection,
      ZONE,
    );
    expect(parts.partialLists).toEqual(["sources", "scriptErrors"]);
    expect(parts.partialSamples).toEqual(["engagement"]);
    expect(parts.totals.visitorsAtLeast).toBe(true);
    expect(
      parts.series.map((point) => [point.visitors, point.visitorsAtLeast]),
    ).toEqual([...Array(5).fill([0, false]), [4, true], [6, false]]);
  });

  it("draws the last 24 hours across midnight, with today's visitors, and a gap as a gap", () => {
    const now = local("2026-09-29", 3, 30);
    const yesterday = stored("2026-09-28", {
      visitors: 50,
      hourly: Object.fromEntries(
        Array.from({ length: 24 }, (_, index) => [
          index,
          { requests: 10, views: 5, visitors: 4 },
        ]),
      ),
      // Hallvi was off from ten to noon.
      coverage: {
        from: iso(dayBounds("2026-09-28", ZONE).start),
        to: iso(dayBounds("2026-09-28", ZONE).end),
        gaps: [
          {
            from: iso(local("2026-09-28", 10)),
            to: iso(local("2026-09-28", 12)),
            why: "hallvi-off",
          },
        ],
      },
    });
    const today = stored("2026-09-29", {
      final: false,
      visitors: 7,
      hourly: {
        0: { requests: 3, views: 2, visitors: 2 },
        3: { requests: 1, views: 1, visitors: 1 },
      },
      pages: [{ key: "/today", count: 3, visitors: 2 }],
      coverage: {
        from: iso(dayBounds("2026-09-29", ZONE).start),
        to: iso(now),
        gaps: [],
      },
    });
    const history = historyOf([yesterday, today], "24h", now, collection, ZONE);
    expect(history.series).toHaveLength(24);
    expect(history.series[0].at).toBe(iso(local("2026-09-28", 4)));
    expect(history.series.at(-1)).toMatchObject({
      at: iso(local("2026-09-29", 3)),
      views: 1,
      // The hour so far was covered in full.
      covered: 1,
    });
    const gap = history.series.filter((point) => point.covered === 0);
    expect(gap.map((point) => point.at)).toEqual([
      iso(local("2026-09-28", 10)),
      iso(local("2026-09-28", 11)),
    ]);
    expect(history.totals).toMatchObject({
      requests: 20 * 10 + 4,
      visitors: 7,
      visitorsPer: "today",
    });
    expect(history.pages).toEqual([{ key: "/today", count: 3, visitors: 2 }]);
    expect(history.coverage.gaps).toContainEqual({
      from: iso(local("2026-09-28", 10)),
      to: iso(local("2026-09-28", 12)),
      why: "hallvi-off",
    });
    expect(history.previous).toBeNull();
  });

  it("is empty, not an error, when nothing is stored", () => {
    const history = historyOf(
      [],
      "30d",
      local("2026-09-29", 12),
      collection,
      ZONE,
    );
    expect(history.series).toHaveLength(30);
    expect(history.series.every((point) => point.covered === 0)).toBe(true);
    expect(history.totals).toMatchObject({ requests: 0, visitors: 0 });
    expect(history.coverage).toEqual({ from: null, to: null, gaps: [] });
  });
});

describe("what a release changed", () => {
  const busy = {
    requests: 100,
    views: 60,
    visitors: 20,
    latency: took(40, 100),
  };
  const day = stored("2026-09-29", {
    hourly: {
      12: busy,
      13: busy,
      14: {
        ...busy,
        errors: 10,
        errorVisitors: 6,
        errorPaths: [{ path: "/checkout", errors: 10, visitors: 6 }],
      },
      15: {
        ...busy,
        errors: 4,
        errorVisitors: 3,
        errorPaths: [{ path: "/checkout", errors: 4, visitors: 3 }],
      },
      16: busy,
      17: busy,
      18: busy,
      19: busy,
    },
  });
  const now = local("2026-09-29", 23);

  it("names a path that started failing, with the visitors it reached", () => {
    const at = iso(local("2026-09-29", 14));
    const impact = releaseImpact([day], at, 120, now);
    expect(impact).toMatchObject({
      releaseAt: at,
      windowMinutes: 120,
      compared: {
        before: {
          from: iso(local("2026-09-29", 12)),
          to: iso(local("2026-09-29", 14)),
        },
        after: {
          from: iso(local("2026-09-29", 14)),
          to: iso(local("2026-09-29", 16)),
        },
      },
      notable: true,
      covered: 1,
      paths: [
        {
          path: "/checkout",
          errorsBefore: 0,
          errorsAfter: 14,
          visitorsAffected: 9,
        },
      ],
    });
    expect(impact.before).toMatchObject({ requests: 200, errors: 0 });
    expect(impact.after).toMatchObject({ requests: 200, errors: 14 });
  });

  it("never counts a failure before the release as after it", () => {
    // Released at 14:20. The errors came at 14:01–14:03, before it, and
    // nothing failed after: the hour holding both is compared in neither.
    const early = stored("2026-09-29", {
      hourly: {
        12: busy,
        13: busy,
        14: {
          ...busy,
          errors: 3,
          errorVisitors: 3,
          errorPaths: [{ path: "/checkout", errors: 3, visitors: 3 }],
        },
        15: busy,
        16: busy,
      },
    });
    const impact = releaseImpact(
      [early],
      iso(local("2026-09-29", 14, 20)),
      120,
      now,
    );
    expect(impact).toMatchObject({
      compared: {
        before: {
          from: iso(local("2026-09-29", 12)),
          to: iso(local("2026-09-29", 14)),
        },
        after: {
          from: iso(local("2026-09-29", 15)),
          to: iso(local("2026-09-29", 17)),
        },
      },
      notable: false,
      paths: [],
    });
    expect(impact.after.errors).toBe(0);
  });

  it("stays quiet when nothing changed, and when there is nothing to compare with", () => {
    // Two quiet hours either side of 18:00.
    const quiet = releaseImpact(
      [day],
      iso(local("2026-09-29", 17, 50)),
      120,
      now,
    );
    expect(quiet).toMatchObject({ notable: false, paths: [] });
    // The same failure, but the log did not cover the hours before it.
    const unseen = {
      ...day,
      coverage: {
        ...day.coverage,
        gaps: [
          {
            from: iso(local("2026-09-29", 11)),
            to: iso(local("2026-09-29", 14)),
            why: "log-rotated" as const,
          },
        ],
      },
    };
    const blind = releaseImpact(
      [unseen],
      iso(local("2026-09-29", 14, 10)),
      120,
      now,
    );
    expect(blind.notable).toBe(false);
    expect(blind.covered).toBe(0.5);
  });
});
