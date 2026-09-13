"use client";

// Backups, on real records.
//
// The accepted Calendar design over the same three subjects Storage reads —
// plan, copy, restore test — because they are the same records and the two
// pages ask different questions of them. Storage asks "would this survive the
// container being replaced"; this one asks "would it survive the server".
//
// The empty state is the one that has to be right. "No backups" is a claim,
// and a page that makes it on the strength of no records has told the reader
// the one thing that would stop them acting.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";
import { currentFacts, subjectsOfKind } from "@/server/record-projection";

import type { PageChrome } from "./architecture-prototype/index";
import { protectionFromRecords } from "./backups-records";
import { CalendarDirection } from "./backup-prototype/calendar";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { storageFromRecords } from "./storage-records";
import "./backup-prototype/calendar.css";

export function BackupsPage({
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
    () => storageFromRecords({ records, applicationId, now }),
    [records, applicationId, now],
  );
  const assessed = useMemo(
    () => protectionFromRecords(records, now).assessed,
    [records, now],
  );
  const server = useMemo(() => {
    const live = records.filter((record) => !record.retiredAt);
    const host = subjectsOfKind(live, "host")[0];
    if (!host) return null;
    return {
      label: host.id,
      city: currentFacts(live, host).get("region")?.value.value ?? null,
    };
  }, [records]);

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Backups"
      name={applicationName}
      openUrl={null}
      restricted={false}
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  if (!assessed)
    return (
      <div className="ax-root" data-variant="calendar">
        {head}
        <div className="sg-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No record names a backup plan, a copy or a restore test for{" "}
            {applicationName}. That is not the same as there being no backups —
            it means Server Guy has not established either way, and this is the
            one page where guessing would be worst.
          </p>
          <p>
            {story.volumes.length > 0
              ? `Something is on disk: ${story.volumes.length === 1 ? "one volume holds" : `${story.volumes.length} volumes hold`} data that would go with the server.`
              : "Nothing has established what is on disk either, so there is not yet anything to say a plan would cover."}
          </p>
          <button
            type="button"
            className="sg-primary-button"
            onClick={() =>
              onAsk(
                `Is anything backing up ${applicationName}'s data off this server? If nothing is, say so and recommend the simplest thing that would.`,
              )
            }
          >
            Ask Pi what protects this
          </button>
        </div>
      </div>
    );

  return (
    <div className="ax-root" data-variant="calendar">
      <CalendarDirection
        story={story}
        now={now}
        head={head}
        activity={null}
        server={server}
        onAsk={onAsk}
      />
    </div>
  );
}
