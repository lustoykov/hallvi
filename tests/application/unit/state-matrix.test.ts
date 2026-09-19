// The states every view claims to support, with the clock in hand.
//
// A real deployment shows a handful of these and never the rest: nothing has
// failed, nothing was withdrawn, nothing is a week old. Waiting for the others
// is not an option, so the clock is advanced instead — which is also the only
// way to assert that a check goes stale *at* its horizon rather than near it.
//
// Every case here is a sentence a page could get wrong in a way a reader
// cannot detect.

import { beforeEach, describe, expect, it } from "vitest";

import { processesFromRecords } from "@/components/hallvi/processes-records";
import { storageFromRecords } from "@/components/hallvi/storage-records";
import { monitoringFromRecords } from "@/components/hallvi/monitoring-records";
import {
  currentFacts,
  freshnessOf,
  presenceOf,
  subjectsOfKind,
} from "@/server/record-projection";
import type { SavedInformation } from "@/server/operator-data";
import { APP, resetRecordIds, states, topology } from "../fixtures/records";

beforeEach(resetRecordIds);

const T0 = Date.parse("2026-09-13T12:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const check = (
  key: string,
  status: "passed" | "failed" | "info",
  claim: string,
  extra: object = {},
) => ({ key, label: key, status, claim, basis: "observed", ...extra });
const fact = (
  key: string,
  value: string,
  claim = "configuration",
  basis = "observed",
) => ({ key, label: key, value, claim, basis });

const web = (input: object) =>
  states({ kind: "process", id: "web" }, input as never);
const read = (records: SavedInformation[], now: number) =>
  processesFromRecords({ records, applicationId: APP, now });

describe("a claim goes stale at its horizon, not near it", () => {
  const horizons = [
    ["liveness", 15 * MINUTE],
    ["reachability", 12 * HOUR],
    ["contents", 3 * DAY],
    ["configuration", 7 * DAY],
  ] as const;

  for (const [claim, horizon] of horizons)
    it(`${claim} lasts exactly ${horizon / MINUTE} minutes`, () => {
      const record = web({
        at: at(0),
        checks: [check("http", "passed", claim)],
      });
      const held = { claim } as { claim: never };
      expect(freshnessOf(held, record, T0 + horizon - 1000).kind).toBe("fresh");
      expect(freshnessOf(held, record, T0 + horizon).kind).toBe("stale");
    });

  it("never expires an identity, because a changed identity is a new thing", () => {
    const record = web({ at: at(0), facts: [fact("image", "x", "identity")] });
    expect(
      freshnessOf({ claim: "identity" } as never, record, T0 + 400 * DAY).kind,
    ).toBe("fresh");
  });

  it("prefers a horizon Pi actually knows over the claim's default", () => {
    const record = web({
      at: at(0),
      checks: [check("valid", "passed", "reachability", { freshFor: 60 })],
    });
    const held = { claim: "reachability", freshFor: 60 } as never;
    expect(freshnessOf(held, record, T0 + 59_000).kind).toBe("fresh");
    expect(freshnessOf(held, record, T0 + 61_000).kind).toBe("stale");
  });

  it("never ages what was never established", () => {
    const record = web({
      at: null,
      checks: [check("http", "passed", "liveness")],
    });
    expect(
      freshnessOf({ claim: "liveness" } as never, record, T0 + 900 * DAY).kind,
    ).toBe("never-established");
  });
});

describe("a passed check ages into unwatched, never into unhealthy", () => {
  const records = [
    topology([{ id: "web", kind: "web", name: "Web" }]),
    web({ at: at(0), checks: [check("http", "passed", "liveness")] }),
  ];

  it("reads verified inside the window", () => {
    expect(read(records, T0 + 5 * MINUTE).state).toBe("running");
  });

  it("reads unwatched outside it, and not failed", () => {
    const story = read(records, T0 + 30 * MINUTE);
    expect(story.state).toBe("unknown");
    expect(story.tone).toBe("stale");
    expect(story.word).toBe("Needs a check");
  });
});

describe("a failed check never ages into unknown", () => {
  const records = [
    topology([{ id: "web", kind: "web", name: "Web" }]),
    web({
      at: at(0),
      status: "failed",
      checks: [check("http", "failed", "liveness")],
    }),
  ];

  it("is still failed a year later", () => {
    const story = read(records, T0 + 365 * DAY);
    expect(story.tone).toBe("failed");
    expect(story.state).toBe("failed");
    expect(story.word).toBe("A check failed");
  });
});

describe("a newer reading replaces an older one", () => {
  it("recovers current state after a failure, on the same key", () => {
    const records = [
      topology([{ id: "web", kind: "web", name: "Web" }]),
      web({
        at: at(0),
        status: "failed",
        checks: [check("http", "failed", "liveness", { detail: "refused" })],
      }),
      web({
        at: at(10 * MINUTE),
        checks: [check("http", "passed", "liveness", { detail: "200" })],
      }),
    ];
    const story = read(records, T0 + 12 * MINUTE);
    expect(story.state).toBe("running");
    expect(story.tone).toBe("verified");
    // One row, not two: the newer reading of the same key replaced it.
    expect(story.processes[0].probes).toHaveLength(1);
    expect(story.processes[0].probes[0].passed).toBe(true);
  });

  it("keeps both events for History, whatever current state says", () => {
    const records = [
      topology([{ id: "web", kind: "web", name: "Web" }]),
      web({ at: at(0), status: "failed", title: "It stopped" }),
      web({ at: at(10 * MINUTE), title: "It is back" }),
    ];
    // Recent changes is the event list, so it keeps the failure.
    expect(read(records, T0 + 12 * MINUTE).processChanges).toHaveLength(2);
  });

  it("does not let an older record resurrect a key a newer one replaced", () => {
    const records = [
      topology([{ id: "web", kind: "web", name: "Web" }]),
      web({ at: at(0), facts: [fact("port", "8080")] }),
      web({ at: at(HOUR), facts: [fact("port", "3000")] }),
    ];
    expect(read(records, T0 + 2 * HOUR).processes[0].port).toBe(3000);
  });

  it("leaves a key the newer record did not mention standing", () => {
    // Pi writes partial observations. A record saying only that HTTP
    // answered must not erase the port somebody recorded yesterday.
    const records = [
      topology([{ id: "web", kind: "web", name: "Web" }]),
      web({
        at: at(0),
        facts: [fact("port", "3000"), fact("command", "node .")],
      }),
      web({ at: at(HOUR), checks: [check("http", "passed", "liveness")] }),
    ];
    const story = read(records, T0 + HOUR + MINUTE);
    expect(story.processes[0].port).toBe(3000);
    expect(story.processes[0].command).toBe("node .");
  });
});

describe("a withdrawn record", () => {
  const ref = { kind: "process", id: "web" } as const;
  const records = [
    topology([{ id: "web", kind: "web", name: "Web" }]),
    web({ at: at(0), facts: [fact("port", "8080")] }),
    web({
      at: at(HOUR),
      facts: [fact("port", "3000")],
      retiredAt: at(2 * HOUR),
    }),
  ];

  it("leaves current state, and the reading it replaced comes back", () => {
    expect(read(records, T0 + 3 * HOUR).processes[0].port).toBe(8080);
  });

  it("is still there to be understood", () => {
    // Retired is withdrawn, not deleted: a reader can still see that Pi said
    // it and took it back.
    expect(records.filter((record) => record.retiredAt).length).toBe(1);
    expect(presenceOf(records, ref).known).toBe(true);
  });
});

describe("presence, outcome and freshness stay apart", () => {
  it("reads nothing recorded as nobody looked", () => {
    expect(presenceOf([], { kind: "volume", id: "data" }).known).toBe(false);
    expect(
      storageFromRecords({ records: [], applicationId: APP, now: T0 }).volumes,
    ).toEqual([]);
  });

  it("reads a written absence as an absence", () => {
    const records = [
      states({ kind: "volume", id: "data" }, {
        at: at(0),
        presence: "absent",
      } as never),
    ];
    const presence = presenceOf(records, { kind: "volume", id: "data" });
    expect(presence.known).toBe(true);
    expect(presence.known && presence.presence).toBe("absent");
  });

  it("does not let a failed check erase a subject", () => {
    // A failed connection means "could not check". The host is still there.
    const records = [
      states({ kind: "host", id: "h1" }, {
        at: at(0),
        status: "failed",
        checks: [check("ssh", "failed", "reachability")],
        facts: [fact("region", "Helsinki", "configuration", "reported")],
      } as never),
    ];
    expect(subjectsOfKind(records, "host")).toHaveLength(1);
    expect(
      currentFacts(records, { kind: "host", id: "h1" }).get("region")?.value
        .value,
    ).toBe("Helsinki");
  });

  it("does not let a new machine inherit the old one's state", () => {
    // A rebuilt host is a different subject, so nothing carries over.
    const records = [
      states({ kind: "host", id: "hetzner-1" }, {
        at: at(0),
        facts: [fact("region", "Helsinki")],
        checks: [check("ssh", "passed", "reachability")],
      } as never),
      states({ kind: "host", id: "hetzner-2" }, { at: at(DAY) } as never),
    ];
    expect(currentFacts(records, { kind: "host", id: "hetzner-2" }).size).toBe(
      0,
    );
    const story = monitoringFromRecords({
      records,
      applicationId: APP,
      applicationName: "x",
      now: T0 + DAY + MINUTE,
    });
    expect(story.unwatched.some((gap) => gap.id === "unlooked:hetzner-2")).toBe(
      true,
    );
  });
});

describe("planned and reported are not observed", () => {
  it("keeps a planned schedule out of the measurement lane", () => {
    const records = [
      states({ kind: "host", id: "h1" }, {
        at: at(0),
        facts: [
          // What the machine was sold with, not what it is doing.
          fact("memory", "4 GB", "configuration", "reported"),
          fact("memory-used", "1.2 of 4 GB", "contents", "observed"),
        ],
      } as never),
    ];
    const story = monitoringFromRecords({
      records,
      applicationId: APP,
      applicationName: "x",
      now: T0 + MINUTE,
    });
    const readings = story.looks.filter((look) => look.kind === "output");
    expect(readings.map((look) => look.short)).toEqual([
      "memory-used 1.2 of 4 GB",
    ]);
  });

  it("never turns a planned check into a result", () => {
    // The contract refuses a planned check with an outcome, so a planned one
    // is always info, and info is noted rather than passed.
    const records = [
      topology([{ id: "web", kind: "web", name: "Web" }]),
      web({
        at: at(0),
        checks: [
          {
            key: "http",
            label: "will be checked",
            status: "info",
            claim: "liveness",
            basis: "planned",
          },
        ],
      }),
    ];
    const story = read(records, T0 + MINUTE);
    expect(story.processes[0].probes[0].passed).toBe(false);
    expect(story.state).not.toBe("running");
  });
});

describe("work that did not run, and work that was stopped", () => {
  it("keeps them apart", async () => {
    // Both were "Cancelled" — one word for "you said no, nothing happened"
    // and for "it was running and was stopped, and how far it got is not
    // known". The second is the more important thing to say.
    const { stateLabel } = await import("@/components/hallvi/operation-model");
    expect(stateLabel.declined).toBe("Not run");
    expect(stateLabel.stopped).toBe("Stopped");
  });

  it("maps an execution's own status to the right one", async () => {
    const { historyFromRecords } =
      await import("@/components/hallvi/history-records");
    const execution = (id: string, status: string) =>
      ({
        id,
        applicationId: APP,
        chatId: "c",
        runId: "r",
        tool: "server_bash",
        target: "root@host:22",
        input: "hostname",
        mode: "always-ask",
        status,
        output: "",
        createdAt: at(0),
        finishedAt: at(1000),
      }) as never;
    const operations = historyFromRecords({
      records: [],
      executions: [execution("a", "declined"), execution("b", "interrupted")],
    });
    const states = Object.fromEntries(
      operations.map((item) => [item.source.id, item.state]),
    );
    expect(states.a).toBe("declined");
    expect(states.b).toBe("stopped");
  });
});
