// Storage, read from records.
//
// The case that matters most is the empty one: the old page printed a
// confident "no volumes" from a model nothing populated, which told a reader
// the opposite of the truth. Nothing recorded has to read as nobody looked.

import { describe, expect, it, beforeEach } from "vitest";

import { storageFromRecords } from "@/components/server-guy/storage-records";
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
        { at, facts: [fact("disk", "3.1 of 38 GB used", "contents")] },
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
