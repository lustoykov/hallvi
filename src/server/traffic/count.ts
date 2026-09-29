// Counting: a day's log lines in, that day's totals out.
//
// A day's numbers are a function of that day's lines and nothing else, so a
// restart, a reconnect or a recount can never count anything twice: the day
// is counted again from the log, never added to. `countDay` counts a whole
// pass. `DayCounter` is the same count held open, so today's provisional
// numbers can follow the log and still equal a recount of the same lines.
// Lines are counted in the order the log holds them.
//
// Who is who lives only in this pass. A browser is its address, user agent
// and host, hashed under a salt made for the pass and gone with it. What
// comes out is counts and the keys of the lists — pages, sources, countries —
// never an address, an agent or a referrer.
//
// Views and visitors come from the log until the switch point, the first
// script event counted, and only from the script after it. Requests, errors,
// response times and bots always come from the log, and Hallvi's own
// requests and the script's events are never requests.

import { createHmac, randomBytes } from "node:crypto";

import {
  classify,
  hasFetchMetadata,
  IMITATION,
  type Request,
} from "./classify";
import {
  LATENCY_BUCKETS_MS,
  OTHER,
  STORED_PER_LIST,
  VITAL_BUCKETS,
  type Coverage,
  type Ranked,
  type ScriptEvent,
  type TrafficDay,
  type TrafficLine,
  type VitalName,
} from "./contract";
import { dayBounds, HOUR_MS, hoursIn } from "./days";
import {
  agentOf,
  arrivalOf,
  countryOf,
  deviceOf,
  pageName,
  referringPage,
  type Arrival,
} from "./enrich";

/** A day is final this long after it ends: lines still being written. */
export const FINAL_AFTER_MS = 10 * 60_000;
/** Paths kept per hour for the errors they answered, worst first. */
const ERROR_PATHS = 20;
/**
 * "Script silent" needs this much evidence: pages served to three browsers,
 * and ten minutes of the log, with no event since the first of them. Less
 * than that is an ad blocker or an event still on its way.
 */
const SILENT_BROWSERS = 3;
const SILENT_AFTER_MS = 10 * 60_000;
/**
 * How far apart a page load and the script's view of it can be. The first
 * view the script sends is the switch point, and the log has already counted
 * the load that sent it, a moment before.
 */
const OVERLAP_MS = 10_000;

export interface CountOptions {
  /** `YYYY-MM-DD` in `timeZone`. */
  day: string;
  timeZone: string;
  /** The switch point on record, if there is one. */
  scriptSince: string | null;
  /** The application's hosts. A line for any other host is another site's. */
  hosts?: readonly string[];
  /** The query key an application routes pages by (WordPress's `p`). */
  pageKey?: string;
  /** What the log covered of the day, as the collector measured it. */
  coverage: Coverage;
  /** When the count is taken: its `computedAt`, and whether it is final. */
  now?: number;
}

interface Entry {
  count: number;
  visitors: Set<string>;
}

interface Hour {
  requests: number;
  views: number;
  errors: number;
  bots: number;
  latency: number[];
  visitors: Set<string>;
  errorVisitors: Set<string>;
  errorPaths: Map<string, Entry>;
}

const LISTS = [
  "pages",
  "sources",
  "campaigns",
  "countries",
  "devices",
  "browsers",
  "systems",
  "errors",
  "goals",
  "bots",
] as const;
type List = (typeof LISTS)[number];

/** What a pass has counted, still holding who was who. */
interface Tally {
  hours: Hour[];
  visitors: Set<string>;
  errorVisitors: Set<string>;
  lists: Record<List, Map<string, Entry>>;
  /** Paths browsers loaded as documents. */
  documents: Set<string>;
  /** Same-site pages named in the referrer of in-page requests. */
  referred: Set<string>;
}

function tally(hours: number): Tally {
  return {
    hours: Array.from({ length: hours }, () => ({
      requests: 0,
      views: 0,
      errors: 0,
      bots: 0,
      latency: new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0),
      visitors: new Set(),
      errorVisitors: new Set(),
      errorPaths: new Map(),
    })),
    visitors: new Set(),
    errorVisitors: new Set(),
    lists: Object.fromEntries(LISTS.map((name) => [name, new Map()])) as Record<
      List,
      Map<string, Entry>
    >,
    documents: new Set(),
    referred: new Set(),
  };
}

function bump(map: Map<string, Entry>, key: string, visitor: string | null) {
  let entry = map.get(key);
  if (!entry) map.set(key, (entry = { count: 0, visitors: new Set() }));
  entry.count += 1;
  if (visitor !== null) entry.visitors.add(visitor);
}

function addAll(into: Set<string>, from: Set<string>) {
  for (const item of from) into.add(item);
}

function absorbEntries(into: Map<string, Entry>, from: Map<string, Entry>) {
  for (const [key, entry] of from) {
    const target = into.get(key);
    if (!target)
      into.set(key, { count: entry.count, visitors: new Set(entry.visitors) });
    else {
      target.count += entry.count;
      addAll(target.visitors, entry.visitors);
    }
  }
}

function absorb(into: Tally, from: Tally) {
  from.hours.forEach((hour, index) => {
    const target = into.hours[index];
    target.requests += hour.requests;
    target.views += hour.views;
    target.errors += hour.errors;
    target.bots += hour.bots;
    hour.latency.forEach((count, bucket) => (target.latency[bucket] += count));
    addAll(target.visitors, hour.visitors);
    addAll(target.errorVisitors, hour.errorVisitors);
    absorbEntries(target.errorPaths, hour.errorPaths);
  });
  addAll(into.visitors, from.visitors);
  addAll(into.errorVisitors, from.errorVisitors);
  for (const name of LISTS) absorbEntries(into.lists[name], from.lists[name]);
  addAll(into.documents, from.documents);
  addAll(into.referred, from.referred);
}

function distinct(sets: Set<string>[]) {
  if (sets.length === 1) return sets[0].size;
  const all = new Set<string>();
  for (const set of sets) addAll(all, set);
  return all.size;
}

const byRank = (
  a: { key: string; count: number; visitors: number },
  b: { key: string; count: number; visitors: number },
) =>
  b.count - a.count ||
  b.visitors - a.visitors ||
  (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * A list as stored: the top entries, and what did not fit as one `OTHER`
 * row whose visitors are still distinct, not added.
 */
function ranked(
  maps: Map<string, Entry>[],
  limit: number,
  other = true,
): Ranked[] {
  const merged = new Map<string, { count: number; sets: Set<string>[] }>();
  for (const map of maps)
    for (const [key, entry] of map) {
      const row = merged.get(key) ?? { count: 0, sets: [] };
      row.count += entry.count;
      row.sets.push(entry.visitors);
      merged.set(key, row);
    }
  const rows = [...merged].map(([key, row]) => ({
    key,
    count: row.count,
    visitors: distinct(row.sets),
    sets: row.sets,
  }));
  rows.sort(byRank);
  const kept = rows
    .slice(0, limit)
    .map(({ key, count, visitors }) => ({ key, count, visitors }));
  const rest = rows.slice(limit);
  if (other && rest.length)
    kept.push({
      key: OTHER,
      count: rest.reduce((sum, row) => sum + row.count, 0),
      visitors: distinct(rest.flatMap((row) => row.sets)),
    });
  return kept;
}

/** Top entries by `weight`, the rest folded into one `OTHER` entry. */
function capped<T>(
  rows: T[],
  weight: (row: T) => number,
  name: (row: T) => string,
  fold: (rest: T[]) => T[],
) {
  rows.sort(
    (a, b) =>
      weight(b) - weight(a) ||
      (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0),
  );
  const rest = rows.slice(STORED_PER_LIST);
  return rest.length
    ? [...rows.slice(0, STORED_PER_LIST), ...fold(rest)]
    : rows;
}

function bucketOf(value: number, bounds: readonly number[]) {
  const index = bounds.findIndex((bound) => value <= bound);
  return index < 0 ? bounds.length : index;
}

/**
 * Whether a request's time says how the application answered. A WebSocket
 * or an event stream stays open for as long as the page does, and would
 * read as the slowest request of the day.
 */
function timed(line: TrafficLine) {
  return (
    line.status !== 101 &&
    line.contentType !== "text/event-stream" &&
    Number.isFinite(line.ms) &&
    line.ms >= 0
  );
}

interface Viewer {
  country: string;
  device: string;
  browser: string;
  system: string;
}

/** One day's count, held open while lines arrive. */
export class DayCounter {
  private readonly start: number;
  private readonly end: number;
  private readonly hosts: readonly string[];
  private readonly salt = randomBytes(16);
  private readonly main: Tally;
  /**
   * Imitation candidates, per host, counted both ways until the pass shows
   * whether browsers reach that host with fetch metadata. A host is decided
   * once and for all by the first request that carries it.
   */
  private readonly undecided = new Map<
    string,
    { asBrowser: Tally; asBot: Tally }
  >();
  private readonly withMetadata = new Set<string>();
  private readonly countries = new Map<string, string>();
  private readonly leaves = new Map<string, { path: string; ms: number }>();
  private readonly vitals = new Map<
    string,
    { path: string; metric: VitalName; value: number }
  >();
  private readonly scriptErrors = new Map<string, number>();
  /** The last few seconds of page loads the log counted, by browser, page. */
  private readonly loaded = new Map<string, number>();
  private switchPoint: number | null;
  private lastEvent: number | null = null;
  private lastLine: number | null = null;
  private quiet: { since: number; browsers: Set<string> } | null = null;

  constructor(private readonly options: CountOptions) {
    const bounds = dayBounds(options.day, options.timeZone);
    this.start = bounds.start;
    this.end = bounds.end;
    this.hosts = (options.hosts ?? []).map((host) => host.toLowerCase());
    this.main = tally(hoursIn(bounds));
    const recorded = options.scriptSince
      ? Date.parse(options.scriptSince)
      : Number.NaN;
    this.switchPoint = Number.isFinite(recorded) ? recorded : null;
  }

  /**
   * The switch point as this pass has it: the one on record, or an earlier
   * event this pass found. The collector records it when it changes.
   */
  get switchAt() {
    return this.switchPoint;
  }

  /** The newest script event counted. */
  get lastEventAt() {
    return this.lastEvent;
  }

  /** The newest line of this day, Hallvi's own included. */
  get lastLineAt() {
    return this.lastLine;
  }

  /**
   * Since when browsers have been served pages with no script event, once
   * there is enough of it to say so; null otherwise. The pass knows only its
   * day: the collector keeps the earliest across days and clears it when an
   * event arrives.
   */
  get silentSince() {
    const quiet = this.quiet;
    return quiet &&
      quiet.browsers.size >= SILENT_BROWSERS &&
      this.lastLine !== null &&
      this.lastLine - quiet.since >= SILENT_AFTER_MS
      ? quiet.since
      : null;
  }

  add(line: TrafficLine) {
    if (!(line.at >= this.start && line.at < this.end)) return;
    if (line.host && this.hosts.length && !this.hosts.includes(line.host))
      return;
    if (this.lastLine === null || line.at > this.lastLine)
      this.lastLine = line.at;
    const kind = classify(line);
    if (kind.kind === "own") return;
    const hour = Math.floor((line.at - this.start) / HOUR_MS);
    const key = this.keyOf(line);
    if (hasFetchMetadata(line)) this.decide(line.host);
    if (kind.kind === "event") {
      this.event(line, kind.event, hour, key);
      return;
    }
    if (!kind.imitation) {
      this.request(this.main, line, hour, key, kind, kind.bot);
      if (kind.view) this.served(line, key);
    } else if (this.withMetadata.has(line.host))
      this.request(this.main, line, hour, key, kind, IMITATION);
    else {
      let both = this.undecided.get(line.host);
      if (!both)
        this.undecided.set(
          line.host,
          (both = {
            asBrowser: tally(this.main.hours.length),
            asBot: tally(this.main.hours.length),
          }),
        );
      this.request(both.asBrowser, line, hour, key, kind, null);
      this.request(both.asBot, line, hour, key, kind, IMITATION);
    }
  }

  /** The day as it stands. Counting can carry on afterwards. */
  day(at: { now?: number; coverage?: Coverage } = {}): TrafficDay {
    const now = at.now ?? Date.now();
    const tallies = [
      this.main,
      ...[...this.undecided.values()].map((both) => both.asBrowser),
    ];
    const list = (name: List) =>
      ranked(
        tallies.map((one) => one.lists[name]),
        STORED_PER_LIST,
      );
    const documents = new Set<string>();
    for (const one of tallies) addAll(documents, one.documents);
    const browserOnly = new Set<string>();
    for (const one of tallies)
      for (const page of one.referred)
        if (!documents.has(page)) browserOnly.add(page);
    const switchAt = this.switchPoint;
    return {
      day: this.options.day,
      timeZone: this.options.timeZone,
      computedAt: new Date(now).toISOString(),
      final: now >= this.end + FINAL_AFTER_MS,
      coverage: at.coverage ?? this.options.coverage,
      viewSource:
        switchAt === null || switchAt >= this.end
          ? "log"
          : switchAt <= this.start
            ? "script"
            : "switch",
      hours: this.main.hours.map((_, index) => {
        const hours = tallies.map((one) => one.hours[index]);
        const sum = (field: "requests" | "views" | "errors" | "bots") =>
          hours.reduce((total, hour) => total + hour[field], 0);
        return {
          requests: sum("requests"),
          views: sum("views"),
          visitors: distinct(hours.map((hour) => hour.visitors)),
          errors: sum("errors"),
          errorVisitors: distinct(hours.map((hour) => hour.errorVisitors)),
          bots: sum("bots"),
          latency: this.main.hours[index].latency.map((_, bucket) =>
            hours.reduce((total, hour) => total + hour.latency[bucket], 0),
          ),
          errorPaths: ranked(
            hours.map((hour) => hour.errorPaths),
            ERROR_PATHS,
            false,
          ).map(({ key, count, visitors }) => ({
            path: key,
            errors: count,
            visitors,
          })),
        };
      }),
      visitors: distinct(tallies.map((one) => one.visitors)),
      errorVisitors: distinct(tallies.map((one) => one.errorVisitors)),
      pages: list("pages"),
      sources: list("sources"),
      campaigns: list("campaigns"),
      countries: list("countries"),
      devices: list("devices"),
      browsers: list("browsers"),
      systems: list("systems"),
      errors: list("errors"),
      goals: list("goals"),
      bots: list("bots"),
      browserOnlyPages: browserOnly.size,
      engagement: this.engagement(),
      vitals: this.measured(),
      scriptErrors: capped(
        [...this.scriptErrors].map(([path, count]) => ({ path, count })),
        (row) => row.count,
        (row) => row.path,
        (rest) => [
          { path: OTHER, count: rest.reduce((sum, row) => sum + row.count, 0) },
        ],
      ),
    };
  }

  private keyOf(line: TrafficLine) {
    return createHmac("sha256", this.salt)
      .update(`${line.address}\n${line.userAgent}\n${line.host}`)
      .digest("base64url")
      .slice(0, 16);
  }

  private pageOf(line: TrafficLine) {
    const key = this.options.pageKey;
    const value = key ? line.kept[key]?.slice(0, 100) : undefined;
    const page = pageName(line.path);
    return value ? `${page}?${key}=${value}` : page;
  }

  private viewer(key: string, line: TrafficLine, width?: number): Viewer {
    const agent = agentOf(line.userAgent);
    let country = this.countries.get(key);
    if (country === undefined) {
      country = countryOf(line.address, line.cdnCountry);
      this.countries.set(key, country);
    }
    return {
      country,
      device: deviceOf(agent, width),
      browser: agent.browser,
      system: agent.system,
    };
  }

  /**
   * Browsers reach this host with fetch metadata: it is served over HTTPS
   * and the log records the headers. Candidates held until now were bots.
   */
  private decide(host: string) {
    if (this.withMetadata.has(host)) return;
    this.withMetadata.add(host);
    const both = this.undecided.get(host);
    if (!both) return;
    absorb(this.main, both.asBot);
    this.undecided.delete(host);
  }

  private request(
    into: Tally,
    line: TrafficLine,
    hour: number,
    key: string,
    kind: Request,
    bot: string | null,
  ) {
    const totals = into.hours[hour];
    totals.requests += 1;
    // Bots are counted, and kept out of response times: a scanner's
    // thousand quick 404s would make a slow application look fast.
    if (bot) {
      totals.bots += 1;
      bump(into.lists.bots, bot, key);
    } else if (timed(line))
      totals.latency[bucketOf(line.ms, LATENCY_BUCKETS_MS)] += 1;
    const person = !bot && kind.browser;
    if (line.status >= 500) {
      const page = this.pageOf(line);
      totals.errors += 1;
      bump(totals.errorPaths, page, person ? key : null);
      bump(into.lists.errors, page, person ? key : null);
      if (person) {
        totals.errorVisitors.add(key);
        into.errorVisitors.add(key);
      }
    }
    if (!person) return;
    if (kind.document) into.documents.add(pageName(line.path));
    else {
      const page = referringPage(line.referrer, line.host, this.hosts);
      if (page) into.referred.add(page);
    }
    if (
      !kind.view ||
      (this.switchPoint !== null && line.at >= this.switchPoint)
    )
      return;
    this.view(into, hour, key, this.pageOf(line), this.viewer(key, line), {
      referrer: line.referrer,
      host: line.host,
      hosts: this.hosts,
      tags: line.kept,
    });
    if (into === this.main)
      this.remember(`${key} ${pageName(line.path)}`, line.at);
  }

  /** Keeps a counted page load for as long as its script view can follow. */
  private remember(load: string, at: number) {
    this.loaded.delete(load);
    this.loaded.set(load, at);
    for (const [oldest, when] of this.loaded) {
      if (when >= at - OVERLAP_MS) break;
      this.loaded.delete(oldest);
    }
  }

  private view(
    into: Tally,
    hour: number,
    key: string,
    page: string,
    viewer: Viewer,
    arrival: Arrival,
  ) {
    const totals = into.hours[hour];
    totals.views += 1;
    totals.visitors.add(key);
    into.visitors.add(key);
    bump(into.lists.pages, page, key);
    // A page reached from another page of the same site is not an arrival:
    // neither a source nor a campaign counts it.
    const arrived = arrivalOf(arrival);
    if (arrived) {
      bump(into.lists.sources, arrived.source, key);
      if (arrived.campaign) bump(into.lists.campaigns, arrived.campaign, key);
    }
    bump(into.lists.countries, viewer.country, key);
    bump(into.lists.devices, viewer.device, key);
    bump(into.lists.browsers, viewer.browser, key);
    bump(into.lists.systems, viewer.system, key);
  }

  /** A page served after the switch point: evidence the script is silent. */
  private served(line: TrafficLine, key: string) {
    if (this.switchPoint === null || line.at < this.switchPoint) return;
    if (this.lastEvent !== null && line.at <= this.lastEvent) return;
    (this.quiet ??= { since: line.at, browsers: new Set() }).browsers.add(key);
  }

  private event(
    line: TrafficLine,
    event: ScriptEvent,
    hour: number,
    key: string,
  ) {
    if (this.switchPoint === null || line.at < this.switchPoint)
      this.switchPoint = line.at;
    if (this.lastEvent === null || line.at > this.lastEvent)
      this.lastEvent = line.at;
    this.quiet = null;
    const page = pageName(event.p);
    switch (event.t) {
      case "view": {
        // A load the log counted just before the switch point, which the
        // script now reports: one view, already counted.
        const load = `${key} ${page}`;
        const loadedAt = this.loaded.get(load);
        if (
          loadedAt !== undefined &&
          loadedAt < this.switchPoint! &&
          line.at - loadedAt <= OVERLAP_MS
        ) {
          this.loaded.delete(load);
          return;
        }
        this.view(this.main, hour, key, page, this.viewer(key, line, event.w), {
          referrer: event.r ?? null,
          host: line.host,
          hosts: this.hosts,
          tags: event.u ?? {},
        });
        return;
      }
      // Events arrive in any order, a view's `leave` often after the next
      // view, so they join on the view's id. Should one be sent twice, the
      // largest stands: visible time and every page-speed figure only grow.
      case "leave": {
        const seen = this.leaves.get(event.s);
        if (!seen || event.e > seen.ms)
          this.leaves.set(event.s, { path: page, ms: event.e });
        return;
      }
      case "vital": {
        const id = `${event.s} ${event.n}`;
        const seen = this.vitals.get(id);
        if (!seen || event.v > seen.value)
          this.vitals.set(id, { path: page, metric: event.n, value: event.v });
        return;
      }
      case "goal":
        bump(this.main.lists.goals, event.g, key);
        return;
      case "error":
        this.scriptErrors.set(page, (this.scriptErrors.get(page) ?? 0) + 1);
        return;
      case "ping":
        return;
    }
  }

  private engagement() {
    const pages = new Map<
      string,
      { path: string; ms: number; samples: number }
    >();
    for (const { path, ms } of this.leaves.values()) {
      const page = pages.get(path) ?? { path, ms: 0, samples: 0 };
      page.ms += ms;
      page.samples += 1;
      pages.set(path, page);
    }
    return capped(
      [...pages.values()],
      (row) => row.samples,
      (row) => row.path,
      (rest) => [
        {
          path: OTHER,
          ms: rest.reduce((sum, row) => sum + row.ms, 0),
          samples: rest.reduce((sum, row) => sum + row.samples, 0),
        },
      ],
    );
  }

  private measured() {
    const rows = new Map<
      string,
      { path: string; metric: VitalName; buckets: number[] }
    >();
    for (const { path, metric, value } of this.vitals.values()) {
      const id = `${metric} ${path}`;
      const bounds = VITAL_BUCKETS[metric];
      let row = rows.get(id);
      if (!row)
        rows.set(
          id,
          (row = {
            path,
            metric,
            buckets: new Array<number>(bounds.length + 1).fill(0),
          }),
        );
      row.buckets[bucketOf(value, bounds)] += 1;
    }
    const samples = (row: { buckets: number[] }) =>
      row.buckets.reduce((sum, count) => sum + count, 0);
    return capped(
      [...rows.values()],
      samples,
      (row) => `${row.metric} ${row.path}`,
      (rest) => {
        const folded = new Map<VitalName, number[]>();
        for (const row of rest) {
          const buckets =
            folded.get(row.metric) ??
            new Array<number>(row.buckets.length).fill(0);
          row.buckets.forEach((count, index) => (buckets[index] += count));
          folded.set(row.metric, buckets);
        }
        return [...folded].map(([metric, buckets]) => ({
          path: OTHER,
          metric,
          buckets,
        }));
      },
    );
  }
}

/** A whole day's lines, counted once. The same lines give the same day. */
export function countDay(
  lines: Iterable<TrafficLine>,
  options: CountOptions,
): TrafficDay {
  const counter = new DayCounter(options);
  for (const line of lines) counter.add(line);
  return counter.day({ now: options.now });
}
