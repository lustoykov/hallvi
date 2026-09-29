// The collector's coverage: a finished day says from when to when the log
// answered for it, and names every stretch it could not, with why; and a
// recount takes the place of what was stored only for the stretches it
// answers for. The rest of the collector — restart is a recount, nothing
// counted twice, rotation, deletion and a lost connection — is proved against
// real Caddy and sshd (the report linked in docs/architecture.md), and
// the day's close in integration/traffic-day-close.test.ts.

import { describe, expect, it } from "vitest";

import { combined, readCoverage } from "@/server/traffic/collector";
import type { TrafficDay, TrafficLine } from "@/server/traffic/contract";
import { countDay } from "@/server/traffic/count";

const at = (time: string) => Date.parse(`2026-09-29T${time}Z`);
const day = { start: at("00:00:00"), end: Date.parse("2026-09-30T00:00:00Z") };
const iso = (ms: number) => new Date(ms).toISOString();

describe("a recount against what was stored", () => {
  // A page load every ten minutes, at :05, :15 … :55, from seven browsers.
  const lines: TrafficLine[] = Array.from({ length: 144 }, (_, index) => ({
    at: day.start + index * 600_000 + 300_000,
    host: "shop.example",
    method: "GET",
    path: "/",
    kept: {},
    status: 200,
    ms: 30,
    address: `203.0.113.${index % 7}`,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    referrer: null,
    fetchDest: "document",
    fetchMode: "navigate",
    purpose: null,
    contentType: "text/html",
    cdnCountry: null,
  }));
  /** What the follow stored before it stopped at `to`, provisional. */
  const stored = (from: string, to: string): TrafficDay =>
    countDay(
      lines.filter((line) => line.at >= at(from) && line.at < at(to)),
      {
        day: "2026-09-29",
        timeZone: "UTC",
        scriptSince: null,
        coverage: { from: iso(at(from)), to: iso(at(to)), gaps: [] },
        now: at(to),
      },
    );
  /** A recount of the files, which hold only `from` to `to` of the day. */
  const recount = (from: string, to = day.end) =>
    countDay(
      lines.filter((line) => line.at >= at(from) && line.at < to),
      {
        day: "2026-09-29",
        timeZone: "UTC",
        scriptSince: null,
        coverage: readCoverage(
          day,
          { covered: [{ from: at(from), to }], unreadable: [] },
          day.start,
        ),
        now: day.end + 3_600_000,
      },
    );
  const requests = (counted: TrafficDay) =>
    counted.hours.reduce((sum, hour) => sum + hour.requests, 0);

  it("takes the recount when it answers for everything stored", () => {
    const again = recount("00:00:00");
    expect(combined(stored("06:00:00", "12:00:00"), again, day)).toBe(again);
  });

  it("keeps what was stored when the log has since lost part of it", () => {
    const kept = combined(
      stored("00:00:00", "18:00:00"),
      recount("06:00:00", at("12:00:00")),
      day,
    );
    expect(requests(kept)).toBe(108);
    // After its last moment Hallvi was not following, and nothing holds it.
    expect(kept.coverage).toEqual({
      from: iso(day.start),
      to: iso(at("18:00:00")),
      gaps: [
        { from: iso(at("18:00:00")), to: iso(day.end), why: "hallvi-off" },
      ],
    });
  });

  it("takes each hour from whichever answers for it when each holds what the other does not", () => {
    // Stored to 18:30, the files from 18:15: comparing how long each covers
    // kept the stored day and lost the evening.
    const both = combined(
      stored("00:00:00", "18:30:00"),
      recount("18:15:00"),
      day,
    );
    // 18:00–18:15 is the recount's hour's, and it no longer holds 18:05.
    expect(requests(both)).toBe(143);
    expect(both.hours[18].requests).toBe(5);
    expect(both.coverage).toEqual({
      from: iso(day.start),
      to: iso(day.end),
      gaps: [
        {
          from: iso(at("18:00:00")),
          to: iso(at("18:15:00")),
          why: "log-rotated",
        },
      ],
    });
    // A list is not hourly: the larger count, a floor and never a sum.
    expect(both.pages).toEqual([{ key: "/", count: 111, visitors: 7 }]);
    expect(both.visitors).toBe(7);

    // Two halves of equal length: the later one no longer replaces the
    // earlier.
    const halves = combined(
      stored("00:00:00", "12:00:00"),
      recount("12:00:00"),
      day,
    );
    expect(requests(halves)).toBe(144);
    expect(halves.coverage.gaps).toEqual([]);
  });
});

describe("a finished day's coverage", () => {
  it("names what the log no longer holds, and what it could not read", () => {
    const coverage = readCoverage(
      day,
      {
        covered: [
          { from: at("06:00:00"), to: at("12:00:00") },
          { from: at("14:00:00"), to: day.end },
        ],
        unreadable: [{ from: at("12:00:00"), to: at("13:00:00") }],
      },
      at("03:00:00"),
    );
    expect(coverage).toEqual({
      from: "2026-09-29T06:00:00.000Z",
      to: "2026-09-30T00:00:00.000Z",
      gaps: [
        // Before the owner chose to keep history, it was not being kept.
        {
          from: "2026-09-29T00:00:00.000Z",
          to: "2026-09-29T03:00:00.000Z",
          why: "not-collecting",
        },
        // After, the log rotated it away before it was read.
        {
          from: "2026-09-29T03:00:00.000Z",
          to: "2026-09-29T06:00:00.000Z",
          why: "log-rotated",
        },
        {
          from: "2026-09-29T12:00:00.000Z",
          to: "2026-09-29T13:00:00.000Z",
          why: "unreadable",
        },
        {
          from: "2026-09-29T13:00:00.000Z",
          to: "2026-09-29T14:00:00.000Z",
          why: "log-rotated",
        },
      ],
    });
  });

  it("stores a day the log no longer holds as a gap, never as zeros", () => {
    expect(
      readCoverage(day, { covered: [], unreadable: [] }, at("00:00:00")),
    ).toEqual({
      from: null,
      to: null,
      gaps: [
        {
          from: "2026-09-29T00:00:00.000Z",
          to: "2026-09-30T00:00:00.000Z",
          why: "log-rotated",
        },
      ],
    });
  });
});
