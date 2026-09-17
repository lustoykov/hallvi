"use client";

// Database, on real records.
//
// The accepted Timeline design. Its empty state has to be careful: an
// application may genuinely have no database, and this page cannot tell that
// apart from nobody having looked — only a record stating one `absent` can.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./deployment-prototype/page-head";
import type { ApplicationSection } from "./application-sections";
import { databaseAssessed, databaseFromRecords } from "./database-records";
import { TimelineDirection } from "./data-prototype/timeline";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import "./data-prototype/timeline.css";

export function DatabasePage({
  records,
  applicationId,
  applicationName,
  now,
  reachable = "checking",
  onReopen,
  chrome,
  onOpenDestination,
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
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () => databaseFromRecords({ records, applicationId, now }),
    [records, applicationId, now],
  );
  const assessed = useMemo(() => databaseAssessed(records), [records]);

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Database"
      name={applicationName}
      openUrl={null}
      restricted={false}
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  if (!assessed)
    return (
      <div className="ax-root" data-variant="timeline">
        {head}
        <div className="sg-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No record names a database for {applicationName}. It may not have
            one — plenty of applications do not — but nothing here has
            established that either way, and an unchecked database and an absent
            one are not the same thing.
          </p>
          <button
            type="button"
            className="sg-primary-button"
            onClick={() =>
              onAsk(
                `Does ${applicationName} have a database? If it does, say which engine, where its data lives and whether it answers; if it does not, record that.`,
              )
            }
          >
            Ask Haldur where the data lives
          </button>
        </div>
      </div>
    );

  return (
    <div className="ax-root" data-variant="timeline">
      <TimelineDirection
        story={story}
        now={now}
        head={head}
        activity={null}
        onAsk={onAsk}
        onOpenDestination={onOpenDestination}
      />
    </div>
  );
}
