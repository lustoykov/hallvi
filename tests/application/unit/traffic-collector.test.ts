// The collector's coverage: a finished day says from when to when the log
// answered for it, and names every stretch it could not, with why. The rest
// of the collector — restart is a recount, nothing counted twice, rotation,
// deletion and a lost connection — is proved against real Caddy and sshd in
// docs/testing/2026-09-29-traffic-collection.md.

import { describe, expect, it } from "vitest";

import { readCoverage } from "@/server/traffic/collector";

const at = (time: string) => Date.parse(`2026-09-29T${time}Z`);
const day = { start: at("00:00:00"), end: Date.parse("2026-09-30T00:00:00Z") };

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
