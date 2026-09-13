"use client";

// Architecture, on real records.
//
// The design is the one accepted on claude/architecture-directions. What
// changes here is where it gets its model: from the records Pi wrote, read
// through the shared projection, rather than from the old facts model.
//
// A destination with a designed component uses it for everything — a complete
// map, a partly observed one, and nothing at all. Falling back to a list of
// cards when records are thin would mean the page a reader learns is the one
// they see least.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import { architectureFromRecords } from "./architecture-records";
import { JourneyDirection } from "./architecture-prototype/journey-v2";
import type { PageChrome } from "./architecture-prototype/index";
import type { Recheck } from "./architecture-prototype/use-recheck";
import type { ApplicationSection } from "./application-sections";
import "./architecture-prototype/prototype.css";

/**
 * The design animates a re-check while one is running. Nothing re-checks on
 * its own here: a reader asks, in the conversation, and the next records are
 * what changes the page.
 */
const idle: Recheck = {
  phase: "idle",
  marks: {},
  active: null,
  run: () => undefined,
  reset: () => undefined,
};

export function ArchitecturePage({
  records,
  applicationId,
  applicationName,
  now,
  reachable = true,
  chrome,
  onOpenDestination,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: boolean;
  chrome: PageChrome;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const model = useMemo(
    () =>
      architectureFromRecords({ records, applicationId, applicationName, now }),
    [records, applicationId, applicationName, now],
  );

  if (!model)
    return (
      <div className="sg-section-page sg-section-architecture">
        {chrome.bar}
        {chrome.header}
        <div className="sg-section-content">
          <div className="sg-arch-unmapped">
            <h2>How this fits together has not been worked out yet.</h2>
            <p>
              Nothing on record says what this application is made of. That is
              not a claim that it is simple, or that anything is missing — only
              that Pi has not looked, or has not written down what it found.
            </p>
            <p>
              Ask in the conversation, and whatever Pi establishes is drawn
              here: the pieces, how a visit reaches them, where your data sits,
              and which of it has actually been checked.
            </p>
            <button
              type="button"
              className="sg-primary-button"
              onClick={() =>
                onAsk(
                  "Work out how this application is put together — its pieces, how they connect, and what you can verify about each — and record it.",
                )
              }
            >
              Ask Pi to map this application
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="sg-section-page sg-section-architecture">
      <JourneyDirection
        model={model}
        recheck={idle}
        onOpenDestination={onOpenDestination}
        onAsk={onAsk}
        page={{
          chrome,
          openUrl: null,
          busy: false,
          last: null,
          earlier: 0,
        }}
      />
    </div>
  );
}
