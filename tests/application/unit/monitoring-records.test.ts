// Monitoring, read from records.
//
// One claim runs through every case: a check that ran once and passed is not
// monitoring. This page's whole job is to say whether you would hear about a
// problem, so it must never let a green result imply that you would.

import { beforeEach, describe, expect, it } from "vitest";

import {
  monitoringFromRecords,
  watchingFromRecords,
} from "@/components/hallvi/monitoring-records";
import {
  APP,
  NOW,
  check,
  fact,
  resetRecordIds,
  states,
  topology,
} from "../fixtures/records";

const read = (
  records: Parameters<typeof monitoringFromRecords>[0]["records"],
) =>
  monitoringFromRecords({
    records,
    applicationId: APP,
    applicationName: "Shop",
    now: NOW,
  });

beforeEach(resetRecordIds);

describe("monitoringFromRecords", () => {
  it("has nothing to age when nothing has been checked", () => {
    const story = read([]);
    expect(story.looks).toEqual([]);
    expect(story.watcher).toBeNull();
  });

  it("says nothing is watching even when every check passed", () => {
    // The failure this prevents: a wall of green that lets a reader conclude
    // they would be told if it broke.
    const story = read([
      topology([{ id: "app", kind: "web" }]),
      states(
        { kind: "process", id: "app" },
        { checks: [check("http", "passed", "liveness")] },
      ),
    ]);
    expect(story.looks[0].state).toBe("passing");
    expect(story.watcher).toBeNull();
    expect(story.unwatched[0].id).toBe("watch");
    expect(story.unwatched[0].detail).toMatch(/nothing would tell you/);
  });

  it("reads a check past its horizon as unknown, not as failing", () => {
    const story = read([
      topology([{ id: "app", kind: "web" }]),
      states(
        { kind: "process", id: "app" },
        {
          at: "2026-09-13T09:00:00.000Z",
          checks: [check("http", "passed", "liveness")],
        },
      ),
    ]);
    expect(story.looks[0].state).toBe("unknown");
  });

  it("reports a watcher, what it watches and who it tells", () => {
    const story = read([
      states(
        { kind: "monitor", id: "uptime" },
        {
          facts: [
            fact("target", "https://shop.example"),
            fact("interval", "60 s"),
            fact("notifies", "lyubomir@example.com"),
          ],
          checks: [check("answering", "passed", "liveness")],
        },
      ),
    ]);
    expect(story.watcher?.state).toBe("running");
    expect(story.watcher?.detail).toContain("Watches shop.example");
    expect(story.watcher?.detail).toContain("tells lyubomir@example.com");
  });

  it("says so when a watcher was recorded as not in place", () => {
    const story = read([
      states({ kind: "monitor", id: "uptime" }, { presence: "absent" }),
    ]);
    expect(story.watcher?.state).toBe("not-running");
    expect(story.watcher?.detail).toMatch(/Nothing is watching/);
  });

  it("names a watcher that has gone quiet without calling it broken", () => {
    const story = read([
      states(
        { kind: "monitor", id: "uptime" },
        {
          at: "2026-09-13T09:00:00.000Z",
          checks: [check("answering", "passed", "liveness")],
        },
      ),
    ]);
    expect(story.watcher?.state).toBe("stale");
    expect(story.watcher?.hostReachable).toBeNull();
  });

  it("draws a part on the map that nothing has stated as a gap", () => {
    const story = read([
      topology([
        { id: "app", kind: "web" },
        { id: "cache", kind: "private", name: "Redis" },
      ]),
      states(
        { kind: "process", id: "app" },
        { checks: [check("http", "passed", "liveness")] },
      ),
    ]);
    expect(story.parts).toEqual(["app"]);
    expect(story.unwatched.some((gap) => gap.id === "unstated:cache")).toBe(
      true,
    );
  });

  it("distinguishes stated-but-never-checked from never-stated", () => {
    const story = read([
      topology([{ id: "app", kind: "web" }]),
      states({ kind: "process", id: "app" }),
    ]);
    const gap = story.unwatched.find((item) => item.id === "unlooked:app");
    expect(gap?.detail).toMatch(/on record as being there/);
  });

  it("shows the host's own measurements as readings, not as checks", () => {
    const story = read([
      states(
        { kind: "host", id: "hetzner-1" },
        {
          facts: [
            fact("cpu-used", "4%", "contents"),
            fact("memory-used", "1.2 of 4 GB", "contents"),
          ],
        },
      ),
    ]);
    const readings = story.looks.filter((look) => look.kind === "output");
    expect(readings.map((look) => look.short)).toEqual([
      "cpu-used 4%",
      "memory-used 1.2 of 4 GB",
    ]);
    expect(readings.every((look) => look.state === "seen")).toBe(true);
  });
});

describe("capacity is not a reading", () => {
  it("ignores the spec sheet a host was sold with", () => {
    // The first real run recorded memory "4 GB" as configuration/reported —
    // what the machine has. Showing that on a page about whether anything is
    // watching would be a spec sheet presented as a measurement.
    const story = monitoringFromRecords({
      records: [
        states(
          { kind: "host", id: "hetzner-4201" },
          {
            facts: [
              fact("memory", "4 GB", "configuration", "reported"),
              fact("disk", "40 GB", "configuration", "reported"),
            ],
          },
        ),
      ],
      applicationId: APP,
      applicationName: "Shop",
      now: NOW,
    });
    expect(story.looks.filter((look) => look.kind === "output")).toEqual([]);
  });
});

describe("watchingFromRecords", () => {
  const watch = (records: Parameters<typeof read>[0]) =>
    watchingFromRecords(records, APP, read(records), NOW);

  it("names a part and words its checks, with how long a pass counts", () => {
    const { parts, counts } = watch([
      topology([{ id: "c-1f9", kind: "web", name: "Shop" }]),
      states(
        { kind: "process", id: "c-1f9" },
        { checks: [check("http", "passed", "liveness")] },
      ),
    ]);
    expect(parts[0]).toMatchObject({
      name: "Shop",
      kindWord: "Web app",
      state: "counts",
      watched: false,
    });
    expect(parts[0].looks[0]).toMatchObject({
      title: "Answers web requests",
      state: "counts",
      // Checked five minutes ago, and liveness counts for fifteen.
      left: 10 * 60_000,
    });
    expect(counts).toEqual({ counts: 1, expired: 0, failed: 0 });
  });

  it("expires a pass rather than failing it, and ghosts what nobody stated", () => {
    const { parts, ghosts, counts } = watch([
      topology([
        { id: "app", kind: "web" },
        { id: "files", kind: "volume" },
      ]),
      states(
        { kind: "process", id: "app" },
        {
          at: "2026-09-13T09:00:00.000Z",
          checks: [check("http", "passed", "liveness")],
        },
      ),
    ]);
    expect(parts[0].state).toBe("expired");
    expect(counts).toEqual({ counts: 0, expired: 1, failed: 0 });
    expect(ghosts.map((gap) => gap.id)).toEqual(["unstated:files"]);
  });

  it("marks the web part watched only while a watcher is running", () => {
    const records = [
      topology([{ id: "app", kind: "web" }]),
      states(
        { kind: "process", id: "app" },
        { checks: [check("http", "failed", "liveness")] },
      ),
      states(
        { kind: "monitor", id: "uptime" },
        { checks: [check("answering", "passed", "liveness")] },
      ),
    ];
    const { parts } = watch(records);
    expect(parts[0]).toMatchObject({ state: "failed", watched: true });
  });
});
