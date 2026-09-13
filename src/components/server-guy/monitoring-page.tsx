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
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { monitoringFromRecords } from "./monitoring-records";
import { TunerDirection } from "./signal-prototype/tuner";
import "./signal-prototype/tuner.css";

export function MonitoringPage({
  records,
  applicationId,
  applicationName,
  now,
  reachable = "checking",
  onReopen,
  chrome,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: Reachability;
  /** Asks Pi to reopen private access when it is closed. */
  onReopen?: () => void;
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
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  // The Tuner draws stations, and a station is a part something was observed
  // about. A record can establish that nothing is watching without anything
  // ever having been observed — an honest state, and one the dial has nothing
  // to point at — so the page says it in words instead.
  if (!story.parts.length)
    return (
      <div className="ax-root" data-variant="tuner">
        {head}
        <div className="sg-deploy-none">
          <h2>
            {story.watcher
              ? story.watcher.state === "running"
                ? "Something is watching, and nothing here has been checked."
                : "Nothing is watching, and nothing here has been checked."
              : "Nothing has been checked, and nothing is watching."}
          </h2>
          <p>
            No record carries a check about any part of {applicationName}. So
            there is nothing here to age, nothing to show green, and — more to
            the point — nothing that would tell you if the application stopped
            answering.
          </p>
          {story.watcher && <p>{story.watcher.detail}</p>}
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
