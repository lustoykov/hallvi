// Overview's three questions, and the one claim it cannot assemble.
//
// What wants you, what is true now, what happened — and the application's own
// condition, which has to be stated by a record because a deployment event
// speaks for none of the things it touched.

import { expect, it, describe } from "vitest";

import type { Ref, SavedInformation } from "@/server/operator-data";
import {
  applicationCondition,
  overviewFromRecords,
} from "@/components/server-guy/overview-records";
import { lane } from "@/server/record-projection";

const APP = "11111111-2222-4333-8444-555555555555";
const application: Ref = { kind: "application", id: APP };
const AT = "2026-09-12T16:05:00.000Z";
const TEN_MINUTES_ON = Date.parse("2026-09-12T16:15:00.000Z");
const A_DAY_ON = Date.parse("2026-09-13T16:05:00.000Z");

function record(input: {
  id: string;
  at?: string | null;
  title?: string;
  states?: NonNullable<SavedInformation["presentation"]>["states"];
  status?: "info" | "verified" | "failed" | "warning";
  role?: "recommendation" | "status" | "outcome";
  nextStep?: string;
  checks?: NonNullable<SavedInformation["presentation"]>["checks"];
}): SavedInformation {
  return {
    id: input.id,
    applicationId: APP,
    title: input.title ?? input.id,
    body: "",
    evidence: [],
    establishedAt: input.at === undefined ? AT : input.at,
    presentation: {
      states: input.states,
      views: ["overview"],
      role: input.role ?? "outcome",
      status: input.status ?? "verified",
      checks: input.checks ?? [],
      nextStep: input.nextStep,
    },
    createdAt: AT,
    updatedAt: AT,
    retiredAt: null,
  };
}

const httpCheck = {
  key: "http",
  label: "The homepage answered",
  status: "passed" as const,
  claim: "reachability" as const,
  basis: "observed" as const,
};

function overview(records: SavedInformation[], now: number) {
  return overviewFromRecords({
    records,
    executions: [],
    chats: [],
    applicationId: APP,
    applicationName: "Getting Started",
    headline: "Getting Started",
    now,
    onOpenConversation: () => undefined,
  });
}

describe("the application's own condition, from the record that states it", () => {
  const healthy = record({
    id: "rec-health",
    states: { ref: application, presence: "present" },
    checks: [httpCheck],
  });

  it("reads unassessed while no record states the application", () => {
    // A deployment event touches the application and speaks for nothing.
    const event = record({ id: "rec-deploy", checks: [httpCheck] });
    expect(applicationCondition([event], APP, TEN_MINUTES_ON)).toMatchObject({
      certainty: "unknown",
    });
  });

  it("reads healthy while the claim is in window", () => {
    expect(applicationCondition([healthy], APP, TEN_MINUTES_ON)).toMatchObject({
      certainty: "verified",
    });
  });

  it("reads stale once the claim's horizon has passed", () => {
    // Reachability is worth twelve hours; this is a day old.
    const reading = applicationCondition([healthy], APP, A_DAY_ON);
    expect(reading.certainty).toBe("stale");
    expect(reading.text).toContain("may have changed");
  });

  it("reads failed when a check ran and did not pass, whatever the clock says", () => {
    const failed = record({
      id: "rec-failed",
      status: "failed",
      states: { ref: application, presence: "present" },
      checks: [{ ...httpCheck, status: "failed" }],
    });
    expect(applicationCondition([failed], APP, A_DAY_ON)).toMatchObject({
      certainty: "failed",
    });
  });

  it("keeps the evidence's own time, not the time it was written down", () => {
    // Written now, about evidence gathered a day ago: still a day old.
    const late: SavedInformation = {
      ...healthy,
      createdAt: new Date(A_DAY_ON).toISOString(),
      updatedAt: new Date(A_DAY_ON).toISOString(),
    };
    expect(applicationCondition([late], APP, A_DAY_ON).certainty).toBe("stale");
  });
});

describe("what wants you", () => {
  it("raises a failed check, with Pi's own detail", () => {
    const failed = record({
      id: "rec-failed",
      states: { ref: application, presence: "present" },
      checks: [
        {
          ...httpCheck,
          status: "failed",
          detail: "It answered 502 three times.",
        },
      ],
    });
    const [need] = overview([failed], TEN_MINUTES_ON).needs;
    expect(need.tone).toBe("failed");
    expect(need.title).toBe("The homepage answered");
    expect(need.detail).toBe("It answered 502 three times.");
  });

  it("raises nothing when every check held", () => {
    const healthy = record({
      id: "rec-health",
      states: { ref: application, presence: "present" },
      checks: [httpCheck],
    });
    expect(overview([healthy], TEN_MINUTES_ON).needs).toEqual([]);
  });

  it("offers Pi's recommendation as an idea, in Pi's words", () => {
    const suggestion = record({
      id: "rec-idea",
      title: "SQLite data still needs a backup",
      role: "recommendation",
      status: "warning",
      nextStep: "Configure and verify recurring off-site backups.",
    });
    const [idea] = overview([suggestion], TEN_MINUTES_ON).ideas;
    expect(idea.title).toBe("SQLite data still needs a backup");
    expect(idea.draft).toBe("Configure and verify recurring off-site backups.");
  });
});

describe("what is true now", () => {
  it("puts a volume's check with the application, never with Backups", () => {
    const volume = record({
      id: "rec-volume",
      states: { ref: { kind: "volume", id: "todo-db" }, presence: "present" },
      checks: [
        {
          key: "persistence",
          label: "Data survived a restart",
          status: "passed",
          claim: "contents",
          basis: "observed",
        },
      ],
    });
    // Surviving a restart copied nothing anywhere.
    expect(lane(volume.presentation!.checks[0], volume)).toBe("checks");
    const vitals = overview([volume], TEN_MINUTES_ON).vitals;
    expect(vitals.find((v) => v.id === "checks")!.status.certainty).toBe("verified");
    expect(vitals.find((v) => v.id === "backups")!.status.certainty).toBe("unknown");
    expect(vitals.find((v) => v.id === "backups")!.status.text).toBe(
      "Nobody has looked yet",
    );
  });

  it("keeps a lane stale when any of its claims has lapsed", () => {
    const host = record({
      id: "rec-host",
      states: { ref: { kind: "host", id: "h1" }, presence: "present" },
      checks: [
        { key: "ssh", label: "SSH connected", status: "passed", claim: "reachability", basis: "observed" },
      ],
    });
    const server = (now: number) =>
      overview([host], now).vitals.find((v) => v.id === "server")!;
    expect(server(TEN_MINUTES_ON).status.certainty).toBe("verified");
    expect(server(A_DAY_ON).status.certainty).toBe("stale");
  });

  it("says an established absence is not the same as nobody looking", () => {
    const none = record({
      id: "rec-none",
      title: "Nothing copies this data off the server",
      states: { ref: { kind: "backup-plan", id: "daily" } as Ref, presence: "absent" },
      checks: [
        { key: "copies", label: "No copy exists", status: "info", claim: "contents", basis: "observed", about: { kind: "backup-plan", id: "daily" } as Ref },
      ],
    });
    const vital = overview([none], TEN_MINUTES_ON).vitals.find(
      (v) => v.id === "backups",
    )!;
    expect(vital.status.certainty).toBe("absent");
    expect(vital.status.text).toBe("Not set up");
  });

  it("reserves no countdown, because no recurrence can be written yet", () => {
    expect(
      overview([], TEN_MINUTES_ON).vitals.every(
        (vital) => vital.countdownTo === null,
      ),
    ).toBe(true);
  });
});

describe("what happened", () => {
  it("lists established records newest first", () => {
    const older = record({ id: "rec-older", at: "2026-09-12T15:00:00.000Z", title: "The server answered" });
    const newer = record({ id: "rec-newer", at: "2026-09-12T16:00:00.000Z", title: "The application answered" });
    expect(
      overview([older, newer], TEN_MINUTES_ON).recent.map((item) => item.title),
    ).toEqual(["The application answered", "The server answered"]);
  });

  it("leaves out a record that established nothing", () => {
    const written = record({ id: "rec-none", at: null, title: "A note" });
    expect(overview([written], TEN_MINUTES_ON).recent).toEqual([]);
  });
});
