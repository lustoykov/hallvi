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

import { useMemo, type ReactNode } from "react";

import type { SavedInformation } from "@/server/operator-data";

import { architectureFromRecords } from "./architecture-records";
import { JourneyDirection } from "./architecture/journey-v2";
import type { ApplicationSection } from "./application-sections";
import "./architecture/prototype.css";

export function ArchitecturePage({
  records,
  applicationId,
  applicationName,
  now,
  bar,
  description,
  onOpenDestination,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  /** The way back to the conversation. */
  bar: ReactNode;
  /** The line under the heading, drawn while nothing is mapped. */
  description: string;
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
      <div className="ax-root hv-section-page hv-section-architecture">
        {bar}
        <header className="hv-section-header">
          <div>
            <h1>Architecture</h1>
            <p>{description}</p>
          </div>
        </header>
        <div className="hv-section-content">
          <div className="hv-arch-unmapped">
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
              className="hv-primary-button"
              onClick={() =>
                onAsk(
                  "Work out how this application is put together — its pieces, how they connect, and what you can verify about each — and record it.",
                )
              }
            >
              Ask Hallvi to map this application
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="ax-root hv-section-page hv-section-architecture">
      <JourneyDirection
        model={model}
        onOpenDestination={onOpenDestination}
        onAsk={onAsk}
        page={{ bar, openUrl: null }}
      />
    </div>
  );
}
