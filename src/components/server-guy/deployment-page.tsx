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

import type { PageChrome } from "./architecture-prototype/index";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { releasesFromRecords } from "./release-records";
import { ReleasesPanel } from "./releases-panel";

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

  // The design's "nothing deployed" branch draws the product's own panel in
  // the middle of the page. In the records path there is no form to put
  // there, so this is what belongs: what is true, and the one thing to do.
  const nothing = (
    <div className="sg-deploy-none">
      <h2>Nothing has been deployed yet.</h2>
      <p>
        No release is on record for this application. That is not a claim it
        cannot be deployed — only that Server Guy has not done it, or has not
        written down what it did.
      </p>
      <p>
        Ask in the conversation. You will be shown what it intends to do before
        anything is bought or changed, and the release, its checks and the way
        in are all recorded here.
      </p>
      <button
        type="button"
        className="sg-primary-button"
        onClick={() =>
          onAsk(
            "Work out what this application needs and deploy it, keeping it private to this PC.",
          )
        }
      >
        Ask Pi to deploy this application
      </button>
    </div>
  );

  const releases = useMemo(() => releasesFromRecords(records, ""), [records]);
  const hasReleases = releases.all.length > 0;
  // Only while something is actually in flight. `running` and
  // `awaiting-approval` are the two states where the conversation has more to
  // say than the record does.
  const waiting = executions.some(
    (execution) =>
      execution.status === "running" ||
      execution.status === "awaiting-approval",
  );

  return (
    <div className="ax-root" data-variant="spine">
      <section className="sg-deployment" aria-label="Deployment">
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
