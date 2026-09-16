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

/**
 * A restore test. `of` is the id of the copy it opened, which is the only
 * thing that lets the page say a particular file has been proved: a restore
 * that names no copy proves recovery has worked and vouches for nothing being
 * kept now.
 */
const restore = (
  at = AT,
  status: "verified" | "failed" = "verified",
  of: string | null = "copy",
) =>
  record({
    id: "restore",
    at,
    status,
    ref: { kind: "restore-test", id: "restore-1" },
    title: "A copy was restored and checked",
    facts: [
      { key: "covers", value: "shop-db, shop-receipts" },
      ...(of ? [{ key: "restored-copy", value: of }] : []),
    ],
  });

const verdict = (records: SavedInformation[], now = NOW) =>
  protectionVerdict(protectionFromRecords(records, now), now);

// Every verdict the page can reach, and the words each one owes the reader.
// The rows are ordered the way the verdict ranks them, so a row that also
// matches an earlier condition documents which one wins.
describe("what the page says, state by state", () => {
  const absent = record({
    id: "none",
    ref: { kind: "backup-plan", id: "daily" },
    presence: "absent",
    title: "Nothing backs this up",
  });
  const older = "2026-09-15T10:00:00.000Z";
  const newer = "2026-09-15T10:30:00.000Z";

  it.each([
    {
      when: "nothing has looked",
      // The one claim that would stop a reader acting, made on no evidence.
      records: [],
      state: "not-assessed",
      tone: "unknown",
      says: /Nobody has looked/,
    },
    {
      when: "a record states there is no backup",
      records: [absent],
      state: "none-configured",
      next: "Set up backups",
    },
    {
      when: "a schedule exists and no copy does",
      // The exact shape that used to read green: an active timer, no file.
      records: [plan("off-site")],
      state: "scheduled-no-copy",
      tone: "warning",
      limit: /A schedule is not a copy/,
    },
    {
      when: "every copy is on the application's own server",
      records: [plan("same-server"), copy("same-server")],
      state: "local-only",
      tone: "warning",
      limit: /does not survive losing the server/,
      next: "Add an off-server destination",
    },
    {
      when: "a copy is off-server and nothing has opened it",
      records: [plan("off-site"), copy("off-site")],
      state: "offsite-untested",
      tone: "warning",
      limit: /nobody has restored/,
      next: "Test a restore",
    },
    {
      when: "a restore of that copy ran",
      records: [plan("off-site"), copy("off-site"), restore()],
      state: "restore-verified",
      tone: "verified",
      limit: null,
    },
    {
      when: "the restored copy was on the same host",
      // Both things are true and the page owes the reader both: the data can
      // be recovered, and it does not survive the machine.
      records: [plan("same-server"), copy("same-server"), restore()],
      tone: "verified",
      limit: /not that it survives losing the machine/,
      next: "Add an off-server destination",
    },
    {
      when: "the newest copy is older than the schedule promises",
      records: [plan("off-site"), copy("off-site")],
      now: MUCH_LATER,
      state: "backup-overdue",
      tone: "warning",
    },
    {
      when: "nothing is being copied and the proof has also lapsed",
      // Both are true; being copied at all is the more urgent one.
      records: [plan("off-site"), copy("off-site"), restore()],
      now: A_MONTH_ON,
      state: "backup-overdue",
    },
    {
      when: "the proof has lapsed and nothing is overdue",
      // No schedule, so nothing is overdue, and the newest copy is the one
      // that was restored. What is left is a five-week-old proof, which says
      // little about the destination today. With a daily schedule this state
      // is unreachable: a copy old enough for the proof to lapse is overdue.
      records: [
        copy("off-site", older, "proved"),
        restore(newer, "verified", "proved"),
      ],
      now: A_MONTH_ON,
      state: "evidence-stale",
      tone: "warning",
      next: "Test a restore again",
    },
    {
      when: "a copy failed, whatever the copies before it did",
      records: [
        plan("off-site"),
        copy("off-site", older, "good"),
        copy("off-site", newer, "bad", "failed"),
      ],
      state: "backup-failed",
      tone: "failed",
    },
    {
      when: "a restore failed, which outranks everything",
      records: [plan("off-site"), copy("off-site"), restore(AT, "failed")],
      state: "restore-failed",
      tone: "failed",
      limit: /unproven/,
    },
  ])("$when", ({ records, now, state, tone, says, limit, next }) => {
    const said = verdict(records, now ?? NOW);
    if (state) expect(said.state).toBe(state);
    if (tone) expect(said.tone).toBe(tone);
    if (says) expect(said.says).toMatch(says);
    if (limit !== undefined)
      limit === null
        ? expect(said.limit).toBeNull()
        : expect(said.limit).toMatch(limit);
    if (next) expect(said.next?.label).toBe(next);
  });

  it("does not count a failed copy as a copy", () => {
    const protection = protectionFromRecords(
      [plan("off-site"), copy("off-site", AT, "bad", "failed")],
      NOW,
    );
    expect(protection.copies).toHaveLength(0);
    expect(protection.failures.copy?.id).toBe("bad");
  });
});

describe("where the copies go", () => {
  it("an undeclared destination is unclassified, not assumed safe", () => {
    const protection = protectionFromRecords([plan(null)], NOW);
    // A plan's destination is intent, and belongs with the other intent.
    expect(protection.plannedDestinations).toEqual(["unclassified"]);
    expect(protection.destinations).toEqual([]);
    // And unclassified must satisfy neither the off-server question nor the
    // on-server one: "all of them are on the application's own server" is a
    // claim about a location, and no record here makes it.
    const said = verdict([plan(null), copy("unclassified")]);
    expect(said.state).toBe("destination-unknown");
    expect(said.tone).toBe("warning");
    expect(said.says).toContain("nothing records where the newest one went");
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

  it("keeps a plan's intent apart from where copies actually went", () => {
    const protection = protectionFromRecords(
      [plan("same-server"), copy("off-site", AT, "offsite")],
      NOW,
    );
    expect(protection.destinations).toEqual(["off-site"]);
    expect(protection.plannedDestinations).toEqual(["same-server"]);
  });

  it("an off-site plan over a same-server copy does not claim a transfer", () => {
    // The sentence this forbids: "Copies are reaching a destination off the
    // application's server," printed over a bucket nothing had ever written
    // to, because a plan said it meant to. A plan describes intent and cannot
    // establish a transfer.
    const said = verdict([
      plan("off-site"),
      copy("same-server", AT, "beside-the-app"),
    ]);
    expect(said.says).not.toContain("off the application's server");
    expect(said.state).toBe("local-only");
    expect(said.says).toContain("on the application's own server");
  });
});

describe("which copy a restore actually proved", () => {
  it("reads verified when the restore is of the newest copy", () => {
    const said = verdict(
      [
        plan("controller"),
        copy("controller", "2026-09-15T10:00:00.000Z", "newest"),
        restore("2026-09-15T10:10:00.000Z", "verified", "newest"),
      ],
      NOW,
    );
    expect(said.state).toBe("restore-verified");
    expect(said.tone).toBe("verified");
  });

  it("a restore of an older copy does not verify a newer one, whatever the clock says", () => {
    // The exact sequence the timestamp comparison got wrong: copy B is made,
    // then older copy A is restored. The newest restore is now later than the
    // newest copy, and reading that as proof called B verified when nothing
    // had ever opened it.
    const older = copy("off-site", "2026-09-15T09:00:00.000Z", "a");
    const newer = copy("off-site", "2026-09-15T09:30:00.000Z", "b");
    const said = verdict(
      [older, newer, restore("2026-09-15T10:30:00.000Z", "verified", "a")],
      NOW,
    );
    expect(said.state).toBe("offsite-untested");
    expect(said.tone).toBe("warning");
    expect(said.limit).toContain("worked at least once");
    expect(said.next?.label).toBe("Test a restore of the newest copy");
  });

  it("a restore naming no copy says so, rather than vouching for the newest", () => {
    const said = verdict(
      [
        copy("off-site", "2026-09-15T10:00:00.000Z", "only"),
        restore("2026-09-15T10:30:00.000Z", "verified", null),
      ],
      NOW,
    );
    expect(said.state).toBe("offsite-untested");
    expect(said.limit).toContain("no record says which copy it opened");
  });
});

describe("what the plan leaves out", () => {
  const volume = (id: string, holds: string) =>
    record({
      id: `volume-${id}`,
      ref: { kind: "volume", id },
      title: `${id} is on disk`,
      facts: [{ key: "holds", value: holds }],
    });

  /** A plan naming exactly what `covers` says, so each case sets its own. */
  const planCovering = (what: string) =>
    record({
      id: "plan",
      ref: { kind: "backup-plan", id: "daily" },
      title: "Daily backups are configured",
      facts: [
        { key: "schedule", value: "Daily at 02:30 UTC" },
        { key: "destination", value: "s3://shop-backups" },
        { key: "destination-kind", value: "off-site" },
        { key: "covers", value: what },
      ],
    });

  const map = (edges: { from: string; to: string }[]) =>
    ({
      ...record({ id: "map", ref: { kind: "application", id: APP } }),
      presentation: {
        states: { ref: { kind: "application", id: APP }, presence: "present" },
        views: ["architecture"],
        role: "outcome",
        status: "verified",
        checks: [],
        content: {
          kind: "topology",
          from: "observed",
          parts: [],
          edges: edges.map((edge) => ({ ...edge, network: "disk" })),
        },
      },
    }) as unknown as SavedInformation;

  it("names the data on record that no plan says it copies", () => {
    const said = protectionVerdict(
      protectionFromRecords(
        [
          planCovering("shop-db"),
          copy("off-site", "2026-09-15T10:00:00.000Z", "c1"),
          restore("2026-09-15T10:30:00.000Z", "verified", "c1"),
          volume("shop-db", "PostgreSQL's data"),
          volume("shop-uploads", "Uploaded receipts"),
        ],
        NOW,
        APP,
      ),
      NOW,
    );
    // Restored and proved, and still not the whole story: a verified restore
    // of a copy that never held the uploads is not protection of the uploads.
    expect(said.tone).toBe("warning");
    expect(said.limit).toContain("Uploaded receipts");
    expect(said.limit).not.toContain("PostgreSQL's data");
  });

  it("counts a database dump as covering the volume its files live in", () => {
    // A nightly pg_dump copies those bytes as surely as copying the volume
    // would. Reading only volume names put "not in the backup plan" on a
    // volume the plan covered through its owner.
    const protection = protectionFromRecords(
      [
        planCovering("shop-postgres"),
        volume("shop-db", "PostgreSQL's data"),
        map([{ from: "shop-postgres", to: "shop-db" }]),
      ],
      NOW,
      APP,
    );
    expect(protection.uncovered).toEqual([]);
  });

  it("says nothing about coverage for a volume nobody has written down", () => {
    // An absent record is nobody having looked, and inventing a hole from
    // silence is the same error as inventing protection from it.
    const protection = protectionFromRecords(
      [planCovering("shop-db")],
      NOW,
      APP,
    );
    expect(protection.uncovered).toEqual([]);
  });
});

describe("evidence belongs to the copy that carries it", () => {
  // Found by review of the first fix: restore proof became specific to a copy
  // while destination and coverage were still read across all of them. Both
  // let one copy's virtue answer for another's.

  /** A copy that says what it captured as well as where it went. */
  const held = (
    id: string,
    at: string,
    kind: string,
    covers: string | null = null,
  ) =>
    record({
      id,
      at,
      ref: { kind: "backup-copy", id },
      title: "A copy was written",
      facts: [
        { key: "destination-kind", value: kind },
        { key: "size", value: "2.8 kB" },
        ...(covers ? [{ key: "covers", value: covers }] : []),
      ],
    });

  const volume = (id: string, holds: string) =>
    record({
      id: `volume-${id}`,
      ref: { kind: "volume", id },
      title: `${id} is on disk`,
      facts: [{ key: "holds", value: holds }],
    });

  const restoreOf = (of: string, at: string, covers: string | null) =>
    record({
      id: "restore",
      at,
      ref: { kind: "restore-test", id: "restore-1" },
      title: "A copy was restored and checked",
      facts: [
        ...(covers ? [{ key: "covers", value: covers }] : []),
        { key: "restored-copy", value: of },
      ],
    });

  const planCovering = (what: string, at = AT) =>
    record({
      id: "plan",
      at,
      ref: { kind: "backup-plan", id: "daily" },
      title: "Daily backups are configured",
      facts: [
        { key: "schedule", value: "Daily at 02:30 UTC" },
        { key: "destination", value: "s3://shop-backups" },
        { key: "destination-kind", value: "off-site" },
        { key: "covers", value: what },
      ],
    });

  it("does not let an older off-site copy vouch for a newer local one", () => {
    // Restoring the newest copy proves the newest copy. It does not move it
    // off the server, and an off-site copy from last week is a different
    // recovery point rather than a property of this one.
    const said = verdict([
      held("old-offsite", "2026-09-14T10:00:00.000Z", "off-site"),
      held("fresh-local", "2026-09-15T09:00:00.000Z", "same-server"),
      restore("2026-09-15T09:30:00.000Z", "verified", "fresh-local"),
    ]);
    expect(said.state).toBe("restore-verified");
    // Review found this returning limit:null and next:null, because an
    // off-site copy from yesterday satisfied the off-server question for a
    // copy written today.
    expect(said.limit).toBeTruthy();
    expect(said.limit).toContain("on the application's own server");
    // The older off-site copy is still worth knowing about, said as its own
    // recovery point and not as reassurance about the newest.
    expect(said.limit).toContain("off the server");
    expect(said.next).not.toBeNull();
  });

  const covered = (records: SavedInformation[]) =>
    protectionVerdict(protectionFromRecords(records, NOW, APP), NOW);

  it("does not let a widened plan add data to copies already taken", () => {
    // The plan learns about the uploads today. Every copy on the shelf was
    // taken before it did, and none of them contains an upload.
    const said = covered([
      planCovering("shop-db, shop-uploads", "2026-09-15T10:00:00.000Z"),
      held("db-only", "2026-09-15T09:00:00.000Z", "off-site", "shop-db"),
      // The restore says what it brought back, and it was the database.
      restoreOf("db-only", "2026-09-15T09:30:00.000Z", "shop-db"),
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
    ]);
    expect(said.tone).toBe("warning");
    expect(said.limit).toContain("Customer uploads");
    expect(said.next?.label).toBe("Cover the rest");
  });

  it("says coverage is unrecorded, whether the plan is older or newer", () => {
    // Neither the copy nor the restore recorded what was in it, so nothing
    // establishes what would come back. The plan cannot answer it at any age:
    // an older plan is intent too. The restore still happened and still
    // counts, and nothing here claims data is missing.
    for (const planAt of [
      "2026-09-15T08:00:00.000Z",
      "2026-09-15T10:00:00.000Z",
    ]) {
      const said = covered([
        planCovering("shop-db, shop-uploads", planAt),
        held("silent", "2026-09-15T09:00:00.000Z", "off-site"),
        restoreOf("silent", "2026-09-15T09:30:00.000Z", null),
        volume("shop-db", "PostgreSQL's data"),
        volume("shop-uploads", "Customer uploads"),
      ]);
      expect(said.state, planAt).toBe("restore-verified");
      expect(said.says, planAt).toContain("restored and checked");
      expect(said.limit, planAt).toContain(
        "No record says what that copy contains",
      );
      // Not an accusation: nothing says the uploads are absent, only that
      // nobody wrote down what is there.
      expect(said.limit, planAt).not.toContain("Customer uploads");
      expect(said.next?.label, planAt).toBe("Check what the copy holds");
    }
  });

  it("prefers what the restore brought back to what the plan intends", () => {
    // A restore that says what it recovered is the strongest evidence there
    // is about a copy's contents, and outranks the copy's own claim.
    const said = covered([
      planCovering("shop-db, shop-uploads", "2026-09-15T08:00:00.000Z"),
      held(
        "claims-both",
        "2026-09-15T09:00:00.000Z",
        "off-site",
        "shop-db, shop-uploads",
      ),
      restoreOf("claims-both", "2026-09-15T09:30:00.000Z", "shop-db"),
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
    ]);
    expect(said.limit).toContain("The restore did not bring back");
    expect(said.limit).toContain("Customer uploads");
  });

  it("clears the coverage warning once a copy actually holds the data", () => {
    // The other half of the rule: a copy taken after the plan widened, whose
    // own record says it captured both, is not warned about.
    const said = covered([
      planCovering("shop-db, shop-uploads", "2026-09-15T08:00:00.000Z"),
      held(
        "both",
        "2026-09-15T09:00:00.000Z",
        "off-site",
        "shop-db, shop-uploads",
      ),
      restoreOf("both", "2026-09-15T09:30:00.000Z", "shop-db, shop-uploads"),
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
    ]);
    expect(said.state).toBe("restore-verified");
    expect(said.limit).toBeNull();
  });

  it("keeps each copy's destination on that copy", () => {
    const protection = protectionFromRecords(
      [
        held("old-offsite", "2026-09-14T10:00:00.000Z", "off-site"),
        held("fresh-local", "2026-09-15T09:00:00.000Z", "same-server"),
      ],
      NOW,
    );
    expect(protection.copies[0].id).toBe("fresh-local");
    expect(protection.copies[0].kind).toBe("same-server");
    expect(protection.copies[1].kind).toBe("off-site");
  });
});

describe("a plan that is on record, and a record saying there is none", () => {
  it("does not count an established absence as a plan", () => {
    // `plans` is every subject a record speaks about, which includes one
    // whose whole content is "there is no plan". Counting those meant an
    // application Server Guy had checked and found unprotected read as
    // planned — latent in the verdict and live the moment anything else
    // asked the question.
    const absent = record({
      id: "looked",
      ref: { kind: "backup-plan", id: "daily" },
      presence: "absent",
      status: "warning",
      title: "Nothing is copying this application's data",
    });
    const protection = protectionFromRecords([absent], NOW);
    expect(protection.declaredAbsent).toBe(true);
    expect(protection.planned).toBe(false);
  });

  it("still counts a plan that is stated", () => {
    expect(protectionFromRecords([plan("off-site")], NOW).planned).toBe(true);
  });
});

describe("the owner's words for what is copied", () => {
  it("prints what a volume says it holds, not the id a page matches on", () => {
    const volume = record({
      id: "volume-shop-uploads",
      ref: { kind: "volume", id: "shop-uploads" },
      title: "shop-uploads is on disk",
      facts: [{ key: "holds", value: "Customer uploads" }],
    });
    const covering = record({
      id: "plan",
      ref: { kind: "backup-plan", id: "daily" },
      title: "Daily backups are configured",
      facts: [
        { key: "schedule", value: "Daily at 02:30 UTC" },
        { key: "destination-kind", value: "off-site" },
        { key: "covers", value: "shop-uploads" },
      ],
    });
    const protection = protectionFromRecords([covering, volume], NOW, APP);
    expect(protection.coverLabels).toEqual(["Customer uploads"]);
    expect(protection.names.get("shop-uploads")).toBe("Customer uploads");
  });

  it("leaves an id nothing names as itself", () => {
    // Honest, and also a sign that nobody has written that subject down.
    const covering = record({
      id: "plan",
      ref: { kind: "backup-plan", id: "daily" },
      title: "Daily backups are configured",
      facts: [
        { key: "schedule", value: "Daily at 02:30 UTC" },
        { key: "destination-kind", value: "off-site" },
        { key: "covers", value: "shop-mystery" },
      ],
    });
    expect(protectionFromRecords([covering], NOW, APP).coverLabels).toEqual([
      "shop-mystery",
    ]);
  });
});

describe("a failed check on a plan is not a failed backup attempt", () => {
  // Found on a live Pi run: a plan record saying there is no plan, with a
  // failed `configured` check, and a copy taken three minutes ago. The page
  // led with "The last backup attempt failed" directly above a stage saying
  // the latest backup succeeded, and the two were reading the same records.
  const brokenPlan = record({
    id: "broken",
    status: "warning",
    ref: { kind: "backup-plan", id: "daily" },
    title: "Nothing backs this up",
    presence: "absent",
    checks: [
      {
        key: "configured",
        label: "Off-server backup plan is configured",
        status: "failed",
        claim: "configuration",
        basis: "observed",
      },
    ],
  });

  it("does not claim an attempt when nothing attempted anything", () => {
    // A record stating the plan is absent is answered by the absence, which
    // is the more specific thing to say than that a check failed.
    const said = verdict([brokenPlan]);
    expect(said.says).not.toContain("attempt failed");
    expect(said.says).toContain("there is no backup");
  });

  it("a plan that exists and whose check failed says the plan is broken", () => {
    const stopped = record({
      id: "stopped",
      status: "warning",
      ref: { kind: "backup-plan", id: "daily" },
      title: "The backup timer is not running",
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
    const said = verdict([stopped]);
    expect(said.says).toBe("The backup plan is not working.");
    expect(said.says).not.toContain("attempt failed");
    expect(said.tone).toBe("failed");
  });

  it("never invents a plan the records say is absent", () => {
    // The live rig: a record saying there is no plan, with a failed check,
    // and a copy that was taken and restored. The page said the plan was not
    // working an inch above a stage saying there was no plan.
    const said = verdict([brokenPlan, copy("controller")]);
    expect(said.says).not.toContain("plan is not working");
    expect(said.says).not.toContain("attempt failed");
  });

  it("a copy written after the failed check is the newer news", () => {
    const later = Date.parse("2026-09-15T10:30:00.000Z");
    const said = protectionVerdict(
      protectionFromRecords(
        [brokenPlan, copy("controller", "2026-09-15T10:20:00.000Z")],
        later,
      ),
      later,
    );
    expect(said.says).not.toContain("not working");
    expect(said.says).not.toContain("attempt failed");
  });

  it("a copy that itself failed still leads", () => {
    const said = verdict([
      plan("off-site"),
      copy("off-site", AT, "bad", "failed"),
    ]);
    expect(said.says).toBe("The last backup attempt failed.");
  });

  it("never prints a raw timestamp at the reader", () => {
    const said = verdict([
      plan("off-site"),
      copy("off-site", "2026-09-15T09:00:00.000Z", "good"),
      copy("off-site", AT, "bad", "failed"),
    ]);
    expect(said.limit).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(said.limit).toContain("ago");
  });
});
