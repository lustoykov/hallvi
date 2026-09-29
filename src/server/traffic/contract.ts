// The shared contract for traffic.
//
// docs/design/traffic.md owns the design. Every part is written against the
// shapes here — the log readers, the counting, the collector in the worker,
// the script, the pages and Pi's tool — so that none of them needs to know
// how another is built. A part that needs a shape to change changes it here
// and says so; it does not grow a private copy.
//
// Nothing in this file may carry a visitor's address, user agent or referrer
// beyond `TrafficLine`, which exists only while a pass is counting.

/** The access log formats Hallvi reads. Anything else is unavailable. */
export const LOG_FORMATS = [
  "caddy-json",
  "hallvi-json",
  "traefik-json",
] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

/**
 * The query keys Hallvi keeps. Everything else in a query string is removed
 * before the proxy writes the line (Caddy, nginx) or when it is read
 * (Traefik). An application that routes by query string may add its own page
 * key through the `access-log` record.
 */
export const KEPT_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
] as const;
export type KeptQueryKey = (typeof KEPT_QUERY_KEYS)[number];

/**
 * One request, as every reader hands it on, whatever proxy wrote it.
 *
 * `address`, `userAgent` and `referrer` are transient: they exist while a
 * pass counts, and are never stored, sent to a page or given to Pi.
 */
export interface TrafficLine {
  /** When the proxy wrote the line — the request's end — in epoch ms. */
  at: number;
  /** Lower-case host without a port; "" when the log does not say. */
  host: string;
  method: string;
  /**
   * The path only, never a query string. At most 300 characters, except a
   * script event's (`EVENT_PREFIX`), kept whole up to 2,000 so it decodes.
   */
  path: string;
  /** Kept query keys the line carried, and an application's page key. */
  kept: Record<string, string>;
  status: number;
  /** How long the request took, in milliseconds. */
  ms: number;
  /** The visitor's address as the proxy resolved it, or a CDN's header. */
  address: string;
  userAgent: string;
  referrer: string | null;
  /** `Sec-Fetch-Dest` and `Sec-Fetch-Mode`, when the browser sent them. */
  fetchDest: string | null;
  fetchMode: string | null;
  /** `Sec-Purpose` or `Purpose`: a prefetch or prerender is not a view. */
  purpose: string | null;
  /** The response's `Content-Type`, without parameters. */
  contentType: string | null;
  /** A CDN's country for the visitor (`CF-IPCountry`), two letters. */
  cdnCountry: string | null;
}

// ---------------------------------------------------------------------------
// The script

/** Everything under this prefix is Hallvi's, never the application's. */
export const HALLVI_PATH_PREFIX = "/_hv/";
/** The script the proxy serves on the application's own domain. */
export const SCRIPT_PATH = "/_hv/s.js";
/**
 * Events are requests to `EVENT_PREFIX` + base64url(JSON), which the proxy
 * answers with 204 and logs. The payload is in the path so that removing
 * query strings never touches it and every proxy records it.
 */
export const EVENT_PREFIX = "/_hv/e/1/";
/** How often the script pings while its tab is visible. */
export const PING_SECONDS = 30;

export type VitalName = "LCP" | "INP" | "CLS";

/**
 * What the script sends. `s` is a random id for one page view — it joins a
 * `leave` to its `view` and identifies nobody. `p` is the page's path.
 */
export type ScriptEvent =
  | {
      t: "view";
      s: string;
      p: string;
      /**
       * The referrer's origin whenever there is one — this site's own origin
       * for internal navigations and route changes — so an internal view is
       * never taken for a direct landing. Absent only with no referrer.
       */
      r?: string;
      /** Campaign tags read from the landing URL in the browser. */
      u?: Partial<Record<KeptQueryKey, string>>;
      /** The screen's width in CSS pixels. */
      w?: number;
    }
  | { t: "ping"; s: string; p: string }
  | {
      t: "leave";
      s: string;
      p: string;
      /** Milliseconds the page was visible, capped at 30 minutes. */
      e: number;
    }
  | { t: "goal"; s: string; p: string; g: string }
  | {
      t: "vital";
      s: string;
      p: string;
      n: VitalName;
      /** LCP and INP in milliseconds; CLS as the score times 1000. */
      v: number;
    }
  | { t: "error"; s: string; p: string };

const LIMITS = {
  path: 300,
  origin: 200,
  tag: 100,
  goal: /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/,
  view: /^[A-Za-z0-9]{8,32}$/,
} as const;

/** The request path for an event. The script builds the same string. */
export function eventPath(event: ScriptEvent) {
  return `${EVENT_PREFIX}${Buffer.from(JSON.stringify(event), "utf8").toString("base64url")}`;
}

const whole = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max;

/**
 * The event a logged request carried, or null for anything that is not a
 * well-formed event. A malformed event counts as nothing at all: it came from
 * the internet, and the only thing it can prove is that someone sent it.
 */
export function eventOf(path: string): ScriptEvent | null {
  if (!path.startsWith(EVENT_PREFIX) || path.length > 2_000) return null;
  let value: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(path.slice(EVENT_PREFIX.length), "base64url").toString(
        "utf8",
      ),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    value = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const { t, s, p } = value;
  if (typeof s !== "string" || !LIMITS.view.test(s)) return null;
  if (!text(p, LIMITS.path) || !(p as string).startsWith("/")) return null;
  const base = { s, p: p as string };
  switch (t) {
    case "view": {
      const event: Extract<ScriptEvent, { t: "view" }> = { t, ...base };
      if (value.r !== undefined) {
        if (!text(value.r, LIMITS.origin)) return null;
        event.r = value.r as string;
      }
      if (value.u !== undefined) {
        if (!value.u || typeof value.u !== "object" || Array.isArray(value.u))
          return null;
        const tags: Partial<Record<KeptQueryKey, string>> = {};
        for (const [key, tag] of Object.entries(value.u)) {
          if (!(KEPT_QUERY_KEYS as readonly string[]).includes(key))
            return null;
          if (!text(tag, LIMITS.tag)) return null;
          tags[key as KeptQueryKey] = tag as string;
        }
        event.u = tags;
      }
      if (value.w !== undefined) {
        if (!whole(value.w, 0, 20_000)) return null;
        event.w = Math.round(value.w as number);
      }
      return event;
    }
    case "ping":
    case "error":
      return { t, ...base };
    case "leave":
      return whole(value.e, 0, 30 * 60_000)
        ? { t, ...base, e: Math.round(value.e as number) }
        : null;
    case "goal":
      return typeof value.g === "string" && LIMITS.goal.test(value.g)
        ? { t, ...base, g: value.g }
        : null;
    case "vital": {
      const n = value.n;
      if (n !== "LCP" && n !== "INP" && n !== "CLS") return null;
      return whole(value.v, 0, 120_000)
        ? { t, ...base, n, v: Math.round(value.v as number) }
        : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Buckets. Percentiles come from merged histograms, never from averaging.

/** Upper bounds in milliseconds; a histogram has one more count, for slower. */
export const LATENCY_BUCKETS_MS = [
  10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
] as const;

/** Page-speed bounds: LCP and INP in ms, CLS as the score times 1000. */
export const VITAL_BUCKETS: Record<VitalName, readonly number[]> = {
  LCP: [500, 1000, 1500, 2000, 2500, 3000, 4000, 6000, 10000],
  INP: [50, 100, 150, 200, 300, 500, 800, 1500],
  CLS: [25, 50, 100, 150, 250, 400, 1000],
};

// ---------------------------------------------------------------------------
// What is stored: one row per application per day, in traffic.db beside
// hallvi.db. Nothing here identifies a visitor.

export interface HourTotals {
  /** Every request except Hallvi's own and the script's events. */
  requests: number;
  views: number;
  /** Distinct browsers seen in the hour — an estimate. */
  visitors: number;
  /** 5xx responses. */
  errors: number;
  /** Distinct browsers that got a 5xx in the hour. */
  errorVisitors: number;
  /** Requests from bots and scanners. */
  bots: number;
  /** Counts per `LATENCY_BUCKETS_MS` bound, plus one for slower. */
  latency: number[];
  /** Paths that answered 5xx this hour, worst first, at most 20. */
  errorPaths: { path: string; errors: number; visitors: number }[];
}

/**
 * One entry of a breakdown. What `count` counts is the list's own: views for
 * pages, countries, devices, browsers and systems; views that arrived from
 * the source for sources and campaigns; 5xx responses for errors; events for
 * goals; requests for bots. `visitors` is always distinct browsers.
 */
export interface Ranked {
  key: string;
  count: number;
  visitors: number;
}

/** The name every list uses for what did not fit. */
export const OTHER = "(other)";
/** The key for what could not be told: a country, a browser, a system. */
export const UNKNOWN = "(unknown)";
/** The source of a view that arrived with no referrer and no campaign. */
export const DIRECT = "Direct";
/** Device keys. Countries are ISO 3166-1 alpha-2, upper case, or UNKNOWN. */
export const DEVICES = ["desktop", "mobile", "tablet"] as const;
/** Entries stored per list per day; a range merges these exactly. */
export const STORED_PER_LIST = 200;

export interface Gap {
  from: string;
  to: string;
  why: "hallvi-off" | "log-rotated" | "unreadable" | "not-collecting";
}

export interface Coverage {
  /** The first and last moment of the day the log covered. */
  from: string | null;
  to: string | null;
  gaps: Gap[];
}

export interface TrafficDay {
  /** `YYYY-MM-DD` in `timeZone`. */
  day: string;
  timeZone: string;
  computedAt: string;
  /** Recounted after the day ended. A provisional day is today's. */
  final: boolean;
  coverage: Coverage;
  /** Where views and visitors came from; `switch` on the day it changed. */
  viewSource: "log" | "script" | "switch";
  /** One per local hour: 23 or 25 on a daylight-saving change. */
  hours: HourTotals[];
  /** Distinct browsers across the day — an estimate, never summed. */
  visitors: number;
  /** Distinct browsers that got a 5xx across the day, estimated alike. */
  errorVisitors: number;
  pages: Ranked[];
  sources: Ranked[];
  campaigns: Ranked[];
  countries: Ranked[];
  devices: Ranked[];
  browsers: Ranked[];
  systems: Ranked[];
  errors: Ranked[];
  goals: Ranked[];
  bots: Ranked[];
  /**
   * Distinct same-site pages named only in the referrer of in-page requests
   * and never loaded as a document: the evidence that the application
   * changes pages in the browser, where the log cannot see them.
   */
  browserOnlyPages: number;
  /** Visible time per page, from `leave` events. */
  engagement: { path: string; ms: number; samples: number }[];
  vitals: { path: string; metric: VitalName; buckets: number[] }[];
  scriptErrors: { path: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Collection: the owner's standing choice, and what the collector last saw.

export type CollectorState =
  "off" | "no-log" | "unsupported" | "catching-up" | "live" | "lost";

export interface Collection {
  /** Set while "Keep traffic history" is on. */
  enabledAt: string | null;
  disabledAt: string | null;
  state: CollectorState;
  /** Why, in words, for `unsupported` and `lost`. */
  detail: string | null;
  lastLineAt: string | null;
  /** The oldest line the server's log still holds. */
  oldestRetainedAt: string | null;
  /** The first script event counted: the switch point. */
  scriptSince: string | null;
  /** Browsers were served pages and no event arrived since this moment. */
  scriptSilentSince: string | null;
  /** What wrote the log, in words and format, from the `access-log` record. */
  source: { proxy: string; format: LogFormat } | null;
  /** The first day with stored totals; null when nothing is stored. */
  storedFrom: string | null;
  /**
   * What the log alone cannot see, from evidence — what the script offer
   * answers. `browser-pages`: recent days have `browserOnlyPages`, so the
   * application changes pages in the browser. `cached-pages`: a current
   * `cdn` record carries the fact `caches-pages` = "yes". Empty once the
   * script has passed its switch point.
   */
  logMisses: ("browser-pages" | "cached-pages")[];
}

// ---------------------------------------------------------------------------
// What the pages and Pi read.

export const TRAFFIC_RANGES = ["24h", "7d", "30d"] as const;
export type TrafficRange = (typeof TRAFFIC_RANGES)[number];

export interface SeriesPoint {
  /** The bucket's start: an hour for 24 h, a local day otherwise. */
  at: string;
  requests: number;
  views: number;
  /** The bucket's own estimate: hourly or daily distinct browsers. */
  visitors: number;
  errors: number;
  errorVisitors: number;
  bots: number;
  /** From the bucket's merged histogram; null with no requests. */
  p95Ms: number | null;
  /** How much of the bucket the log covered, 0 to 1. Zero is a gap. */
  covered: number;
}

export interface RangeTotals {
  requests: number;
  views: number;
  errors: number;
  /** Like `visitors`: today's for 24 h, else the average per covered day. */
  errorVisitors: number;
  bots: number;
  p95Ms: number | null;
  /** Today's estimate for 24 h; the average per covered day otherwise. */
  visitors: number;
  visitorsPer: "today" | "day";
}

/**
 * `GET …/traffic/history?range=` answers with this. An application with
 * nothing stored gets an empty history — every bucket `covered: 0` — never
 * an error: nothing stored is unassessed, not absent.
 */
export interface TrafficHistory {
  range: TrafficRange;
  timeZone: string;
  collection: Collection;
  series: SeriesPoint[];
  totals: RangeTotals;
  /** The range before this one, where the log covered it. */
  previous: RangeTotals | null;
  pages: Ranked[];
  sources: Ranked[];
  campaigns: Ranked[];
  countries: Ranked[];
  devices: Ranked[];
  browsers: Ranked[];
  systems: Ranked[];
  errors: Ranked[];
  goals: Ranked[];
  bots: Ranked[];
  engagement: { path: string; averageMs: number; samples: number }[];
  /** The 75th percentile per page and metric, the page-speed convention. */
  vitals: { path: string; metric: VitalName; p75: number; samples: number }[];
  scriptErrors: { path: string; count: number }[];
  coverage: Coverage;
  viewSource: "log" | "script" | "switch";
}

/**
 * What changed in the window after a release against the one before it.
 * `GET …/traffic/impact?at=…&at=…` answers with one per `at`, in the order
 * asked, `releaseAt` echoing it.
 */
export interface ReleaseImpact {
  releaseAt: string;
  windowMinutes: number;
  before: Omit<RangeTotals, "visitorsPer">;
  after: Omit<RangeTotals, "visitorsPer">;
  /** Paths whose errors rose, worst first. */
  paths: {
    path: string;
    errorsBefore: number;
    errorsAfter: number;
    visitorsAffected: number;
  }[];
  /** Whether it is worth a line. Decided by fixed rules, never by a model. */
  notable: boolean;
  /** How much of both windows the log covered, 0 to 1. */
  covered: number;
}

// ---------------------------------------------------------------------------
// Live: the stream a page holds open while it is showing.

export interface Arrival {
  at: number;
  kind: "view" | "request" | "bot";
  path: string;
  status: number;
  ms: number;
  country: string | null;
  source: string | null;
  device: "desktop" | "mobile" | "tablet" | null;
  /** Stable within one stream and meaningless outside it. */
  visitor: string;
}

export type LiveEvent =
  | {
      type: "state";
      state: "no-server" | "no-log" | "connecting" | "live";
    }
  | { type: "state"; state: "lost"; detail: string }
  | { type: "arrivals"; arrivals: Arrival[] }
  | {
      type: "now";
      /** Page views whose tab pinged recently; null without the script. */
      openNow: number | null;
      /** Distinct browsers in the window — an estimate. */
      recentVisitors: number;
      windowMinutes: number;
    };
