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
import { historyOf } from "@/server/traffic/merge";
import { caddyKeptField, parseLine } from "@/server/traffic/parse";
import { LOG_SETUP, trafficReading } from "@/server/traffic/pi-tools";

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
    expect(
      rows.find((row) => row[0] === iso(dayBounds("2026-09-26", ZONE).start)),
    ).toEqual([
      iso(dayBounds("2026-09-26", ZONE).start),
      0,
      "gap: not counted",
    ]);
    expect(reading.notes.join(" ")).toMatch(/Never add days together/);
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

  it("gives Caddy a field for every kept key, under the name the reader reads", () => {
    for (const key of KEPT_QUERY_KEYS)
      expect(LOG_SETUP.caddy.config.Caddyfile).toContain(
        `log_append ${caddyKeptField(key)} {query.${key}}`,
      );
  });
});
