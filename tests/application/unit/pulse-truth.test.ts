// What the live pulse may and may not vouch for.
//
// The pulse requests the application's address and opens SSH to the server.
// Calm-by-default made an aged pass neutral and let an answer from the pulse
// turn it green — and the first version let that answer refresh things it
// never asked: a whole Overview lane holding volume checks, a database whose
// only evidence was a note. These are the rules that stop that.

import { describe, expect, it } from "vitest";

import { applicationListCondition } from "@/server/application-list";
import type { Ref, SavedInformation } from "@/server/operator-data";
import { databasesFromRecords } from "@/components/hallvi/database-records";
import { overviewFromRecords } from "@/components/hallvi/overview-records";
import { allAsk, pulseAsks } from "@/components/hallvi/pulse-asks";

const APP = "11111111-2222-4333-8444-555555555555";
const AT = "2026-09-12T16:05:00.000Z";
const A_DAY_ON = Date.parse("2026-09-13T16:05:00.000Z");

type Check = NonNullable<SavedInformation["presentation"]>["checks"][number];

function record(id: string, ref: Ref, checks: Check[]): SavedInformation {
  return {
    id,
    applicationId: APP,
    title: id,
    body: "",
    evidence: [],
    establishedAt: AT,
    presentation: {
      states: { ref, presence: "present" },
      views: ["overview"],
      role: "status",
      status: "verified",
      checks,
      facts: [],
    },
    createdAt: AT,
    updatedAt: AT,
    retiredAt: null,
  };
}

const check = (
  key: string,
  status: Check["status"] = "passed",
  claim: Check["claim"] = "reachability",
): Check => ({ key, label: key, status, claim, basis: "observed" });

const application: Ref = { kind: "application", id: APP };
const volume: Ref = { kind: "volume", id: "data" };
const database: Ref = { kind: "database", id: "db" };

describe("what the pulse asks", () => {
  it("is the address on the application, and SSH on the host, and nothing else", () => {
    expect(pulseAsks({ key: "http" }, application)).toBe("app");
    expect(pulseAsks({ key: "ssh" }, { kind: "host" })).toBe("server");
    // A page that loads does not establish any of these.
    expect(pulseAsks({ key: "container" }, { kind: "process" })).toBeNull();
    expect(pulseAsks({ key: "http" }, { kind: "process" })).toBeNull();
    expect(pulseAsks({ key: "persistence" }, volume)).toBeNull();
    expect(pulseAsks({ key: "answering" }, database)).toBeNull();
  });

  it("refreshes a group only when every aged reading in it asked the same thing", () => {
    expect(allAsk([{ check: { key: "http" }, subject: application }])).toBe(
      "app",
    );
    expect(
      allAsk([
        { check: { key: "http" }, subject: application },
        { check: { key: "persistence" }, subject: volume },
      ]),
    ).toBeNull();
    expect(allAsk([])).toBeNull();
  });
});

describe("Overview's Checks lane", () => {
  const lane = (records: SavedInformation[]) =>
    overviewFromRecords({
      records,
      executions: [],
      chats: [],
      applicationId: APP,
      applicationName: "Shop",
      headline: "Shop",
      now: A_DAY_ON,
      accessClosed: false,
      onOpenConversation: () => undefined,
    }).vitals.find((vital) => vital.id === "checks")!;

  it("may be refreshed by an answer when its only aged check asked for one", () => {
    const vital = lane([record("app", application, [check("http")])]);
    expect(vital.status.certainty).toBe("stale");
    expect(vital.reasked).toBe("app");
  });

  it("is not refreshed when it also holds an aged volume check", () => {
    const vital = lane([
      record("app", application, [check("http")]),
      // Liveness lasts fifteen minutes, so a day on this one has aged too.
      record("vol", volume, [check("persistence", "passed", "liveness")]),
    ]);
    expect(vital.status.certainty).toBe("stale");
    expect(vital.reasked).toBeNull();
  });
});

describe("whether a database answers", () => {
  const rows = (checks: Check[]) =>
    databasesFromRecords({
      records: [record("db", database, checks)],
      now: A_DAY_ON,
    });

  it("does not read a note as a pass", () => {
    const [row] = rows([check("answering", "info")]);
    expect(row.answering).toMatchObject({ passed: false, noted: true });
    expect(row.lastPassed).toBeNull();
  });

  it("is not answered by some other check passing", () => {
    const [row] = rows([check("persistence", "passed", "contents")]);
    expect(row.answering).toBeNull();
  });

  it("is answered by the query check, which still ages", () => {
    const [row] = rows([check("answering")]);
    expect(row.answering).toMatchObject({ passed: true, fresh: false });
  });
});

describe("the applications list", () => {
  it("keeps an aged pass green and says how old it is", () => {
    const said = applicationListCondition(
      [record("app", application, [check("http")])],
      APP,
      A_DAY_ON,
    );
    expect(said.tone).toBe("live");
    expect(said.text).toBe("Checks held 1 d ago");
  });
});
