// A name another record used is not a volume anybody found.
//
// Paperless's later records referred to its volumes by their Docker names —
// `paperless-media` — where the stating records had used
// `paperless-media-volume`.
// Storage listed all seven and said "7 volumes hold the application's data",
// about an application with four.

import { describe, expect, it } from "vitest";

import { storageFromRecords } from "@/components/hallvi/storage-records";
import type { Ref, SavedInformation } from "@/server/operator-data";

const APPLICATION = "26820a4b-a4c2-49f8-8002-678503aeb385";
const AT = "2026-09-13T17:55:00.000Z";
const NOW = Date.parse("2026-09-13T18:00:00.000Z");

const record = (input: {
  id: string;
  states?: { ref: Ref; presence: "present" | "absent" };
  about?: Ref[];
  checks?: NonNullable<SavedInformation["presentation"]>["checks"];
  facts?: NonNullable<SavedInformation["presentation"]>["facts"];
}): SavedInformation => ({
  id: input.id,
  applicationId: APPLICATION,
  title: input.id,
  body: "",
  evidence: [],
  establishedAt: AT,
  presentation: {
    states: input.states,
    about: input.about,
    views: ["storage"],
    role: "outcome",
    status: "verified",
    checks: input.checks ?? [],
    facts: input.facts,
  },
  createdAt: AT,
  updatedAt: AT,
  retiredAt: null,
});

const volume = (id: string, path: string) =>
  record({
    id: `rec-${id}`,
    states: { ref: { kind: "volume", id }, presence: "present" },
    facts: [{ key: "path", label: "Path", value: path }],
    checks: [
      {
        key: "persistence",
        label: "Survived a replacement",
        status: "passed",
        about: { kind: "volume", id },
      },
    ],
  });

describe("volumes only other records name", () => {
  const view = storageFromRecords({
    records: [
      volume(
        "paperless-media-volume",
        "/var/lib/docker/volumes/paperless_media/_data",
      ),
      volume(
        "paperless-data-volume",
        "/var/lib/docker/volumes/paperless_data/_data",
      ),
      // A later event that refers to the same volumes by a different id.
      record({
        id: "rec-recreated",
        about: [
          { kind: "volume", id: "paperless-media" },
          { kind: "volume", id: "paperless-data" },
        ],
      }),
    ],
    applicationId: APPLICATION,
    now: NOW,
  });

  it("marks the two that a record states, and the two that nothing states", () => {
    const stated = view.volumes.filter((item) => item.stated);
    expect(stated.map((item) => item.name).sort()).toEqual([
      "paperless-data-volume",
      "paperless-media-volume",
    ]);
    const unstated = view.volumes.filter((item) => item.stated === false);
    expect(unstated.map((item) => item.name).sort()).toEqual([
      "paperless-data",
      "paperless-media",
    ]);
    for (const item of unstated)
      expect(item.note).toBe(
        "Another record names this volume; nothing states that it is there.",
      );
  });

  it("does not hand an unstated volume somebody else's replacement result", () => {
    // The stated volumes passed a persistence check; the named-only ones have
    // none of their own, and the page must not borrow one.
    for (const item of view.volumes)
      if (item.stated) expect(item.keptAt).toBe(AT);
      else expect(item.keptAt ?? null).toBeNull();
  });
});
