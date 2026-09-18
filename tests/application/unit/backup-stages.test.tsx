// The Backups view keeps plan, copy and restore truth separate while making
// the application's tangible data the thing the owner evaluates.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BackupStages } from "@/components/hallvi/backup-stages";
import {
  protectionFromRecords,
  protectionVerdict,
} from "@/components/hallvi/backups-records";
import { storageFromRecords } from "@/components/hallvi/storage-records";
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
  body?: string;
  facts?: { key: string; value: string }[];
}): SavedInformation {
  return {
    id: input.id,
    applicationId: APP,
    title: input.title ?? input.id,
    body: input.body ?? "",
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

const brokenPlan = record({
  id: "broken-plan",
  ref: { kind: "backup-plan", id: "daily" },
  presence: "absent",
  status: "warning",
  title: "No off-server backup copies exist",
  body: "The nightly timer is disabled.",
});
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
    facts: [
      { key: "holds", value: name },
      { key: "size", value: id === "shop-db" ? "4.2 GB" : "860 MB" },
      { key: "path", value: `/srv/${id}` },
    ],
  });

const copy = (covers: string | null) =>
  record({
    id: "copy",
    ref: { kind: "backup-copy", id: "copy" },
    title: "A copy was written",
    facts: [
      { key: "destination-kind", value: "off-site" },
      { key: "destination", value: "R2 · shop-backups" },
      ...(covers ? [{ key: "covers", value: covers }] : []),
    ],
  });

const restore = (covers: string | null) =>
  record({
    id: "restore",
    ref: { kind: "restore-test", id: "restore-1" },
    title: "A copy was restored and checked",
    facts: [
      ...(covers ? [{ key: "covers", value: covers }] : []),
      { key: "restored-copy", value: "copy" },
    ],
  });

function draw(records: SavedInformation[]) {
  const protection = protectionFromRecords(records, NOW, APP);
  const story = storageFromRecords({ records, applicationId: APP, now: NOW });
  return renderToStaticMarkup(
    <BackupStages
      protection={protection}
      verdict={protectionVerdict(protection, NOW)}
      now={NOW}
      applicationName="Shop"
      hostName="shop.example.net"
      volumes={story.volumes}
      pieces={story.pieces}
      onAsk={() => undefined}
    />,
  );
}

describe("application-first backup truth", () => {
  it("shows the newer successful copy after an earlier failure", () => {
    const html = draw([
      plan,
      record({
        id: "failed-copy",
        ref: { kind: "backup-copy", id: "failed-copy" },
        at: "2026-09-15T09:00:00.000Z",
        status: "failed",
        body: "Storage refused the older attempt.",
      }),
      copy("shop-db, shop-uploads"),
    ]);
    expect(html).toContain("R2 · shop-backups");
    expect(html).not.toContain("Storage refused the older attempt.");
  });

  it("makes a short restore visible on the affected data item", () => {
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy("shop-db, shop-uploads"),
      restore("shop-db"),
    ]);
    expect(html).toContain("Missing from the latest copy");
    expect(html).toContain("The restore did not bring back Customer uploads.");
  });

  it("shows every restored item as present when the restore was complete", () => {
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy("shop-db, shop-uploads"),
      restore("shop-db, shop-uploads"),
    ]);
    expect(html.match(/In the latest copy/g)).toHaveLength(2);
    expect(html).not.toContain("Missing from the latest copy");
  });

  it("keeps unrecorded copy contents unknown", () => {
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy(null),
      restore(null),
    ]);
    expect(html.match(/Latest copy contents unknown/g)).toHaveLength(2);
  });

  it("does not count a merely mentioned volume as included in a copy", () => {
    const completed = copy("shop-db");
    completed.presentation!.about = [{ kind: "volume", id: "uninspected" }];
    const html = draw([volume("shop-db", "PostgreSQL's data"), completed]);
    expect(html).toContain("Everything in uninspected");
    expect(html.match(/In the latest copy/g)).toHaveLength(1);
    expect(html).toContain("Latest copy contents unknown");
  });

  it("does not promote the plan into evidence for a short copy", () => {
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy("shop-db"),
    ]);
    expect(html).toContain("Customer uploads");
    expect(html).toContain("Missing from the latest copy");
  });

  it("says a schedule has produced no completed copy", () => {
    const html = draw([plan]);
    expect(html).toContain("A schedule is not a copy");
    expect(html).toContain("No completed copy");
  });

  it("does not invent a missing plan when nobody has checked", () => {
    const html = draw([volume("shop-db", "PostgreSQL's data")]);
    expect(html).toContain("Backup status not established");
    expect(html).not.toContain("Not in the backup plan");
  });

  it("distinguishes a failed plan check from a failed copy attempt", () => {
    const html = draw([brokenPlan]);
    expect(html).toContain("The nightly timer is disabled.");
    expect(html).not.toContain("Latest attempt failed");
    expect(html).toContain("No completed copy");
  });

  it("surfaces the real reason for the newest failed copy", () => {
    const html = draw([
      plan,
      record({
        id: "failed-copy",
        ref: { kind: "backup-copy", id: "failed-copy" },
        status: "failed",
        body: "The archive stopped because /var ran out of space.",
      }),
    ]);
    expect(html).toContain(
      "The archive stopped because /var ran out of space.",
    );
  });

  it("uses owner-facing names instead of subject ids", () => {
    const html = draw([
      plan,
      volume("shop-db", "PostgreSQL's data"),
      volume("shop-uploads", "Customer uploads"),
      copy("shop-db"),
    ]);
    expect(html).not.toContain("shop-uploads");
  });
});
