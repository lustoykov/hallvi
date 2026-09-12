// Architecture, read end to end from records.
//
// These are the five reads the page has to get right, worked as concrete
// records rather than as a framework. Real deployment evidence is what visual
// acceptance uses; these fixtures cover the transitions the deployment on
// record does not contain — a second observation, a replacement machine, and
// monitoring going from unlooked-at to established to present.

import { expect, it, describe } from "vitest";

import type { Ref, SavedInformation } from "@/server/operator-data";
import { architectureFromRecords } from "@/components/server-guy/architecture-records";
import {
  checkAsNow,
  checkAsRecorded,
  currentChecks,
  currentFacts,
  freshnessOf,
  presenceOf,
  seriesFor,
  tagFor,
} from "@/server/record-projection";

const APPLICATION = "11111111-2222-4333-8444-555555555555";
const APP: Ref = { kind: "application", id: APPLICATION };
const HOST: Ref = { kind: "host", id: "hetzner-165600952" };
const WEB: Ref = { kind: "process", id: "app" };

function record(input: {
  id: string;
  at: string | null;
  title?: string;
  body?: string;
  states?: NonNullable<SavedInformation["presentation"]>["states"];
  about?: NonNullable<SavedInformation["presentation"]>["about"];
  status?: "info" | "verified" | "failed" | "warning";
  checks?: NonNullable<SavedInformation["presentation"]>["checks"];
  facts?: NonNullable<SavedInformation["presentation"]>["facts"];
  content?: NonNullable<SavedInformation["presentation"]>["content"];
  retired?: boolean;
}): SavedInformation {
  return {
    id: input.id,
    applicationId: APPLICATION,
    title: input.title ?? input.id,
    body: input.body ?? "",
    evidence: [],
    establishedAt: input.at,
    presentation: {
      about: input.about,
      states: input.states,
      views: ["architecture"],
      role: "outcome",
      status: input.status ?? "verified",
      checks: input.checks ?? [],
      facts: input.facts,
      content: input.content,
    },
    createdAt: input.at ?? "2026-09-12T00:00:00.000Z",
    updatedAt: input.at ?? "2026-09-12T00:00:00.000Z",
    retiredAt: input.retired ? "2026-09-13T09:30:00.000Z" : null,
  };
}

const ssh = {
  key: "ssh",
  label: "SSH connected",
  status: "passed" as const,
  claim: "reachability" as const,
  basis: "observed" as const,
};

/** The map: composition only. No facts, no absences. */
const mapRecord = record({
  id: "rec-map",
  at: "2026-09-12T15:48:00.000Z",
  title: "How this application is put together",
  states: { ref: APP, presence: "present" },
  content: {
    kind: "topology",
    from: "observed",
    parts: [
      { id: "controller", kind: "controller", name: "Server Guy", role: "Runs the work", plain: "This PC" },
      { id: "hetzner-165600952", kind: "host", name: "getting-started", role: "Runs the container", plain: "The machine your application runs on" },
      { id: "app", kind: "web", name: "Getting Started", role: "Serves the pages", plain: "Your application" },
      { id: "todo-db", kind: "volume", name: "todo.db", role: "Holds the database", plain: "Where your data lives" },
    ],
    edges: [
      { from: "controller", to: "hetzner-165600952", network: "public", label: "SSH" },
      { from: "hetzner-165600952", to: "app", network: "loopback" },
      { from: "app", to: "todo-db", network: "disk" },
    ],
  },
});

const hostFirst = record({
  id: "rec-host-1",
  at: "2026-09-12T15:48:00.000Z",
  states: { ref: HOST, presence: "present" },
  checks: [ssh],
  facts: [
    { key: "server-id", label: "Server ID", value: "165600952", claim: "identity", basis: "reported" },
    { key: "region", label: "Location", value: "Helsinki", claim: "configuration", basis: "reported" },
    { key: "size", label: "Type", value: "CX23 · 2 vCPU · 4 GB", claim: "configuration", basis: "reported" },
    { key: "address", label: "Address", value: "46.62.253.6", claim: "configuration", basis: "observed" },
  ],
});

/** The deployment event: speaks for nothing, and places its checks itself. */
const deployed = record({
  id: "rec-deploy",
  at: "2026-09-12T16:05:00.000Z",
  about: [APP, WEB],
  checks: [
    { key: "http", label: "Homepage answered", status: "passed", claim: "reachability", basis: "observed", about: WEB },
    { key: "persistence", label: "Data survived a restart", status: "passed", claim: "contents", basis: "observed", about: { kind: "volume", id: "todo-db" } },
  ],
});

const SEP_12_16_30 = Date.parse("2026-09-12T16:30:00.000Z");
const SEP_13_10_00 = Date.parse("2026-09-13T10:00:00.000Z");

function architecture(records: SavedInformation[], now: number) {
  return architectureFromRecords({
    records,
    applicationId: APPLICATION,
    applicationName: "Getting Started",
    now,
  });
}

describe("1 · the first observations produce the designed map", () => {
  const model = architecture([mapRecord, hostFirst, deployed], SEP_12_16_30)!;

  it("draws every part Pi composed, in the slots the design lays out", () => {
    // Pi names a host `hetzner-165600952` — a reference it reuses on every
    // later observation — and the design has one place for a host. The two
    // are deliberately different: the slot is the component's, the reference
    // is Pi's, and only the reference reads records.
    expect(model.parts.filter((part) => !part.id.startsWith("gap:")).map((part) => part.id)).toEqual([
      "controller",
      "host",
      "app",
      "todo-db",
    ]);
    expect(model.status).toBe("live");
    expect(model.headline).toBe("Getting Started");
  });

  it("resolves each part's state from the records that state it", () => {
    expect(model.byId.host.evidence.certainty).toBe("verified");
    // Facts and the region are read against Pi's reference, not the slot.
    expect(model.byId.host.facts.map((fact) => fact.label)).toContain("Location");
    expect(model.region).toBe("Helsinki");
  });

  it("lets a deployment event's checks reach the parts they were about", () => {
    // The event speaks for no subject, so only `check.about` places these.
    expect(model.byId.app.evidence.certainty).toBe("verified");
    expect(model.byId["todo-db"].evidence.certainty).toBe("verified");
  });

  it("says a loopback-only application is reached from this PC, not the world", () => {
    expect(model.openness).toBe("restricted");
  });

  it("gives Server Guy no tag of its own to be wrong about", () => {
    expect(model.byId.controller.quiet).toBe(true);
  });
});

describe("2 · a later SSH-only observation keeps the configuration and its times", () => {
  const sshOnly = record({
    id: "rec-host-2",
    at: "2026-09-13T09:12:00.000Z",
    states: { ref: HOST, presence: "present" },
    checks: [ssh],
  });
  const records = [mapRecord, hostFirst, deployed, sshOnly];

  it("takes the check from the newer record", () => {
    const held = currentChecks(records, HOST).get("ssh")!;
    expect(held.record.id).toBe("rec-host-2");
    expect(checkAsNow(held.value, held.record, SEP_13_10_00)).toBe("verified");
  });

  it("keeps the facts the newer record never mentioned", () => {
    const facts = currentFacts(records, HOST);
    expect(facts.get("region")!.value.value).toBe("Helsinki");
    expect(facts.get("address")!.value.value).toBe("46.62.253.6");
  });

  it("keeps each value's own observation time, not the newest record's", () => {
    const facts = currentFacts(records, HOST);
    // The location was read on the 12th and has not been read since.
    expect(facts.get("region")!.record.establishedAt).toBe("2026-09-12T15:48:00.000Z");
    expect(facts.get("region")!.record.id).toBe("rec-host-1");
    expect(currentChecks(records, HOST).get("ssh")!.record.establishedAt).toBe(
      "2026-09-13T09:12:00.000Z",
    );
  });

  it("ages each claim on its own terms", () => {
    const facts = currentFacts(records, HOST);
    const region = facts.get("region")!;
    // 18 hours on: the location still stands, a reachability claim would not.
    expect(freshnessOf(region.value, region.record, SEP_13_10_00).kind).toBe("fresh");
    expect(freshnessOf({ claim: "reachability" }, region.record, SEP_13_10_00).kind).toBe("stale");
    expect(freshnessOf(facts.get("server-id")!.value, region.record, SEP_13_10_00).kind).toBe("fresh");
  });

  it("still draws the host as verified, on the newer check", () => {
    expect(architecture(records, SEP_13_10_00)!.byId.host.evidence.certainty).toBe("verified");
  });
});

describe("3 · a replacement machine inherits nothing", () => {
  const replacement: Ref = { kind: "host", id: "hetzner-165700111" };
  const gone = record({
    id: "rec-host-gone",
    at: "2026-09-15T11:00:00.000Z",
    title: "The first server was destroyed",
    states: { ref: HOST, presence: "absent" },
  });
  const fresh = record({
    id: "rec-host-new",
    at: "2026-09-15T11:40:00.000Z",
    states: { ref: replacement, presence: "present" },
    checks: [ssh],
    facts: [
      { key: "server-id", label: "Server ID", value: "165700111", claim: "identity", basis: "reported" },
      { key: "address", label: "Address", value: "46.62.99.9", claim: "configuration", basis: "observed" },
    ],
  });
  const records = [mapRecord, hostFirst, deployed, gone, fresh];

  it("keeps the two machines' facts apart, because they are two subjects", () => {
    expect(currentFacts(records, replacement).get("address")!.value.value).toBe("46.62.99.9");
    expect(currentFacts(records, replacement).has("region")).toBe(false);
    expect(currentFacts(records, HOST).get("address")!.value.value).toBe("46.62.253.6");
  });

  it("says the first machine is gone, and stops describing it", () => {
    expect(presenceOf(records, HOST)).toMatchObject({ presence: "absent" });
    const part = architecture(records, Date.parse("2026-09-15T12:00:00.000Z"))!
      .byId.host;
    expect(part.evidence.certainty).toBe("absent");
    expect(part.facts).toEqual([]);
  });

  it("leaves the destroyed machine in its series, not in the current read", () => {
    expect(seriesFor(records, HOST).map((item) => item.record.id)).toEqual([
      "rec-host-1",
      "rec-host-gone",
    ]);
  });
});

describe("4 · monitoring, from unlooked-at to established to present", () => {
  const MONITOR: Ref = { kind: "monitor", id: "uptime" };
  const base = [mapRecord, hostFirst, deployed];
  const now = SEP_12_16_30;

  it("reads unassessed while nobody has looked", () => {
    const model = architecture(base, now)!;
    expect(model.gaps.map((gap) => gap.id)).toEqual(["monitoring"]);
    expect(model.byId["gap:monitoring"].evidence.certainty).toBe("unknown");
    expect(model.byId["gap:monitoring"].evidence.short).toBe("Not assessed");
  });

  it("reads absent only once a record establishes it", () => {
    const none = record({
      id: "rec-monitor-none",
      at: "2026-09-12T16:20:00.000Z",
      title: "Nothing watches this application",
      body: "No health check or alert is configured anywhere.",
      states: { ref: MONITOR, presence: "absent" },
      status: "warning",
    });
    const model = architecture([...base, none], now)!;
    expect(model.byId["gap:monitoring"].evidence.certainty).toBe("absent");
    expect(model.gaps[0].detail).toContain("No health check or alert");
  });

  it("leaves no ghost behind once a monitor is on the map", () => {
    const watched = {
      ...mapRecord,
      presentation: {
        ...mapRecord.presentation!,
        content: {
          ...(mapRecord.presentation!.content as { kind: "topology"; parts: unknown[]; edges: unknown[]; from: "observed" }),
          parts: [
            ...(mapRecord.presentation!.content as { parts: { id: string }[] }).parts,
            { id: "uptime", kind: "monitor", name: "Uptime check", role: "Asks the homepage every minute", plain: "Watches your application" },
          ],
        },
      },
    } as SavedInformation;
    const up = record({
      id: "rec-monitor-up",
      at: "2026-09-12T16:25:00.000Z",
      states: { ref: MONITOR, presence: "present" },
      checks: [{ key: "answering", label: "The check is answering", status: "passed", claim: "liveness", basis: "observed" }],
    });
    const model = architecture([watched, hostFirst, deployed, up], now)!;
    expect(model.gaps).toEqual([]);
    expect(model.byId["gap:monitoring"]).toBeUndefined();
    expect(model.byId.uptime.evidence.certainty).toBe("verified");
  });
});

describe("5 · the same records read twice give the same page", () => {
  it("reconstructs part for part, with no state of its own", () => {
    const records = [mapRecord, hostFirst, deployed];
    const first = architecture(records, SEP_12_16_30)!;
    const second = architecture([...records].reverse(), SEP_12_16_30)!;
    expect(second.parts.map((part) => [part.id, part.evidence.certainty])).toEqual(
      first.parts.map((part) => [part.id, part.evidence.certainty]),
    );
    expect(second.journeys).toEqual(first.journeys);
    expect(second.condition).toEqual(first.condition);
    expect(second.region).toBe(first.region);
  });

  it("has nothing to draw, and says so, when no record maps the application", () => {
    expect(architecture([hostFirst, deployed], SEP_12_16_30)).toBeNull();
  });
});

describe("what a reading never does", () => {
  const at = "2026-09-12T16:05:00.000Z";
  const ONE_HOUR_ON = Date.parse("2026-09-12T17:05:00.000Z");

  it("keeps the recorded outcome where the page records an event", () => {
    expect(deployed.presentation!.checks.map(checkAsRecorded)).toEqual(["passed", "passed"]);
  });

  it("ages the liveness claim, and only that one, as evidence about now", () => {
    const event = record({
      id: "rec-three",
      at,
      checks: [
        { key: "http", label: "Answered", status: "passed", claim: "reachability", basis: "observed" },
        { key: "persistence", label: "Survived", status: "passed", claim: "contents", basis: "observed" },
        { key: "container", label: "Running", status: "passed", claim: "liveness", basis: "observed" },
      ],
    });
    expect(
      event.presentation!.checks.map((check) => checkAsNow(check, event, ONE_HOUR_ON)),
    ).toEqual(["verified", "verified", "stale"]);
    expect(tagFor(event, event.presentation!.checks, ONE_HOUR_ON)).toBe("stale");
    expect(tagFor(event, [{ claim: "identity" }], ONE_HOUR_ON)).toBe("verified");
  });

  it("never ages a failure into doubt", () => {
    const failed = record({
      id: "rec-failed",
      at,
      status: "failed",
      checks: [{ key: "http", label: "Answered", status: "failed", claim: "reachability", basis: "observed" }],
    });
    expect(checkAsNow(failed.presentation!.checks[0], failed, ONE_HOUR_ON)).toBe("failed");
    expect(tagFor(failed, failed.presentation!.checks, ONE_HOUR_ON)).toBe("failed");
  });

  it("will not let an unknown key decide what the map says", () => {
    const odd = record({
      id: "rec-odd",
      at,
      states: { ref: HOST, presence: "present" },
      checks: [{ key: "moon-phase", label: "Waxing", status: "passed", claim: "liveness", basis: "observed" }],
    });
    const part = architecture([mapRecord, odd], ONE_HOUR_ON)!.byId.host;
    // A record speaks for the host, so it is not unlooked-at; but nothing
    // this page knows how to read says whether it is working.
    expect(part.evidence.certainty).toBe("unknown");
    expect(part.evidence.short).toBe("Recorded, nothing checked");
  });

  it("retires by falling back, and changes not a word of what was said", () => {
    const withdrawn = { ...hostFirst, retiredAt: "2026-09-13T09:30:00.000Z" };
    expect(currentFacts([mapRecord, withdrawn, deployed], HOST).size).toBe(0);
    expect(withdrawn.presentation!.facts).toEqual(hostFirst.presentation!.facts);
    expect(seriesFor([mapRecord, withdrawn], HOST)[0].withdrawn).toBe(true);
  });
});
