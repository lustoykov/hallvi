"use client";

// What the Backups page says before it says anything else.
//
// The calendar underneath shows what happened: the copies, when they ran,
// what a restore test proved. This says what all of that adds up to, because
// that is the question a reader arrives with and it is the one thing a page
// made of dated rows does not answer.
//
// The distinctions it exists to keep:
//
// - A schedule is not a copy. A timer that is active and has never produced a
//   file protects nothing, and the most reassuring thing this page could do
//   is call that green.
// - A copy is not a recovery. A file nobody has restored is a file nobody has
//   opened; the only evidence recovery works is a restore that happened.
// - Where a copy is decides what it survives. Beside the application it dies
//   with the server. That is not a footnote, it is the answer.
// - A provider snapshot is not an application-aware copy, and neither implies
//   the other.

import {
  ArrowClockwise,
  CheckCircle,
  CircleDashed,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";

import type {
  DestinationKind,
  Protection,
  ProtectionVerdict,
} from "./backups-records";
import { LocalTime } from "./local-time";
import "./protection-banner.css";

const icon = {
  verified: <CheckCircle weight="fill" aria-hidden="true" />,
  warning: <WarningCircle weight="fill" aria-hidden="true" />,
  failed: <XCircle weight="fill" aria-hidden="true" />,
  unknown: <CircleDashed weight="bold" aria-hidden="true" />,
} as const;

/** The word on the tag. Never "Protected" unless a restore proved it. */
const word = {
  verified: "Recovery proved",
  warning: "Limited",
  failed: "Failed",
  unknown: "Not assessed",
} as const;

const destinationWord: Record<DestinationKind, string> = {
  "same-server": "On the application's server",
  controller: "On this computer",
  "off-site": "Off-site storage",
  provider: "Provider snapshot",
  unclassified: "Destination not classified",
};

export function ProtectionBanner({
  verdict,
  protection,
  meaning,
  now,
  onAsk,
}: {
  verdict: ProtectionVerdict;
  protection: Protection;
  meaning: Record<DestinationKind, string>;
  now: number;
  onAsk: (draft: string) => void;
}) {
  void now;
  const {
    summary,
    destinations,
    plannedDestinations,
    failures,
    nextRunAt,
    covers,
    keepText,
  } = protection;
  // Only where a plan names somewhere no copy has reached. Listing a class
  // twice — once as intent and once as evidence — is the page saying the same
  // thing in two tones.
  const onlyPlanned = plannedDestinations.filter(
    (kind) => !destinations.includes(kind),
  );
  const restoreIsPrimary = /restore/i.test(verdict.next?.label ?? "");
  return (
    <section
      className="sg-protect"
      data-tone={verdict.tone}
      aria-label="What protects this application's data"
    >
      <div className="sg-protect-head">
        <span className="sg-protect-mark">{icon[verdict.tone]}</span>
        <span className="sg-protect-tag">{word[verdict.tone]}</span>
        <p className="sg-protect-says">{verdict.says}</p>
      </div>

      {verdict.limit && <p className="sg-protect-limit">{verdict.limit}</p>}

      {/* Where the copies actually went, and what each class survives. Drawn
          per class rather than once, because a plan can have more than one
          and they do not protect against the same thing. */}
      {destinations.length > 0 && (
        <ul className="sg-protect-destinations">
          {destinations.map((kind) => (
            <li key={kind} data-kind={kind}>
              <b>{destinationWord[kind]}</b>
              <span>{meaning[kind]}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Somewhere the plan means to write and nothing has. Said in the
          future tense and kept out of the list above, because that list is
          what the copies did and this is what they are meant to do. */}
      {onlyPlanned.length > 0 && (
        <p className="sg-protect-planned">
          The plan also names{" "}
          {onlyPlanned
            .map((kind) => destinationWord[kind].toLowerCase())
            .join(" and ")}
          . No copy has reached there yet.
        </p>
      )}

      <dl className="sg-protect-facts">
        <div>
          <dt>Last copy that worked</dt>
          <dd>
            {summary.backup ? (
              <>
                <LocalTime value={summary.backup.at} variant="compact" />
                <small>{summary.backup.detail}</small>
              </>
            ) : (
              "None yet"
            )}
          </dd>
        </div>
        <div>
          <dt>Last restore tested</dt>
          <dd>
            {summary.restore ? (
              <>
                <LocalTime value={summary.restore.at} variant="compact" />
                <small>{summary.restore.detail}</small>
              </>
            ) : (
              "Never"
            )}
          </dd>
        </div>
        <div>
          <dt>Schedule</dt>
          <dd>
            {summary.schedule?.words ?? "None"}
            {nextRunAt && (
              <small>
                next <LocalTime value={nextRunAt} variant="compact" />
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Kept</dt>
          <dd>
            {keepText ??
              (summary.keep ? `${summary.keep} copies` : "Not recorded")}
            {/* Coverage, which is the part most often incomplete and least
                often mentioned: a plan that copies the database and not the
                uploads is a plan with a hole in it. */}
            {/* In the owner's words. This printed `covers shop-postgres`,
                which is the id a page matches on and not a thing anybody
                calls their data. */}
            <small>
              {protection.coverLabels.length
                ? `covers ${protection.coverLabels.join(", ")}`
                : covers.size
                  ? `covers ${[...covers.keys()].join(", ")}`
                  : "nothing says what it covers"}
            </small>
          </dd>
        </div>
      </dl>

      {(failures.copy || failures.restore) && (
        <p className="sg-protect-failure">
          {failures.restore
            ? "A restore test on record failed and no later success replaces it."
            : "A backup attempt on record failed and no later success replaces it."}
        </p>
      )}

      <div className="sg-protect-actions">
        {verdict.next && (
          <button
            type="button"
            className="sg-protect-primary"
            onClick={() => onAsk(verdict.next!.draft)}
          >
            {verdict.next.label}
          </button>
        )}
        {/* Always available, whatever the verdict: taking a copy now and
            testing one are the two things an owner wants to be able to do
            from this page without composing a sentence. */}
        <button
          type="button"
          className="sg-protect-action"
          onClick={() =>
            onAsk(
              "Take a backup of this application now and verify the copy is readable. Record the copy and where it went.",
            )
          }
        >
          <ArrowClockwise weight="bold" aria-hidden="true" />
          Back up now
        </button>
        {/* Dropped when the verdict already asks for a restore. Two buttons
            a word apart — "Test a restore of the newest copy" beside "Test a
            restore" — read as two different operations, and the reader has
            to work out that one of them is the other one, vaguer. */}
        {!restoreIsPrimary && (
          <button
            type="button"
            className="sg-protect-action"
            onClick={() =>
              onAsk(
                "Restore the newest backup copy into an isolated copy of this application and verify the data and files are actually there. Keep it away from the running application and anything it talks to, and record exactly what it proved.",
              )
            }
          >
            Test a restore
          </button>
        )}
      </div>
    </section>
  );
}
