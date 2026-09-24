// Which destinations an application lists, decided by its records.
//
// The sidebar grows with the application: a page is listed when a record
// gives it something to show, and everything else waits under "Show more"
// with the reason on the row. A destination wrongly listed is a claim that
// something exists; a destination wrongly hidden is a page the owner cannot
// find. Neither is allowed, so the four answers a row can carry — content,
// silence, an established absence, and a decision nobody has made — are held
// apart here.
import { describe, expect, it } from "vitest";

import {
  hiddenSections,
  standings,
  visibleSections,
} from "../../../src/components/hallvi/application-sections";
import type { SavedInformation } from "../../../src/server/operator-data";

const record = (
  presentation: SavedInformation["presentation"],
  retiredAt: string | null = null,
) =>
  ({
    id: `r-${Math.random()}`,
    applicationId: "app",
    title: "",
    body: "",
    evidence: [],
    establishedAt: "2026-09-16T10:00:00.000Z",
    createdAt: "2026-09-16T10:00:00.000Z",
    updatedAt: "2026-09-16T10:00:00.000Z",
    retiredAt,
    presentation,
  }) as SavedInformation;

const states = (
  kind: string,
  presence: "present" | "absent" = "present",
  retiredAt: string | null = null,
) =>
  record(
    {
      views: ["overview"],
      role: "status",
      status: "verified",
      checks: [],
      states: { ref: { kind, id: `${kind}-1` }, presence },
    } as unknown as SavedInformation["presentation"],
    retiredAt,
  );

const ids = (records: SavedInformation[], active = null) =>
  visibleSections(active, standings(records)).map((section) => section.id);

const why = (records: SavedInformation[], active = null) =>
  Object.fromEntries(
    hiddenSections(active, standings(records)).map((section) => [
      section.id,
      section.note,
    ]),
  );

describe("what an application lists", () => {
  it("lists a destination a record gives content, and hides the rest", () => {
    const listed = ids([states("process"), states("volume")]);
    expect(listed).toContain("processes");
    expect(listed).toContain("storage");
    expect(listed).not.toContain("database");
    expect(listed).not.toContain("cache");
    expect(listed).not.toContain("jobs");
  });

  // The bug the sidebar exploration found. whoami's one volume record exists
  // to say the container keeps nothing, and the sidebar read it as storage
  // worth a page — off the very record that says there is none.
  it("does not let a record stating an absence light its destination", () => {
    expect(ids([states("volume", "absent")])).not.toContain("storage");
    expect(why([states("volume", "absent")]).storage).toBe(
      "checked · none here",
    );
  });

  it("always lists the pages that exist for every application, and Access", () => {
    const listed = ids([]);
    for (const always of [
      "overview",
      "architecture",
      "deployment",
      "history",
      "logs",
      // Its unknowns are the point: a page that appears only once a firewall
      // has been read hides the fact that nobody read one.
      "access",
    ])
      expect(listed).toContain(always);
  });

  // They used to be listed whatever the records said. On a stateless
  // container with nothing arranged that is two care pages about nothing, and
  // the offer belongs on the row rather than in a page nobody asked for.
  it("waits for content before listing Backups and Monitoring", () => {
    expect(ids([])).not.toContain("backups");
    expect(ids([])).not.toContain("monitoring");
    expect(ids([states("backup-copy")])).toContain("backups");
    expect(ids([states("monitor")])).toContain("monitoring");
  });

  // What there is to lose is what decides it, not whether a copy exists. An
  // application with documents and no copy is the case that must not be
  // quiet; a stateless one whose volume record says it keeps nothing is not.
  it("lists Backups as soon as something on record holds data", () => {
    expect(ids([states("volume")])).toContain("backups");
    expect(ids([states("database")])).toContain("backups");
    expect(ids([states("volume", "absent")])).not.toContain("backups");
    expect(why([states("volume", "absent")]).backups).toBe("not set up");
  });

  it("keeps the destination being viewed listed even with nothing recorded", () => {
    expect(ids([], "jobs" as never)).toContain("jobs");
  });

  it("stops listing a destination whose only record was retired", () => {
    expect(ids([states("database")])).toContain("database");
    expect(
      ids([states("database", "present", "2026-09-16T12:00:00.000Z")]),
    ).not.toContain("database");
  });

  it("says why a destination is not listed, and keeps the answers apart", () => {
    const reasons = why([]);
    // Nobody has looked.
    expect(reasons.database).toBe("not checked");
    // Nobody has arranged it, which is a decision rather than a gap.
    expect(reasons.backups).toBe("not set up");
    expect(reasons.monitoring).toBe("not set up");
    expect(reasons.cdn).toBe("not set up");
  });

  it("says on the row when a listed page has nothing to show", () => {
    const rows = visibleSections(null, standings([]));
    expect(rows.find((section) => section.id === "access")?.note).toBe(
      "not checked",
    );
    expect(
      rows.find((section) => section.id === "overview")?.note,
    ).toBeUndefined();
  });
});
