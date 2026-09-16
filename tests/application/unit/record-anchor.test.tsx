// A repeated record points at the one that holds the evidence.
//
// The transcript draws a record's full card at its first appearance and a
// one-line "see it in full above" at every later one, linking to
// #record-<id>. That link is only worth having if the target exists — and it
// did not, whenever the first appearance was compact: one branch of
// GenericInformationCard served both the superseded case and the routine
// case, and set no id at all. Every such link went nowhere, before and after
// a reload, which is the condition it was written to survive.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InformationCard } from "../../../src/components/server-guy/information-card";
import type { SavedInformation } from "../../../src/server/operator-data";

const ID = "bc44dc0c-ea81-4001-a608-bd8febf6cc07";

/** A record that goes well and asks nothing of the reader — so it compacts. */
function routine(): SavedInformation {
  return {
    id: ID,
    applicationId: "app",
    title: "Daily backup protects only PostgreSQL volume data",
    body: "The nightly dump covers shop-postgres-volume.",
    evidence: [],
    establishedAt: "2026-09-13T15:27:00.000Z",
    createdAt: "2026-09-13T15:27:00.000Z",
    updatedAt: "2026-09-13T15:27:00.000Z",
    retiredAt: null,
    presentation: {
      role: "observation",
      status: "verified",
      views: [],
      checks: [{ label: "The dump completed", status: "passed" }],
      facts: [],
      about: [],
      states: [],
      nextStep: null,
      url: null,
    },
  } as unknown as SavedInformation;
}

const anchor = (markup: string) => markup.match(/id="(record-[^"]+)"/)?.[1];
const link = (markup: string) => markup.match(/href="#(record-[^"]+)"/)?.[1];

describe("the anchor a repeated record points at", () => {
  it("is carried by a compact first appearance, and the repeat links to it", () => {
    const first = renderToStaticMarkup(<InformationCard record={routine()} />);
    expect(first).toContain("sg-result");
    expect(anchor(first)).toBe(`record-${ID}`);
    const again = renderToStaticMarkup(
      <InformationCard record={routine()} superseded />,
    );
    // The repeat claims no anchor of its own; it would link to itself.
    expect(anchor(again)).toBeUndefined();
    expect(link(again)).toBe(anchor(first));
  });

  it("is carried by a full first appearance too", () => {
    const record = routine();
    record.presentation!.nextStep = "Cover the other two volumes.";
    const markup = renderToStaticMarkup(<InformationCard record={record} />);
    expect(anchor(markup)).toBe(`record-${ID}`);
  });
});
