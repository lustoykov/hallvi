// What the traffic pages decide to say: when Traffic is listed, what a usual
// day is, when the script is offered, when a small application reads as one
// line, when Little Server visits, and when a release is worth a line.
// Each is a claim an owner reads, so each is held here once.
import { describe, expect, it } from "vitest";

import {
  hiddenSections,
  standings,
  visibleSections,
} from "../../../src/components/hallvi/application-sections";
import { impactQuestion } from "../../../src/components/hallvi/traffic/release-impact";
import {
  comparedWords,
  impactLine,
  isQuiet,
  momentsOf,
  quietLine,
  scriptOffer,
  serverLogWords,
  trafficListed,
  usualDay,
} from "../../../src/components/hallvi/traffic/model";
import type {
  Collection,
  ReleaseImpact,
  SeriesPoint,
  TrafficHistory,
} from "../../../src/server/traffic/contract";

const DAY = 864e5;
const NOW = Date.parse("2026-09-29T15:00:00.000Z");

const collection = (input: Partial<Collection> & object = {}) =>
  ({
    enabledAt: "2026-09-01T10:00:00.000Z",
    disabledAt: null,
    state: "live",
    detail: null,
    lastLineAt: null,
    oldestRetainedAt: null,
    scriptSince: null,
    scriptSilentSince: null,
    source: null,
    storedFrom: "2026-08-20T00:00:00.000Z",
    logMisses: [],
    ...input,
  }) as Collection;

const day = (ago: number, visitors: number, covered = 1): SeriesPoint => ({
  at: new Date(NOW - ago * DAY).toISOString(),
  requests: visitors * 20,
  views: visitors * 3,
  visitors,
  errors: 0,
  errorVisitors: 0,
  visitorsAtLeast: false,
  bots: 0,
  p95Ms: 200,
  p95AtLeast: false,
  covered,
});

const history = (
  series: SeriesPoint[],
  input: Partial<TrafficHistory> = {},
): TrafficHistory =>
  ({
    range: "30d",
    timeZone: "UTC",
    collection: collection(),
    series,
    totals: {
      requests: 0,
      views: series.reduce((sum, point) => sum + point.views, 0),
      errors: 0,
      errorVisitors: 0,
      bots: 0,
      p95Ms: 200,
      visitors: 1,
      visitorsPer: "day",
    },
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
    scriptErrors: [],
    coverage: { from: null, to: null, gaps: [] },
    viewSource: "log",
    ...input,
  }) as TrafficHistory;

describe("Traffic in the sidebar", () => {
  it("waits under Show more until history is kept, and stays while totals remain", () => {
    const listed = (kept: boolean) =>
      visibleSections(null, standings([], false, kept)).map(
        (section) => section.id,
      );
    expect(listed(false)).not.toContain("traffic");
    expect(
      hiddenSections(null, standings([])).find(
        (section) => section.id === "traffic",
      )?.note,
    ).toBe("not set up");
    expect(listed(true)).toContain("traffic");

    expect(trafficListed(null)).toBe(false);
    expect(trafficListed(collection())).toBe(true);
    // Turned off with its totals kept: still a page worth listing.
    expect(trafficListed(collection({ enabledAt: null, state: "off" }))).toBe(
      true,
    );
    // Turned off and forgotten: nothing left to show.
    expect(
      trafficListed(
        collection({
          enabledAt: null,
          state: "off",
          storedFrom: null,
        } as never),
      ),
    ).toBe(false);
  });
});

describe("a usual day", () => {
  it("is the median of the last seven covered days, never today", () => {
    const series = [
      day(8, 900),
      ...[7, 6, 5, 4, 3, 2, 1].map((ago, index) => day(ago, 100 + index * 10)),
      day(0, 40, 0.4),
    ];
    expect(usualDay(series)).toMatchObject({
      today: 40,
      usual: 130,
      // A morning is below a whole day; it is not "quieter than usual".
      busier: false,
    });
  });

  it("calls today busier only once it has passed a whole usual day", () => {
    const series = [day(3, 100), day(2, 100), day(1, 100), day(0, 180, 0.6)];
    expect(usualDay(series)?.busier).toBe(true);
  });

  it("says nothing about usual with fewer than three covered days", () => {
    expect(
      usualDay([day(2, 50), day(1, 50, 0), day(0, 10, 0.5)])?.usual,
    ).toBeNull();
  });
});

describe("the script offer", () => {
  it("is made only on evidence that the log misses something", () => {
    expect(scriptOffer(collection())).toBeNull();
    expect(
      scriptOffer(collection({ logMisses: ["browser-pages"] } as never))
        ?.reason,
    ).toBe("browser-pages");
    expect(
      scriptOffer(collection({ logMisses: ["cached-pages"] } as never))?.reason,
    ).toBe("cached-pages");
    // The owner opening something only the script measures is evidence too.
    expect(scriptOffer(collection(), "goals")?.reason).toBe("goals");
  });

  it("is never made while the script runs, history is off, or there is no log", () => {
    const misses = { logMisses: ["browser-pages"] } as never;
    expect(
      scriptOffer(
        collection({ ...(misses as object), scriptSince: NOW.toString() }),
      ),
    ).toBeNull();
    expect(
      scriptOffer(
        collection({ ...(misses as object), enabledAt: null, state: "off" }),
      ),
    ).toBeNull();
    expect(
      scriptOffer(collection({ ...(misses as object), state: "no-log" })),
    ).toBeNull();
  });
});

describe("a quiet application", () => {
  it("reads as one line of views and visitors a day, never summed people", () => {
    const quiet = history([day(3, 2), day(2, 1), day(1, 3), day(0, 1, 0.5)], {
      range: "7d",
    });
    expect(isQuiet(quiet)).toBe(true);
    expect(quietLine(quiet)).toBe(
      "21 page views this week, about 1 visitor a day.",
    );
    expect(isQuiet(history([day(1, 40), day(0, 12, 0.5)]))).toBe(false);
  });

  it("is never claimed for a range the log did not cover", () => {
    expect(isQuiet(history([day(1, 0, 0), day(0, 0, 0)]))).toBe(false);
  });
});

describe("Little Server's moments", () => {
  it("visits for a first visitor only when all stored history is in range", () => {
    const first = history([day(3, 0), day(2, 0), day(1, 0), day(0, 1, 0.3)]);
    const recent = collection({
      storedFrom: new Date(NOW - 3 * DAY).toISOString(),
    } as never);
    expect(
      momentsOf({ month: first, day: null, collection: recent })[0]?.id,
    ).toBe("first-visitor");
    const older = collection({
      storedFrom: new Date(NOW - 90 * DAY).toISOString(),
    } as never);
    expect(momentsOf({ month: first, day: null, collection: older })).toEqual(
      [],
    );
  });
});

describe("the privacy line", () => {
  it("claims only what the setup's record says the server's log removes", () => {
    const words = (
      queries: "removed" | "path-only" | "kept" | null,
      format: "caddy-json" | "traefik-json" = "caddy-json",
    ) => serverLogWords({ proxy: "Caddy", format, queries });
    expect(words("removed")).toMatch(
      /removed — from the address asked for and from the referrer/,
    );
    // Caddy 2.5 keeps referrers' queries: never "removed" for them.
    expect(words("path-only")).toMatch(/referrers keep theirs/);
    expect(words("path-only")).not.toMatch(/and from the referrer/);
    expect(words("kept", "traefik-json")).toMatch(
      /Traefik's log cannot be rewritten/,
    );
    // A record that does not say: nothing is claimed either way.
    for (const unknown of [words(null), serverLogWords(null)])
      expect(unknown).not.toMatch(/removed/);
  });
});

describe("a release's line in Deployment", () => {
  const impact = (input: Partial<ReleaseImpact>): ReleaseImpact => ({
    releaseAt: new Date(NOW - 5 * 3_600_000).toISOString(),
    windowMinutes: 120,
    compared: {
      before: {
        from: new Date(NOW - 7 * 3_600_000).toISOString(),
        to: new Date(NOW - 5 * 3_600_000).toISOString(),
      },
      after: {
        from: new Date(NOW - 4 * 3_600_000).toISOString(),
        to: new Date(NOW - 2 * 3_600_000).toISOString(),
      },
    },
    before: {
      requests: 100,
      views: 40,
      errors: 0,
      errorVisitors: 0,
      bots: 0,
      p95Ms: 200,
      p95AtLeast: false,
      visitors: 20,
    },
    after: {
      requests: 100,
      views: 40,
      errors: 0,
      errorVisitors: 0,
      bots: 0,
      p95Ms: 200,
      p95AtLeast: false,
      visitors: 20,
    },
    paths: [],
    notable: false,
    covered: 1,
    ...input,
  });

  it("says nothing after a quiet release", () => {
    expect(impactLine(impact({}), NOW)).toBeNull();
  });

  it("names the page, the change and the visitors it reached", () => {
    expect(
      impactLine(
        impact({
          notable: true,
          paths: [
            {
              path: "/checkout",
              errorsBefore: 0,
              errorsAfter: 14,
              visitorsAffected: 9,
            },
          ],
        }),
        NOW,
      ),
    ).toEqual({
      tone: "bad",
      says: "After this release: errors on /checkout 0 → 14, about 9 visitors",
    });
  });

  it("goes by the hours it compared, not the release's own time", () => {
    // A release at 12:20: 11:00–13:00 was compared with 13:00 onwards, and
    // at 15:00 the hours after it are not over yet.
    const late = (hour: number) =>
      new Date(
        Date.parse("2026-09-29T00:00:00.000Z") + hour * 3_600_000,
      ).toISOString();
    const straddling = impact({
      releaseAt: late(12.3333),
      compared: {
        before: { from: late(10), to: late(12) },
        after: { from: late(13), to: late(15.5) },
      },
      notable: true,
      before: { ...impact({}).before, errors: 1 },
      after: { ...impact({}).after, errors: 9, errorVisitors: 3 },
    });
    expect(impactLine(straddling, NOW)?.says).toMatch(/^Since this release/);
    const words = comparedWords(straddling);
    expect(words).toMatch(/^\d\d:\d\d–\d\d:\d\d against \d\d:\d\d–\d\d:\d\d$/);
    expect(impactQuestion(straddling, NOW)).toContain(`(${words})`);
  });
});
