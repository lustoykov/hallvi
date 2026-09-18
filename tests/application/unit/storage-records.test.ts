// Storage, read from records.
//
// The case that matters most is the empty one: the old page printed a
// confident "no volumes" from a model nothing populated, which told a reader
// the opposite of the truth. Nothing recorded has to read as nobody looked.

import { describe, expect, it, beforeEach } from "vitest";

import { protectionFromRecords } from "@/components/hallvi/backups-records";
import { storageFromRecords } from "@/components/hallvi/storage-records";
import {
  APP,
  NOW,
  check,
  fact,
  resetRecordIds,
  states,
  topology,
} from "../fixtures/records";

const read = (records: Parameters<typeof storageFromRecords>[0]["records"]) =>
  storageFromRecords({ records, applicationId: APP, now: NOW });

beforeEach(resetRecordIds);

const volume = (id: string, extra: object = {}) =>
  states({ kind: "volume", id }, extra);

describe("storageFromRecords", () => {
  it("reads nothing recorded as nobody looked, not as no volumes", () => {
    const story = read([]);
    expect(story.volumes).toEqual([]);
    expect(story.pieces).toEqual([]);
    expect(story.keptAt).toBeNull();
  });

  it("takes the owner from the map's disk edge", () => {
    const story = read([
      topology(
        [
          { id: "app", kind: "web", name: "Todo" },
          { id: "data", kind: "volume", name: "Data" },
        ],
        [{ from: "app", to: "data", network: "disk" }],
      ),
      volume("data", { facts: [fact("path", "/etc/todos")] }),
    ]);
    expect(story.volumes[0].owner).toBe("Todo");
    expect(story.volumes[0].mount).toBe("/etc/todos");
  });

  it("says nobody tested persistence rather than implying it holds", () => {
    const story = read([volume("data", { facts: [fact("path", "/data")] })]);
    expect(story.keptAt).toBeNull();
    expect(story.volumes[0].note).toMatch(/Nobody has tested/);
  });

  it("records when the data was proved to survive a replacement", () => {
    const at = "2026-09-13T10:00:00.000Z";
    const story = read([
      volume("data", {
        at,
        checks: [check("persistence", "passed", "configuration")],
      }),
    ]);
    expect(story.keptAt).toBe(at);
    expect(story.volumes[0].note).toBeNull();
  });

  it("says the data did not survive when the test failed", () => {
    const story = read([
      volume("data", {
        checks: [check("persistence", "failed", "configuration")],
      }),
    ]);
    expect(story.keptAt).toBeNull();
    expect(story.volumes[0].note).toMatch(/did not survive/);
  });

  it("drops a volume only when a record says it is gone", () => {
    expect(read([volume("data", { presence: "absent" })]).volumes).toEqual([]);
  });

  it("never treats surviving a restart as having been copied", () => {
    const story = read([
      volume("data", {
        checks: [check("persistence", "passed", "configuration")],
      }),
    ]);
    expect(story.pieces[0].method).toBeNull();
    expect(story.copies).toEqual([]);
    expect(story.protection.backup).toBeNull();
  });

  it("marks a piece copied once a plan says it covers that volume", () => {
    const story = read([
      volume("data"),
      states(
        { kind: "backup-plan", id: "nightly" },
        {
          facts: [
            fact("schedule", "Daily at 03:30"),
            fact("destination", "Cloudflare R2"),
            fact("covers", "data"),
          ],
        },
      ),
    ]);
    expect(story.pieces[0].method).toBe("Cloudflare R2");
    expect(story.protection.schedule?.words).toBe("Daily at 03:30");
  });

  it("reads the host's disk measurement when it has one", () => {
    const at = "2026-09-13T11:00:00.000Z";
    const story = read([
      volume("data"),
      states(
        { kind: "host", id: "hetzner-1" },
        { at, facts: [fact("disk-used", "3.1 of 38 GB used", "contents")] },
      ),
    ]);
    expect(story.disk).toEqual({ usedGb: 3.1, totalGb: 38, measuredAt: at });
  });

  it("leaves disk unknown rather than guessing from a volume size", () => {
    const story = read([
      volume("data", { facts: [fact("size", "220 MB", "contents")] }),
    ]);
    expect(story.disk).toBeNull();
    expect(story.volumes[0].sizeGb).toBeCloseTo(0.22, 5);
  });
});

describe("backups, from the same records", () => {
  const read2 = (
    records: Parameters<typeof storageFromRecords>[0]["records"],
  ) => protectionFromRecords(records, NOW);

  it("a plan with no copies is a promise that has produced nothing", () => {
    const protection = read2([
      states(
        { kind: "backup-plan", id: "nightly" },
        { facts: [fact("schedule", "Daily at 03:30"), fact("keep", "7")] },
      ),
    ]);
    expect(protection.assessed).toBe(true);
    expect(protection.summary.schedule?.words).toBe("Daily at 03:30");
    expect(protection.summary.keep).toBe(7);
    expect(protection.copies).toEqual([]);
    expect(protection.summary.backup).toBeNull();
  });

  it("counts copies as records rather than a number someone incremented", () => {
    const protection = read2([
      states(
        { kind: "backup-copy", id: "c1" },
        {
          at: "2026-09-12T03:30:00.000Z",
          facts: [fact("size", "11 MB", "contents")],
        },
      ),
      states(
        { kind: "backup-copy", id: "c2" },
        {
          at: "2026-09-13T03:30:00.000Z",
          facts: [fact("size", "12 MB", "contents")],
        },
      ),
    ]);
    expect(protection.copies.map((copy) => copy.id)).toEqual(["c2", "c1"]);
    expect(protection.summary.backup?.at).toBe("2026-09-13T03:30:00.000Z");
  });

  it("never lets a copy imply it is any good", () => {
    const protection = read2([
      states(
        { kind: "backup-copy", id: "c1" },
        { at: "2026-09-13T03:30:00.000Z" },
      ),
    ]);
    expect(protection.restores).toEqual([]);
    expect(protection.checks).toEqual([]);
    expect(protection.summary.restore).toBeNull();
  });

  it("marks a restore's own checks as proof, and anything else as untested", () => {
    const protection = read2([
      states(
        { kind: "restore-test", id: "t1" },
        {
          at: "2026-09-13T04:00:00.000Z",
          checks: [
            check("restored", "passed"),
            check("started", "info", "liveness"),
          ],
        },
      ),
    ]);
    expect(protection.checks).toEqual([
      { label: "restored", state: "pass" },
      { label: "started", state: "untested" },
    ]);
  });

  it("a copy with no time established nothing, so it is not a dot", () => {
    expect(
      read2([states({ kind: "backup-copy", id: "c1" }, { at: null })]).copies,
    ).toEqual([]);
  });
});

describe("what a measurement is worth", () => {
  it("keeps the words Pi measured in, for a volume too small to round", () => {
    // 8 KiB rounded to "0 MB", which says empty when it means small.
    const story = read([
      volume("data", { facts: [fact("size", "8 KiB", "contents")] }),
    ]);
    expect(story.volumes[0].sizeText).toBe("8 KiB");
    expect(story.volumes[0].sizeGb).toBeCloseTo((8 * 1024) / 1024 ** 3, 12);
  });
});

describe("a replacement that lost the data", () => {
  it("is not the same as never having been tested", () => {
    // "Kept: volumes stay when containers are replaced" was printed whenever
    // nothing had been tested. It is true of a named volume and false of a
    // bind mount to a temporary path, and the page cannot tell which.
    const untested = read([volume("data")]);
    expect(untested.keptAt).toBeNull();
    expect(untested.lostAt).toBeNull();

    const at = "2026-09-13T10:00:00.000Z";
    const lost = read([
      volume("data", {
        at,
        checks: [check("persistence", "failed", "configuration")],
      }),
    ]);
    expect(lost.keptAt).toBeNull();
    expect(lost.lostAt).toBe(at);
  });

  it("lets a later success replace an earlier loss", () => {
    const story = read([
      volume("data", {
        at: "2026-09-13T09:00:00.000Z",
        checks: [check("persistence", "failed", "configuration")],
      }),
      volume("data", {
        at: "2026-09-13T11:00:00.000Z",
        checks: [check("persistence", "passed", "configuration")],
      }),
    ]);
    // Current state recovers; the older failure is History's business.
    expect(story.keptAt).toBe("2026-09-13T11:00:00.000Z");
    expect(story.lostAt).toBeNull();
  });
});

describe("a plan that covers a database, not a volume", () => {
  it("counts the volume the database's files live in", () => {
    // Shop's plan takes a nightly pg_dump. Reading only volume names put
    // "One copy off the server is on record" on Backups and "PostgreSQL's
    // data · Not in the backup plan" on Storage, about the same bytes.
    const story = read([
      topology(
        [
          { id: "db", kind: "private", name: "Postgres" },
          { id: "pgdata", kind: "volume", name: "Data" },
        ],
        [{ from: "db", to: "pgdata", network: "disk" }],
      ),
      volume("pgdata", { facts: [fact("path", "/var/lib/pg")] }),
      states(
        { kind: "backup-plan", id: "nightly" },
        {
          facts: [
            fact("schedule", "Daily at 03:00"),
            fact("destination", "s3://backups/pg/"),
            fact("covers", "db"),
          ],
        },
      ),
    ]);
    expect(story.pieces[0].method).toBe("s3://backups/pg/");
  });

  it("leaves a volume nothing covers uncopied", () => {
    const story = read([
      topology(
        [
          { id: "db", kind: "private", name: "Postgres" },
          { id: "pgdata", kind: "volume", name: "Data" },
          { id: "uploads", kind: "volume", name: "Uploads" },
        ],
        [{ from: "db", to: "pgdata", network: "disk" }],
      ),
      volume("pgdata"),
      volume("uploads"),
      states(
        { kind: "backup-plan", id: "nightly" },
        { facts: [fact("destination", "s3://backups/"), fact("covers", "db")] },
      ),
    ]);
    const method = Object.fromEntries(
      story.pieces.map((piece) => [piece.volume, piece.method]),
    );
    expect(method.pgdata).toBe("s3://backups/");
    expect(method.uploads).toBeNull();
  });

  it("keeps a covers written in prose whole rather than splitting words", () => {
    // "Shop PostgreSQL orders database" is one description, not four ids.
    const story = read([
      volume("data"),
      states(
        { kind: "backup-plan", id: "nightly" },
        { facts: [fact("covers", "Shop PostgreSQL orders database")] },
      ),
    ]);
    expect(story.pieces[0].method).toBeNull();
  });
});
