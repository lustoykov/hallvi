"use client";

// Monitoring, on real records.
//
// What it must never do is show a wall of green and let a reader conclude
// they would be told if something broke. So the lede says first whether
// anything is watching, every result says how much longer it counts, and a
// missing watcher is drawn as the gap it is.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./deployment-prototype/page-head";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import {
  monitoringFromRecords,
  usageFromRecords,
  watchingFromRecords,
} from "./monitoring-records";
import { MonitoringUsage } from "./monitoring-usage";
import { AskButton, MonitoringLede, WatchingMap } from "./monitoring-watching";
import { EmptySketch } from "./empty-sketch";

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
  const watching = useMemo(
    () => watchingFromRecords(records, applicationId, story, now),
    [records, applicationId, story, now],
  );
  const usage = useMemo(
    () => usageFromRecords(records, applicationId),
    [records, applicationId],
  );

  // A check can pass while visitors get errors; the lede says both.
  const failed = usage?.traffic?.serverErrors.reduce((a, b) => a + b, 0) ?? 0;
  const aside = failed
    ? `In the last 24 hours the access log shows ${failed.toLocaleString("en-US")} ${failed === 1 ? "request" : "requests"} failing on the server.`
    : null;

  return (
    <div className="ax-root">
      <section className="axmw-page" aria-label="Monitoring">
        <PageHead
          bar={chrome.bar}
          title="Monitoring"
          name={applicationName}
          openUrl={null}
          restricted={false}
          reachable={reachable}
          onReopen={onReopen}
        />
        {story.parts.length ? (
          <MonitoringLede
            story={story}
            watching={watching}
            now={now}
            aside={aside}
            onAsk={onAsk}
          />
        ) : (
          // A record can establish that nothing is watching without anything
          // ever having been checked: an honest state with no map to draw.
          <div className="hd-deploy-none">
            <h2>
              {story.watcher
                ? story.watcher.state === "running"
                  ? "Something is watching, and nothing here has been checked."
                  : "Nothing is watching, and nothing here has been checked."
                : "Nothing has been checked, and nothing is watching."}
            </h2>
            <p>
              No record carries a check about any part of {applicationName}. So
              there is nothing here to age, nothing to show green, and nothing
              that would tell you if the application stopped answering.
            </p>
            {story.watcher && <p>{story.watcher.detail}</p>}
            <AskButton
              primary
              onClick={() =>
                onAsk(
                  `Check every part of ${applicationName} now and tell me what would happen if one of them stopped — would anything notice?`,
                )
              }
            >
              Ask Haldur to check it now
            </AskButton>
            <EmptySketch kind="rings" />
          </div>
        )}
        {/* How much it is used stands whether or not anything is watching. */}
        <MonitoringUsage
          usage={usage}
          name={applicationName}
          now={now}
          onAsk={onAsk}
        />
        {story.parts.length > 0 && (
          <WatchingMap
            story={story}
            watching={watching}
            now={now}
            onAsk={onAsk}
          />
        )}
      </section>
    </div>
  );
}
