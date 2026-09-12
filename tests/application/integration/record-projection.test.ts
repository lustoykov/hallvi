// The read rules, proved against the cases the contract works out by hand in
// §9.7. Each test is one of those cases, with the contract's own answers.
//
// These are hand-written fixtures on purpose: they cover a partial
// observation, a retirement and a rebuild, which the deployment on record
// does not yet contain. Visual acceptance uses the real records; these prove
// the arithmetic.

import { expect, it, describe } from "vitest";

import type { Ref, SavedInformation } from "@/server/operator-data";
import {
  checkAsNow,
  checkAsRecorded,
  currentChecks,
  currentFacts,
  freshnessOf,
  lane,
  presenceOf,
  seriesFor,
  tagFor,
  timelineWorthy,
} from "@/server/record-projection";

const APPLICATION = "11111111-2222-4333-8444-555555555555";
const HOST: Ref = { kind: "host", id: "hetzner-165600952" };

function record(input: {
  id: string;
  at: string | null;
  states?: SavedInformation["states"];
  about?: SavedInformation["about"];
  status?: "info" | "verified" | "failed" | "warning";
  checks?: NonNullable<SavedInformation["presentation"]>["checks"];
  facts?: NonNullable<SavedInformation["presentation"]>["facts"];
  retired?: boolean;
}): SavedInformation {
  return {
    id: input.id,
    applicationId: APPLICATION,
    title: input.id,
    body: "",
    about: input.about,
    states: input.states,
    evidence: [],
    establishedAt: input.at,
    presentation: {
      views: ["overview"],
      role: "outcome",
      status: input.status ?? "verified",
      checks: input.checks ?? [],
      facts: input.facts,
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

// The host's series, exactly as the contract tabulates it.
const one = record({
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
const two = record({
  id: "rec-host-2",
  at: "2026-09-13T09:12:00.000Z",
  states: { ref: HOST, presence: "present" },
  checks: [ssh],
});
const destroyed = record({
  id: "rec-host-4",
  at: "2026-09-15T11:00:00.000Z",
  states: { ref: HOST, presence: "absent" },
});
const rebuilt = record({
  id: "rec-host-5",
  at: "2026-09-15T11:40:00.000Z",
  states: { ref: HOST, presence: "present" },
  checks: [ssh],
  facts: [
    { key: "server-id", label: "Server ID", value: "165700111", claim: "identity", basis: "reported" },
    { key: "address", label: "Address", value: "46.62.99.9", claim: "configuration", basis: "observed" },
  ],
});

const SEP_13_10_00 = Date.parse("2026-09-13T10:00:00.000Z");
const SEP_15_12_00 = Date.parse("2026-09-15T12:00:00.000Z");

describe("A · a later partial observation does not erase what it did not mention", () => {
  const records = [one, two];

  it("takes presence from the newest record stating the host", () => {
    const presence = presenceOf(records, HOST);
    expect(presence.known && presence.presence).toBe("present");
    expect(presence.known && presence.record.id).toBe("rec-host-2");
  });

  it("reads the check from the newer record, verified 48 minutes on", () => {
    const held = currentChecks(records, HOST).get("ssh")!;
    expect(held.record.id).toBe("rec-host-2");
    expect(checkAsNow(held.value, held.record, SEP_13_10_00)).toBe("verified");
  });

  it("keeps the facts the newer record never spoke about", () => {
    const facts = currentFacts(records, HOST);
    expect(facts.get("region")!.value.value).toBe("Helsinki");
    expect(facts.get("region")!.record.id).toBe("rec-host-1");
    expect(facts.get("size")!.value.value).toBe("CX23 · 2 vCPU · 4 GB");
    expect(facts.get("address")!.value.value).toBe("46.62.253.6");
    expect(facts.get("server-id")!.value.value).toBe("165600952");
  });

  it("reads the same record differently for different claims", () => {
    const facts = currentFacts(records, HOST);
    const region = facts.get("region")!;
    // 18 hours old: stale as reachability, still plain as configuration.
    expect(freshnessOf(region.value, region.record, SEP_13_10_00).kind).toBe("fresh");
    expect(
      freshnessOf({ claim: "reachability" }, region.record, SEP_13_10_00).kind,
    ).toBe("stale");
    // Identity never expires, because a changed identity is a new thing.
    expect(
      freshnessOf(facts.get("server-id")!.value, region.record, SEP_15_12_00).kind,
    ).toBe("fresh");
  });
});

describe("B · retiring falls back; it does not edit", () => {
  const records = [one, { ...two, retiredAt: "2026-09-13T09:30:00.000Z" }];

  it("makes the older record current again, and it reads stale", () => {
    const held = currentChecks(records, HOST).get("ssh")!;
    expect(held.record.id).toBe("rec-host-1");
    // Passed 18 hours ago; reachability is worth twelve.
    expect(checkAsNow(held.value, held.record, SEP_13_10_00)).toBe("stale");
  });

  it("leaves the facts alone and changes not a word of what was said", () => {
    expect(currentFacts(records, HOST).get("region")!.value.value).toBe("Helsinki");
    expect(records[1].title).toBe(two.title);
    expect(records[1].presentation!.checks).toEqual(two.presentation!.checks);
    expect(records[1].establishedAt).toBe(two.establishedAt);
  });

  it("still shows it in the series, marked withdrawn", () => {
    const series = seriesFor(records, HOST);
    expect(series.map((item) => item.record.id)).toEqual([
      "rec-host-1",
      "rec-host-2",
    ]);
    expect(series.find((item) => item.record.id === "rec-host-2")!.withdrawn).toBe(true);
  });
});

describe("C · assembly stops at a presence change", () => {
  const records = [one, two, destroyed, rebuilt];

  it("reads the rebuilt machine's own identity and address", () => {
    const presence = presenceOf(records, HOST);
    expect(presence.known && presence.presence).toBe("present");
    const facts = currentFacts(records, HOST);
    expect(facts.get("address")!.value.value).toBe("46.62.99.9");
    expect(facts.get("server-id")!.value.value).toBe("165700111");
  });

  it("does not inherit the dead machine's region or size", () => {
    const facts = currentFacts(records, HOST);
    expect(facts.has("region")).toBe(false);
    expect(facts.has("size")).toBe(false);
  });

  it("says absent while that is the newest word on it", () => {
    const presence = presenceOf([one, two, destroyed], HOST);
    expect(presence.known && presence.presence).toBe("absent");
  });

  it("says nobody looked when no record states the subject", () => {
    // A record that is only `about` a subject never answers for its state.
    const mention = record({
      id: "rec-mention",
      at: "2026-09-15T11:00:00.000Z",
      about: [HOST],
    });
    expect(presenceOf([mention], HOST).known).toBe(false);
  });
});

describe("D · lanes come from what a check was about", () => {
  const deployment = record({
    id: "rec-deploy",
    at: "2026-09-15T16:05:00.000Z",
    about: [
      { kind: "application", id: "app-dgs" },
      { kind: "volume", id: "volume-todo" },
    ],
    checks: [
      { key: "api-round-trip", label: "Items API answered", status: "passed", claim: "reachability", basis: "observed", about: { kind: "process", id: "process-app" } },
      { key: "restart-persistence", label: "Data survived a restart", status: "passed", claim: "contents", basis: "observed", about: { kind: "volume", id: "volume-todo" } },
      { key: "reboot-recovery", label: "Came back after reboot", status: "passed", claim: "liveness", basis: "observed", about: { kind: "process", id: "process-app" } },
    ],
  });

  it("puts every check of the deployment in Application", () => {
    const assigned = deployment.presentation!.checks.map((check) =>
      lane(check, deployment),
    );
    expect(assigned).toEqual(["application", "application", "application"]);
  });

  it("leaves Backups empty — surviving a restart copied nothing", () => {
    expect(
      deployment.presentation!.checks.some(
        (check) => lane(check, deployment) === "backups",
      ),
    ).toBe(false);
  });

  it("gives a check with nothing to place no lane, and no timeline", () => {
    const loose = record({
      id: "rec-loose",
      at: "2026-09-15T16:05:00.000Z",
      checks: [{ key: "note", label: "Something", status: "info" }],
    });
    const check = loose.presentation!.checks[0];
    expect(lane(check, loose)).toBeNull();
    expect(timelineWorthy(check, loose)).toBe(false);
  });

  it("reads a refused public knock as access, not as the application", () => {
    const refused = record({
      id: "rec-refused",
      at: "2026-09-15T16:05:00.000Z",
      checks: [
        { key: "public-refused", label: "Public address did not answer from this PC", status: "passed", claim: "reachability", basis: "observed", about: { kind: "access", id: "app-dgs" } },
      ],
    });
    expect(lane(refused.presentation!.checks[0], refused)).toBe("access");
  });
});

describe("F · one check, two readings, one hour after the deployment", () => {
  const at = "2026-09-15T16:05:00.000Z";
  const ONE_HOUR_LATER = Date.parse("2026-09-15T17:05:00.000Z");
  const TEN_MINUTES_LATER = Date.parse("2026-09-15T16:15:00.000Z");
  const deployment = record({
    id: "rec-deploy",
    at,
    checks: [
      { key: "api-round-trip", label: "Items API answered", status: "passed", claim: "reachability", basis: "observed" },
      { key: "restart-persistence", label: "Data survived a restart", status: "passed", claim: "contents", basis: "observed" },
      { key: "reboot-recovery", label: "Came back after reboot", status: "passed", claim: "liveness", basis: "observed" },
    ],
  });
  const checks = deployment.presentation!.checks;

  it("keeps the recorded outcome on the page that records the event", () => {
    expect(checks.map(checkAsRecorded)).toEqual(["passed", "passed", "passed"]);
  });

  it("ages only the liveness claim when read as evidence about now", () => {
    expect(
      checks.map((check) => checkAsNow(check, deployment, ONE_HOUR_LATER)),
    ).toEqual(["verified", "verified", "stale"]);
  });

  it("takes the card's tag from the soonest claim it is showing", () => {
    expect(tagFor(deployment, checks, TEN_MINUTES_LATER)).toBe("verified");
    expect(tagFor(deployment, checks, ONE_HOUR_LATER)).toBe("stale");
    // A card showing only identity never goes stale.
    expect(tagFor(deployment, [{ claim: "identity" }], ONE_HOUR_LATER)).toBe("verified");
  });

  it("never ages a failure into doubt, or a warning into calm", () => {
    const failed = record({
      id: "rec-failed",
      at,
      status: "failed",
      checks: [{ key: "probe", label: "Probe", status: "failed", claim: "liveness", basis: "observed" }],
    });
    expect(checkAsNow(failed.presentation!.checks[0], failed, ONE_HOUR_LATER)).toBe("failed");
    expect(tagFor(failed, failed.presentation!.checks, ONE_HOUR_LATER)).toBe("failed");
    const warned = { ...failed, presentation: { ...failed.presentation!, status: "warning" as const } };
    expect(tagFor(warned, warned.presentation.checks, ONE_HOUR_LATER)).toBe("warning");
  });

  it("never starts ageing something that established nothing", () => {
    const unestablished = record({
      id: "rec-none",
      at: null,
      checks: [{ key: "probe", label: "Probe", status: "passed", claim: "liveness", basis: "observed" }],
    });
    const check = unestablished.presentation!.checks[0];
    expect(freshnessOf(check, unestablished, ONE_HOUR_LATER).kind).toBe("never-established");
    expect(checkAsNow(check, unestablished, ONE_HOUR_LATER)).toBe("recorded");
    expect(timelineWorthy(check, unestablished)).toBe(false);
  });

  it("will not call a claimless check verified, however recent", () => {
    // Records written before the contract carry no claim. There is no horizon
    // to judge them by, so they read as recorded rather than as holding.
    const legacy = record({
      id: "rec-legacy",
      at,
      checks: [{ label: "Server is running", status: "passed", subject: "server" }],
    });
    const check = legacy.presentation!.checks[0];
    expect(checkAsNow(check, legacy, TEN_MINUTES_LATER)).toBe("recorded");
    expect(checkAsRecorded(check)).toBe("passed");
    // Its lane still comes from the legacy subject, so Overview keeps it.
    expect(lane(check, legacy)).toBe("server");
    expect(timelineWorthy(check, legacy)).toBe(true);
  });
});
