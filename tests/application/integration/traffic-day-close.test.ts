// A day's close, driven by the collector's own clock: the follow keeps
// writing the day that just ended as it runs past midnight, and ten minutes
// later the day is counted again from the files. Only that recount may make
// it final — a provisional write at the same moment once did, and the day
// kept the one request the follow saw of the two the log held.
//
// The server is a stand-in (the files and the follow are in memory); the
// collector, its timers, the counting and traffic.db are real.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TrafficLine } from "@/server/traffic/contract";

const server = vi.hoisted(() => ({
  /** Every line the log holds. */
  log: [] as TrafficLine[],
  /** The lines the follow hands on: one was lost on the way. */
  followed: [] as TrafficLine[],
  /** When the log holds nothing, a listing is empty. */
  oldest: 0 as number | null,
  reads: [] as { from: number; to: number }[],
  push: (() => {}) as (line: TrafficLine) => void,
}));
vi.mock("@/server/db", async (actual) => ({
  ...(await actual<typeof import("@/server/db")>()),
  listApplications: () => [{ id: "app" }],
}));
vi.mock("@/server/operator-execution", () => ({
  operatorSettings: () => ({
    host: {
      address: "server.test",
      user: "hallvi",
      port: 22,
      privateKeyPath: "/test/key",
      knownHostsPath: "/test/hosts",
    },
  }),
}));
vi.mock("@/server/access-log", () => ({
  accessLogRecord: () => ({
    kind: "access-log",
    proxy: "Caddy",
    format: "caddy-json",
    source: { type: "file", path: "/var/log/caddy/access.log" },
    hosts: ["shop.example"],
  }),
}));
vi.mock("@/server/traffic/sources", () => ({
  listLog: async () =>
    server.oldest === null
      ? []
      : [
          {
            name: "access.log",
            from: server.oldest,
            to: Date.now() + 1000,
            bytes: 1,
            modified: Date.now(),
            inode: "1",
          },
        ],
  readLog: async (
    _host: unknown,
    _log: unknown,
    range: { from: number; to: number },
    onLine: (line: TrafficLine) => void,
  ) => {
    server.reads.push(range);
    for (const line of server.log)
      if (line.at >= range.from && line.at < range.to) onLine(line);
    return { covered: [range], unreadable: [] };
  },
  followLog: (
    _host: unknown,
    _log: unknown,
    _files: unknown,
    since: number,
    on: { line: (line: TrafficLine) => void; ready?: () => void },
    signal: AbortSignal,
  ) =>
    new Promise((resolve) => {
      on.ready?.();
      for (const line of server.followed) if (line.at >= since) on.line(line);
      server.push = on.line;
      signal.addEventListener("abort", () =>
        resolve({ exitCode: null, said: "", moved: null }),
      );
    }),
}));

import { trafficCollector } from "@/server/traffic/collector";
import { FINAL_AFTER_MS, LOOKBACK_MS } from "@/server/traffic/count";
import { controllerTimeZone, dayBounds, dayOf } from "@/server/traffic/days";
import { readDays, setCollection } from "@/server/traffic/store";

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-traffic-close-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "hallvi.db"));
});
afterAll(() => {
  vi.useRealTimers();
  globalThis.__hallviTraffic?.client.close();
  globalThis.__hallviTraffic = undefined;
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const request = (at: number): TrafficLine => ({
  at,
  host: "shop.example",
  method: "GET",
  path: "/api/cart",
  kept: {},
  status: 200,
  ms: 12,
  address: "203.0.113.9",
  userAgent: "curl/8.5.0",
  referrer: null,
  fetchDest: null,
  fetchMode: null,
  purpose: null,
  contentType: "application/json",
  cdnCountry: null,
});

describe("a day's close", () => {
  it("counts the day again from the files, whatever the follow wrote at the same moment", async () => {
    const zone = controllerTimeZone();
    const day = dayOf(Date.parse("2026-09-29T12:00:00Z"), zone);
    const { start, end } = dayBounds(day, zone);
    const stored = () => readDays("app", day, day)[0];
    const requests = () =>
      stored().hours.reduce((sum, hour) => sum + hour.requests, 0);

    vi.useFakeTimers({ now: end - 60_000 });
    setCollection("app", "keep");
    server.oldest = start;
    server.log = [request(end - 50_000), request(end - 40_000)];
    server.followed = [server.log[0]];

    const stop = new AbortController();
    const collector = trafficCollector(stop.signal);
    collector.tick();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(stored()).toMatchObject({ final: false });
    expect(requests()).toBe(1);

    // Past midnight the day is still written as the follow saw it, and never
    // as final, however late.
    await vi.advanceTimersByTimeAsync(end + FINAL_AFTER_MS - 300 - Date.now());
    expect(stored().final).toBe(false);
    expect(server.reads).toEqual([]);

    // A request of the new day, so a write is due at the very tick the day
    // closes.
    server.push(request(Date.now()));
    await vi.advanceTimersByTimeAsync(1_000);
    // From a few minutes before the day, for what the log counted there.
    expect(server.reads).toEqual([{ from: start - LOOKBACK_MS, to: end }]);
    expect(stored().final).toBe(true);
    expect(requests()).toBe(2);
    expect(stored().coverage).toEqual({
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      gaps: [],
    });

    stop.abort();
    await collector.stop();
  });

  it("counts the day again when the log was empty as the follow began", async () => {
    const zone = controllerTimeZone();
    const day = dayOf(Date.parse("2026-10-02T12:00:00Z"), zone);
    const { start, end } = dayBounds(day, zone);
    const stored = () => readDays("app", day, day)[0];
    const requests = () =>
      stored().hours.reduce((sum, hour) => sum + hour.requests, 0);

    // A container that has written nothing yet: its listing is empty.
    vi.useFakeTimers({ now: end - 60_000 });
    server.oldest = null;
    server.log = [];
    server.followed = [];
    server.reads = [];
    const stop = new AbortController();
    const collector = trafficCollector(stop.signal);
    collector.tick();
    await vi.advanceTimersByTimeAsync(2_000);

    // Then traffic, of which the follow saw one request of two.
    server.log = [request(end - 50_000), request(end - 40_000)];
    server.oldest = end - 50_000;
    server.push(server.log[0]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(requests()).toBe(1);

    await vi.advanceTimersByTimeAsync(end + FINAL_AFTER_MS + 1_000 - Date.now());
    expect(server.reads).toEqual([{ from: start - LOOKBACK_MS, to: end }]);
    expect(stored().final).toBe(true);
    expect(requests()).toBe(2);

    stop.abort();
    await collector.stop();
  });
});
