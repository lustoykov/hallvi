// Nobody looked, versus somebody looked and the answer was no.
//
// Architecture told Paperless's owner that whether anything copies their
// documents off the server "has not been assessed" — while the same records
// carried a nightly export job, two backup copies and a verified restore.
// Somebody had looked. What they found was that every copy lands on the same
// host, which is why Storage says nothing is off the server and the
// application list says "A backup plan, no copy yet". Reporting a settled
// absence as an open question is the reassuring reading, and the wrong one.

import { describe, expect, it } from "vitest";

import { architectureFromRecords } from "@/components/haldur/architecture-records";
import type { SavedInformation } from "@/server/operator-data";

const APPLICATION = "26820a4b-a4c2-49f8-8002-678503aeb385";
const NOW = Date.parse("2026-09-13T18:00:00.000Z");
const AT = "2026-09-13T17:55:00.000Z";

const part = (id: string, kind: string, name: string) =>
  ({ id, kind, name, role: "", plain: "" }) as never;

const map: SavedInformation = {
  id: "rec-map",
  applicationId: APPLICATION,
  title: "Paper uses a private topology with durable storage",
  body: "",
  evidence: [],
  establishedAt: AT,
  presentation: {
    states: {
      ref: { kind: "application", id: APPLICATION },
      presence: "present",
    },
    views: ["architecture"],
    role: "outcome",
    status: "verified",
    checks: [],
    content: {
      kind: "topology",
      from: "observed",
      parts: [
        part("paper-host", "host", "paper-26820a4b"),
        part("paperless-web", "web", "Paperless-ngx"),
        part("paperless-data-volume", "volume", "Application data"),
      ],
      edges: [
        { from: "paper-host", to: "paperless-web", network: "loopback" },
        {
          from: "paperless-web",
          to: "paperless-data-volume",
          network: "disk",
        },
      ],
    } as never,
  },
  createdAt: AT,
  updatedAt: AT,
  retiredAt: null,
} as unknown as SavedInformation;

function about(
  id: string,
  title: string,
  kind: string,
  subject: string,
): SavedInformation {
  return {
    id,
    applicationId: APPLICATION,
    title,
    body: title,
    evidence: [],
    establishedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    retiredAt: null,
    presentation: {
      role: "observation",
      status: "verified",
      views: ["backups"],
      checks: [],
      facts: [],
      about: [],
      states: { ref: { kind, id: subject }, presence: "present" },
      nextStep: null,
      url: null,
    },
  } as unknown as SavedInformation;
}

const dataSummary = (records: SavedInformation[]) =>
  architectureFromRecords({
    records,
    applicationId: APPLICATION,
    applicationName: "Paper",
    now: NOW,
  })?.journeys.find((journey) => journey.id === "data")?.summary ?? "";

describe("whether anything copies the data off the server", () => {
  it("is an open question when nothing on record has looked", () => {
    expect(dataSummary([map])).toContain("has not been assessed");
  });

  it("is a settled no once a backup plan is on record", () => {
    const said = dataSummary([
      map,
      about(
        "r2",
        "Nightly application exports are configured",
        "backup-plan",
        "paperless-nightly-export",
      ),
    ]);
    expect(said).toContain("Nothing on record copies them off it.");
    expect(said).not.toContain("has not been assessed");
  });

  it("is a settled no when copies exist but none of them is off the server", () => {
    const said = dataSummary([
      map,
      about(
        "r3",
        "The acceptance backup is checksum-verified",
        "backup-copy",
        "paperless-export-20260913",
      ),
    ]);
    expect(said).toContain("Nothing on record copies them off it.");
  });

  it("still names where the data lives either way", () => {
    expect(dataSummary([map])).toContain("Application data");
  });
});
