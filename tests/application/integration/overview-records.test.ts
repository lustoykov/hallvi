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
  facts?: { key: string; value: string }[];
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
      facts: (input.facts ?? []).map((fact) => ({
        key: fact.key,
        label: fact.key,
        value: fact.value,
        claim: "configuration" as const,
        basis: "observed" as const,
      })),
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

function overview(
  records: SavedInformation[],
  now: number,
  accessClosed = false,
) {
  return overviewFromRecords({
    records,
    executions: [],
    chats: [],
    applicationId: APP,
    applicationName: "Getting Started",
    headline: "Getting Started",
    now,
    accessClosed,
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

  it("lets a newer result replace an older failure with the same key", () => {
    const failed = record({
      id: "rec-old-failure",
      at: "2026-09-12T15:00:00.000Z",
      status: "failed",
      states: { ref: application, presence: "present" },
      checks: [{ ...httpCheck, status: "failed" }],
    });
    const recovered = record({
      id: "rec-recovered",
      states: { ref: application, presence: "present" },
      checks: [httpCheck],
    });

    const result = overview([failed, recovered], TEN_MINUTES_ON);
    expect(result.needs).toEqual([]);
    expect(result.vitals.find((v) => v.id === "checks")!.status.certainty).toBe(
      "verified",
    );
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
    expect(vitals.find((v) => v.id === "checks")!.status.certainty).toBe(
      "verified",
    );
    expect(vitals.find((v) => v.id === "backups")!.status.certainty).toBe(
      "unknown",
    );
    expect(vitals.find((v) => v.id === "backups")!.status.text).toBe(
      "Nobody has looked yet",
    );
  });

  it("keeps a lane stale when any of its claims has lapsed", () => {
    const host = record({
      id: "rec-host",
      states: { ref: { kind: "host", id: "h1" }, presence: "present" },
      checks: [
        {
          key: "ssh",
          label: "SSH connected",
          status: "passed",
          claim: "reachability",
          basis: "observed",
        },
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
      states: {
        ref: { kind: "backup-plan", id: "daily" } as Ref,
        presence: "absent",
      },
      checks: [
        {
          key: "copies",
          label: "No copy exists",
          status: "info",
          claim: "contents",
          basis: "observed",
          about: { kind: "backup-plan", id: "daily" } as Ref,
        },
      ],
    });
    const vital = overview([none], TEN_MINUTES_ON).vitals.find(
      (v) => v.id === "backups",
    )!;
    expect(vital.status.certainty).toBe("absent");
    expect(vital.status.text).toBe("Nothing backs this up");
  });

  it("reads a declared absence even when it has no check", () => {
    const none = record({
      id: "rec-none-without-check",
      states: {
        ref: { kind: "backup-plan", id: "daily" } as Ref,
        presence: "absent",
      },
    });
    const vital = overview([none], TEN_MINUTES_ON).vitals.find(
      (v) => v.id === "backups",
    )!;
    expect(vital.status.certainty).toBe("absent");
    expect(vital.status.text).toBe("Nothing backs this up");
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
    const older = record({
      id: "rec-older",
      at: "2026-09-12T15:00:00.000Z",
      title: "The server answered",
    });
    const newer = record({
      id: "rec-newer",
      at: "2026-09-12T16:00:00.000Z",
      title: "The application answered",
    });
    expect(
      overview([older, newer], TEN_MINUTES_ON).recent.map((item) => item.title),
    ).toEqual(["The application answered", "The server answered"]);
  });

  it("leaves out a record that established nothing", () => {
    const written = record({ id: "rec-none", at: null, title: "A note" });
    expect(overview([written], TEN_MINUTES_ON).recent).toEqual([]);
  });
});

describe("a tunnel the controller has just found closed", () => {
  // The record that says where the application answers is not wrong and is
  // not withdrawn: it was true when it was written. What has changed is
  // something only the controller can know, by asking its own tunnel, and
  // the Access lane is where Overview reports exactly that.
  const accessRecord = record({
    id: "access",
    title: "Getting Started is available privately from this PC",
    states: { ref: { kind: "access", id: "private" }, presence: "present" },
    checks: [
      {
        key: "tunnel",
        label: "The tunnel reached the application",
        status: "passed",
        claim: "reachability",
        basis: "observed",
      },
    ],
  });

  it("reads verified while nothing says otherwise", () => {
    const access = overview([accessRecord], TEN_MINUTES_ON).vitals.find(
      (vital) => vital.id === "access",
    );
    expect(access?.status.certainty).toBe("verified");
    expect(access?.status.text).toContain("Checked");
  });

  it("reports the closed tunnel instead of the recorded pass", () => {
    const access = overview([accessRecord], TEN_MINUTES_ON, true).vitals.find(
      (vital) => vital.id === "access",
    );
    expect(access?.status.certainty).toBe("failed");
    expect(access?.status.text).toBe("Tunnel is closed");
    // Pi's own sentence said the application was available from this PC.
    // Repeating it under a closed tunnel is the same claim in longer words.
    expect(access?.plain).toBe("Tunnel is closed");
  });

  it("leaves the other lanes alone", () => {
    // The application, its data and the server are exactly as they were:
    // only the way in from this PC is gone, and a closed tunnel is not
    // evidence about any of them.
    const checks = record({
      id: "health",
      states: { ref: application, presence: "present" },
      checks: [httpCheck],
    });
    const built = overview([accessRecord, checks], TEN_MINUTES_ON, true);
    expect(
      built.vitals.find((vital) => vital.id === "checks")?.status.certainty,
    ).toBe("verified");
    expect(applicationCondition([checks], APP, TEN_MINUTES_ON).certainty).toBe(
      "verified",
    );
  });
});

describe("a backup plan that is set up and protects less than its name implies", () => {
  // The real records from the 14 September Shop run. Pi did the right thing
  // in both: the plan is a warning whose body says it does not protect
  // against losing the machine, and the copy that exists says a restore has
  // never been performed. The lane used to read only the checks, so a passing
  // "timer is active" printed green under the word Backups.
  const sameHostPlan = record({
    id: "plan",
    title: "Daily same-host backups are configured",
    status: "warning",
    states: {
      ref: { kind: "backup-plan", id: "shop-local-backup" },
      presence: "present",
    },
    checks: [
      {
        key: "configured",
        label: "Daily backup timer is active",
        status: "passed",
        claim: "configuration",
        basis: "observed",
      },
    ],
  });

  it("does not read as verified on the strength of a passing timer check", () => {
    const lane = overview([sameHostPlan], TEN_MINUTES_ON).vitals.find(
      (vital) => vital.id === "backups",
    );
    expect(lane?.status.certainty).not.toBe("verified");
    expect(lane?.status.certainty).toBe("warning");
    expect(lane?.value).toBe("Limited");
    // Named for what is missing rather than for the fact of a limit: there is
    // a schedule on record and no copy anywhere, which is the more useful
    // half of the sentence.
    expect(lane?.status.text).toBe("Scheduled, no copy yet");
  });

  it("keeps Pi's own sentence about what the limit is", () => {
    // The body is the only place the reader learns *what* the limit is, so a
    // lane that says "with a limit" has to carry it.
    const spoken = {
      ...sameHostPlan,
      body: "It does not protect against loss of the entire server.",
    };
    const lane = overview([spoken], TEN_MINUTES_ON).vitals.find(
      (vital) => vital.id === "backups",
    );
    expect(lane?.plain).toContain("does not protect against loss");
  });

  it("a judgement does not age into something softer", () => {
    // A day later the configuration claim is still inside its window, so
    // without the judgement the lane would still be green rather than stale.
    const lane = overview([sameHostPlan], A_DAY_ON).vitals.find(
      (vital) => vital.id === "backups",
    );
    expect(lane?.status.certainty).toBe("warning");
  });

  it("a failed check still outranks a warning", () => {
    const broken = record({
      id: "broken",
      status: "warning",
      states: {
        ref: { kind: "backup-plan", id: "shop-local-backup" },
        presence: "present",
      },
      checks: [
        {
          key: "configured",
          label: "Daily backup timer is active",
          status: "failed",
          claim: "configuration",
          basis: "observed",
        },
      ],
    });
    const lane = overview([broken], TEN_MINUTES_ON).vitals.find(
      (vital) => vital.id === "backups",
    );
    expect(lane?.status.certainty).toBe("failed");
  });

  it("a plan Pi is content with, and has carried out, reads verified", () => {
    // The fix must not paint every backup plan amber. What earns verified is
    // the plan plus the evidence: a copy that left the host and a restore
    // that was actually tried. A schedule on its own never reads verified,
    // however content Pi is with it — that is the whole point of the verdict.
    const plan = record({
      id: "offsite",
      status: "verified",
      states: {
        ref: { kind: "backup-plan", id: "shop-offsite" },
        presence: "present",
      },
      checks: [
        {
          key: "configured",
          label: "Daily off-site copy is active",
          status: "passed",
          claim: "configuration",
          basis: "observed",
        },
      ],
    });
    const copy = record({
      id: "offsite-copy",
      at: "2026-09-14T15:00:00.000Z",
      status: "verified",
      states: {
        ref: { kind: "backup-copy", id: "shop-offsite-1" },
        presence: "present",
      },
      facts: [
        { key: "destination-kind", value: "off-site" },
        { key: "destination", value: "the computer running Server Guy" },
      ],
    });
    const restore = record({
      id: "offsite-restore",
      at: "2026-09-14T16:00:00.000Z",
      status: "verified",
      states: {
        ref: { kind: "restore-test", id: "shop-offsite-restore" },
        presence: "present",
      },
    });
    const lane = overview([plan, copy, restore], TEN_MINUTES_ON).vitals.find(
      (vital) => vital.id === "backups",
    );
    expect(lane?.status.certainty).toBe("verified");
  });
});

describe("which time a stale reading cites", () => {
  // The real shape from the 15 September run: one reachability check from
  // yesterday sitting beside five observations minutes old. The lane is
  // rightly stale, and the number beside it has to be the lapsed claim's.
  const application: Ref = { kind: "application", id: APP };
  const lapsed = record({
    id: "yesterday",
    at: "2026-09-12T16:05:00.000Z",
    states: { ref: application, presence: "present" },
    checks: [
      {
        key: "workflow",
        label: "The order workflow ran end to end",
        status: "passed",
        claim: "reachability",
        basis: "observed",
      },
    ],
  });
  const fresh = record({
    id: "just-now",
    at: "2026-09-13T16:00:00.000Z",
    states: { ref: application, presence: "present" },
    checks: [
      {
        key: "http",
        label: "The homepage answered",
        status: "passed",
        claim: "liveness",
        basis: "observed",
      },
    ],
  });

  it("cites the lapsed claim, not the newest observation", () => {
    const condition = applicationCondition([lapsed, fresh], APP, A_DAY_ON);
    expect(condition.certainty).toBe("stale");
    // A_DAY_ON is five minutes after `fresh` and a day after `lapsed`.
    expect(condition.text).toContain("1 d ago");
    expect(condition.text).not.toContain("5 min ago");
  });

  it("does the same for a lane caption", () => {
    const lane = overview([lapsed, fresh], A_DAY_ON).vitals.find(
      (vital) => vital.id === "checks",
    );
    expect(lane?.status.certainty).toBe("stale");
    expect(lane?.status.text).toBe("Last checked 1 d ago");
  });
});
