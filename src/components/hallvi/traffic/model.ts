// What the traffic pages decide, apart from how they draw it.
//
// Every rule a page follows about what to say lives here, so the Traffic
// destination, the Overview tile, Deployment and Monitoring cannot disagree:
// when Traffic is listed, what a usual day is, when the script is offered,
// when an application is quiet enough for one line, and which of Little
// Server's moments has earned a visit. docs/design/traffic.md owns the
// design; src/server/traffic/contract.ts owns the shapes.

import {
  OTHER,
  type Collection,
  type Gap,
  type ReleaseImpact,
  type SeriesPoint,
  type TrafficHistory,
  type TrafficRange,
} from "@/server/traffic/contract";

// Mirrors of claude/traffic-v1's contract (6557b872), which has not been
// merged into this branch. Swap each for the contract's own export once it
// is: `UNKNOWN`, `DIRECT`, and the two `Collection` fields read below.
/** The key for what could not be told: a country, a browser, a system. */
export const UNKNOWN = "(unknown)";
/** The source of a view with no referrer and no campaign. */
export const DIRECT = "Direct";
type Contracted = Collection & {
  storedFrom?: string | null;
  logMisses?: ("browser-pages" | "cached-pages")[];
};
/** The first day with stored totals; null when nothing is stored. */
export const storedFrom = (collection: Collection) =>
  (collection as Contracted).storedFrom ?? null;
/** What the log alone cannot see, from evidence. */
export const logMisses = (collection: Collection) =>
  (collection as Contracted).logMisses ?? [];

// ---------------------------------------------------------------------------
// Words and numbers

export const count = (value: number) =>
  Math.round(value).toLocaleString("en-US");

export const plural = (value: number, word: string, many = `${word}s`) =>
  `${count(value)} ${Math.round(value) === 1 ? word : many}`;

/** 12, 1.2k, 34k: for axes and tight cells, never for a headline. */
export function compact(value: number) {
  if (value < 1000) return String(Math.round(value));
  if (value < 10_000)
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function milliseconds(ms: number) {
  if (ms >= 10_000) return `${Math.round(ms / 1000)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

/** Visible time on a page: "48 s", "2 min 5 s". */
export function onPage(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes} min ${seconds % 60} s` : `${minutes} min`;
}

let regions: Intl.DisplayNames | null = null;
/** "DE" as "Germany". A key that is not a country says what it is. */
export function countryName(code: string) {
  if (code === OTHER) return "Other countries";
  if (!/^[A-Z]{2}$/.test(code)) return "Unknown";
  try {
    regions ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

/** A breakdown's key, as a reader should see it. */
export function keyWords(key: string) {
  if (key === OTHER) return "Everything else";
  if (key === UNKNOWN) return "Unknown";
  return key;
}

export const RANGE_WORDS: Record<TrafficRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const GAP_WORDS: Record<Gap["why"], string> = {
  "hallvi-off": "Hallvi was off",
  "log-rotated": "the log had rotated away",
  unreadable: "the log could not be read",
  "not-collecting": "history was not being kept",
};
export const gapWords = (gap: Gap) => GAP_WORDS[gap.why];

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const inOrder = (series: SeriesPoint[]) =>
  [...series].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

/** Whether the log covered any of the range: nothing stored is unassessed. */
export const hasTotals = (history: TrafficHistory | null) =>
  Boolean(history?.series.some((point) => point.covered > 0));

/**
 * Whether a server error reached a visitor in the range. A scanner that
 * trips a 5xx nobody saw is a line in the small print, not a red number.
 */
export const errorsHitVisitors = (history: TrafficHistory) =>
  history.totals.errorVisitors > 0 ||
  history.series.some((point) => point.errorVisitors > 0);

// ---------------------------------------------------------------------------
// Decisions

/**
 * Traffic is listed once history is kept or stored totals remain. Before
 * that it waits under "Show more" as a decision nobody has made.
 */
export function trafficListed(collection: Collection | null) {
  return Boolean(
    collection && (collection.enabledAt || storedFrom(collection)),
  );
}

/**
 * Today's estimate against a usual day: the median of the last seven days
 * the log covered, from a daily series whose last point is today.
 *
 * Today is not over, so it is never called quieter than usual: a morning is
 * always below a whole day. It is called busier only once it has already
 * passed a usual whole day, which no later hour can take back.
 */
export function usualDay(series: SeriesPoint[]) {
  const days = inOrder(series);
  const today = days.at(-1);
  if (!today) return null;
  const before = days
    .slice(0, -1)
    .filter((day) => day.covered >= 0.9)
    .slice(-7);
  const usual =
    before.length >= 3 ? median(before.map((day) => day.visitors)) : null;
  return {
    today: today.visitors,
    covered: today.covered > 0,
    usual,
    busier:
      usual !== null && today.visitors > Math.max(usual * 1.25, usual + 2),
  };
}

export type ScriptAsk = "time" | "goals" | "speed";

const ASKED: Record<ScriptAsk, string> = {
  time: "Time on page is measured in the browser, by Hallvi's script.",
  goals: "Goals are counted in the browser, by Hallvi's script.",
  speed: "Page speed is measured in the browser, by Hallvi's script.",
};

/**
 * Whether the page offers the script, and in which sentence.
 *
 * Only when the evidence says the log misses something: the application
 * changes pages in the browser, a CDN serves its pages from a cache, or the
 * owner just opened something only the script measures. Never while the
 * script already runs, never before history is kept, and never while there
 * is no log to carry its events.
 */
export function scriptOffer(
  collection: Collection | null,
  asked: ScriptAsk | null = null,
): {
  reason: ScriptAsk | "browser-pages" | "cached-pages";
  says: string;
} | null {
  if (!collection?.enabledAt || collection.scriptSince) return null;
  if (["off", "no-log", "unsupported"].includes(collection.state)) return null;
  if (asked) return { reason: asked, says: ASKED[asked] };
  const misses = logMisses(collection);
  if (misses.includes("browser-pages"))
    return {
      reason: "browser-pages",
      says: "This application changes pages in the browser, where the server's log never sees them.",
    };
  if (misses.includes("cached-pages"))
    return {
      reason: "cached-pages",
      says: "A CDN answers some pages from its cache, so those visits never reach the log.",
    };
  return null;
}

/** What the owner sends Pi when they take the offer. */
export function scriptDraft(name: string) {
  return `Add Hallvi's traffic script to ${name}: open the one-line pull request that loads /_hv/s.js from the layout every page shares, and make sure the proxy serves /_hv/. Don't change anything at the proxy that rewrites pages.`;
}

/**
 * A small application reads as one calm line, not a dashboard of zeros:
 * no day in the range reached ten estimated visitors. A range the log never
 * covered is not quiet — it is unread.
 */
export function isQuiet(history: TrafficHistory) {
  if (!hasTotals(history)) return false;
  if (history.range === "24h") return history.totals.visitors < 10;
  return history.series
    .filter((point) => point.covered > 0)
    .every((point) => point.visitors < 10);
}

/**
 * The one line a quiet range reads as. Views add up over days; visitor
 * estimates do not, so a week is its views and "about N a day".
 */
export function quietLine(history: TrafficHistory) {
  const { views, visitors } = history.totals;
  if (history.range === "24h") {
    if (!visitors && !views) return "No visitors yet today.";
    return `${plural(visitors, "estimated visitor")} today, ${plural(views, "page view")}.`;
  }
  const span = history.range === "7d" ? "this week" : "in the last 30 days";
  if (!views) return `No page views ${span}.`;
  const daily =
    visitors < 1
      ? "fewer than one visitor a day"
      : `about ${plural(visitors, "visitor")} a day`;
  return `${plural(views, "page view")} ${span}, ${daily}.`;
}

const list = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** Where a quiet range's few visits went and came from, in one sentence. */
export function quietWhere(history: TrafficHistory) {
  const pages = history.pages
    .filter((row) => row.count > 0 && row.key !== OTHER)
    .slice(0, 3)
    .map((row) => row.key);
  const places = history.countries
    .filter((row) => row.count > 0 && /^[A-Z]{2}$/.test(row.key))
    .slice(0, 3)
    .map((row) => countryName(row.key));
  const source = history.sources.find(
    (row) => row.count > 0 && row.key !== OTHER && row.key !== UNKNOWN,
  );
  if (!pages.length) return null;
  return [
    `They opened ${list(pages)}`,
    places.length ? `, from ${list(places)}` : "",
    source
      ? source.key === DIRECT
        ? ", most of them directly"
        : `, most of them from ${source.key}`
      : "",
    ".",
  ].join("");
}

export interface Moment {
  /** Remembered per viewer once shown, so each visit happens once. */
  id: string;
  words: string;
}

/**
 * Little Server's moments, from stored totals: a first visitor, a first
 * visit from a new country, a record day. Newest news first; the page shows
 * the first one this viewer has not seen.
 */
export function momentsOf({
  month,
  day,
  collection,
}: {
  /** The 30-day history: a daily series whose last point is today. */
  month: TrafficHistory;
  /** The 24-hour history, for the countries of the last day. */
  day: TrafficHistory | null;
  collection: Collection;
}): Moment[] {
  const days = inOrder(month.series);
  const today = days.at(-1);
  if (!today?.covered) return [];
  const earlier = days.slice(0, -1);
  const from = storedFrom(collection);
  // Everything ever stored is inside this range, so "first" and "yet" are
  // claims about all of it rather than about thirty days.
  const whole = !from || Date.parse(from) >= Date.parse(days[0].at) - 864e5;
  const seen = earlier.filter((one) => one.covered > 0);
  const moments: Moment[] = [];

  if (whole && today.visitors > 0 && seen.every((one) => !one.visitors))
    return [{ id: "first-visitor", words: "Your first visitor." }];

  const settled = earlier.filter((one) => one.covered >= 0.9);
  const best = Math.max(0, ...earlier.map((one) => one.visitors));
  if (settled.length >= 7 && today.visitors >= 10 && today.visitors > best)
    moments.push({
      id: `record:${today.at.slice(0, 10)}`,
      words: whole ? "Your busiest day yet." : "Busiest day in 30 days.",
    });

  if (day && seen.some((one) => one.visitors > 0) && seen.length >= 3)
    for (const country of day.countries) {
      if (!/^[A-Z]{2}$/.test(country.key)) continue;
      const before = month.countries.find((one) => one.key === country.key);
      // Every view from it in thirty days happened in the last one.
      if (before && before.count > country.count) continue;
      if (month.countries.length < 2) continue;
      moments.push({
        id: `country:${country.key}`,
        words: `A first visit from ${countryName(country.key)}.`,
      });
    }
  return moments;
}

/**
 * The line a release row wears when what followed it is worth saying.
 * Nothing at all when it is not: a quiet release is quiet.
 */
export function impactLine(impact: ReleaseImpact, now: number) {
  if (!impact.notable) return null;
  const young = now - Date.parse(impact.releaseAt) < impact.windowMinutes * 6e4;
  const lead = young ? "Since this release" : "After this release";
  const [worst, ...rest] = impact.paths;
  const { before, after } = impact;
  if (worst)
    return {
      tone: "bad" as const,
      says: `${lead}: errors on ${worst.path} ${count(worst.errorsBefore)} → ${count(worst.errorsAfter)}${
        worst.visitorsAffected
          ? `, about ${plural(worst.visitorsAffected, "visitor")}`
          : ""
      }${rest.length ? ` · ${plural(rest.length, "more page")}` : ""}`,
    };
  if (after.errors > before.errors)
    return {
      tone: "bad" as const,
      says: `${lead}: errors ${count(before.errors)} → ${count(after.errors)}${
        after.errorVisitors
          ? `, about ${plural(after.errorVisitors, "visitor")}`
          : ""
      }`,
    };
  if (before.p95Ms && after.p95Ms && after.p95Ms >= before.p95Ms * 1.5)
    return {
      tone: "warn" as const,
      says: `${lead}: slower, ${milliseconds(before.p95Ms)} → ${milliseconds(after.p95Ms)} for the slowest 1 in 20`,
    };
  if (after.errors < before.errors)
    return {
      tone: "good" as const,
      says: `${lead}: errors ${count(before.errors)} → ${count(after.errors)}`,
    };
  return {
    tone: "plain" as const,
    says: `${lead}: page views ${count(before.views)} → ${count(after.views)}`,
  };
}
