// What Pi reads about traffic: numbers it cannot misread as more than they
// are, and setup text the readers can actually read.

import { describe, expect, it } from "vitest";

import {
  KEPT_QUERY_KEYS,
  LATENCY_BUCKETS_MS,
  type Collection,
  type HourTotals,
  type TrafficDay,
} from "@/server/traffic/contract";
import { dayBounds } from "@/server/traffic/days";
import { historyOf, releaseImpact } from "@/server/traffic/merge";
import { caddyKeptField, parseLine } from "@/server/traffic/parse";
import {
  LOG_SETUP,
  setupVariant,
  trafficReading,
} from "@/server/traffic/pi-tools";

const ZONE = "Europe/Sofia";
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const noon = (day: string) => dayBounds(day, ZONE).start + 12 * HOUR;

const collection: Collection = {
  enabledAt: "2026-09-01T00:00:00.000Z",
  disabledAt: null,
  state: "live",
  detail: null,
  lastLineAt: null,
  oldestRetainedAt: null,
  scriptSince: null,
  scriptSilentSince: null,
  source: { proxy: "Caddy", format: "caddy-json" },
  storedFrom: "2026-09-25",
  logMisses: [],
};

const hour = (overrides: Partial<HourTotals> = {}): HourTotals => ({
  requests: 0,
  views: 0,
  visitors: 0,
  errors: 0,
  errorVisitors: 0,
  bots: 0,
  latency: new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0),
  errorPaths: [],
  ...overrides,
});

/** A stored day, covered in full, with its visitors seen in one hour. */
function stored(day: string, visitors: number): TrafficDay {
  const { start, end } = dayBounds(day, ZONE);
  return {
    day,
    timeZone: ZONE,
    computedAt: iso(end),
    final: true,
    coverage: { from: iso(start), to: iso(end), gaps: [] },
    viewSource: "log",
    hours: Array.from({ length: Math.ceil((end - start) / HOUR) }, (_, index) =>
      hour(
        index === 9
          ? { requests: visitors * 3, views: visitors * 2, visitors }
          : {},
      ),
    ),
    visitors,
    errorVisitors: 0,
    pages: [{ key: "/", count: visitors * 2, visitors }],
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
  };
}

describe("read_traffic", () => {
  it("gives visitors per day, never added up, and a missing day as a gap", () => {
    const reading = trafficReading(
      historyOf(
        [stored("2026-09-25", 10), stored("2026-09-27", 30)],
        "7d",
        noon("2026-09-29"),
        collection,
        ZONE,
      ),
    );
    // Two covered days of 10 and 30 are about 20 a day, not 40 people.
    expect(reading.totals).toMatchObject({
      pageViews: 80,
      estimatedVisitorsPerDay: 20,
    });
    expect(JSON.stringify(reading.totals)).not.toMatch(/"visitors"|:40\b/);
    expect(reading.lists).toMatchObject({
      pages: {
        columns: ["path", "page views", "estimated visitors per day"],
        rows: [["/", 80, 20]],
      },
    });
    const rows = reading.series.rows;
    expect(rows).toHaveLength(7);
    // Named by the local day, and a gap rather than a quiet day.
    expect(rows.find((row) => row[0] === "2026-09-26")).toEqual([
      "2026-09-26",
      0,
      "gap: not counted",
    ]);
    expect(reading.notes.join(" ")).toMatch(/Never add days together/);
  });

  it("keeps every floor a floor, and says which hours a release compared", () => {
    const slow = new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);
    slow[LATENCY_BUCKETS_MS.length] = 50;
    const whole = stored("2026-09-28", 10);
    // Counted in parts: its visitors, lists and page speed are floors or
    // samples; one list also kept only its busiest entries on another day.
    const parts: TrafficDay = {
      ...stored("2026-09-27", 30),
      hours: whole.hours.map((one, index) =>
        index === 15 ? { ...one, requests: 50, latency: slow } : one,
      ),
      vitals: [
        { path: "/", metric: "LCP", buckets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 4] },
      ],
      engagement: [{ path: "/", ms: 60_000, samples: 2 }],
      partial: ["visitors", "pages", "engagement", "vitals"],
    };
    const history = historyOf(
      [parts, whole],
      "7d",
      noon("2026-09-29"),
      collection,
      ZONE,
    );
    const release = releaseImpact(
      [parts],
      new Date(dayBounds("2026-09-27", ZONE).start + 14 * HOUR + 20 * 60_000)
        .toISOString(),
      120,
      noon("2026-09-29"),
    );
    const reading = trafficReading(history, [release]);
    expect(reading.totals).toMatchObject({
      p95ResponseMs: "at least 10000",
      estimatedVisitorsPerDay: "at least 20",
    });
    const row = reading.series.rows.find((one) => one[0] === "2026-09-27");
    expect(row?.[4]).toBe("at least 30");
    expect(row?.[8]).toBe("at least 10000");
    expect(reading.lists.pages).toMatchObject({ atLeast: true });
    expect(reading.pageSpeedP75).toEqual([["/", "LCP", "at least 10000", 4]]);
    expect(reading.releases?.[0]).toMatchObject({
      compared: {
        before: {
          from: iso(dayBounds("2026-09-27", ZONE).start + 12 * HOUR),
          to: iso(dayBounds("2026-09-27", ZONE).start + 14 * HOUR),
        },
        after: {
          from: iso(dayBounds("2026-09-27", ZONE).start + 15 * HOUR),
          to: iso(dayBounds("2026-09-27", ZONE).start + 17 * HOUR),
        },
      },
      after: { p95ResponseMs: "at least 10000" },
    });
    const notes = reading.notes.join(" ");
    expect(notes).toMatch(/only a floor/);
    expect(notes).toMatch(/Time on page and Page speed.*part of its views/);
    expect(notes).toMatch(/compared\.before/);
  });

  it("says nothing counted means nobody was counting", () => {
    const reading = trafficReading(
      historyOf(
        [],
        "24h",
        noon("2026-09-29"),
        { ...collection, state: "off", enabledAt: null },
        ZONE,
      ),
    );
    expect(reading.collection.inWords).toMatch(/Keep traffic history is off/);
    expect(
      reading.series.rows.every((row) => row[2] === "gap: not counted"),
    ).toBe(true);
    expect(reading.notes.join(" ")).toMatch(/not that nobody came/);
  });
});

describe("traffic_setup", () => {
  it("writes the nginx line the reader reads, without its query strings", () => {
    const conf = LOG_SETUP.nginx.config["/etc/nginx/conf.d/hallvi-log.conf"];
    const format = /log_format hallvi escape=json '([^']+)'/.exec(conf)![1];
    const values: Record<string, string> = {
      msec: "1790000000.123",
      host: "shop.example.com",
      request_method: "GET",
      hallvi_path: "/reset",
      arg_utm_source: "news",
      hallvi_page: "42",
      status: "200",
      request_time: "0.020",
      remote_addr: "203.0.113.9",
      http_user_agent: "Mozilla/5.0",
      hallvi_referrer: "https://shop.example.com/login",
      http_sec_fetch_dest: "document",
      sent_http_content_type: "text/html",
    };
    const line = format.replace(/\$(\w+)/g, (_, name) => values[name] ?? "");
    expect(parseLine("hallvi-json", line, { pageKey: "p" })).toMatchObject({
      host: "shop.example.com",
      path: "/reset",
      status: 200,
      ms: 20,
      kept: { utm_source: "news", p: "42" },
      referrer: "https://shop.example.com/login",
      fetchDest: "document",
    });
    // The path and the referrer are cut at the query before nginx writes them.
    expect(conf).toContain("map $request_uri $hallvi_path");
    expect(conf).toContain("map $http_referer $hallvi_referrer");
  });

  it("gives Caddy from 2.8 a field for every kept key, under the name the reader reads", () => {
    for (const variant of ["caddy", "caddy-2.8"] as const)
      for (const key of KEPT_QUERY_KEYS)
        expect(LOG_SETUP[variant].config.Caddyfile).toContain(
          `log_append ${caddyKeptField(key)} {query.${key}}`,
        );
  });

  it("keeps the request's query out of every Caddy log's response headers", () => {
    // Caddy logs response headers whole: a sign-in redirect's Location
    // carried ?next=<the path and query> into the log on a real server.
    for (const variant of ["caddy", "caddy-2.8", "caddy-2.6"] as const) {
      const text = LOG_SETUP[variant].config.Caddyfile;
      const [, pattern] = /resp_headers>Location regexp (\S+) ""/.exec(text)!;
      expect(
        "/accounts/login/?next=/x?token=y#f".replace(new RegExp(pattern), ""),
      ).toBe("/accounts/login/");
      for (const header of ["Content-Location", "Link", "Refresh"])
        expect(text).toContain(`resp_headers>${header} delete`);
    }
  });

  it("has Caddy 2.6 keep only the kept keys in the path, where the reader finds them", () => {
    // Caddy 2.6 has no log_append: its filter rewrites the logged path.
    // Go's ReplaceAllString and a global JavaScript replace agree on it.
    const [, pattern, replacement] = /request>uri regexp (\S+) (\S+)/.exec(
      LOG_SETUP["caddy-2.6"].config.Caddyfile,
    )!;
    const filtered = (uri: string) =>
      uri.replace(new RegExp(pattern, "g"), replacement);
    const uri = filtered(
      "/a&b/c?token=reset-secret&utm_campaign=spring&x=1&ref=hn&utm_source=news",
    );
    expect(uri).toBe("/a&b/c?&utm_campaign=spring&ref=hn&utm_source=news");
    const line = JSON.stringify({
      logger: "http.log.access.log0",
      ts: 1790000000.5,
      status: 200,
      duration: 0.01,
      request: { host: "shop.example.com", method: "GET", uri },
    });
    expect(parseLine("caddy-json", line)).toMatchObject({
      path: "/a&b/c",
      kept: { utm_campaign: "spring", ref: "hn", utm_source: "news" },
    });
    expect(filtered("/?token=reset-secret")).toBe("/?");
  });

  it("gives each installed version its own text, never an upgrade", () => {
    const picked = (proxy: "caddy" | "nginx" | "traefik", version: string) => {
      const chosen = setupVariant(proxy, version);
      return "variant" in chosen ? chosen.variant : "unsupported";
    };
    // As each prints it: Debian's Caddy, the official build, nginx -v.
    expect(picked("caddy", "2.6.2")).toBe("caddy-2.6");
    expect(picked("caddy", "v2.7.6 h1:abc=")).toBe("caddy-2.6");
    expect(picked("caddy", "v2.8.4 h1:abc=")).toBe("caddy-2.8");
    expect(picked("caddy", "v2.10.2 h1:abc=")).toBe("caddy-2.8");
    expect(picked("caddy", "v2.11.4 h1:abc=")).toBe("caddy");
    expect(picked("caddy", "v2.12.0")).toBe("caddy");
    expect(picked("caddy", "v2.5.2")).toBe("caddy-2.6");
    expect(picked("caddy", "v2.4.6")).toBe("unsupported");
    expect(picked("caddy", "")).toBe("unsupported");
    expect(picked("nginx", "nginx version: nginx/1.24.0 (Ubuntu)")).toBe(
      "nginx",
    );
    expect(picked("nginx", "nginx version: nginx/1.10.3")).toBe("unsupported");
    expect(picked("traefik", "Version:      2.11.3")).toBe("traefik");
  });
});
