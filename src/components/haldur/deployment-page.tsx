"use client";

// Deployment, on real records and real executions.
//
// The selected design (the spine): one list of releases, newest first, with
// what is serving named above it and the commands that produced each release
// inside it.
//
// The Transit story that used to sit under the list is gone. It told the
// story of the latest attempt as phases, which is the same executions the
// newest release now opens on, in a second shape on the same screen. Its
// four states are all still reachable in the list: nothing deployed, a
// decision waiting, work running, and a release that either holds or failed.
// The design is kept at deployment-prototype/transit.tsx.

import { useMemo } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./deployment-prototype/page-head";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { releasesFromRecords } from "./release-records";
import { ReleasesPanel } from "./releases-panel";
import { EmptySketch } from "./empty-sketch";

export function DeploymentPage({
  records,
  executions,
  applicationName,
  now,
  reachable = "checking",
  onReopen,
  chrome,
  panel,
  onAsk,
}: {
  records: SavedInformation[];
  executions: ExecutionRecord[];
  applicationName: string;
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: Reachability;
  /** Asks Pi to reopen private access when it is closed. */
  onReopen?: () => void;
  chrome: PageChrome;
  panel?: React.ReactNode;
  onAsk: (draft: string) => void;
}) {
  const access = records
    .filter((record) => !record.retiredAt)
    .find(
      (record) => record.presentation?.content?.kind === "application-access",
    );
  const content = access?.presentation?.content;
  const restricted =
    content?.kind === "application-access" ? content.mode === "private" : false;

  // Only while something is actually in flight. `running` and
  // `awaiting-approval` are the two states where the conversation has more to
  // say than the record does.
  const waiting = executions.some(
    (execution) =>
      execution.status === "running" ||
      execution.status === "awaiting-approval",
  );

  // The design's "nothing deployed" branch draws the product's own panel in
  // the middle of the page. In the records path there is no form to put
  // there, so this is what belongs: what is true, and the one thing to do.
  const nothing = waiting ? (
    <div className="hd-deploy-none">
      <h2>Work is in progress.</h2>
      <p>
        Follow the current work in the conversation. Recorded releases will
        appear here.
      </p>
      <EmptySketch kind="flow" />
    </div>
  ) : (
    <div className="hd-deploy-none">
      <h2>No deployment is on record.</h2>
      <p>Deployment details will appear here when Haldur records a release.</p>
      <button
        type="button"
        className="hd-primary-button"
        onClick={() =>
          onAsk(
            "Work out what this application needs and deploy it, keeping it private to this PC.",
          )
        }
      >
        Ask Haldur to deploy this application
      </button>
      <EmptySketch kind="flow" />
    </div>
  );

  const releases = useMemo(() => releasesFromRecords(records, ""), [records]);
  const hasReleases = releases.all.length > 0;

  return (
    <div className="ax-root" data-variant="spine">
      <section className="hd-deployment" aria-label="Deployment">
        <PageHead
          bar={chrome.bar}
          title="Deployment"
          name={applicationName}
          // The band an inch below owns the way in on this page: the state,
          // the address and the one control. The header offers it everywhere
          // else, and offering it here too put two reopen buttons and the
          // same sentence twice on one screen.
          openUrl={null}
          restricted={restricted}
          reachable={reachable}
          onReopen={onReopen}
        />
        {hasReleases ? (
          <ReleasesPanel
            view={releases}
            records={records}
            executions={executions}
            now={now}
            reachable={reachable}
            onReopen={onReopen}
            onAsk={onAsk}
          />
        ) : (
          nothing
        )}
        {/* Work in progress, where the shell has any. A release that is still
            running is a row in the list; this is the conversation's own view
            of what it is doing right now. */}
        {waiting && chrome.activity}
        {hasReleases && panel}
      </section>
    </div>
  );
}
