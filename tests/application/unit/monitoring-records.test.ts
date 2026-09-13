// Monitoring, read from records.
//
// One claim runs through every case: a check that ran once and passed is not
// monitoring. This page's whole job is to say whether you would hear about a
// problem, so it must never let a green result imply that you would.

import { beforeEach, describe, expect, it } from "vitest";

import { monitoringFromRecords } from "@/components/server-guy/monitoring-records";
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

  it("keeps a failure failing however old it is", () => {
    const story = read([
      topology([{ id: "app", kind: "web" }]),
      states(
        { kind: "process", id: "app" },
        {
          at: "2026-09-01T09:00:00.000Z",
          checks: [check("http", "failed", "liveness")],
        },
      ),
    ]);
    expect(story.looks[0].state).toBe("failing");
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
    expect(story.watcher?.detail).toContain("Watches https://shop.example");
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
            fact("cpu", "4%", "contents"),
            fact("memory", "1.2 of 4 GB", "contents"),
          ],
        },
      ),
    ]);
    const readings = story.looks.filter((look) => look.kind === "output");
    expect(readings.map((look) => look.short)).toEqual([
      "cpu 4%",
      "memory 1.2 of 4 GB",
    ]);
    expect(readings.every((look) => look.state === "seen")).toBe(true);
  });

  it("never invents a reading", () => {
    const story = read([
      topology([{ id: "app", kind: "web" }]),
      states(
        { kind: "process", id: "app" },
        { checks: [check("http", "passed", "liveness")] },
      ),
    ]);
    expect(story.looks.every((look) => !look.invented)).toBe(true);
  });
});
