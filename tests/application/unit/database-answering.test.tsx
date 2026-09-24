// What the Answering column may say, and what colour it may say it in.
//
// Four records, four different answers. A note settles nothing and must not
// become a red "no"; a pass too old to vouch for now must not be drawn as
// one that is, or the column disagrees with the Checks pips beside it.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { DatabasePage } from "@/components/hallvi/database-page";

import {
  APP,
  NOW,
  check,
  fact,
  resetRecordIds,
  states,
} from "../fixtures/records";

beforeEach(resetRecordIds);

const LONG_AGO = "2026-09-01T12:00:00.000Z";

/** The Answering cell, as its tag renders: the words and the tone. */
function answering(status: "passed" | "failed" | "info", at?: string) {
  const html = renderToStaticMarkup(
    <DatabasePage
      records={[
        states({ kind: "database", id: "db" }, {
          at,
          facts: [fact("engine", "PostgreSQL")],
          checks: [check("answering", status, "liveness")],
        } as Parameters<typeof states>[1]),
      ]}
      applicationId={APP}
      applicationName="Shop"
      now={NOW}
      chrome={{ bar: null, header: null, activity: null }}
      onOpenDestination={() => undefined}
      onAsk={() => undefined}
    />,
  );
  // The first tag in the Answering column, or the grey chip that took its
  // place when nothing settled the question.
  const tag = html.match(
    /<span class="hv-rg-tag" data-tone="([a-z]+)">([^<]*)</,
  );
  return {
    tone: tag?.[1] ?? null,
    words: tag?.[2] ?? null,
    unchecked: html.includes('class="hv-rg-unchecked"'),
  };
}

describe("what the Answering column says", () => {
  it("separates a fresh pass, an old pass, a note and a failure", () => {
    // A query that ran minutes ago and answered.
    expect(answering("passed")).toMatchObject({
      tone: "good",
      words: "yes, 5 min ago",
    });

    // The same pass, twelve days old. Still a yes, with its date, drawn
    // neutral because it does not vouch for right now.
    const stale = answering("passed", LONG_AGO);
    expect(stale.words).toBe("yes, 12 d ago");
    expect(stale.tone).toBe("plain");

    // A note is neither outcome. It must not become the red "no".
    const noted = answering("info");
    expect(noted.unchecked).toBe(true);
    expect(noted.words).not.toBe("no");

    // Only a query that ran and failed says no.
    expect(answering("failed")).toMatchObject({ tone: "bad", words: "no" });
  });
});
