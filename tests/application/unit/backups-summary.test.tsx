// What the Backups and Storage strips are allowed to claim.
//
// Each case here is a sentence the summary printed from records that did
// not establish it: coverage counted over a set the coverage rule could not
// answer for, a history read out of an absent record, and a blanket yes
// from one check on one of several things.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { BackupsPage } from "@/components/hallvi/backups-page";
import { StoragePage } from "@/components/hallvi/storage-page";
import type { SavedInformation } from "@/server/operator-data";

import {
  APP,
  NOW,
  check,
  fact,
  resetRecordIds,
  states,
  topology,
} from "../fixtures/records";

beforeEach(resetRecordIds);

const page = {
  applicationId: APP,
  applicationName: "Shop",
  now: NOW,
  chrome: { bar: null, header: null, activity: null },
  onAsk: () => undefined,
  onOpenDestination: () => undefined,
};

/** The rendered page as plain words, the way a reader meets it. */
const words = (node: React.ReactElement) =>
  renderToStaticMarkup(node)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const backups = (records: SavedInformation[]) =>
  words(<BackupsPage {...page} records={records} />);

const database = states({ kind: "database", id: "db" }, {
  facts: [fact("engine", "PostgreSQL")],
} as Parameters<typeof states>[1]);
const volume = states({ kind: "volume", id: "data" }, {
  facts: [fact("holds", "Shop's data")],
} as Parameters<typeof states>[1]);
const onDisk = topology(
  [
    { id: "db", kind: "private" },
    { id: "data", kind: "volume" },
  ],
  [{ from: "db", to: "data", network: "disk" }],
);
const copyOf = (covers: string, at?: string) =>
  states({ kind: "backup-copy", id: `copy-${covers}-${at ?? "now"}` }, {
    at,
    facts: [fact("covers", covers), fact("destination-kind", "off-site")],
  } as Parameters<typeof states>[1]);

describe("what holds data, counted once", () => {
  it("does not count a database and the volume its files live in twice", () => {
    // The copy names the database; the bytes it copied are the volume's.
    // Counting both said one of two things was in a copy when the whole of
    // the data was.
    expect(backups([database, volume, onDisk, copyOf("db")])).toContain(
      "1 of 1 in a copy",
    );
  });

  it("counts a database that no volume on record accounts for", () => {
    // Leaving it out reported nothing to protect on an application whose
    // only data is its database.
    expect(backups([database, copyOf("db")])).toContain("1 of 1 in a copy");
    // A copy that holds something else leaves it out, and says so.
    expect(backups([database, copyOf("logs")])).toContain("0 of 1 in a copy");
    // Nobody having looked is still not an established zero.
    expect(backups([database])).toContain("Not checked");
  });
});

describe("what the summary may say about history", () => {
  it("does not read an established zero out of an unrecorded copy", () => {
    // The copy says nothing about what went into it, so "0 of 1" would be a
    // count nobody took.
    const silent = states({ kind: "backup-copy", id: "copy" }, {
      facts: [fact("destination-kind", "off-site")],
    } as Parameters<typeof states>[1]);
    const said = backups([database, silent]);
    expect(said).toContain("The copy did not say");
    expect(said).not.toContain("0 of 1 in a copy");
  });

  it("reports no copy record without claiming nothing was copied", () => {
    const said = backups([]);
    expect(said).toContain("None on record");
    expect(said).toContain("No record names a copy");
    expect(said).not.toContain("Nothing has copied");
  });

  it("calls the newest copy untested when an older one was restored", () => {
    const older = copyOf("db", "2026-09-13T10:00:00.000Z");
    const newer = copyOf("db", "2026-09-13T11:50:00.000Z");
    const restore = states({ kind: "restore-test", id: "restore" }, {
      at: "2026-09-13T10:30:00.000Z",
      facts: [
        fact("restored-copy", older.presentation!.states!.ref.id),
        fact("covers", "db"),
      ],
    } as Parameters<typeof states>[1]);
    const said = backups([database, older, newer, restore]);
    expect(said).toContain("Newest copy untested");
    expect(said).toContain("An earlier copy was restored");
    expect(said).not.toContain("Never tested");
  });
});

describe("what Storage may say about surviving a replacement", () => {
  it("reports the tested subset instead of a blanket yes", () => {
    const tested = states({ kind: "volume", id: "data" }, {
      facts: [fact("holds", "Shop's data")],
      checks: [check("persistence", "passed", "configuration")],
    } as Parameters<typeof states>[1]);
    const untested = states({ kind: "volume", id: "uploads" }, {
      facts: [fact("holds", "Uploads")],
    } as Parameters<typeof states>[1]);
    const said = words(<StoragePage {...page} records={[tested, untested]} />);
    expect(said).toContain("1 of 2 kept");
    expect(said).toContain("Not tested: Uploads");
  });
});
