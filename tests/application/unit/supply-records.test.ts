// Cache & queue, Jobs, Environment Variables and CDN, read from records.
//
// The two rules that matter most are tested as leaks rather than features: a
// variable never carries a value, and a next run is recorded rather than
// computed from a cron string against a timezone we are guessing at.

import { beforeEach, describe, expect, it } from "vitest";

import { supplyFromRecords } from "@/components/server-guy/supply-records";
import type { SecretRequest } from "@/components/server-guy/secret-request";
import {
  APP,
  NOW,
  check,
  fact,
  resetRecordIds,
  states,
  topology,
} from "../fixtures/records";

type Records = Parameters<typeof supplyFromRecords>[0]["records"];

const read = (records: Records, secrets: SecretRequest[] = []) =>
  supplyFromRecords({
    records,
    applicationId: APP,
    applicationName: "Shop",
    secrets,
    now: NOW,
  });

beforeEach(resetRecordIds);

describe("cache and queue", () => {
  it("says nobody looked when nothing names one", () => {
    const story = read([]);
    expect(story.brokers).toEqual([]);
    expect(story.queues).toEqual([]);
  });

  it("draws the broker and its port", () => {
    const story = read([
      states(
        { kind: "cache", id: "redis" },
        {
          facts: [
            fact("engine", "Redis"),
            fact("version", "7.4"),
            fact("port", "6379"),
            fact("persistence", "Append-only file"),
          ],
        },
      ),
    ]);
    expect(story.brokers[0].product).toBe("Redis 7.4");
    expect(story.brokers[0].reach).toBe("Port 6379 · inside the server only");
    expect(story.brokers[0].persistence).toBe("Append-only file");
  });

  it("leaves an unmeasured queue unmeasured rather than empty", () => {
    // A queue nobody has measured is not a queue with nothing in it, and the
    // difference is the whole reason to draw the page.
    const story = read([
      states(
        { kind: "queue", id: "default" },
        { facts: [fact("library", "Sidekiq"), fact("backend", "Redis")] },
      ),
    ]);
    expect(story.queues[0].backlog).toBeNull();
    expect(story.queues[0].at).toBeNull();
  });

  it("reads a measured depth with the time it was measured", () => {
    const at = "2026-09-13T11:40:00.000Z";
    const story = read([
      states(
        { kind: "queue", id: "default" },
        {
          at,
          facts: [
            fact("library", "Sidekiq"),
            fact("depth", "12", "contents"),
            fact("oldest", "90 s", "contents"),
            fact("workers", "worker-a worker-b"),
          ],
        },
      ),
    ]);
    expect(story.queues[0].backlog).toBe(12);
    expect(story.queues[0].oldestSeconds).toBe(90);
    expect(story.queues[0].workers).toEqual(["worker-a", "worker-b"]);
    expect(story.queues[0].at).toBe(at);
  });

  it("drops a broker a record says is gone", () => {
    expect(
      read([states({ kind: "cache", id: "redis" }, { presence: "absent" })])
        .brokers,
    ).toEqual([]);
  });
});

describe("jobs", () => {
  const job = (extra: object = {}) =>
    states({ kind: "job", id: "nightly-report" }, extra);

  it("never computes the next run from the schedule", () => {
    const story = read([
      job({
        facts: [fact("schedule", "0 3 * * *"), fact("command", "rake r")],
      }),
    ]);
    expect(story.jobs[0].schedule).toBe("0 3 * * *");
    // A cron string parsed against a timezone we are guessing at gives a
    // confident time that is wrong twice a year.
    expect(story.jobs[0].nextAt).toBeNull();
  });

  it("uses the next run Pi recorded when it recorded one", () => {
    const story = read([
      job({
        facts: [
          fact("schedule", "0 3 * * *"),
          fact(
            "next-run",
            "2026-09-14T03:00:00.000Z",
            "configuration",
            "planned",
          ),
        ],
      }),
    ]);
    expect(story.jobs[0].nextAt).toBe("2026-09-14T03:00:00.000Z");
  });

  it("reads the last outcome from the ran check, and the series as runs", () => {
    const story = read([
      job({
        at: "2026-09-11T03:00:00.000Z",
        checks: [check("ran", "failed", "liveness")],
      }),
      job({
        at: "2026-09-12T03:00:00.000Z",
        checks: [check("ran", "passed", "liveness")],
      }),
    ]);
    expect(story.jobs[0].last).toEqual({
      outcome: "succeeded",
      at: "2026-09-12T03:00:00.000Z",
      seconds: null,
    });
    expect(story.runs.map((run) => run.outcome)).toEqual([
      "succeeded",
      "failed",
    ]);
  });
});

describe("environment variables", () => {
  it("shows a name and its source, and has nowhere to hold a value", () => {
    const story = read([
      states(
        { kind: "variable", id: "DATABASE_URL" },
        {
          facts: [
            fact("source", "Written by the release"),
            fact("scope", "web"),
          ],
        },
      ),
    ]);
    expect(story.values[0].name).toBe("DATABASE_URL");
    expect(story.values[0].where).toBe("Written by the release");
    expect(JSON.stringify(story.values[0])).not.toMatch(/value/i);
  });

  it("lists something asked for before any record names it", () => {
    // The request is itself evidence: the page should show the gap without
    // waiting for Pi to write a record about a value it has not been given.
    const story = read(
      [],
      [
        {
          name: "GF_SECURITY_ADMIN_PASSWORD",
          why: "Grafana will not start without one.",
          process: "grafana",
          requestedAt: "2026-09-13T11:00:00.000Z",
          establishedAt: null,
        },
      ],
    );
    expect(story.waiting).toEqual([
      {
        name: "GF_SECURITY_ADMIN_PASSWORD",
        reason: "Grafana will not start without one.",
      },
    ]);
    expect(story.values[0].pending).toBe(true);
    expect(story.values[0].held).toBe(true);
  });

  it("stops waiting once the owner has supplied it", () => {
    const story = read(
      [],
      [
        {
          name: "GF_SECURITY_ADMIN_PASSWORD",
          why: "Grafana will not start without one.",
          process: null,
          requestedAt: "2026-09-13T11:00:00.000Z",
          establishedAt: "2026-09-13T11:05:00.000Z",
        },
      ],
    );
    expect(story.waiting).toEqual([]);
    expect(story.values[0].pending).toBe(false);
    expect(story.values[0].where).toMatch(/sealed on this computer/);
  });
});

describe("cdn", () => {
  it("says nobody looked rather than that nothing caches", () => {
    expect(read([]).cdn).toEqual({
      on: false,
      provider: null,
      origin: null,
      concern: null,
      originReachable: "unchecked",
      detail: "Nobody has looked at whether a cache sits in front.",
    });
  });

  it("says nothing caches only when a record says so", () => {
    const story = read([
      states({ kind: "cdn", id: "front" }, { presence: "absent" }),
    ]);
    expect(story.cdn.on).toBe(false);
    expect(story.cdn.detail).toBe(
      "Nothing caches in front of this application.",
    );
  });

  it("reads a live CDN and what it covers", () => {
    const story = read([
      states(
        { kind: "cdn", id: "front" },
        {
          facts: [
            fact("provider", "Cloudflare"),
            fact("covers", "Static assets"),
          ],
          checks: [check("caching", "passed")],
        },
      ),
    ]);
    expect(story.cdn).toEqual({
      on: true,
      provider: "Cloudflare",
      origin: null,
      concern: null,
      originReachable: "unchecked",
      detail: "Static assets",
    });
  });

  // A cache in front and a working site behind it are two claims. Cloudflare
  // proxying a dead origin is still, accurately, caching in front — and every
  // visitor gets its error page. The page has to be able to say both.
  it("a cache in front is not evidence the origin answers", () => {
    const story = read([
      states(
        { kind: "cdn", id: "front" },
        {
          facts: [
            fact("provider", "Cloudflare"),
            fact("origin", "46.62.253.6"),
            fact("covers", "Everything on the name"),
          ],
          checks: [
            check("caching", "passed"),
            check("origin-reachable", "failed", "reachability", {
              detail:
                "522 from Cloudflare; the origin never completed a connection.",
            }),
          ],
        },
      ),
    ]);
    expect(story.cdn.on).toBe(true);
    expect(story.cdn.originReachable).toBe("no");
    expect(story.cdn.origin).toBe("46.62.253.6");
    expect(story.cdn.detail).toMatch(/522/);
  });

  it("says when the cache forwards somewhere this application is not", () => {
    const story = read([
      states(
        { kind: "host", id: "h" },
        { facts: [fact("address", "192.0.2.10")] },
      ),
      states(
        { kind: "cdn", id: "front" },
        {
          facts: [
            fact("provider", "Cloudflare"),
            fact("origin", "46.62.253.6"),
          ],
          checks: [check("caching", "passed")],
        },
      ),
    ]);
    expect(story.cdn.concern).toMatch(/46\.62\.253\.6/);
    expect(story.cdn.concern).toMatch(/192\.0\.2\.10/);
  });

  it("an origin that answers is said to answer", () => {
    const story = read([
      states(
        { kind: "cdn", id: "front" },
        {
          facts: [fact("provider", "Cloudflare"), fact("covers", "Images")],
          checks: [
            check("caching", "passed"),
            check("origin-reachable", "passed"),
          ],
        },
      ),
    ]);
    expect(story.cdn.originReachable).toBe("yes");
    expect(story.cdn.detail).toBe("Images");
  });
});

describe("shared", () => {
  it("carries the release revision and where it runs", () => {
    const story = read([
      topology([{ id: "app", kind: "web" }]),
      states(
        { kind: "host", id: "hetzner-1" },
        { facts: [fact("region", "Helsinki")] },
      ),
    ]);
    expect(story.machine).toBe("hetzner-1");
    expect(story.place).toBe("Helsinki");
  });

  it("never invents anything, on any page", () => {
    expect(read([]).invented).toBeNull();
    expect(read([]).files).toEqual([]);
  });
});
