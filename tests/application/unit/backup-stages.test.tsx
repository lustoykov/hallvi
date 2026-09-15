// Being backed up is three facts in order, not one.
//
// Every bug this page has had was two of them folded together: a schedule
// reported as protection, a copy reported as a recovery, a successful restore
// reported as complete coverage. The three stages exist so that folding them
// is structurally impossible, which only holds if each stage reports its own
// result and nobody else's.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BackupStages } from "@/components/server-guy/backup-stages";
import {
  protectionFromRecords,
  protectionVerdict,
} from "@/components/server-guy/backups-records";
import type { Ref, SavedInformation } from "@/server/operator-data";

const APP = "11111111-2222-4333-8444-555555555555";
const AT = "2026-09-15T10:00:00.000Z";
const NOW = Date.parse("2026-09-15T11:00:00.000Z");

function record(input: {
  id: string;
  ref: Ref;
  at?: string | null;
  presence?: "present" | "absent";
  status?: "info" | "verified" | "failed" | "warning";
  title?: string;
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
      states: { ref: input.ref, presence: input.presence ?? "present" },
      views: ["backups"],
      role: "outcome",
      status: input.status ?? "verified",
      checks: [],
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

const plan = record({
  id: "plan",
  ref: { kind: "backup-plan", id: "daily" },
  title: "Daily backups are configured",
  facts: [
    { key: "schedule", value: "Daily at 02:30 UTC" },
    { key: "destination-kind", value: "off-site" },
    { key: "covers", value: "shop-db, shop-uploads" },
  ],
});

/** A volume, named the way Pi names one: `holds` carries the owner's words. */
/** A plan record whose own check failed: no timer, so nothing ever ran. */
const brokenPlan = {
  ...record({
    id: "plan",
    ref: { kind: "backup-plan", id: "daily" },
    presence: "absent",
    status: "warning",
    title: "No off-server backup copies exist",
  }),
} as SavedInformation;
(brokenPlan.presentation as { checks: unknown[] }).checks = [
  {
    key: "configured",
    label: "Off-server backup plan is configured",
    status: "failed",
    claim: "configuration",
    basis: "observed",
  },
];

const volume = (id: string, name: string) =>
  record({
    id: `vol-${id}`,
    ref: { kind: "volume", id },
    title: name,
    facts: [{ key: "holds", value: name }],
  });

const copy = (covers: string | null) =>
  record({
    id: "copy",
    ref: { kind: "backup-copy", id: "copy" },
    title: "A copy was written",
    facts: [
      { key: "destination-kind", value: "off-site" },
      ...(covers ? [{ key: "covers", value: covers }] : []),
    ],
  });

const restore = (covers: string) => restoreOf(covers);

/**
 * A restore that opened the newest copy. A `null` covers means the restore
 * recorded nothing about what came back, which is not the same as nothing
 * coming back.
 */
const restoreOf = (covers: string | null) =>
  record({
    id: "restore",
    ref: { kind: "restore-test", id: "restore-1" },
    title: "A copy was restored and checked",
    facts: [
      ...(covers ? [{ key: "covers", value: covers }] : []),
      { key: "restored-copy", value: "copy" },
    ],
  });

function draw(
  records: SavedInformation[],
  controller?: Parameters<typeof BackupStages>[0]["controller"],
) {
  const protection = protectionFromRecords(records, NOW, APP);
  return renderToStaticMarkup(
    <BackupStages
      protection={protection}
      verdict={protectionVerdict(protection, NOW)}
      now={NOW}
      controller={controller}
      onAsk={() => undefined}
    />,
  );
}

/** The marks on Server Guy's own track, which is the second one. */
function ownMarks(html: string) {
  const track = /<ol class="bs-track bs-track-small">(.*?)<\/ol>/s.exec(html);
  return [
    ...(track?.[1] ?? "").matchAll(/class="bs-mark" data-state="([a-z]+)"/g),
  ].map((match) => match[1]);
}

/**
 * The state mark each of the application's three stages is wearing.
 *
 * Only the first track: Server Guy's own recovery is a second subject on this
 * page, and reading its marks as the application's is the exact confusion the
 * component separates them to prevent.
 */
function marks(html: string) {
  const track = /<ol class="bs-track"[^>]*>(.*?)<\/ol>/s.exec(html);
  return [
    ...(track?.[1] ?? "").matchAll(/class="bs-mark" data-state="([a-z]+)"/g),
  ].map((match) => match[1]);
}

describe("each stage reports its own result", () => {
  it("a restore that came back short is not a tick", () => {
    // It proved recovery works and proved this copy is not enough. A tick
    // says only the first, and the reader acts on the first.
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy("shop-db, shop-uploads"),
      restore("shop-db"),
    ]);
    expect(marks(html)[2]).toBe("attention");
    expect(html).toContain("without Customer uploads");
  });

  it("a restore that brought everything back is a tick", () => {
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy("shop-db, shop-uploads"),
      restore("shop-db, shop-uploads"),
    ]);
    expect(marks(html)[2]).toBe("done");
    expect(html).not.toContain("without");
  });

  it("an unrecorded copy is not held against the restore", () => {
    // Nobody wrote down what went into the copy. That is a thing to find
    // out, not a finding, and it must not turn a successful restore amber.
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy(null),
      restoreOf(null),
    ]);
    expect(marks(html)[2]).toBe("done");
    expect(html).toContain("No record says what that copy contains");
  });

  it("a copy whose own record says it left something out says so", () => {
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy("shop-db"),
    ]);
    expect(marks(html)[1]).toBe("attention");
    expect(html).toContain("without Customer uploads");
  });

  it("a schedule alone leaves the later stages waiting, not done", () => {
    // The original bug on this page: a timer reported as protection.
    const html = draw([plan]);
    expect(marks(html)).toEqual(["done", "waiting", "waiting"]);
    expect(html).toContain("A schedule is not a copy");
  });

  it("a failed plan check is not a failed backup attempt", () => {
    // The owner's own Paperless records: a plan check that failed, and no
    // backup ever run. The page said "The attempt 5 h ago failed", which
    // invented a backup run out of a check on a schedule.
    const html = draw([brokenPlan]);
    expect(html).not.toContain("The attempt");
    expect(html).toContain("No copy has been written");
    expect(marks(html)[0]).toBe("failed");
    expect(marks(html)[1]).toBe("waiting");
  });

  it("names the subjects rather than their ids", () => {
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy("shop-db"),
    ]);
    expect(html).not.toContain("shop-uploads");
  });
});

describe("Server Guy's own recovery", () => {
  it("does not ask for a passphrase before there is a copy to open", () => {
    const html = draw([plan], {
      connected: false,
      bucket: null,
      lastCopyAt: null,
      kitConfirmedAt: null,
      keep: 14,
    } as Parameters<typeof BackupStages>[0]["controller"]);
    expect(ownMarks(html)[2]).toBe("waiting");
    expect(html).toContain("nothing has been copied for it to open");
  });

  it("asks for it once copies exist", () => {
    const html = draw([plan], {
      connected: true,
      bucket: "shop-controller",
      lastCopyAt: AT,
      kitConfirmedAt: null,
      keep: 14,
    } as Parameters<typeof BackupStages>[0]["controller"]);
    expect(ownMarks(html)[2]).toBe("attention");
    expect(html).toContain("nobody can open the copies yet");
  });
});
