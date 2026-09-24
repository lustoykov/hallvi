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

const AT = "2026-09-16T10:00:00.000Z";

const record = (
  presentation: SavedInformation["presentation"],
  {
    at = AT,
    retiredAt = null,
  }: { at?: string; retiredAt?: string | null } = {},
) =>
  ({
    id: `r-${Math.random()}`,
    applicationId: "app",
    title: "",
    body: "",
    evidence: [],
    establishedAt: at,
    createdAt: AT,
    updatedAt: AT,
    retiredAt,
    presentation,
  }) as SavedInformation;

/** A record speaking for one subject. `at` decides which one is current. */
const states = (
  kind: string,
  {
    presence = "present",
    retiredAt = null,
    at = AT,
    id = `${kind}-1`,
  }: {
    presence?: "present" | "absent";
    retiredAt?: string | null;
    at?: string;
    id?: string;
  } = {},
) =>
  record(
    {
      views: ["overview"],
      role: "status",
      status: "verified",
      checks: [],
      states: { ref: { kind, id }, presence },
    } as unknown as SavedInformation["presentation"],
    { at, retiredAt },
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
    expect(ids([states("volume", { presence: "absent" })])).not.toContain(
      "storage",
    );
    expect(why([states("volume", { presence: "absent" })]).storage).toBe(
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
    expect(ids([states("volume", { presence: "absent" })])).not.toContain(
      "backups",
    );
    expect(why([states("volume", { presence: "absent" })]).backups).toBe(
      "not set up",
    );
  });

  // A subject has one current state, and it is the newest record's. Reading
  // "does any record say present" answers with a record a later one
  // contradicted, and the pages themselves read the newer one.
  it("follows the newest record about a subject, not any record", () => {
    const removed = [
      states("volume", { at: "2026-09-11T12:00:00.000Z" }),
      states("volume", { at: "2026-09-12T12:00:00.000Z", presence: "absent" }),
    ];
    expect(ids(removed)).not.toContain("storage");
    expect(ids(removed)).not.toContain("backups");
    expect(why(removed).storage).toBe("checked · none here");

    const added = [
      states("volume", { at: "2026-09-11T12:00:00.000Z", presence: "absent" }),
      states("volume", { at: "2026-09-12T12:00:00.000Z" }),
    ];
    expect(ids(added)).toContain("storage");
    expect(ids(added)).toContain("backups");
  });

  it("keeps a destination while one of its subjects is still there", () => {
    const listed = ids([
      states("volume", { id: "gone", presence: "absent" }),
      states("volume", { id: "documents" }),
    ]);
    expect(listed).toContain("storage");
    expect(listed).toContain("backups");
  });

  it("keeps the destination being viewed listed even with nothing recorded", () => {
    expect(ids([], "jobs" as never)).toContain("jobs");
  });

  it("stops listing a destination whose only record was retired", () => {
    expect(ids([states("database")])).toContain("database");
    expect(
      ids([states("database", { retiredAt: "2026-09-16T12:00:00.000Z" })]),
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
