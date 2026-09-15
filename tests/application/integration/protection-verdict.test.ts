// What the Backups page is allowed to say, for each state it can be in.
//
// Every case here is a sentence the page must not say: a schedule reported as
// protection, a same-host copy reported as surviving the server, a copy
// reported as a recovery, a failure hidden by a later success. The states are
// separate because each wants a different next action, and collapsing any two
// of them is how this page lies.

import { describe, expect, it } from "vitest";

import type { Ref, SavedInformation } from "@/server/operator-data";
import {
  protectionFromRecords,
  protectionVerdict,
} from "@/components/server-guy/backups-records";

const APP = "11111111-2222-4333-8444-555555555555";
const AT = "2026-09-15T10:00:00.000Z";
const NOW = Date.parse("2026-09-15T11:00:00.000Z");
const MUCH_LATER = Date.parse("2026-09-18T11:00:00.000Z");
const A_MONTH_ON = Date.parse("2026-10-20T11:00:00.000Z");

function record(input: {
  id: string;
  ref: Ref;
  at?: string | null;
  presence?: "present" | "absent";
  status?: "info" | "verified" | "failed" | "warning";
  title?: string;
  facts?: { key: string; value: string }[];
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
      states: { ref: input.ref, presence: input.presence ?? "present" },
      views: ["backups"],
      role: "outcome",
      status: input.status ?? "verified",
      checks: input.checks ?? [],
      facts: (input.facts ?? []).map((fact) => ({
        key: fact.key,
        label: fact.key,
        value: fact.value,
        claim: "configuration" as const,
        basis: "observed" as const,
      })),
    },
    createdAt: AT,
    updatedAt: AT,
    retiredAt: null,
  } as unknown as SavedInformation;
}

const plan = (kind: string | null, id = "plan") =>
  record({
    id,
    ref: { kind: "backup-plan", id: "daily" },
    title: "Daily backups are configured",
    facts: [
      { key: "schedule", value: "Daily at 02:30 UTC" },
      { key: "destination", value: "/var/backups/shop" },
      { key: "keep", value: "7" },
      { key: "covers", value: "shop-db, shop-receipts" },
      ...(kind ? [{ key: "destination-kind", value: kind }] : []),
    ],
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

const copy = (
  kind: string,
  at = AT,
  id = "copy",
  status: "verified" | "failed" = "verified",
) =>
  record({
    id,
    at,
    status,
    ref: { kind: "backup-copy", id },
    title: "A copy was written",
    facts: [
      { key: "destination-kind", value: kind },
      { key: "size", value: "2.8 kB" },
    ],
  });

const restore = (at = AT, status: "verified" | "failed" = "verified") =>
  record({
    id: "restore",
    at,
    status,
    ref: { kind: "restore-test", id: "restore-1" },
    title: "A copy was restored and checked",
    facts: [{ key: "covers", value: "shop-db, shop-receipts" }],
  });

const verdict = (records: SavedInformation[], now = NOW) =>
  protectionVerdict(protectionFromRecords(records, now), now);

describe("what the page says, state by state", () => {
  it("no records at all is not assessed, never 'no backups'", () => {
    // The one claim that would stop a reader acting, made on no evidence.
    const said = verdict([]);
    expect(said.state).toBe("not-assessed");
    expect(said.tone).toBe("unknown");
    expect(said.says).toContain("Nobody has looked");
  });

  it("an established absence says there is no backup", () => {
    const said = verdict([
      record({
        id: "none",
        ref: { kind: "backup-plan", id: "daily" },
        presence: "absent",
        title: "Nothing backs this up",
      }),
    ]);
    expect(said.state).toBe("none-configured");
    expect(said.next?.label).toBe("Set up backups");
  });

  it("a schedule with no copy is not protection", () => {
    // The exact shape that used to read green: an active timer and no file.
    const said = verdict([plan("off-site")]);
    expect(said.state).toBe("scheduled-no-copy");
    expect(said.tone).toBe("warning");
    expect(said.limit).toContain("A schedule is not a copy");
  });

  it("copies that are all on the application's own server say so", () => {
    const said = verdict([plan("same-server"), copy("same-server")]);
    expect(said.state).toBe("local-only");
    expect(said.tone).toBe("warning");
    expect(said.limit).toContain("does not survive losing the server");
    expect(said.next?.label).toBe("Add an off-server destination");
  });

  it("a copy off-server with no restore is still untested", () => {
    const said = verdict([plan("off-site"), copy("off-site")]);
    expect(said.state).toBe("offsite-untested");
    expect(said.tone).toBe("warning");
    expect(said.limit).toContain("nobody has restored");
    expect(said.next?.label).toBe("Test a restore");
  });

  it("only a restore that ran earns the verified tone", () => {
    const said = verdict([plan("off-site"), copy("off-site"), restore()]);
    expect(said.state).toBe("restore-verified");
    expect(said.tone).toBe("verified");
    expect(said.limit).toBeNull();
  });

  it("a restore of a same-host copy is verified recovery and not off-server safety", () => {
    // Both things are true and the page has to say both: the data can be
    // recovered, and it does not survive the machine.
    const said = verdict([plan("same-server"), copy("same-server"), restore()]);
    expect(said.tone).toBe("verified");
    expect(said.limit).toContain("not that it survives losing the machine");
    expect(said.next?.label).toBe("Add an off-server destination");
  });

  it("a failed copy outranks the copies that worked", () => {
    const said = verdict([
      plan("off-site"),
      copy("off-site", AT, "good"),
      copy("off-site", "2026-09-15T10:30:00.000Z", "bad", "failed"),
    ]);
    expect(said.state).toBe("backup-failed");
    expect(said.tone).toBe("failed");
  });

  it("a failed restore outranks a failed copy and everything else", () => {
    const said = verdict([
      plan("off-site"),
      copy("off-site"),
      restore(AT, "failed"),
    ]);
    expect(said.state).toBe("restore-failed");
    expect(said.tone).toBe("failed");
    expect(said.limit).toContain("unproven");
  });

  it("a failed copy is not counted as a copy", () => {
    const protection = protectionFromRecords(
      [plan("off-site"), copy("off-site", AT, "bad", "failed")],
      NOW,
    );
    expect(protection.copies).toHaveLength(0);
    expect(protection.failures.copy?.id).toBe("bad");
  });

  it("a daily schedule whose newest copy is older than that is overdue", () => {
    const said = verdict([plan("off-site"), copy("off-site")], MUCH_LATER);
    expect(said.state).toBe("backup-overdue");
    expect(said.tone).toBe("warning");
  });

  it("a restore proved long ago stops vouching for the copy it proved", () => {
    // No schedule, so nothing is overdue; the newest copy *was* the one
    // restored, so nothing newer is untested. What is left is that the proof
    // itself is five weeks old, which says little about the destination
    // today. Deliberately without a plan: with a daily schedule this state is
    // unreachable, because a copy old enough for the proof to lapse is also a
    // copy old enough to be overdue, and that is the more urgent thing.
    const said = verdict(
      [
        copy("off-site", "2026-09-15T10:00:00.000Z", "proved"),
        restore("2026-09-15T10:30:00.000Z"),
      ],
      A_MONTH_ON,
    );
    expect(said.state).toBe("evidence-stale");
    expect(said.tone).toBe("warning");
    expect(said.next?.label).toBe("Test a restore again");
  });

  it("an overdue backup outranks stale restore evidence", () => {
    // Both are true and this is the more urgent one: nothing is being copied
    // at all, which matters more than the age of the last restore test.
    const said = verdict(
      [plan("off-site"), copy("off-site"), restore()],
      A_MONTH_ON,
    );
    expect(said.state).toBe("backup-overdue");
  });
});

describe("where the copies go", () => {
  it("an undeclared destination is unclassified, not assumed safe", () => {
    const protection = protectionFromRecords([plan(null)], NOW);
    expect(protection.destinations).toEqual(["unclassified"]);
    // And unclassified must not satisfy the off-server question.
    const said = verdict([plan(null), copy("unclassified")]);
    expect(said.state).toBe("local-only");
  });

  it("the controller's own machine counts as off the application host", () => {
    const said = verdict([plan("controller"), copy("controller")]);
    expect(said.state).toBe("offsite-untested");
  });

  it("a provider snapshot alone is not an application-aware copy", () => {
    // It can rebuild the machine; it says nothing about the data, so it must
    // not answer the question this page asks.
    const said = verdict([plan("provider")]);
    expect(said.state).toBe("scheduled-no-copy");
  });

  it("keeps every class a plan declares, because they differ", () => {
    const protection = protectionFromRecords(
      [plan("same-server"), copy("off-site", AT, "offsite")],
      NOW,
    );
    expect(new Set(protection.destinations)).toEqual(
      new Set(["same-server", "off-site"]),
    );
  });
});

describe("which copy a restore actually proved", () => {
  it("does not let an older proof vouch for a newer copy", () => {
    // The shape the 15 September run produced: a same-server archive that was
    // restored, then a fresh copy pulled to the controller that never was.
    // "Recovery proved" over that newer, untested file is an overclaim.
    const proved = copy("same-server", "2026-09-15T10:00:00.000Z", "proved");
    const fresh = copy("controller", "2026-09-15T10:45:00.000Z", "fresh");
    const said = verdict(
      [plan("controller"), proved, restore("2026-09-15T10:10:00.000Z"), fresh],
      NOW,
    );
    expect(said.state).toBe("offsite-untested");
    expect(said.tone).toBe("warning");
    expect(said.limit).toContain("worked at least once");
    expect(said.next?.label).toBe("Test a restore of the newest copy");
  });

  it("reads verified when the restore is of the newest copy", () => {
    const said = verdict(
      [
        plan("controller"),
        copy("controller", "2026-09-15T10:00:00.000Z", "newest"),
        restore("2026-09-15T10:10:00.000Z"),
      ],
      NOW,
    );
    expect(said.state).toBe("restore-verified");
    expect(said.tone).toBe("verified");
  });
});
