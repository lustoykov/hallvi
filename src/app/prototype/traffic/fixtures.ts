// Invented traffic, for looking at the Traffic pages before the collector
// exists. DEVELOPMENT PREVIEW ONLY: nothing here reaches a real application,
// and every number is synthetic and seeded, so each look draws the same page.
//
// Each scenario is one state the pages must draw well: a busy site read
// from its log, a single-page application with Hallvi's script, a tiny
// quiet one, history turned off, never kept, no access log, a gap, a script
// gone silent, errors after a release, and a first visitor.

import type { SavedInformation } from "@/server/operator-data";
import type {
  Arrival,
  Collection,
  Coverage,
  Gap,
  Ranked,
  ReleaseImpact,
  SeriesPoint,
  TrafficHistory,
  TrafficRange,
} from "@/server/traffic/contract";
import type {
  CollectionAction,
  StreamEvent,
  TrafficSource,
} from "@/components/hallvi/traffic/source";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A seeded generator, so a scenario looks the same on every load. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The same small wobble for the same moment, whatever asks for it. */
const wobble = (key: number, spread: number) =>
  1 + (seeded(key)() - 0.5) * 2 * spread;

// Quiet overnight, busiest through the afternoon: the share of a day's
// visitors arriving in each local hour.
const CURVE = (() => {
  const raw = Array.from({ length: 24 }, (_, hour) => {
    const day = Math.max(0, Math.sin((Math.PI * (hour - 5.5)) / 18));
    return 0.08 + day ** 1.3;
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((value) => value / total);
})();
const WEEKDAY = [0.72, 1.04, 1.08, 1.06, 1.02, 0.96, 0.7];

type Weights = [key: string, weight: number][];

interface Profile {
  /** Estimated visitors on an ordinary weekday. */
  daily: number;
  /** Growth per day, as a fraction. */
  growth: number;
  viewsPerVisitor: number;
  requestsPerView: number;
  botShare: number;
  p95: number;
  /** Extra visitors today, as a multiple: a launch. */
  today?: number;
  pages: Weights;
  sources: Weights;
  campaigns?: Weights;
  countries: Weights;
  devices: Weights;
  browsers: Weights;
  systems: Weights;
  /** A country seen only today, with how many views. */
  newCountry?: [string, number];
}

interface Release {
  at: number;
  revision: string;
  change: string;
  impact?: Omit<
    ReleaseImpact,
    "releaseAt" | "windowMinutes" | "compared" | "covered"
  >;
}

interface Errors {
  from: number;
  to: number;
  /** Errors an hour while it lasts, and the paths that throw them. */
  perHour: number;
  paths: [string, number][];
}

export interface Scenario {
  id: string;
  label: string;
  name: string;
  profile: Profile;
  collection: Collection & {
    storedFrom: string | null;
    logMisses: ("browser-pages" | "cached-pages")[];
  };
  /** What the live stream says about itself. */
  stream: "live" | "no-log";
  /** Seconds between page views arriving live. */
  every: number;
  /** Times Hallvi counted nothing, besides before `storedFrom`. */
  gaps: Gap[];
  releases: Release[];
  errors?: Errors;
  /** Hallvi's script: page changes, time on page, goals, speed. */
  script?: {
    engagement: [string, number][];
    goals: Weights;
    vitals: [string, number, number, number][];
    scriptErrors: [string, number][];
  };
  /** The live stream starts with a first visit a moment after opening. */
  firstVisit?: string;
  /** Records for the pages around Traffic: releases, the way in, load. */
  load: boolean;
}

const iso = (at: number) => new Date(at).toISOString();

const PAGES: Weights = [
  ["/", 30],
  ["/pricing", 14],
  ["/docs", 11],
  ["/blog/launch-week", 9],
  ["/docs/getting-started", 7],
  ["/changelog", 5],
  ["/about", 4],
  ["/login", 4],
  ["/blog/why-self-host", 3],
  ["/careers", 1.5],
];
const SOURCES: Weights = [
  ["Direct", 34],
  ["Google", 26],
  ["Hacker News", 11],
  ["GitHub", 7],
  ["X", 5],
  ["Reddit", 4],
  ["LinkedIn", 3],
  ["ChatGPT", 3],
  ["DuckDuckGo", 2],
  ["newsletter.example.com", 1.5],
];
const COUNTRIES: Weights = [
  ["US", 30],
  ["DE", 13],
  ["GB", 9],
  ["IN", 7],
  ["FR", 5],
  ["CA", 4.5],
  ["NL", 4],
  ["BR", 3.5],
  ["JP", 3],
  ["SE", 2.5],
  ["PL", 2.2],
  ["AU", 2],
  ["ES", 1.8],
  ["BG", 1.2],
  ["SG", 1.1],
  ["KR", 1],
  ["ZA", 0.8],
  ["MX", 0.8],
  ["NG", 0.6],
  ["AR", 0.5],
];
const DEVICES: Weights = [
  ["desktop", 64],
  ["mobile", 33],
  ["tablet", 3],
];
const BROWSERS: Weights = [
  ["Chrome", 58],
  ["Safari", 22],
  ["Firefox", 9],
  ["Edge", 7],
  ["Samsung Internet", 2],
  ["(unknown)", 2],
];
const SYSTEMS: Weights = [
  ["macOS", 31],
  ["Windows", 29],
  ["iOS", 18],
  ["Android", 14],
  ["Linux", 8],
];

const busyProfile: Profile = {
  daily: 820,
  growth: 0.012,
  viewsPerVisitor: 2.7,
  requestsPerView: 11,
  botShare: 0.14,
  p95: 210,
  pages: PAGES,
  sources: SOURCES,
  campaigns: [
    ["launch-week", 5],
    ["newsletter-sep", 3],
    ["podcast", 1],
  ],
  countries: COUNTRIES,
  devices: DEVICES,
  browsers: BROWSERS,
  systems: SYSTEMS,
  newCountry: ["IS", 3],
};

export function scenarios(now: number): Scenario[] {
  const today = new Date(now);
  const midnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const collection = (
    input: Partial<Scenario["collection"]>,
  ): Scenario["collection"] => ({
    enabledAt: iso(now - 40 * DAY),
    disabledAt: null,
    state: "live",
    detail: null,
    lastLineAt: iso(now - 2_000),
    oldestRetainedAt: iso(now - 14 * DAY),
    scriptSince: null,
    scriptSilentSince: null,
    source: { proxy: "Caddy", format: "caddy-json", queries: "removed" },
    storedFrom: iso(midnight - 54 * DAY),
    logMisses: [],
    ...input,
  });
  const releases = (quiet = true): Release[] => [
    {
      at: now - 27 * DAY - 3 * HOUR,
      revision: "a41c9e2f0b7d",
      change: "Moved the docs under /docs",
    },
    {
      at: now - 16 * DAY - 5 * HOUR,
      revision: "5be08d13c9aa",
      change: "Pricing page, second draft",
    },
    {
      at: now - 5 * DAY - 2 * HOUR,
      revision: "e9a71c4d2b10",
      change: "Fixed the export timeout",
      impact: quiet
        ? undefined
        : {
            before: totals(0, 12, 380),
            after: totals(0, 0, 240),
            paths: [],
            notable: true,
          },
    },
    {
      at: now - 26 * HOUR,
      revision: "c74379a8e5f2",
      change: "Launch-week banner",
    },
  ];
  const spa = {
    daily: 540,
    growth: 0.02,
    viewsPerVisitor: 3.6,
    requestsPerView: 8,
    botShare: 0.1,
    p95: 160,
    today: 4.2,
    pages: [
      ["/", 28],
      ["/app", 18],
      ["/app/boards", 14],
      ["/app/settings", 6],
      ["/pricing", 9],
      ["/signup", 7],
      ["/blog/we-launched", 11],
      ["/login", 5],
    ] as Weights,
    sources: [
      ["Hacker News", 30],
      ["Direct", 24],
      ["Google", 16],
      ["X", 9],
      ["Reddit", 6],
      ["GitHub", 5],
      ["Product Hunt", 4],
    ] as Weights,
    campaigns: [["hn-launch", 4]] as Weights,
    countries: COUNTRIES,
    devices: [
      ["desktop", 71],
      ["mobile", 27],
      ["tablet", 2],
    ] as Weights,
    browsers: BROWSERS,
    systems: SYSTEMS,
  };
  const script = {
    engagement: [
      ["/app/boards", 184_000],
      ["/app", 96_000],
      ["/blog/we-launched", 142_000],
      ["/", 38_000],
      ["/pricing", 51_000],
      ["/signup", 44_000],
      ["/app/settings", 29_000],
    ] as [string, number][],
    goals: [
      ["signup", 42],
      ["board-created", 31],
      ["upgrade", 4],
    ] as Weights,
    vitals: [
      ["/", 1420, 88, 20],
      ["/app", 2100, 160, 40],
      ["/app/boards", 2860, 240, 110],
      ["/pricing", 1180, 72, 10],
      ["/blog/we-launched", 1640, 64, 180],
    ] as [string, number, number, number][],
    scriptErrors: [
      ["/app/boards", 6],
      ["/app", 2],
    ] as [string, number][],
  };

  return [
    {
      id: "busy",
      label: "Busy site, from the log",
      name: "Northwind",
      profile: busyProfile,
      collection: collection({}),
      stream: "live",
      every: 2.2,
      gaps: [],
      releases: releases(false),
      load: true,
    },
    {
      id: "script",
      label: "Single-page app with the script",
      name: "Boardly",
      profile: spa,
      collection: collection({
        enabledAt: iso(now - 25 * DAY),
        storedFrom: iso(midnight - 36 * DAY),
        scriptSince: iso(now - 9 * DAY - 4 * HOUR),
      }),
      stream: "live",
      every: 1.1,
      gaps: [],
      releases: [
        {
          at: now - 12 * DAY,
          revision: "0f4b2d61aa90",
          change: "Boards can be shared",
        },
        {
          at: now - 9 * DAY - 5 * HOUR,
          revision: "7d21c0be4f13",
          change: "Loads Hallvi's script from the layout",
        },
        {
          at: now - 26 * HOUR,
          revision: "b3e9f07c21d4",
          change: "New board renderer",
          impact: {
            before: totals(0, 0, 240),
            after: totals(0, 0, 620),
            paths: [],
            notable: true,
          },
        },
      ],
      script,
      load: true,
    },
    {
      id: "tiny",
      label: "Tiny and quiet",
      name: "Recipes",
      profile: {
        ...busyProfile,
        daily: 1.6,
        growth: 0,
        viewsPerVisitor: 2.2,
        requestsPerView: 9,
        botShare: 0.6,
        p95: 90,
        newCountry: undefined,
        pages: [
          ["/", 10],
          ["/recipes/soup", 4],
          ["/about", 1],
        ],
        sources: [
          ["Direct", 8],
          ["Google", 2],
        ],
        campaigns: [],
        countries: [
          ["DE", 6],
          ["FR", 2],
          ["JP", 1],
        ],
      },
      collection: collection({
        enabledAt: iso(now - 12 * DAY),
        storedFrom: iso(midnight - 16 * DAY),
      }),
      stream: "live",
      every: 45,
      gaps: [],
      releases: [
        {
          at: now - 11 * DAY,
          revision: "33aa0b9c1d2e",
          change: "First release",
        },
      ],
      load: false,
    },
    {
      id: "off",
      label: "History turned off",
      name: "Northwind",
      profile: busyProfile,
      collection: collection({
        enabledAt: null,
        disabledAt: iso(midnight - 6 * DAY + 10 * HOUR),
        state: "off",
        lastLineAt: iso(midnight - 6 * DAY + 10 * HOUR),
      }),
      stream: "live",
      every: 2.2,
      gaps: [],
      releases: releases(),
      load: true,
    },
    {
      id: "never",
      label: "Never kept",
      name: "Northwind",
      profile: busyProfile,
      collection: collection({
        enabledAt: null,
        state: "off",
        lastLineAt: null,
        oldestRetainedAt: null,
        storedFrom: null,
      }),
      stream: "live",
      every: 2.2,
      gaps: [],
      releases: releases(),
      load: true,
    },
    {
      id: "no-log",
      label: "No access log",
      name: "Ledger",
      profile: busyProfile,
      collection: collection({
        enabledAt: iso(now - 2 * HOUR),
        state: "no-log",
        lastLineAt: null,
        oldestRetainedAt: null,
        source: null,
        storedFrom: null,
      }),
      stream: "no-log",
      every: 0,
      gaps: [],
      releases: releases(),
      load: false,
    },
    {
      id: "gap",
      label: "A gap",
      name: "Northwind",
      profile: busyProfile,
      collection: collection({}),
      stream: "live",
      every: 2.2,
      gaps: [
        {
          from: iso(midnight - 3 * DAY + 2 * HOUR),
          to: iso(midnight - 2 * DAY + 3 * HOUR),
          why: "hallvi-off",
        },
        {
          from: iso(midnight - 9 * DAY),
          to: iso(midnight - 8 * DAY),
          why: "log-rotated",
        },
        {
          from: iso(now - 7 * HOUR - (now % HOUR)),
          to: iso(now - 5 * HOUR - (now % HOUR)),
          why: "unreadable",
        },
      ],
      releases: releases(),
      load: true,
    },
    {
      id: "silent",
      label: "Script silent",
      name: "Boardly",
      profile: { ...spa, today: 1 },
      collection: collection({
        enabledAt: iso(now - 25 * DAY),
        storedFrom: iso(midnight - 36 * DAY),
        scriptSince: iso(now - 20 * DAY),
        scriptSilentSince: iso(now - 5 * HOUR - 12 * MINUTE),
      }),
      stream: "live",
      every: 1.6,
      gaps: [],
      releases: [
        {
          at: now - 5 * HOUR - 20 * MINUTE,
          revision: "9ac1e5d7b203",
          change: "New layout",
        },
      ],
      script,
      load: true,
    },
    {
      id: "errors",
      label: "Errors after a release",
      name: "Shopfront",
      profile: {
        ...busyProfile,
        daily: 360,
        newCountry: undefined,
        pages: [
          ["/", 26],
          ["/products", 18],
          ["/products/linen-shirt", 9],
          ["/cart", 8],
          ["/checkout", 6],
          ["/account", 4],
        ],
      },
      collection: collection({}),
      stream: "live",
      every: 3,
      gaps: [],
      releases: [
        ...releases(),
        {
          at: now - 2 * HOUR - 40 * MINUTE,
          revision: "f0e1d2c3b4a5",
          change: "Payment provider upgrade",
          impact: {
            before: totals(0, 0, 230),
            after: totals(14, 9, 410),
            paths: [
              {
                path: "/checkout",
                errorsBefore: 0,
                errorsAfter: 14,
                visitorsAffected: 9,
              },
              {
                path: "/api/cart",
                errorsBefore: 0,
                errorsAfter: 3,
                visitorsAffected: 2,
              },
            ],
            notable: true,
          },
        },
      ],
      errors: {
        from: now - 2 * HOUR - 40 * MINUTE,
        to: now,
        perHour: 6,
        paths: [
          ["/checkout", 14],
          ["/api/cart", 3],
        ],
      },
      load: true,
    },
    {
      id: "first",
      label: "First visitor",
      name: "Pebble",
      profile: {
        ...busyProfile,
        daily: 0,
        growth: 0,
        botShare: 1,
        newCountry: undefined,
        pages: [["/", 1]],
        sources: [["Direct", 1]],
        campaigns: [],
        countries: [["NO", 1]],
      },
      collection: collection({
        enabledAt: iso(now - 3 * HOUR),
        storedFrom: iso(midnight - 3 * DAY),
        oldestRetainedAt: iso(midnight - 3 * DAY),
      }),
      stream: "live",
      every: 0,
      gaps: [],
      releases: [
        {
          at: now - 2 * DAY,
          revision: "1a2b3c4d5e6f",
          change: "First release",
        },
      ],
      firstVisit: "NO",
      load: false,
    },
  ];
}

function totals(
  errors: number,
  errorVisitors: number,
  p95Ms: number,
): ReleaseImpact["before"] {
  return {
    requests: 4_200,
    views: 380,
    errors,
    errorVisitors,
    bots: 520,
    p95Ms,
    p95AtLeast: false,
    visitors: 140,
  };
}

// ---------------------------------------------------------------------------
// Totals

interface Hour {
  at: number;
  /** The share of the whole hour the log covered, for scaling its counts. */
  covered: number;
  /** How much of the hour has passed, in ms. */
  elapsed: number;
  visitors: number;
  views: number;
  requests: number;
  errors: number;
  errorVisitors: number;
  bots: number;
  p95: number;
}

/** What one hour held, counted from the scenario's shape. */
function hourOf(scenario: Scenario, at: number, now: number): Hour {
  const { profile } = scenario;
  const start = Date.parse(scenario.collection.storedFrom ?? iso(now));
  const stoppedAt = scenario.collection.enabledAt
    ? Infinity
    : Date.parse(scenario.collection.disabledAt ?? iso(now));
  const end = Math.min(at + HOUR, now);
  let covered = 0;
  if (scenario.collection.storedFrom && end > at) {
    const from = Math.max(at, start);
    const to = Math.min(end, stoppedAt);
    covered = Math.max(0, to - from);
    for (const gap of scenario.gaps) {
      const a = Math.max(from, Date.parse(gap.from));
      const b = Math.min(to, Date.parse(gap.to));
      if (b > a) covered -= b - a;
    }
    covered = Math.max(0, covered) / HOUR;
  }
  const date = new Date(at);
  const days = (now - at) / DAY;
  const isToday = new Date(now).toDateString() === date.toDateString();
  const expected =
    profile.daily *
    WEEKDAY[date.getDay()] *
    (1 + profile.growth) ** -days *
    (isToday ? (profile.today ?? 1) : 1) *
    CURVE[date.getHours()] *
    wobble(Math.floor(at / HOUR) * 7 + scenario.id.length, 0.18);
  // Rounded by chance rather than to the nearest, so a small application
  // gets its occasional visitor instead of a flat zero.
  const chance = seeded(Math.floor(at / HOUR) * 13 + scenario.id.length)();
  const visitors = Math.floor(expected * 1.18 * covered + chance);
  const views = visitors
    ? Math.max(visitors, Math.round(visitors * profile.viewsPerVisitor))
    : 0;
  const bots = Math.round(
    (views * profile.requestsPerView + 30) * profile.botShare * covered,
  );
  const incident = Boolean(
    scenario.errors &&
    at + HOUR > scenario.errors.from &&
    at < scenario.errors.to,
  );
  // Now and then a scanner trips a 5xx that no visitor sees.
  const failing = incident
    ? scenario.errors!.perHour
    : wobble(at + 3, 1) > 1.96
      ? 1
      : 0;
  const errors = Math.round(failing * covered);
  return {
    at,
    covered,
    elapsed: Math.max(0, end - at),
    visitors,
    views,
    requests: Math.round(views * profile.requestsPerView + bots),
    errors,
    errorVisitors: incident ? Math.min(visitors, Math.round(errors * 0.65)) : 0,
    bots,
    p95: Math.round(
      profile.p95 * wobble(at + 11, 0.22) * (failing > 1 ? 1.8 : 1),
    ),
  };
}

const sum = (hours: Hour[], key: keyof Hour) =>
  hours.reduce((total, hour) => total + (hour[key] as number), 0);

function pointOf(hours: Hour[], at: number): SeriesPoint {
  const counted = hours.filter((hour) => hour.covered > 0);
  const timed = counted.filter((hour) => hour.requests > 0);
  return {
    at: iso(at),
    requests: sum(hours, "requests"),
    views: sum(hours, "views"),
    // A day's distinct browsers are fewer than its hours' added up.
    visitors: Math.round(
      sum(hours, "visitors") / (hours.length > 1 ? 1.18 : 1),
    ),
    errors: sum(hours, "errors"),
    errorVisitors: sum(hours, "errorVisitors"),
    visitorsAtLeast: false,
    bots: sum(hours, "bots"),
    p95Ms: timed.length
      ? Math.round(Math.max(...timed.map((hour) => hour.p95)) * 0.92)
      : null,
    p95AtLeast: false,
    // Like the stored totals: a share of the time that has passed, so the
    // bucket still running is short only of what the log missed.
    covered:
      Math.round(
        Math.min(
          1,
          (sum(hours, "covered") * HOUR) / sum(hours, "elapsed") || 0,
        ) * 1000,
      ) / 1000,
  };
}

/** Spreads a total over weighted keys, largest first. */
function spread(weights: Weights, total: number, perVisitor: number): Ranked[] {
  const all = weights.reduce((a, [, weight]) => a + weight, 0);
  return weights
    .map(([key, weight]) => {
      const count = Math.round((total * weight) / all);
      return { key, count, visitors: Math.round(count / perVisitor) };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

function bucketsOf(range: TrafficRange, now: number) {
  if (range === "24h") {
    const current = now - (now % HOUR);
    return Array.from({ length: 24 }, (_, index) => {
      const at = current - (23 - index) * HOUR;
      return { at, hours: [at] };
    });
  }
  const days = range === "7d" ? 7 : 30;
  const today = new Date(now);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (days - 1 - index),
    );
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const hours: number[] = [];
    for (let at = day.getTime(); at < next.getTime(); at += HOUR)
      hours.push(at);
    return { at: day.getTime(), hours };
  });
}

/** The range ending at `end`; `now` is the real clock, for what is today. */
function rangeOf(
  scenario: Scenario,
  range: TrafficRange,
  end: number,
  now: number,
) {
  const buckets = bucketsOf(range, end);
  const series = buckets.map((bucket) =>
    pointOf(
      bucket.hours.map((at) => hourOf(scenario, at, now)),
      bucket.at,
    ),
  );
  const counted = series.filter((point) => point.covered > 0);
  const days = counted.reduce((total, point) => total + point.covered, 0);
  const today = series.at(-1)!;
  const midnight = new Date(end);
  midnight.setHours(0, 0, 0, 0);
  const todayHours =
    range === "24h"
      ? buckets
          .filter((bucket) => bucket.at >= midnight.getTime())
          .map((bucket) => hourOf(scenario, bucket.at, now))
      : [];
  const timed = counted.filter((point) => point.p95Ms !== null);
  return {
    series,
    totals: {
      requests: counted.reduce((a, point) => a + point.requests, 0),
      views: counted.reduce((a, point) => a + point.views, 0),
      errors: counted.reduce((a, point) => a + point.errors, 0),
      errorVisitors:
        range === "24h"
          ? sum(todayHours, "errorVisitors")
          : counted.reduce((a, point) => a + point.errorVisitors, 0),
      bots: counted.reduce((a, point) => a + point.bots, 0),
      p95Ms: timed.length
        ? Math.round(
            [...timed].sort((a, b) => a.p95Ms! - b.p95Ms!)[
              Math.floor(timed.length * 0.8)
            ].p95Ms!,
          )
        : null,
      p95AtLeast: false,
      visitors:
        range === "24h"
          ? Math.round(sum(todayHours, "visitors") / 1.18)
          : days
            ? Math.round(
                counted.reduce((a, point) => a + point.visitors, 0) / days,
              )
            : 0,
      visitorsPer: range === "24h" ? ("today" as const) : ("day" as const),
      visitorsAtLeast: false,
    },
    today,
  };
}

const SPAN: Record<TrafficRange, number> = {
  "24h": DAY,
  "7d": 7 * DAY,
  "30d": 30 * DAY,
};

export function historyOf(
  scenario: Scenario,
  range: TrafficRange,
  now: number,
): TrafficHistory {
  const { profile, collection } = scenario;
  const current = rangeOf(scenario, range, now, now);
  const before = rangeOf(scenario, range, now - SPAN[range], now);
  // A first visitor, a moment ago: one browser, two pages.
  if (scenario.firstVisit) {
    const last = current.series.at(-1)!;
    last.visitors = 1;
    last.views = 2;
    current.totals.visitors = range === "24h" ? 1 : current.totals.visitors;
    current.totals.views = 2;
  }
  const views = current.totals.views;
  const lists = (weights: Weights | undefined) =>
    views ? spread(weights ?? [], views, profile.viewsPerVisitor) : [];
  const countries = lists(profile.countries);
  if (profile.newCountry && views)
    countries.push({
      key: profile.newCountry[0],
      count: profile.newCountry[1],
      visitors: 1,
    });
  const errors = scenario.errors
    ? scenario.errors.paths.map(([key, count]) => ({
        key,
        count,
        visitors: Math.round(count * 0.64),
      }))
    : current.totals.errors
      ? [{ key: "/api/export", count: current.totals.errors, visitors: 1 }]
      : [];
  const script = scenario.script && collection.scriptSince && views;
  const gaps = scenario.gaps.filter(
    (gap) =>
      Date.parse(gap.to) > Date.parse(current.series[0].at) &&
      Date.parse(gap.from) < now,
  );
  const coverage: Coverage = {
    from: collection.storedFrom,
    to: collection.enabledAt ? iso(now) : collection.disabledAt,
    gaps,
  };
  const switched =
    collection.scriptSince &&
    Date.parse(collection.scriptSince) > Date.parse(current.series[0].at);
  return {
    range,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    collection,
    series: current.series,
    totals: current.totals,
    previous: before.series.some((point) => point.covered > 0)
      ? before.totals
      : null,
    pages: lists(profile.pages),
    sources: lists(profile.sources),
    campaigns: lists(profile.campaigns),
    countries,
    devices: lists(profile.devices),
    browsers: lists(profile.browsers),
    systems: lists(profile.systems),
    errors,
    goals: script ? lists(scenario.script!.goals).slice(0, 5) : [],
    partialLists: [],
    partialSamples: [],
    bots: current.totals.bots
      ? spread(
          [
            ["Googlebot", 30],
            ["bingbot", 14],
            ["Probes for /wp-login.php and /.env", 22],
            ["Uptime checkers", 9],
            ["(other)", 25],
          ],
          current.totals.bots,
          40,
        )
      : [],
    engagement: script
      ? scenario.script!.engagement.map(([path, averageMs]) => ({
          path,
          averageMs,
          samples: Math.round(views / 12),
        }))
      : [],
    vitals: script
      ? scenario.script!.vitals.flatMap(([path, lcp, inp, cls]) =>
          (
            [
              ["LCP", lcp],
              ["INP", inp],
              ["CLS", cls],
            ] as const
          ).map(([metric, p75]) => ({
            path,
            metric,
            p75,
            atLeast: false,
            samples: Math.round(views / 20),
          })),
        )
      : [],
    scriptErrors: script
      ? scenario.script!.scriptErrors.map(([path, count]) => ({ path, count }))
      : [],
    coverage,
    viewSource: collection.scriptSince
      ? switched
        ? "switch"
        : "script"
      : "log",
  };
}

// ---------------------------------------------------------------------------
// The source the pages read, in place of the controller's routes.

const pick = (weights: Weights, draw: number) => {
  const all = weights.reduce((a, [, weight]) => a + weight, 0);
  let left = draw * all;
  for (const [key, weight] of weights) {
    left -= weight;
    if (left <= 0) return key;
  }
  return weights[0][0];
};

export function fixtureSource(scenario: Scenario): TrafficSource {
  // The owner's choice, changed in place so the preview can toggle it.
  const state = { ...scenario, collection: { ...scenario.collection } };
  const wait = <T>(value: T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), 180));
  return {
    history: (_, range) => wait(historyOf(state, range, Date.now())),
    collection: () => wait(state.collection),
    act(_, action: CollectionAction) {
      const at = iso(Date.now());
      if (action === "keep")
        state.collection = {
          ...state.collection,
          enabledAt: at,
          disabledAt: null,
          state: "catching-up",
          storedFrom: state.collection.storedFrom ?? at,
        };
      if (action === "stop")
        state.collection = {
          ...state.collection,
          enabledAt: null,
          disabledAt: at,
          state: "off",
        };
      // As the store does: the collection record goes with the totals.
      if (action === "forget")
        state.collection = {
          ...state.collection,
          enabledAt: null,
          disabledAt: null,
          state: "off",
          storedFrom: null,
        };
      return wait(state.collection);
    },
    impact: (_, at) =>
      wait(
        at.map((one) => {
          const release = state.releases.find(
            (candidate) => Math.abs(candidate.at - Date.parse(one)) < MINUTE,
          );
          // The release's own hour is compared in neither window.
          const hour = Math.floor(Date.parse(one) / 3_600_000) * 3_600_000;
          const span = 2 * 3_600_000;
          return {
            releaseAt: one,
            windowMinutes: 120,
            compared: {
              before: { from: iso(hour - span), to: iso(hour) },
              after: {
                from: iso(hour + 3_600_000),
                to: iso(hour + 3_600_000 + span),
              },
            },
            covered: 1,
            ...(release?.impact ?? {
              before: totals(0, 0, 220),
              after: totals(0, 0, 230),
              paths: [],
              notable: false,
            }),
          };
        }),
      ),
    live(_, on) {
      const timers: number[] = [];
      const send = (event: StreamEvent) => on.event(event);
      timers.push(
        window.setTimeout(() => {
          send({ type: "state", state: "connecting" });
          send({ type: "state", state: state.stream });
        }, 120),
      );
      if (state.stream !== "live") return () => timers.forEach(clearTimeout);
      const random = seeded(Date.now() % 997);
      let visitors = 0;
      const arrival = (at: number, country?: string): Arrival[] => {
        const visitor = `v${visitors++ % 40}`;
        const path = pick(state.profile.pages, random());
        const view: Arrival = {
          at,
          kind: "view",
          script: false,
          path,
          status: 200,
          ms: Math.round(40 + random() * 160),
          country: country ?? pick(state.profile.countries, random()),
          source: pick(state.profile.sources, random()),
          device: pick(state.profile.devices, random()) as Arrival["device"],
          visitor,
        };
        const files = Array.from(
          { length: Math.floor(random() * 3) },
          (_, index): Arrival => ({
            ...view,
            kind: "request",
            path: ["/assets/app.js", "/assets/app.css", "/api/session"][index],
            at: at + 80 * (index + 1),
          }),
        );
        return [view, ...files];
      };
      const now = Date.now();
      // A few minutes of backlog, as the server sends on connect.
      if (state.every)
        timers.push(
          window.setTimeout(
            () =>
              send({
                type: "arrivals",
                arrivals: Array.from(
                  { length: Math.min(14, Math.ceil(120 / state.every)) },
                  (_, index) => arrival(now - (index + 1) * 17_000),
                ).flat(),
              }),
            200,
          ),
        );
      if (state.firstVisit)
        timers.push(
          window.setTimeout(
            () =>
              send({
                type: "arrivals",
                arrivals: arrival(Date.now(), state.firstVisit),
              }),
            2_600,
          ),
        );
      if (state.every) {
        const tick = () => {
          send({ type: "arrivals", arrivals: arrival(Date.now()) });
          timers.push(
            window.setTimeout(
              tick,
              state.every * (0.4 + random() * 1.2) * 1000,
            ),
          );
        };
        timers.push(window.setTimeout(tick, 900));
      }
      if (state.collection.scriptSince && !state.collection.scriptSilentSince) {
        const now = () =>
          send({
            type: "now",
            openNow: Math.round(24 / state.every + random() * 6),
            recentVisitors: Math.round(60 / state.every),
            windowMinutes: 5,
          });
        timers.push(window.setTimeout(now, 400));
        timers.push(window.setInterval(now, 15_000));
      }
      return () => timers.forEach((timer) => clearTimeout(timer));
    },
  };
}

// ---------------------------------------------------------------------------
// The records the pages around Traffic read.

export function recordsOf(scenario: Scenario, now: number): SavedInformation[] {
  const id = `proto-${scenario.id}`;
  let counter = 0;
  const record = (
    input: Partial<NonNullable<SavedInformation["presentation"]>> & {
      at: number;
      title: string;
    },
  ): SavedInformation => {
    const { at, title, ...presentation } = input;
    return {
      id: `${id}-${++counter}`,
      applicationId: id,
      title,
      body: "",
      evidence: [],
      establishedAt: iso(at),
      createdAt: iso(at),
      updatedAt: iso(at),
      retiredAt: null,
      presentation: {
        views: ["overview"],
        role: "status",
        status: "verified",
        checks: [],
        ...presentation,
      },
    } as SavedInformation;
  };
  const slug = scenario.name.toLowerCase();
  const records = scenario.releases.map((release) =>
    record({
      at: release.at,
      title: `Released ${release.revision.slice(0, 7)}`,
      views: ["deployment", "history"],
      role: "outcome",
      checks: [
        {
          key: "release-http",
          label: "Answers web requests",
          status: "passed",
          claim: "liveness",
          basis: "observed",
        },
      ],
      content: {
        kind: "deployment",
        repositoryUrl: `https://github.com/owner/${slug}`,
        revision: release.revision,
        server: "hetzner-4242",
        changes: [release.change],
        image: `ghcr.io/owner/${slug}:${release.revision.slice(0, 7)}`,
      },
    }),
  );
  records.push(
    record({
      at: now - 20 * MINUTE,
      title: `${scenario.name} answers at its name`,
      views: ["overview", "deployment", "access"],
      url: `https://${slug}.example.com`,
      content: {
        kind: "application-access",
        mode: "public",
        server: "hetzner-4242",
      },
    }),
  );
  if (scenario.stream === "live")
    records.push(
      record({
        at: now - 30 * DAY,
        title: "Caddy writes one JSON line per request",
        views: ["monitoring"],
        content: {
          kind: "access-log",
          proxy: "Caddy",
          format: "caddy-json",
          source: { type: "file", path: "/var/log/caddy/access.log" },
        },
      }),
    );
  if (scenario.load) {
    const step = 60;
    const start = now - (now % HOUR) - 23 * HOUR;
    const cpu = Array.from({ length: 24 }, (_, index) =>
      Math.round(
        8 +
          400 *
            CURVE[new Date(start + index * HOUR).getHours()] *
            wobble(index, 0.3),
      ),
    );
    records.push(
      record({
        at: now - 25 * MINUTE,
        title: "A day of server load was read",
        views: ["monitoring"],
        content: {
          kind: "usage",
          start: iso(start),
          stepMinutes: step,
          host: {
            source: "sysstat on the server",
            cpu,
            memory: cpu.map((value) => Math.min(90, 38 + value / 5)),
            memoryTotal: "4 GB",
          },
        },
      }),
    );
  }
  return records;
}
