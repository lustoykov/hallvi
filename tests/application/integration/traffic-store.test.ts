// traffic.db: a recount takes a stored day's place only when it should, a
// restart counts the day again rather than adding to it, and nothing is
// written while traffic history is off.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TrafficDay, TrafficLine } from "@/server/traffic/contract";
import { countDay, DayCounter } from "@/server/traffic/count";
import { dayBounds } from "@/server/traffic/days";
import {
  collectionOf,
  forget,
  readDays,
  recordCollector,
  setCollection,
  trafficDatabasePath,
  writeDay,
} from "@/server/traffic/store";

const DAY = "2026-09-29";
const ZONE = "Europe/Sofia";
const { start, end } = dayBounds(DAY, ZONE);
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-traffic-store-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "hallvi.db"));
});

afterAll(() => {
  globalThis.__hallviTraffic?.client.close();
  globalThis.__hallviTraffic = undefined;
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

/** A day as counted, covering its first `hours` hours. */
function counted(hours: number, final: boolean): TrafficDay {
  return countDay([], {
    day: DAY,
    timeZone: ZONE,
    scriptSince: null,
    coverage: { from: iso(start), to: iso(start + hours * HOUR), gaps: [] },
    now: final ? end + HOUR : start + hours * HOUR,
  });
}

function view(at: number, address: string): TrafficLine {
  return {
    at,
    host: "shop.example",
    method: "GET",
    path: "/",
    kept: {},
    status: 200,
    ms: 30,
    address,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    referrer: null,
    fetchDest: "document",
    fetchMode: "navigate",
    purpose: null,
    contentType: "text/html",
    cdnCountry: null,
  };
}

describe("traffic.db", () => {
  it("keeps a recount only when it covers at least as much, and never a provisional one over a final one", () => {
    setCollection("replacing", "keep");
    const kept = () => readDays("replacing", DAY, DAY)[0];
    expect(writeDay("replacing", counted(12, false))).toBe(true);
    // Today is recounted whenever the collector starts: always the latest.
    expect(writeDay("replacing", counted(6, false))).toBe(true);
    expect(kept().coverage.to).toBe(iso(start + 6 * HOUR));
    expect(writeDay("replacing", counted(20, true))).toBe(true);
    expect(writeDay("replacing", counted(24, false))).toBe(false);
    expect(writeDay("replacing", counted(10, true))).toBe(false);
    expect(kept()).toMatchObject({
      final: true,
      coverage: { to: iso(start + 20 * HOUR) },
    });
    expect(writeDay("replacing", counted(24, true))).toBe(true);
    expect(kept().coverage.to).toBe(iso(end));
  });

  it("counts a day again after a restart, and never adds to what it stored", () => {
    setCollection("restarted", "keep");
    const lines = Array.from({ length: 40 }, (_, index) =>
      view(start + 8 * HOUR + index * 60_000, `203.0.113.${index % 7}`),
    );
    const now = start + 9 * HOUR;
    const options = {
      day: DAY,
      timeZone: ZONE,
      scriptSince: null,
      coverage: { from: iso(start), to: iso(now), gaps: [] },
    };
    // Following the log, then stopped part way through the day.
    const before = new DayCounter(options);
    for (const line of lines.slice(0, 25)) before.add(line);
    writeDay("restarted", before.day({ now }));
    // On restart the collector counts today again from the log, which still
    // holds every line, the ones already counted included.
    const after = new DayCounter(options);
    for (const line of lines) after.add(line);
    writeDay("restarted", after.day({ now }));
    const [stored] = readDays("restarted", DAY, DAY);
    expect(stored).toEqual(countDay(lines, { ...options, now }));
    expect(stored.hours[8].views).toBe(40);
    expect(stored.visitors).toBe(7);
  });

  it("never stores a page's query or fragment, even from a forged event", () => {
    setCollection("forged", "keep");
    const at = start + 10 * HOUR;
    const event = (payload: object) =>
      `/_hv/e/1/${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
    const beacon = (path: string, offset: number): TrafficLine => ({
      ...view(at + offset, "203.0.113.9"),
      method: "POST",
      path,
      status: 204,
      fetchDest: "empty",
      fetchMode: "no-cors",
      contentType: null,
    });
    const s = "a1b2c3d4e5f6a7b8";
    const lines = [
      view(at, "203.0.113.9"),
      beacon(event({ t: "view", s, p: "/reset?token=x#y" }), 1000),
      beacon(event({ t: "leave", s, p: "/reset#token=x", e: 5000 }), 2000),
      beacon(event({ t: "error", s, p: "/reset?token=x" }), 3000),
    ];
    const options = {
      day: DAY,
      timeZone: ZONE,
      scriptSince: null,
      coverage: { from: iso(start), to: iso(end), gaps: [] },
      now: end + HOUR,
    };
    expect(writeDay("forged", countDay(lines, options))).toBe(true);
    const [kept] = readDays("forged", DAY, DAY);
    // Malformed events are nothing at all: not a view, not a switch.
    expect(kept.viewSource).toBe("log");
    expect(kept.pages).toEqual([{ key: "/", count: 1, visitors: 1 }]);
    expect(JSON.stringify(kept)).not.toMatch(/token|reset/);
  });

  it("writes nothing while collection is off, and forgetting ends it", () => {
    expect(writeDay("owner", counted(24, true))).toBe(false);
    expect(collectionOf("owner")).toMatchObject({
      enabledAt: null,
      state: "off",
      storedFrom: null,
    });
    setCollection("owner", "keep");
    expect(writeDay("owner", counted(24, true))).toBe(true);
    expect(recordCollector("owner", { state: "live" })).toMatchObject({
      state: "live",
      storedFrom: DAY,
    });
    // Stopping keeps the totals and what was seen, and a collector that has
    // not stopped yet can neither write nor say it is live.
    const stopped = setCollection("owner", "stop");
    expect(stopped).toMatchObject({ enabledAt: null, state: "off" });
    expect(stopped.disabledAt).not.toBeNull();
    expect(writeDay("owner", counted(24, true))).toBe(false);
    expect(recordCollector("owner", { state: "live" }).state).toBe("off");
    expect(readDays("owner", DAY, DAY)).toHaveLength(1);
    forget("owner");
    expect(readDays("owner", DAY, DAY)).toEqual([]);
    expect(collectionOf("owner")).toMatchObject({
      enabledAt: null,
      disabledAt: null,
      storedFrom: null,
    });
    // Another application's totals are untouched.
    expect(readDays("restarted", DAY, DAY)).toHaveLength(1);
    expect(existsSync(trafficDatabasePath())).toBe(true);
  });
});
