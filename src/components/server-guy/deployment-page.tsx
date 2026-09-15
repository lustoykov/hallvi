"use client";

// Deployment, on real records and real executions.
//
// The accepted Transit design, fed by what Pi recorded about the release and
// what the controller recorded about the commands that produced it. It has
// four states worth drawing and they are all reachable here: nothing
// deployed, a decision waiting, work running, and a release that either holds
// or failed.

import { useMemo } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./architecture-prototype/index";
import type { ApplicationSection } from "./application-sections";
import { deploymentFromRecords } from "./deployment-records";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { TransitDirection } from "./deployment-prototype/transit";
import "./deployment-prototype/transit.css";
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
  onOpenConversation,
  onOpenDestination,
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
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () => deploymentFromRecords({ records, executions, applicationName, now }),
    [records, executions, applicationName, now],
  );
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

  return (
    <div className="ax-root" data-variant="transit">
      <TransitDirection
        story={story}
        now={now}
        head={
          <>
            <PageHead
              bar={chrome.bar}
              title="Deployment"
              name={story.name}
              // The release panel an inch below owns the way in on this page:
              // the state, the address and the one control. The header offers
              // it everywhere else, and offering it here too put two reopen
              // buttons and the same sentence twice on one screen.
              //
              // Offered only while a release is standing; a failed or
              // unfinished one has nothing to open.
              openUrl={
                story.state === "live" && !hasReleases
                  ? (access?.presentation?.url ?? null)
                  : null
              }
              restricted={restricted}
              reachable={reachable}
              onReopen={onReopen}
            />
            {/* What is deployed, above the story of the latest attempt.
                The story below is the attempt's phases, which is the right
                answer to "what just happened" and the wrong one to "what is
                running" whenever those are different records. */}
            {hasReleases && (
              <ReleasesPanel
                view={releases}
                now={now}
                reachable={reachable}
                onReopen={onReopen}
                onAsk={onAsk}
              />
            )}
          </>
        }
        activity={
          story.state === "working" || story.state === "awaiting"
            ? chrome.activity
            : null
        }
        panel={story.state === "none" ? nothing : panel}
        onAsk={onAsk}
        onOpenConversation={onOpenConversation}
        onOpenDestination={onOpenDestination}
      />
    </div>
  );
}
