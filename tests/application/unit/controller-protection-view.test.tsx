// Haldur's own protection is a distinct, compact disclosure below the
// application's backup surface. Its actions never imply application coverage.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it } from "vitest";

import { BackupsPage } from "@/components/haldur/backups-page";
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

it("keeps recoverable controller protection in one compact disclosure", () => {
  const markup = draw([PLAN()], controller());
  expect(markup.split("Haldur on this Mac")).toHaveLength(3);
  expect(markup).toContain("recovery kit saved");
  expect(markup).toContain("It keeps the last 14 copies");
  expect(markup).not.toContain("Save your recovery kit");
});

it("offers the recovery kit without rendering a passphrase in the page", () => {
  const markup = draw(
    [PLAN()],
    controller({ state: "copied", kitConfirmedAt: null }),
  );
  expect(markup).toContain("recovery kit still needs saving");
  expect(markup).toContain("Save your recovery kit");
  expect(markup).toContain("Open this section to read the kit.");
  expect(markup).not.toContain("data-recovery-passphrase");
});

it("uses the same truthful surface when application evidence is sparse", () => {
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
  expect(markup).toContain("Nobody has looked at whether this application");
  expect(markup).toContain("Haldur on this Mac");
  expect(markup).toContain("Not copied");
  expect(markup).toContain("Connect backup storage");
  expect(markup).toContain("Application data still needs its own backup plan");
});

it("keeps the controller disclosure present on a sparse recoverable page", () => {
  const markup = draw([], controller());
  expect(markup).toContain("Haldur on this Mac");
  expect(markup).toContain("recovery kit saved");
  expect(markup).not.toContain("Save your recovery kit");
});

it("shows an actual failed controller copy and its reason", () => {
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
  expect(markup).toContain("Latest copy failed");
  expect(markup).toContain('data-state="failing"');
  expect(markup).toContain("refused the request (403)");
});

it("says nothing about a controller it has no facts for", () => {
  expect(draw([PLAN()])).not.toContain("Haldur on this Mac");
});
