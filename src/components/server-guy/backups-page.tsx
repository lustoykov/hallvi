"use client";

// Backups, on real records.
//
// The selected design (C inside F) over the same three subjects Storage reads
// — plan, copy, restore test — because they are the same records and the two
// pages ask different questions of them. Storage asks "would this survive the
// container being replaced"; this one asks "would it survive the server".
//
// The stages are the page. The calendar board that used to sit under them is
// kept at backup-prototype/calendar.tsx as the alternative it now is: with
// the things themselves inside the stages, a board of the same copies by day
// is the reader meeting the same facts twice. One finding went with it — the
// board marked a day where a schedule implied a copy and none was on record,
// which it worked out by assuming the schedule was daily. Nothing on record
// says the cadence, so that mark is not reproduced here rather than guessed
// at again.
//
// The empty state is the one that has to be right. "No backups" is a claim,
// and a page that makes it on the strength of no records has told the reader
// the one thing that would stop them acting.

import { useMemo } from "react";

import type { ControllerProtectionFacts } from "@/server/application-facts";
import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./architecture-prototype/index";
import { protectionFromRecords, protectionVerdict } from "./backups-records";
import { BackupStages } from "./backup-stages";
import { ControllerProtectionBand } from "./controller-protection";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { storageFromRecords } from "./storage-records";

export function BackupsPage({
  records,
  applicationId,
  applicationName,
  now,
  reachable = "checking",
  onReopen,
  chrome,
  controller,
  onRefresh,
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
  /** Server Guy's own protection, which no application record establishes. */
  controller?: ControllerProtectionFacts;
  /** Re-reads the view after the owner confirms the recovery kit. */
  onRefresh?: () => Promise<void>;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () => storageFromRecords({ records, applicationId, now }),
    [records, applicationId, now],
  );
  const protection = useMemo(
    () => protectionFromRecords(records, now, applicationId),
    [records, now, applicationId],
  );
  const assessed = protection.assessed;
  // The one verdict the page leads with, and deliberately not a summary of
  // the stages under it: they say what happened, this says what that adds up
  // to, which is the question a reader arrives with.
  const verdict = useMemo(
    () => protectionVerdict(protection, now),
    [protection, now],
  );
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
      <div className="ax-root" data-variant="stages">
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
            Check backups
          </button>
        </div>
        {/* Server Guy's own protection is true whether or not anything
            has looked at this application, and the first copy's recovery
            kit has to be findable on a controller that has never deployed
            anything. */}
        {controller && (
          <ControllerProtectionBand
            facts={controller}
            now={now}
            onRefresh={onRefresh}
            standalone
          />
        )}
      </div>
    );

  return (
    <div className="ax-root" data-variant="stages">
      <section className="sg-backups" aria-label="Backups">
        {head}
        {/* Set up, copied, opened — three stages rather than one verdict with
            three facts folded into it, and what the application keeps inside
            the first of them. */}
        <BackupStages
          protection={protection}
          verdict={verdict}
          now={now}
          applicationName={applicationName}
          volumes={story.volumes}
          pieces={story.pieces}
          controller={controller}
          onAsk={onAsk}
        />
        {/* The track above already names Server Guy's own recovery and says
            its state, so this stays quiet unless there is something to do
            about it. */}
        {controller && (
          <ControllerProtectionBand
            facts={controller}
            now={now}
            onRefresh={onRefresh}
          />
        )}
      </section>
    </div>
  );
}
