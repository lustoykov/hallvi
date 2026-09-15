// Server Guy's own protection, as the Backups page states it.
//
// The page has two shapes and the controller fact belongs in both: the board,
// where it is one more row beside the application's data, and the empty page
// a controller that has never deployed anything shows — which is exactly when
// the first copy's recovery kit has to be findable.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it } from "vitest";

import { BackupsPage } from "@/components/server-guy/backups-page";
import type { ControllerProtectionFacts } from "@/server/application-facts";

import { APP, NOW, fact, resetRecordIds, states } from "../fixtures/records";

beforeEach(resetRecordIds);

const AT = new Date(NOW - 90 * 60_000).toISOString();
const PLAN = () =>
  states(
    { kind: "backup-plan", id: "nightly" },
    { facts: [fact("schedule", "Daily at 03:30"), fact("keep", "7")] },
  );

function controller(
  over: Partial<ControllerProtectionFacts> = {},
): ControllerProtectionFacts {
  return {
    connected: true,
    state: "recoverable",
    bucket: "server-guy-copies",
    host: "account.r2.cloudflarestorage.com",
    keep: 14,
    lastCopyAt: AT,
    nextCopyBy: new Date(NOW + 22 * 3_600_000).toISOString(),
    kitConfirmedAt: AT,
    kitReady: true,
    copies: [
      {
        id: "c1",
        at: AT,
        outcome: "succeeded",
        reason: null,
        size: "2.2 MB",
      },
    ],
    retentionFailed: false,
    ...over,
  };
}

const draw = (
  records: Parameters<typeof BackupsPage>[0]["records"],
  facts?: ControllerProtectionFacts,
) =>
  renderToStaticMarkup(
    <BackupsPage
      records={records}
      applicationId={APP}
      applicationName="Notes"
      now={NOW}
      chrome={{ bar: null, header: null, activity: null }}
      controller={facts}
      onAsk={() => {}}
    />,
  );

it("draws Server Guy as one more row on the board, in its own words", () => {
  const markup = draw([PLAN()], controller());
  expect(markup).toContain("Server Guy itself");
  expect(markup).toContain("Recoverable");
  expect(markup).toContain("you hold what opens them");
  expect(markup).toContain("copy of Server Guy&#x27;s own records");
  // Quiet when there is nothing to ask of the owner: the row carries it.
  expect(markup).not.toContain("Save your recovery kit");
});

it("says so on the board when the copies are not yet the owner's", () => {
  const markup = draw(
    [PLAN()],
    controller({ state: "copied", kitConfirmedAt: null }),
  );
  expect(markup).toContain("Kit not saved");
  // The board's row names the subject and its state. The band below it asks
  // for what the owner has to do, and says neither of them again.
  expect(markup.split("Kit not saved")).toHaveLength(2);
  expect(markup).not.toContain("cpb-head");
  // The region keeps its accessible name; only the visible repeat goes.
  expect(markup).toContain('aria-label="Server Guy itself"');
  expect(markup).toContain("recovery kit is not saved yet");
  expect(markup).toContain("Save your recovery kit");
  // The passphrase is fetched when the band is shown, never rendered with
  // the page.
  expect(markup).toContain("Reading the kit");
});

it("states Server Guy on a page no record has anything to say about", () => {
  const markup = draw(
    [],
    controller({
      connected: false,
      state: "unprotected",
      lastCopyAt: null,
      nextCopyBy: null,
      kitConfirmedAt: null,
      kitReady: false,
      copies: [],
      bucket: null,
      host: null,
    }),
  );
  expect(markup).toContain("Nothing here has been looked at yet.");
  // Nothing else on this page names the subject, so the band still does.
  expect(markup).toContain("Server Guy itself");
  expect(markup).toContain("Not copied");
  expect(markup).toContain("Connect backup storage");
  expect(markup).toContain("protects your application");
  // And the sentence beside that form stands on its own words.
  expect(markup).toContain("would lose Server Guy");
});

it("keeps stating Server Guy on that page once it is recoverable", () => {
  const markup = draw([], controller());
  expect(markup).toContain("Recoverable");
  expect(markup).toContain("The last 14 copies are kept");
  expect(markup).not.toContain("Save your recovery kit");
});

it("reports a failed copy instead of a quiet page", () => {
  const markup = draw(
    [PLAN()],
    controller({
      state: "failing",
      copies: [
        {
          id: "c2",
          at: AT,
          outcome: "failed",
          reason: "The backup storage refused the request (403).",
          size: null,
        },
        ...controller().copies,
      ],
    }),
  );
  expect(markup).toContain("Copy failed");
  expect(markup).toContain("refused the request (403)");
});

it("says nothing about a controller it has no facts for", () => {
  expect(draw([PLAN()])).not.toContain("Server Guy itself");
});
