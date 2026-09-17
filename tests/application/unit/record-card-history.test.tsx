// Two ways a conversation used to show its own history badly.
//
// A record mentioned twice drew a one-line repeat linking to the first
// appearance. That is right only when the first appearance holds more than
// the repeat does, and often it does not: a record that went well is compact
// both times, so following "see it in full above" scrolled the reader into
// the middle of history and showed them the same single line. The place that
// renders a record in full is its destination, which the record already
// names in `views`.
//
// A retired record drew its full card — including a red failed check and a
// "Next" line telling the reader what to do. In one real transcript a
// transfer that failed at 11:53 and succeeded at 11:55 sat there advising a
// retry. The failure belongs in history; the instruction does not.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InformationCard } from "../../../src/components/haldur/information-card";
import type { SavedInformation } from "../../../src/server/operator-data";

const ID = "bcb57ff6-2d1e-4a1b-9c74-0f2f7a4ad2e1";

/** A copy that reached the controller, which is a Backups record. */
function record(): SavedInformation {
  return {
    id: ID,
    applicationId: "app",
    title: "Controller backups retain up to seven Shop copies",
    body: "Retention kept one current copy and removed nothing else.",
    evidence: [],
    establishedAt: "2026-09-15T11:55:00.000Z",
    createdAt: "2026-09-15T11:55:00.000Z",
    updatedAt: "2026-09-15T11:55:00.000Z",
    retiredAt: null,
    presentation: {
      role: "outcome",
      status: "verified",
      views: ["backups"],
      checks: [{ label: "Retention completed", status: "passed" }],
      facts: [],
      about: [],
      states: [],
      nextStep: null,
      url: null,
    },
  } as unknown as SavedInformation;
}

const anchorTo = (markup: string) =>
  markup.match(/href="#(record-[^"]+)"/)?.[1];

describe("a record mentioned a second time", () => {
  it("offers the destination that renders it, not a scroll to itself", () => {
    const markup = renderToStaticMarkup(
      <InformationCard record={record()} superseded onOpen={() => {}} />,
    );
    // A control, because switching destination is the shell's job rather
    // than a URL the transcript can link to.
    expect(markup).toContain("hd-result-elsewhere");
    expect(markup).toContain("open Backups");
    expect(markup).not.toContain("see it in full above");
    // Nothing to scroll to, and nothing claiming to be the target.
    expect(anchorTo(markup)).toBeUndefined();
    expect(markup).not.toContain(`id="record-${ID}"`);
  });

  it("follows the record's own order, not the sidebar's", () => {
    // The live record that prompted this reads ["backups", "overview"]:
    // Backups renders a backup copy and Overview only mentions it. The
    // sidebar lists Overview first, and picking from that order sent the
    // reader to the page that says least.
    const both = record();
    both.presentation!.views = ["backups", "overview"];
    const markup = renderToStaticMarkup(
      <InformationCard record={both} superseded onOpen={() => {}} />,
    );
    expect(markup).toContain("open Backups");
    expect(markup).not.toContain("open Overview");
  });

  it("does not offer the destination it is already being read on", () => {
    const markup = renderToStaticMarkup(
      <InformationCard
        record={record()}
        superseded
        onOpen={() => {}}
        currentView="backups"
      />,
    );
    // On Backups itself there is nowhere better to go, so the old anchor is
    // still the best available.
    expect(markup).not.toContain("hd-result-elsewhere");
    expect(anchorTo(markup)).toBe(`record-${ID}`);
  });

  it("keeps the anchor when the record names no destination", () => {
    const bare = record();
    bare.presentation!.views = [];
    const markup = renderToStaticMarkup(
      <InformationCard record={bare} superseded onOpen={() => {}} />,
    );
    expect(markup).not.toContain("hd-result-elsewhere");
    expect(anchorTo(markup)).toBe(`record-${ID}`);
  });

  it("keeps the anchor when there is no shell to switch", () => {
    const markup = renderToStaticMarkup(
      <InformationCard record={record()} superseded />,
    );
    expect(anchorTo(markup)).toBe(`record-${ID}`);
  });
});

describe("a repeated record that carries its own content", () => {
  // Deployment, access and database records render through a different
  // component with the same one-line repeat. In one live conversation three
  // such records accounted for 46 of the 47 repeats on screen, so fixing
  // only the generic card would have fixed one of them.
  function contentRecord(): SavedInformation {
    const item = record();
    item.title = "Shop private access is open from this PC";
    item.presentation!.views = ["overview"];
    (item.presentation as unknown as { content: unknown }).content = {
      kind: "application-access",
      url: "http://127.0.0.1:8000/",
      scope: "Only on this PC, while the tunnel is open",
    };
    return item;
  }

  it("offers its destination too", () => {
    const markup = renderToStaticMarkup(
      <InformationCard record={contentRecord()} superseded onOpen={() => {}} />,
    );
    expect(markup).toContain("hd-result-elsewhere");
    expect(markup).toContain("open Overview");
    expect(markup).not.toContain("see it in full above");
  });

  it("keeps the anchor with no destination to offer", () => {
    const bare = contentRecord();
    bare.presentation!.views = [];
    const markup = renderToStaticMarkup(
      <InformationCard record={bare} superseded onOpen={() => {}} />,
    );
    expect(anchorTo(markup)).toBe(`record-${ID}`);
  });
});

describe("a record a later one replaced", () => {
  /** The failure that was resolved two minutes later. */
  function retired(): SavedInformation {
    const item = record();
    item.id = "0a554d96-6f3b-4c07-9a2a-6b6d0c5f9a11";
    item.title = "No controller-held Shop backup copy was created";
    item.retiredAt = "2026-09-15T11:55:00.000Z";
    item.presentation!.status = "failed";
    item.presentation!.checks = [
      {
        label: "Protected transfer to the controller completed",
        status: "failed",
      },
    ] as never;
    item.presentation!.nextStep =
      "Retry fetch_backup_copy once the transport is fixed.";
    return item;
  }

  it("says it is no longer current and stops asking for anything", () => {
    const markup = renderToStaticMarkup(
      <InformationCard record={retired()} onOpen={() => {}} />,
    );
    expect(markup).toContain("No longer current");
    // The instruction goes entirely: a resolved failure that still says
    // "Next: retry" reads as an open task wherever it is printed.
    expect(markup).not.toContain("hd-info-next");
    expect(markup).not.toContain("Retry fetch_backup_copy");
    // The failed check is kept but not on the surface. Everything the card
    // shows before its disclosure is title, tag and time.
    const surface = markup.slice(0, markup.indexOf("<details"));
    expect(surface).not.toContain("hd-info-checks");
    expect(surface).not.toContain("Protected transfer");
  });

  it("gives up the room but keeps the failure in its detail", () => {
    const markup = renderToStaticMarkup(
      <InformationCard record={retired()} onOpen={() => {}} />,
    );
    // Compact, like the other two reasons a card yields space.
    expect(markup).toContain("hd-result");
    expect(markup).toContain("data-quiet");
    expect(markup).not.toContain('class="hd-info"');
    // Behind the disclosure, not deleted.
    expect(markup).toContain("<details");
    expect(markup).toContain("Protected transfer to the controller completed");
  });

  it("still renders in full once it is current again", () => {
    // The same record without retiredAt is an ordinary failure that does
    // want the reader: this is what keeps the change scoped to history.
    const live = retired();
    live.retiredAt = null;
    const markup = renderToStaticMarkup(
      <InformationCard record={live} onOpen={() => {}} />,
    );
    expect(markup).toContain('class="hd-info"');
    expect(markup).toContain("hd-info-next");
    expect(markup).toContain("Retry fetch_backup_copy");
  });
});
