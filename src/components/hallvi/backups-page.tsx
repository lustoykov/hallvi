"use client";

// Backups, on real records.
//
// Application-first Backups over the same three subjects Storage reads — plan,
// copy and restore test — because the pages ask different questions of them.
// Storage asks "would this survive the container being replaced"; this one
// asks "would the application's data survive losing the server".
//
// The application and its data are the page. The calendar board that used to
// sit under them is kept at backup-prototype/calendar.tsx as the alternative
// it now is: with
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
import {
  currentFacts,
  subjectsOfKind,
  topologyOf,
} from "@/server/record-projection";

import type { PageChrome } from "./deployment-prototype/page-head";
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
  /** Hallvi's own protection, which no application record establishes. */
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
  const hostName = useMemo(() => {
    const live = records.filter((record) => !record.retiredAt);
    const host = topologyOf(live, applicationId)?.value.parts.find(
      (part) => part.kind === "host",
    );
    if (host?.name) return host.name;
    const hostRef = subjectsOfKind(live, "host")[0];
    if (!hostRef) return "server not established";
    return (
      currentFacts(live, hostRef).get("address")?.value.value ?? hostRef.id
    );
  }, [records, applicationId]);
  // The one verdict the page leads with. Data items say what happened; this
  // says what those records add up to, which is the question a reader arrives
  // with.
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

  return (
    <div className="ax-root" data-variant="stages">
      <section className="hv-backups" aria-label="Backups">
        {head}
        <BackupStages
          protection={protection}
          verdict={verdict}
          now={now}
          applicationName={applicationName}
          hostName={hostName}
          volumes={story.volumes}
          pieces={story.pieces}
          onAsk={onAsk}
        />
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
