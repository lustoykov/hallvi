// A range from stored days: the charts, the totals, the lists, and what a
// release changed.
//
// Only what adds up is added. Requests, views, errors and bots are sums; a
// response time or a page-speed figure comes from merged histograms, never
// from averaging percentiles; and a visitor estimate exists per day only —
// a range shows today's, or the average per day the log covered, never days
// added into a number that reads as people. A stretch the log did not cover
// is a gap: every bucket says how much of it was covered, and zero means
// nobody looked, not that nobody came.

import {
  LATENCY_BUCKETS_MS,
  OTHER,
  TRAFFIC_LISTS,
  VITAL_BUCKETS,
  type Collection,
  type Coverage,
  type DayFigure,
  type Gap,
  type HourTotals,
  type RangeTotals,
  type Ranked,
  type ReleaseImpact,
  type SeriesPoint,
  type TrafficDay,
  type TrafficHistory,
  type TrafficRange,
  type VitalName,
} from "./contract";
import {
  addDays,
  controllerTimeZone,
  coveredMs,
  dayBounds,
  dayOf,
  HOUR_MS,
  hourStart,
} from "./days";

/** Entries a page shows per list; the rest is one `OTHER` row. */
const SHOWN = 20;
/** A previous period is compared only when the log covered this much of it. */
const COMPARABLE = 0.9;
const DAYS_IN: Record<Exclude<TrafficRange, "24h">, number> = {
  "7d": 7,
  "30d": 30,
};

interface Stored {
  day: TrafficDay;
  start: number;
  end: number;
}

function placed(days: TrafficDay[]): Stored[] {
  return days.map((day) => ({ day, ...dayBounds(day.day, day.timeZone) }));
}

/** Every stored hour, by the moment it starts. */
function hoursOf(days: Stored[]) {
  return days.flatMap(({ day, start }) =>
    day.hours.map((totals, index) => ({
      start: start + index * HOUR_MS,
      totals,
    })),
  );
}

/** Milliseconds of `[from, to)` the log covered, across the stored days. */
function coveredIn(days: Stored[], from: number, to: number) {
  let total = 0;
  for (const { day, start, end } of days) {
    const a = Math.max(from, start);
    const b = Math.min(to, end);
    if (b > a) total += coveredMs(day.coverage, a, b);
  }
  return total;
}

/** Whether a day counted `figure` from part of itself only: a floor. */
const floored = (
  day: Pick<TrafficDay, "partial"> | undefined,
  figure: DayFigure,
) => Boolean(day?.partial?.includes(figure));

function share(part: number, whole: number) {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
}

const tenths = (value: number) => Math.round(value * 10) / 10;

/**
 * A percentile from a histogram, interpolated within its bucket. Slower than
 * the last bound reads as the last bound, and says it is only a floor.
 */
export function percentile(
  counts: readonly number[],
  bounds: readonly number[],
  q: number,
): { value: number; atLeast: boolean } | null {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  const target = q * total;
  const past = { value: bounds[bounds.length - 1], atLeast: true };
  let below = 0;
  for (let index = 0; index < counts.length; index++) {
    const count = counts[index];
    if (count && below + count >= target) {
      if (index >= bounds.length) return past;
      const lower = index === 0 ? 0 : bounds[index - 1];
      return {
        value: Math.round(
          lower + (bounds[index] - lower) * ((target - below) / count),
        ),
        atLeast: false,
      };
    }
    below += count;
  }
  return past;
}

/** The 95th percentile response time, and whether it is only a floor. */
function p95(latency: readonly number[]) {
  const found = percentile(latency, LATENCY_BUCKETS_MS, 0.95);
  return { p95Ms: found?.value ?? null, p95AtLeast: found?.atLeast ?? false };
}

/** Hours added up, their visitor estimates too: say so where shown. */
function summed(hours: HourTotals[]) {
  const latency = new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);
  const total = {
    requests: 0,
    views: 0,
    visitors: 0,
    errors: 0,
    errorVisitors: 0,
    bots: 0,
    latency,
  };
  for (const hour of hours) {
    total.requests += hour.requests;
    total.views += hour.views;
    total.visitors += hour.visitors;
    total.errors += hour.errors;
    total.errorVisitors += hour.errorVisitors;
    total.bots += hour.bots;
    hour.latency.forEach((count, bucket) => (latency[bucket] += count));
  }
  return total;
}

/**
 * One bucket of a chart. An hour's visitors are its own estimate; a day's
 * come from the day, never from its hours added up, and are floors where
 * the day was counted in parts.
 */
function point(
  at: number,
  hours: HourTotals[],
  covered: number,
  day?: Pick<TrafficDay, "visitors" | "errorVisitors" | "partial">,
): SeriesPoint {
  const total = summed(hours);
  return {
    at: new Date(at).toISOString(),
    requests: total.requests,
    views: total.views,
    visitors: day ? day.visitors : total.visitors,
    errors: total.errors,
    errorVisitors: day ? day.errorVisitors : total.errorVisitors,
    visitorsAtLeast: floored(day, "visitors"),
    bots: total.bots,
    ...p95(total.latency),
    covered,
  };
}

function totalsOf(
  hours: HourTotals[],
  visitors: number,
  errorVisitors: number,
  visitorsPer: RangeTotals["visitorsPer"],
  visitorsAtLeast: boolean,
): RangeTotals {
  const total = summed(hours);
  return {
    requests: total.requests,
    views: total.views,
    errors: total.errors,
    errorVisitors,
    bots: total.bots,
    ...p95(total.latency),
    visitors,
    visitorsPer,
    visitorsAtLeast,
  };
}

const byRank = (a: Ranked, b: Ranked) =>
  b.count - a.count ||
  b.visitors - a.visitors ||
  (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * Stored lists merged by key, the top `SHOWN` kept and the rest one `OTHER`
 * row. Counts merge exactly. Visitors are each day's estimate divided by the
 * days the log covered — per day, like the headline — and `OTHER`'s adds
 * its entries' together, so it can only overstate.
 */
function mergedLists(lists: Ranked[][], perDay: number): Ranked[] {
  const merged = new Map<string, Ranked>();
  const other = { key: OTHER, count: 0, visitors: 0 };
  for (const list of lists)
    for (const row of list) {
      if (row.key === OTHER) {
        other.count += row.count;
        other.visitors += row.visitors;
        continue;
      }
      const into = merged.get(row.key) ?? {
        key: row.key,
        count: 0,
        visitors: 0,
      };
      into.count += row.count;
      into.visitors += row.visitors;
      merged.set(row.key, into);
    }
  const rows = [...merged.values()].sort(byRank);
  for (const row of rows.slice(SHOWN)) {
    other.count += row.count;
    other.visitors += row.visitors;
  }
  const shown = rows.slice(0, SHOWN);
  if (other.count) shown.push(other);
  return shown.map((row) => ({
    ...row,
    visitors: perDay === 1 ? row.visitors : tenths(row.visitors / perDay),
  }));
}

/**
 * Whether a merged list shows floors: a day stored only its top entries
 * (it has an `OTHER` row) and a shown entry is not among them, so that day's
 * share of the entry is lost in its `OTHER`. Otherwise the merge is exact.
 */
function partial(lists: Ranked[][], shown: Ranked[]) {
  const cut = lists
    .filter((list) => list.some((row) => row.key === OTHER))
    .map((list) => new Set(list.map((row) => row.key)));
  return shown.some(
    (row) => row.key !== OTHER && cut.some((keys) => !keys.has(row.key)),
  );
}

function mergedEngagement(days: TrafficDay[]) {
  const pages = new Map<string, { ms: number; samples: number }>();
  for (const day of days)
    for (const { path, ms, samples } of day.engagement) {
      const page = pages.get(path) ?? { ms: 0, samples: 0 };
      page.ms += ms;
      page.samples += samples;
      pages.set(path, page);
    }
  const other = pages.get(OTHER) ?? { ms: 0, samples: 0 };
  pages.delete(OTHER);
  const rows = [...pages]
    .map(([path, page]) => ({ path, ...page }))
    .sort(
      (a, b) =>
        b.samples - a.samples ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );
  for (const row of rows.slice(SHOWN)) {
    other.ms += row.ms;
    other.samples += row.samples;
  }
  const shown = rows.slice(0, SHOWN);
  if (other.samples) shown.push({ path: OTHER, ...other });
  return shown.map(({ path, ms, samples }) => ({
    path,
    averageMs: samples ? Math.round(ms / samples) : 0,
    samples,
  }));
}

function mergedVitals(days: TrafficDay[]) {
  const shown: TrafficHistory["vitals"] = [];
  for (const metric of ["LCP", "INP", "CLS"] as VitalName[]) {
    const bounds = VITAL_BUCKETS[metric];
    const pages = new Map<string, number[]>();
    for (const day of days)
      for (const row of day.vitals) {
        if (row.metric !== metric) continue;
        const buckets =
          pages.get(row.path) ?? new Array<number>(bounds.length + 1).fill(0);
        row.buckets.forEach((count, index) => (buckets[index] += count));
        pages.set(row.path, buckets);
      }
    const samples = (buckets: number[]) =>
      buckets.reduce((sum, count) => sum + count, 0);
    const other =
      pages.get(OTHER) ?? new Array<number>(bounds.length + 1).fill(0);
    pages.delete(OTHER);
    const rows = [...pages].sort(
      ([a, x], [b, y]) =>
        samples(y) - samples(x) || (a < b ? -1 : a > b ? 1 : 0),
    );
    for (const [, buckets] of rows.slice(SHOWN))
      buckets.forEach((count, index) => (other[index] += count));
    const kept: [string, number[]][] = rows.slice(0, SHOWN);
    if (samples(other)) kept.push([OTHER, other]);
    for (const [path, buckets] of kept) {
      const found = percentile(buckets, bounds, 0.75);
      shown.push({
        path,
        metric,
        p75: found?.value ?? 0,
        atLeast: found?.atLeast ?? false,
        samples: samples(buckets),
      });
    }
  }
  return shown;
}

function mergedScriptErrors(days: TrafficDay[]) {
  const pages = new Map<string, number>();
  for (const day of days)
    for (const { path, count } of day.scriptErrors)
      pages.set(path, (pages.get(path) ?? 0) + count);
  let other = pages.get(OTHER) ?? 0;
  pages.delete(OTHER);
  const rows = [...pages]
    .map(([path, count]) => ({ path, count }))
    .sort(
      (a, b) =>
        b.count - a.count || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );
  for (const row of rows.slice(SHOWN)) other += row.count;
  const shown = rows.slice(0, SHOWN);
  if (other) shown.push({ path: OTHER, count: other });
  return shown;
}

/**
 * What the log covered of `[from, to)`: from its first covered moment to
 * its last, with the gaps the days name, and a day with nothing stored in
 * between as a gap of its own. The collector names every uncovered stretch
 * of a day it writes, so a gap here always has its reason.
 */
function coverageOf(
  days: Stored[],
  names: string[],
  from: number,
  to: number,
  timeZone: string,
): Coverage {
  let first: number | null = null;
  let last: number | null = null;
  for (const { day, start, end } of days) {
    if (!day.coverage.from || !day.coverage.to) continue;
    const a = Math.max(from, start, Date.parse(day.coverage.from));
    const b = Math.min(to, end, Date.parse(day.coverage.to));
    if (!(b > a)) continue;
    first = first === null ? a : Math.min(first, a);
    last = last === null ? b : Math.max(last, b);
  }
  if (first === null || last === null)
    return { from: null, to: null, gaps: [] };
  const gaps: { from: number; to: number; why: Gap["why"] }[] = [];
  const clip = (a: number, b: number, why: Gap["why"]) => {
    const s = Math.max(a, first!);
    const e = Math.min(b, last!);
    if (e > s) gaps.push({ from: s, to: e, why });
  };
  for (const { day } of days)
    for (const gap of day.coverage.gaps)
      clip(Date.parse(gap.from), Date.parse(gap.to), gap.why);
  const stored = new Set(days.map(({ day }) => day.day));
  for (const name of names)
    if (!stored.has(name)) {
      const { start, end } = dayBounds(name, timeZone);
      clip(start, end, "not-collecting");
    }
  gaps.sort((a, b) => a.from - b.from || a.to - b.to);
  const joined: typeof gaps = [];
  for (const gap of gaps) {
    const previous = joined.at(-1);
    if (previous && previous.why === gap.why && gap.from <= previous.to)
      previous.to = Math.max(previous.to, gap.to);
    else joined.push({ ...gap });
  }
  return {
    from: new Date(first).toISOString(),
    to: new Date(last).toISOString(),
    gaps: joined.map((gap) => ({
      from: new Date(gap.from).toISOString(),
      to: new Date(gap.to).toISOString(),
      why: gap.why,
    })),
  };
}

function viewSourceOf(days: TrafficDay[]): TrafficHistory["viewSource"] {
  const sources = new Set(days.map((day) => day.viewSource));
  if (sources.size === 1) return [...sources][0];
  return sources.size ? "switch" : "log";
}

/** The stored days a history reads: the range and the one before it. */
export function historyDays(
  range: TrafficRange,
  now: number,
  timeZone: string,
) {
  const today = dayOf(now, timeZone);
  if (range === "24h")
    return { from: dayOf(now - 49 * HOUR_MS, timeZone), to: today };
  return { from: addDays(today, 1 - 2 * DAYS_IN[range]), to: today };
}

interface Stretch {
  series: SeriesPoint[];
  totals: RangeTotals;
  previous: RangeTotals | null;
  /** The days the lists come from, and how many of them the log covered. */
  listed: TrafficDay[];
  perDay: number;
  /** The local days the range touches, and its first moment. */
  names: string[];
  from: number;
}

interface Reading {
  all: Stored[];
  byName: Map<string, TrafficDay>;
  hoursIn: (from: number, to: number) => HourTotals[];
  today: string;
  now: number;
  timeZone: string;
}

/**
 * The last 24 local hours, hour by hour across midnight. Its visitors and
 * its lists are today's: both are kept per day.
 */
function lastHours({
  all,
  byName,
  hoursIn,
  today,
  now,
  timeZone,
}: Reading): Stretch {
  const end = hourStart(now, timeZone) + HOUR_MS;
  const from = end - 24 * HOUR_MS;
  const series: SeriesPoint[] = [];
  for (let at = from; at < end; at += HOUR_MS) {
    const until = Math.min(at + HOUR_MS, now);
    series.push(
      point(
        at,
        hoursIn(at, at + HOUR_MS),
        share(coveredIn(all, at, until), until - at),
      ),
    );
  }
  const current = byName.get(today);
  const yesterday = byName.get(addDays(today, -1));
  const earlier = from - 24 * HOUR_MS;
  return {
    series,
    totals: totalsOf(
      hoursIn(from, end),
      current?.visitors ?? 0,
      current?.errorVisitors ?? 0,
      "today",
      floored(current, "visitors"),
    ),
    previous:
      share(coveredIn(all, earlier, from), from - earlier) >= COMPARABLE
        ? totalsOf(
            hoursIn(earlier, from),
            yesterday?.visitors ?? 0,
            yesterday?.errorVisitors ?? 0,
            "today",
            floored(yesterday, "visitors"),
          )
        : null,
    listed: current ? [current] : [],
    perDay: 1,
    names: [...new Set([dayOf(from, timeZone), today])],
    from,
  };
}

/** The last `count` local days, today included, day by day. */
function lastDays(
  count: number,
  { all, byName, today, now, timeZone }: Reading,
): Stretch {
  const run = (offset: number) =>
    Array.from({ length: count }, (_, index) =>
      addDays(today, index - offset - (count - 1)),
    );
  const names = run(0);
  const before = run(count);
  const from = dayBounds(names[0], timeZone).start;
  const earlier = dayBounds(before[0], timeZone).start;
  // How many days the log covered any of. A visitor estimate is a distinct
  // count, which does not grow with the time it was counted over: ten
  // browsers seen in half an hour are not five hundred a day. So a day read
  // in part counts as a whole day, and can only understate the average.
  const coveredDays = (list: string[]) =>
    list.filter((name) => {
      const day = byName.get(name);
      if (!day) return false;
      const { start, end } = dayBounds(day.day, day.timeZone);
      return coveredMs(day.coverage, start, Math.min(end, now)) > 0;
    }).length;
  const perDay = (list: string[], field: "visitors" | "errorVisitors") => {
    const whole = coveredDays(list);
    const sum = list.reduce(
      (total, name) => total + (byName.get(name)?.[field] ?? 0),
      0,
    );
    return whole > 0 ? tenths(sum / whole) : 0;
  };
  const totals = (list: string[]) =>
    totalsOf(
      list.flatMap((name) => byName.get(name)?.hours ?? []),
      perDay(list, "visitors"),
      perDay(list, "errorVisitors"),
      "day",
      list.some((name) => floored(byName.get(name), "visitors")),
    );
  return {
    series: names.map((name) => {
      const day = byName.get(name);
      const at = dayBounds(name, timeZone).start;
      if (!day) return point(at, [], 0, { visitors: 0, errorVisitors: 0 });
      const { start, end } = dayBounds(day.day, day.timeZone);
      const until = Math.min(end, now);
      return point(
        at,
        day.hours,
        share(coveredMs(day.coverage, start, until), until - start),
        day,
      );
    }),
    totals: totals(names),
    previous:
      share(coveredIn(all, earlier, from), from - earlier) >= COMPARABLE
        ? totals(before)
        : null,
    listed: names.flatMap((name) => byName.get(name) ?? []),
    perDay: coveredDays(names) || 1,
    names,
    from,
  };
}

/**
 * A range as the pages draw it, from the days `historyDays` names. Nothing
 * stored is an empty history — every bucket uncovered — not an error.
 */
export function historyOf(
  days: TrafficDay[],
  range: TrafficRange,
  now: number,
  collection: Collection,
  timeZone = controllerTimeZone(),
): TrafficHistory {
  const all = placed(days);
  const hours = hoursOf(all);
  const reading: Reading = {
    all,
    byName: new Map(days.map((day) => [day.day, day])),
    hoursIn: (from, to) =>
      hours
        .filter((hour) => hour.start >= from && hour.start < to)
        .map((hour) => hour.totals),
    today: dayOf(now, timeZone),
    now,
    timeZone,
  };
  const stretch =
    range === "24h" ? lastHours(reading) : lastDays(DAYS_IN[range], reading);
  const { listed, perDay, names } = stretch;
  const lists = Object.fromEntries(
    TRAFFIC_LISTS.map((name) => [
      name,
      mergedLists(
        listed.map((day) => day[name]),
        perDay,
      ),
    ]),
  ) as Record<(typeof TRAFFIC_LISTS)[number], Ranked[]>;
  const inPart = (figure: DayFigure) =>
    listed.some((day) => floored(day, figure));
  const partialLists: TrafficHistory["partialLists"] = [
    ...TRAFFIC_LISTS.filter(
      (name) =>
        inPart(name) ||
        partial(
          listed.map((day) => day[name]),
          lists[name],
        ),
    ),
    ...(inPart("scriptErrors") ? (["scriptErrors"] as const) : []),
  ];
  const inRange = all.filter(({ day }) => names.includes(day.day));
  return {
    range,
    timeZone,
    collection,
    series: stretch.series,
    totals: stretch.totals,
    previous: stretch.previous,
    ...lists,
    partialLists,
    partialSamples: (["engagement", "vitals"] as const).filter(inPart),
    engagement: mergedEngagement(listed),
    vitals: mergedVitals(listed),
    scriptErrors: mergedScriptErrors(listed),
    coverage: coverageOf(inRange, names, stretch.from, now, timeZone),
    viewSource: viewSourceOf(inRange.map(({ day }) => day)),
  };
}

/** The stored days a release's windows read. */
export function impactDays(
  releaseAt: number,
  windowMinutes: number,
  timeZone: string,
) {
  const reach = (Math.ceil(windowMinutes / 60) + 1) * HOUR_MS;
  return {
    from: dayOf(releaseAt - reach, timeZone),
    to: dayOf(releaseAt + reach, timeZone),
  };
}

/**
 * What a release changed: the hours after it against the hours before.
 * Totals are kept by the hour, and the hour the release fell in holds some
 * of each side, so it is left out: before ends where that hour begins, and
 * after starts where it ends — or at the release, when it came on the hour.
 * Visitor figures here are the hours' estimates added together.
 *
 * `notable` follows fixed rules, and only when the log covered the window
 * before (there is nothing to compare against otherwise):
 *
 * - a path that answered no 5xx before now answers them, at least three
 *   times and to at least one browser;
 * - errors reach clearly more browsers: at least three, and at least twice
 *   as many as before;
 * - responses got clearly slower: with 30 timed requests on each side, the
 *   95th percentile at least doubled and rose by at least 500 ms.
 *
 * Otherwise it is quiet: nothing is said when nothing changed.
 */
export function releaseImpact(
  days: TrafficDay[],
  releaseAt: string,
  windowMinutes = 120,
  now = Date.now(),
): ReleaseImpact {
  const at = Date.parse(releaseAt);
  const all = placed(days);
  const hours = hoursOf(all);
  const span = Math.max(1, Math.round(windowMinutes / 60)) * HOUR_MS;
  const home = all.find(({ start, end }) => at >= start && at < end);
  const hour = home
    ? home.start + Math.floor((at - home.start) / HOUR_MS) * HOUR_MS
    : hourStart(at, controllerTimeZone());
  const beforeTo = hour;
  const afterFrom = at === hour ? hour : hour + HOUR_MS;
  const window = (from: number, to: number) =>
    hours.filter((one) => one.start >= from && one.start < to);
  const before = window(beforeTo - span, beforeTo).map((one) => one.totals);
  const after = window(afterFrom, afterFrom + span).map((one) => one.totals);
  const side = (list: HourTotals[]) => {
    const total = summed(list);
    return {
      totals: {
        requests: total.requests,
        views: total.views,
        errors: total.errors,
        errorVisitors: total.errorVisitors,
        bots: total.bots,
        ...p95(total.latency),
        visitors: total.visitors,
      },
      timed: total.latency.reduce((sum, count) => sum + count, 0),
    };
  };
  const earlier = side(before);
  const later = side(after);
  const pathErrors = (list: HourTotals[]) => {
    const paths = new Map<string, { errors: number; visitors: number }>();
    for (const one of list)
      for (const { path, errors, visitors } of one.errorPaths) {
        const row = paths.get(path) ?? { errors: 0, visitors: 0 };
        row.errors += errors;
        row.visitors += visitors;
        paths.set(path, row);
      }
    return paths;
  };
  const was = pathErrors(before);
  const paths = [...pathErrors(after)]
    .map(([path, row]) => ({
      path,
      errorsBefore: was.get(path)?.errors ?? 0,
      errorsAfter: row.errors,
      visitorsAffected: row.visitors,
    }))
    .filter((row) => row.errorsAfter > row.errorsBefore)
    .sort(
      (a, b) =>
        b.errorsAfter - b.errorsBefore - (a.errorsAfter - a.errorsBefore) ||
        b.errorsAfter - a.errorsAfter ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    )
    .slice(0, SHOWN);
  const coveredBefore = share(coveredIn(all, beforeTo - span, beforeTo), span);
  const coveredAfter = share(
    coveredIn(all, afterFrom, Math.min(afterFrom + span, now)),
    span,
  );
  const newlyFailing = paths.some(
    (row) =>
      row.errorsBefore === 0 &&
      row.errorsAfter >= 3 &&
      row.visitorsAffected >= 1,
  );
  const reachesMore =
    later.totals.errorVisitors >= 3 &&
    later.totals.errorVisitors >= 2 * earlier.totals.errorVisitors;
  const p95Before = earlier.totals.p95Ms;
  const p95After = later.totals.p95Ms;
  // A floor after is still at least that slow; a floor before could be
  // anything slower, so nothing can be said to have doubled.
  const slower =
    earlier.timed >= 30 &&
    later.timed >= 30 &&
    !earlier.totals.p95AtLeast &&
    p95Before !== null &&
    p95After !== null &&
    p95After >= 2 * p95Before &&
    p95After - p95Before >= 500;
  const stamp = (ms: number) =>
    Number.isFinite(ms) ? new Date(ms).toISOString() : releaseAt;
  return {
    releaseAt,
    windowMinutes: span / 60_000,
    compared: {
      before: { from: stamp(beforeTo - span), to: stamp(beforeTo) },
      after: { from: stamp(afterFrom), to: stamp(afterFrom + span) },
    },
    before: earlier.totals,
    after: later.totals,
    paths,
    notable:
      Number.isFinite(at) &&
      coveredBefore >= COMPARABLE &&
      (newlyFailing || reachesMore || slower),
    covered: Number.isFinite(at) ? (coveredBefore + coveredAfter) / 2 : 0,
  };
}
