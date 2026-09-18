// Which destinations an application lists, decided by its records.
//
// This used to be decided twice: by the records, and behind them by a stack
// derived from a deployment model the product stopped writing to. The second
// answer could only ever say "nothing", which is the worst thing a fallback
// can say — it reads like an answer. The records decide it now, and this
// holds them to it, because a destination wrongly hidden is a page the owner
// cannot reach and a destination wrongly shown is a claim that something
// exists.
import { describe, expect, it } from "vitest";

import {
  hiddenSections,
  recordedSections,
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

const states = (kind: string, retiredAt: string | null = null) =>
  record(
    {
      views: ["overview"],
      role: "status",
      status: "verified",
      checks: [],
      states: { ref: { kind, id: `${kind}-1` }, presence: "present" },
    } as unknown as SavedInformation["presentation"],
    retiredAt,
  );

const ids = (records: SavedInformation[], active = null) =>
  visibleSections(active, recordedSections(records)).map(
    (section) => section.id,
  );

describe("what an application lists", () => {
  it("hides a stack destination nothing names, and lists the ones that are", () => {
    const listed = ids([states("process"), states("volume")]);
    expect(listed).toContain("processes");
    expect(listed).toContain("storage");
    expect(listed).not.toContain("database");
    expect(listed).not.toContain("cache");
    expect(listed).not.toContain("jobs");
  });

  it("always lists the destinations whose absence is itself the answer", () => {
    const listed = ids([]);
    for (const always of [
      "overview",
      "architecture",
      "deployment",
      "history",
      "backups",
      "monitoring",
      "domains",
      "logs",
    ])
      expect(listed).toContain(always);
  });

  it("keeps the destination being viewed listed even with nothing recorded", () => {
    expect(ids([], "jobs" as never)).toContain("jobs");
  });

  it("stops listing a destination whose only record was retired", () => {
    expect(ids([states("database")])).toContain("database");
    expect(ids([states("database", "2026-09-16T12:00:00.000Z")])).not.toContain(
      "database",
    );
  });

  it("says why a hidden destination is hidden, and changes it once something ships", () => {
    const before = Object.fromEntries(
      hiddenSections(null, recordedSections([])).map((section) => [
        section.id,
        section.note,
      ]),
    );
    expect(before.cdn).toBe("after deployment");
    expect(before.security).toBe("check firewall rules");

    const deployed = recordedSections([
      record({
        views: ["deployment"],
        role: "outcome",
        status: "verified",
        checks: [],
        content: {
          kind: "deployment",
          repositoryUrl: "https://github.com/qa/app",
          revision: "abcdef0",
          server: "host",
          changes: [],
        },
      } as unknown as SavedInformation["presentation"]),
    ]);
    const after = Object.fromEntries(
      hiddenSections(null, deployed).map((section) => [
        section.id,
        section.note,
      ]),
    );
    // "After deployment" is false once one has happened; what is true then is
    // that nobody has looked.
    expect(after.cdn).toBe("not checked yet");
  });
});
