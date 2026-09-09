"use client";

import type { ReactNode } from "react";

import type {
  BackupEvidenceFacts,
  BackupProof,
} from "@/server/application-facts";

import { lastVerifiedProof, latestProof } from "../fact-status";
import { LocalTime } from "../local-time";
import { Facts, Pill, SubHeading, When } from "./bits";
import { BackupPlugins } from "./backup-plugins";

const outcomeWord = {
  verified: "Verified",
  failed: "Failed",
  incomplete: "Not verified",
} as const;
const outcomeTone = {
  verified: "ok",
  failed: "bad",
  incomplete: "muted",
} as const;

/**
 * The two limits no receipt can lift, because the product runs neither a
 * schedule nor a retention policy. They are stated once, as limits, so the
 * page never repeats "not configured" in four places.
 */
const scheduleLimit =
  "Nothing runs on its own. Every proof is started by hand. It verifies a dated copy and does not keep newer changes backed up.";
const retentionLimit =
  "Nothing removes or ages a stored copy. It stays until someone removes it by hand.";

const short = (revision: string) => revision.slice(0, 7);

function megabytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "a, b and c": what a disclosure is about to open, in one phrase. */
function listed(parts: string[]) {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** The revision a proof ran against, and whether it is the one running now. */
function Revision({ proof }: { proof: BackupProof }) {
  if (!proof.revision) return <>Not recorded</>;
  return (
    <>
      <code>{short(proof.revision)}</code>
      <small className="sg-fact-note">
        {proof.revisionCurrent
          ? "The revision this application runs now."
          : "An earlier revision, so the proof does not describe what is deployed today."}
      </small>
    </>
  );
}

/** When the copied state was taken, or the window it was taken inside. */
function Captured({ proof, now }: { proof: BackupProof; now: number }) {
  if (proof.capturedAt) return <When at={proof.capturedAt} now={now} />;
  if (proof.startedAt && proof.uploadedAt)
    return (
      <>
        Between <LocalTime value={proof.startedAt} variant="compact" /> and{" "}
        <LocalTime value={proof.uploadedAt} variant="compact" />
        <small className="sg-fact-note">
          The receipt records the run, not the exact moment of the copy.
        </small>
      </>
    );
  return <>Not recorded</>;
}

/**
 * The one archive the restore read: how large it was, where it came back
 * from, and what was compared. Size, destination and the round trip were
 * three rows saying one thing; they are one row saying it once.
 */
function RestoredCopy({ proof, now }: { proof: BackupProof; now: number }) {
  const { archive, destination } = proof;
  if (!archive && !destination) return <>Not recorded</>;
  return (
    <>
      {archive?.bytes != null ? `${megabytes(archive.bytes)} · ` : ""}
      {destination ? (
        <>
          Cloudflare R2 · <code>{destination.bucket}</code>
        </>
      ) : (
        "Destination not recorded"
      )}
      <small className="sg-fact-note">
        {proof.downloadedCopyVerified
          ? `Downloaded back from the destination, matched by size${archive ? " and checksum" : ""}, and read by the restore.`
          : "The round trip through the destination was not recorded."}{" "}
        {proof.privateBucketCheckedAt ? (
          <>
            Private access checked{" "}
            <When at={proof.privateBucketCheckedAt} now={now} />.
          </>
        ) : (
          "Bucket visibility was not recorded."
        )}
      </small>
    </>
  );
}

function GrafanaChecks({ proof }: { proof: BackupProof }) {
  const grafana = proof.grafana;
  if (!grafana) return null;
  const { dashboard, credential, plugins } = grafana;
  return (
    <>
      <SubHeading>Dashboard and credential checks</SubHeading>
      <Facts
        wide
        rows={[
          [
            "Restored dashboard",
            dashboard
              ? `${dashboard.panels} panels saved, ${dashboard.queriesVerified} queries returned restored data.${dashboard.renderedCharts !== undefined ? ` ${dashboard.renderedCharts} of ${dashboard.panels} charts rendered in the browser.` : dashboard.browserRendered ? " Browser rendering passed; a chart count was not recorded." : " Browser rendering was not recorded."}`
              : "No dashboard was checked.",
          ],
          [
            "Saved credential",
            credential
              ? [
                  credential.authenticatedQuery
                    ? "A saved credential authenticated a real query."
                    : "The saved credential failed to authenticate a query.",
                  credential.unauthenticatedRejected
                    ? "An unauthenticated request was rejected."
                    : "An unauthenticated request was not rejected.",
                  credential.wrongPasswordRejected
                    ? "A wrong password was rejected."
                    : "A wrong password was not rejected.",
                ].join(" ")
              : "No saved credential was checked.",
          ],
        ]}
      />
      {plugins ? (
        <BackupPlugins plugins={plugins.items} counts={plugins} />
      ) : null}
    </>
  );
}

/** One attempt in the record: its outcome, one clause, and its time. */
function Attempt({ proof, now }: { proof: BackupProof; now: number }) {
  const at = proof.finishedAt ?? proof.startedAt;
  return (
    <li>
      <Pill tone={outcomeTone[proof.outcome]}>
        {outcomeWord[proof.outcome]}
      </Pill>
      <span>
        {proof.outcome === "verified"
          ? `Restored from the downloaded copy · ${proof.checks.length} checks`
          : proof.outcome === "failed"
            ? "Recorded a failure · not evidence that a copy restores"
            : "No completed restore recorded"}
        {proof.revision && (
          <>
            {" · "}
            <code>{short(proof.revision)}</code>
            {proof.revisionCurrent ? "" : " · earlier revision"}
          </>
        )}
      </span>
      <span className="sg-op-rel">
        {at ? <When at={at} now={now} /> : "Time not recorded"}
      </span>
    </li>
  );
}

/**
 * The restore proofs an operator ran, and what each one does not show. This
 * is evidence, not protection: it states a dated test, the copy that test
 * read back from the destination, and the checks it made. It never states a
 * schedule, a retention policy or a copy taken since.
 */
export function BackupEvidencePanel({
  facts,
  now,
  ongoingProtection = false,
}: {
  facts: BackupEvidenceFacts;
  now: number;
  ongoingProtection?: boolean;
}) {
  const verified = lastVerifiedProof(facts);
  const latest = latestProof(facts);
  const unverified = facts.proofs.filter(
    (proof) => proof.outcome !== "verified",
  );
  const uncleaned = facts.proofs.filter(
    (proof) => proof.cleanupNotes.length > 0,
  );
  // Absence stated once. The schedule and retention a proof cannot record
  // belong with the limits of the proof, not in a section of their own.
  const notCovered: Array<[string, ReactNode]> = [];
  if (!facts.scheduleConfigured && !ongoingProtection)
    notCovered.push(["Nothing is scheduled", scheduleLimit]);
  if (!facts.retentionConfigured && !ongoingProtection)
    notCovered.push(["No retention policy", retentionLimit]);
  for (const gap of verified?.gaps ?? [])
    if (gap.key !== "schedule" && gap.key !== "retention")
      notCovered.push([gap.label, gap.detail]);
  const opened = verified
    ? listed([
        `${verified.checks.length} checks`,
        ...(verified.grafana?.dashboard ? ["the dashboard"] : []),
        ...(verified.grafana?.credential ? ["a saved credential"] : []),
        ...(verified.grafana?.plugins
          ? [
              `${verified.grafana.plugins.total} plugin${verified.grafana.plugins.total === 1 ? "" : "s"}`,
            ]
          : []),
      ])
    : "";
  return (
    <>
      {uncleaned.length > 0 ? (
        <section
          className="sg-band sg-attention"
          aria-label="Cleanup attention"
        >
          <SubHeading>Cleanup needs attention</SubHeading>
          <p>
            Cleanup is separate from the restore result. These temporary
            resources may still exist.
          </p>
          {uncleaned.map((proof) => (
            <div key={proof.id}>
              {(proof.finishedAt ?? proof.startedAt) && (
                <p className="sg-visual-caption">
                  Left by the proof of{" "}
                  <When at={(proof.finishedAt ?? proof.startedAt)!} now={now} />
                </p>
              )}
              <Facts
                wide
                rows={proof.cleanupNotes.map((note) => [
                  note.label,
                  note.detail,
                ])}
              />
            </div>
          ))}
        </section>
      ) : null}
      {verified ? (
        <section className="sg-band" aria-label="Verified restore">
          <div className="sg-band-head">
            <h2>Verified restore</h2>
            <span className="sg-visual-caption">
              One proof an operator ran by hand · not a schedule
            </span>
          </div>
          <Facts
            wide
            rows={[
              [
                "Proved",
                verified.finishedAt ? (
                  <When at={verified.finishedAt} now={now} />
                ) : (
                  "Time not recorded"
                ),
              ],
              ["Revision", <Revision key="revision" proof={verified} />],
              [
                "Data captured",
                <Captured key="captured" proof={verified} now={now} />,
              ],
              [
                "Copy restored",
                <RestoredCopy key="copy" proof={verified} now={now} />,
              ],
              ...(verified.sourcePauseSeconds !== null
                ? ([
                    [
                      "Source paused",
                      <>
                        {verified.sourcePauseSeconds.toFixed(1)} seconds while
                        the data was copied
                        <small className="sg-fact-note">
                          A brief pause can still miss work in flight.
                        </small>
                      </>,
                    ],
                  ] as Array<[string, ReactNode]>)
                : []),
            ]}
          />
          <details className="sg-op-more sg-evidence-more">
            <summary>What the restore checked · {opened}</summary>
            <Facts
              wide
              rows={verified.checks.map((check) => [check.label, check.detail])}
            />
            <GrafanaChecks proof={verified} />
            {verified.archive && (
              <Facts
                wide
                rows={[
                  [
                    "Archive SHA-256",
                    <code key="sha">{verified.archive.sha256}</code>,
                  ],
                ]}
              />
            )}
          </details>
        </section>
      ) : (
        <section className="sg-band" aria-label="Verified restore">
          <SubHeading>Verified restore</SubHeading>
          <p className="sg-outcome-warn">
            No proof has restored this deployment&rsquo;s data.
            {latest
              ? " Every recorded attempt failed or did not finish, and a failed attempt is not a copy you can rely on."
              : ""}
          </p>
        </section>
      )}
      {notCovered.length > 0 && (
        <section className="sg-band" aria-label="What is not covered">
          <SubHeading>What is not covered</SubHeading>
          <Facts wide rows={notCovered} />
        </section>
      )}
      <section className="sg-band" aria-label="Attempts">
        <div className="sg-band-head">
          <h2>Attempts</h2>
          <span className="sg-visual-caption">
            {facts.proofs.length} recorded ·{" "}
            {facts.proofs.length - unverified.length} verified
            {unverified.length
              ? `, ${unverified.length} without a verified restore`
              : ""}
          </span>
        </div>
        <details
          className="sg-op-more"
          open={latest ? latest.outcome !== "verified" : false}
        >
          <summary>Every attempt, newest first</summary>
          <ol className="sg-history sg-attempts">
            {facts.proofs.map((proof) => (
              <Attempt key={proof.id} proof={proof} now={now} />
            ))}
          </ol>
        </details>
        {(facts.mismatched > 0 || facts.unreadable > 0) && (
          <p className="sg-section-note">
            {facts.mismatched > 0 &&
              `${facts.mismatched} recorded proof${facts.mismatched === 1 ? " belongs" : "s belong"} to an earlier deployment of this application and ${facts.mismatched === 1 ? "is" : "are"} not evidence for what runs now. `}
            {facts.unreadable > 0 &&
              `${facts.unreadable} proof receipt${facts.unreadable === 1 ? "" : "s"} in Server Guy's records could not be read and ${facts.unreadable === 1 ? "was" : "were"} ignored. An unreadable receipt never counts as a proof.`}
          </p>
        )}
      </section>
    </>
  );
}
