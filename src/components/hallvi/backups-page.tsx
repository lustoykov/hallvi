"use client";

// Backups, on real records.
//
// The one page that says whether this application's data is copied, what a
// copy holds and whether a restore has ever opened one. Storage and Database
// each carry a single read-only line of that and send the reader here.
//
// It opens on the four figures a reader arrives with: what holds data and
// how much of it is in a copy, how old the newest copy is, whether a restore
// has been tried, and what the plan says. Under them the stages show the
// work. Storage asks a different question of the same subjects — would this
// survive the container being replaced — and answers only that.
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
import {
  inNewestCopy,
  protectionFromRecords,
  protectionVerdict,
} from "./backups-records";
import { BackupStages } from "./backup-stages";
import { ControllerProtectionBand } from "./controller-protection";
import { databasesFromRecords } from "./database-records";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { Figure, Lede, Strip, ago } from "./register";
import { storageFromRecords, volumeName } from "./storage-records";

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
  // Everything on record that holds data, however it is stored. A volume and
  // a database are two answers to one question, and only because of how the
  // bytes sit on disk.
  const holders = useMemo(() => {
    const databases = databasesFromRecords({ records, now });
    return [
      ...story.volumes.map((volume) => ({
        id: volume.name,
        name: volumeName(volume),
      })),
      ...databases
        .filter((row) => !row.absent)
        .map((row) => ({ id: row.id, name: row.label })),
    ];
  }, [records, story.volumes, now]);
  const copied = holders.filter(
    (one) => inNewestCopy(protection, one.id) === true,
  );
  const newest = protection.copies[0] ?? null;
  const proved = newest ? protection.verifiedCopies.get(newest.id) : null;
  const { schedule } = protection.summary;

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
        <Lede>
          What is protected, and whether a restore has been tried. Storage and
          Database each carry one line of this and send you here.
        </Lede>
        <Strip>
          <Figure
            label="Holds data"
            // "0 of 5" is an established zero. Nobody having looked is not
            // that, and must not borrow its confidence.
            value={
              !holders.length || !protection.assessed
                ? "Not checked"
                : `${copied.length} of ${holders.length} in a copy`
            }
            tone={
              !holders.length || !protection.assessed
                ? "plain"
                : copied.length === holders.length
                  ? "good"
                  : "warn"
            }
            note={
              !holders.length
                ? "No record names a volume or a database."
                : !protection.assessed
                  ? "Nobody has looked at whether any of it is copied."
                  : holders.map((one) => one.name).join(", ")
            }
          />
          <Figure
            label="Newest copy"
            value={newest ? ago(newest.at, now) : "None on record"}
            note={
              newest
                ? (newest.destination ?? "Where it went is not recorded.")
                : "Nothing has copied this application's data."
            }
          />
          <Figure
            label="Restore"
            // "Never tested" is a claim about what has happened. Only a page
            // that has looked may make it.
            value={
              proved
                ? `Tested ${ago(proved.at, now)}`
                : protection.assessed
                  ? "Never tested"
                  : "Not checked"
            }
            // Worth amber only once there is a copy to be unsure about.
            tone={proved ? "good" : newest ? "warn" : "plain"}
            note={
              proved
                ? proved.detail
                : "A copy counts once one has been opened and loaded."
            }
          />
          <Figure
            label="Plan"
            value={
              schedule
                ? schedule.words
                : protection.declaredAbsent
                  ? "None"
                  : protection.planned
                    ? "No schedule"
                    : "Not checked"
            }
            // Not the verdict's own sentence: the band below already says it,
            // and a page that repeats itself is the fault this one is fixing.
            note={
              protection.coverLabels.length
                ? `Covers ${protection.coverLabels.join(", ")}`
                : (verdict.limit ?? "No plan names what to copy.")
            }
          />
        </Strip>
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
