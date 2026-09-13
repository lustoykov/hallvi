"use client";

// Monitoring, on real records.
//
// The accepted Tuner design. What it must never do is show a wall of green
// and let a reader conclude they would be told if something broke. Every
// station says when it was last looked at, and the page says plainly whether
// anything is watching between those looks.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./architecture-prototype/index";
import { PageHead } from "./deployment-prototype/page-head";
import { monitoringFromRecords } from "./monitoring-records";
import { TunerDirection } from "./signal-prototype/tuner";
import "./signal-prototype/tuner.css";

export function MonitoringPage({
  records,
  applicationId,
  applicationName,
  now,
  chrome,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  chrome: PageChrome;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () =>
      monitoringFromRecords({ records, applicationId, applicationName, now }),
    [records, applicationId, applicationName, now],
  );

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Monitoring"
      name={applicationName}
      openUrl={null}
      restricted={false}
    />
  );

  if (!story.looks.length && !story.watcher)
    return (
      <div className="ax-root" data-variant="tuner">
        {head}
        <div className="sg-deploy-none">
          <h2>Nothing has been checked, and nothing is watching.</h2>
          <p>
            No record carries a check about any part of {applicationName}. So
            there is nothing here to age, nothing to show green, and — more to
            the point — nothing that would tell you if the application stopped
            answering.
          </p>
          <button
            type="button"
            className="sg-primary-button"
            onClick={() =>
              onAsk(
                `Check every part of ${applicationName} now and tell me what would happen if one of them stopped — would anything notice?`,
              )
            }
          >
            Ask Pi to check it now
          </button>
        </div>
      </div>
    );

  return (
    <div className="ax-root" data-variant="tuner">
      <TunerDirection
        story={story}
        now={now}
        head={head}
        activity={null}
        onAsk={onAsk}
      />
    </div>
  );
}
