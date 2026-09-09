"use client";

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

const short = (revision: string) => revision.slice(0, 7);

function megabytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The revision a proof ran against, and whether it is the one running now. */
function Revision({ proof }: { proof: BackupProof }) {
  if (!proof.revision) return <>Not recorded</>;
  return (
    <>
      <code>{short(proof.revision)}</code>
      {proof.revisionCurrent ? (
        <small className="sg-fact-note">
          The revision this application runs now.
        </small>
      ) : (
        <small className="sg-fact-note">
          An earlier revision. This application no longer runs it, so the proof
          does not describe what is deployed today.
        </small>
      )}
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

function GrafanaChecks({ proof }: { proof: BackupProof }) {
  const grafana = proof.grafana;
  if (!grafana) return null;
  const credential = grafana.credential;
  return (
    <>
      <SubHeading>Dashboard and credential checks</SubHeading>
      <Facts
        wide
        rows={[
          [
            "Restored dashboard",
            grafana.dashboard
              ? `${grafana.dashboard.panels} panels saved; ${grafana.dashboard.queriesVerified} queries returned restored data.${grafana.dashboard.browserRendered ? " Both charts rendered in the browser." : " Browser rendering was not recorded."}`
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
          [
            "Plugins",
            grafana.plugins
              ? `${grafana.plugins.registered} of ${grafana.plugins.total} loaded, ${grafana.plugins.moduleServed} matched their archived files, ${grafana.plugins.behaviourChecked} passed a functional test.`
              : "No plugins were checked.",
          ],
        ]}
      />
      {grafana.plugins ? (
        <BackupPlugins plugins={grafana.plugins.items} />
      ) : null}
    </>
  );
}

/** One attempt in the record, whatever it ended as. */
function Attempt({ proof, now }: { proof: BackupProof; now: number }) {
  const at = proof.finishedAt ?? proof.startedAt;
  return (
    <li>
      <Pill tone={outcomeTone[proof.outcome]}>
        {outcomeWord[proof.outcome]}
      </Pill>
      <span>
        {proof.outcome === "verified"
          ? `Restored from the downloaded copy and made ${proof.checks.length} checks.`
          : proof.outcome === "failed"
            ? "The run recorded a failure. It is not evidence that a copy can be restored."
            : "No completed restore is recorded for this attempt."}
        {proof.revision && (
          <>
            {" "}
            Revision <code>{short(proof.revision)}</code>
            {proof.revisionCurrent ? "." : ", an earlier revision."}
          </>
        )}
        <small>{at ? <When at={at} now={now} /> : "Time not recorded"}</small>
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
}: {
  facts: BackupEvidenceFacts;
  now: number;
}) {
  const verified = lastVerifiedProof(facts);
  const latest = latestProof(facts);
  const unverified = facts.proofs.filter(
    (proof) => proof.outcome !== "verified",
  );
  return (
    <>
      {verified ? (
        <section className="sg-band" aria-label="Verified restore">
          <div className="sg-band-head">
            <h2>Verified restore</h2>
            <span className="sg-visual-caption">
              One proof an operator ran by hand · not a schedule
            </span>
          </div>
          <Facts
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
                "Copy in the destination",
                verified.destination ? (
                  <>
                    Cloudflare R2 · <code>{verified.destination.bucket}</code>
                    <small className="sg-fact-note">
                      {verified.privateBucketCheckedAt ? (
                        <>
                          Private access checked{" "}
                          <When
                            at={verified.privateBucketCheckedAt}
                            now={now}
                          />
                          .
                        </>
                      ) : (
                        "Bucket visibility was not recorded."
                      )}
                    </small>
                  </>
                ) : (
                  "Not recorded"
                ),
              ],
              [
                "Downloaded copy checked",
                verified.archive ? (
                  <>
                    {verified.archive.bytes !== null
                      ? `${megabytes(verified.archive.bytes)} · `
                      : ""}
                    SHA-256 <code>{verified.archive.sha256.slice(0, 16)}…</code>
                    <small className="sg-fact-note">
                      {verified.downloadedCopyVerified
                        ? "The archive was downloaded back from the destination and matched by size and checksum. The restore read those bytes."
                        : "The round trip through the destination was not recorded."}
                    </small>
                  </>
                ) : (
                  "Not recorded"
                ),
              ],
              [
                "Source pause",
                verified.sourcePauseSeconds !== null ? (
                  <>
                    {verified.sourcePauseSeconds.toFixed(1)} seconds
                    <small className="sg-fact-note">
                      The application was stopped for that long so the copy was
                      consistent. A brief pause can still miss work in flight.
                    </small>
                  </>
                ) : (
                  "Not recorded"
                ),
              ],
            ]}
          />
          <details className="sg-op-more">
            <summary>
              What was checked · {verified.checks.length}
              {verified.grafana ? " plus dashboard checks" : ""}
            </summary>
            <div className="sg-coverage">
              {verified.checks.map((check) => (
                <div className="sg-coverage-row" key={check.key}>
                  <strong>{check.label}</strong>
                  <Pill tone="ok">Checked</Pill>
                  <span>{check.detail}</span>
                </div>
              ))}
            </div>
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
            {latest
              ? "No proof has restored this deployment's data. The attempts below did not finish or recorded a failure, and a failed attempt is not a copy you can rely on."
              : "No proof has restored this deployment's data."}
          </p>
        </section>
      )}
      <section className="sg-band" aria-label="Scheduling and retention">
        <SubHeading>Scheduling and retention</SubHeading>
        <Facts
          rows={[
            [
              "Schedule",
              facts.scheduleConfigured ? (
                "Recorded by a proof"
              ) : (
                <>
                  Not configured
                  <small className="sg-fact-note">
                    Nothing runs on its own. A copy exists only for the dates
                    listed here.
                  </small>
                </>
              ),
            ],
            [
              "Retention",
              facts.retentionConfigured
                ? "Recorded by a proof"
                : "Not configured. The stored copies stay until someone removes them.",
            ],
            [
              "Ongoing protection",
              "None. Running a proof is a manual operation and Server Guy does not offer one from this page yet.",
            ],
          ]}
        />
      </section>
      {verified && (
        <section className="sg-band" aria-label="What this proof does not show">
          <SubHeading>What this proof does not show</SubHeading>
          <Facts
            wide
            rows={verified.gaps
              .filter((gap) => !["schedule", "retention"].includes(gap.key))
              .map((gap) => [gap.label, gap.detail])}
          />
        </section>
      )}
      <section className="sg-band" aria-label="Attempts">
        <div className="sg-band-head">
          <h2>Attempts</h2>
          <span className="sg-visual-caption">
            {facts.proofs.length} recorded
            {unverified.length
              ? ` · ${unverified.length} without a verified restore`
              : ""}
          </span>
        </div>
        <details className="sg-op-more" open={unverified.length > 0}>
          <summary>Every recorded attempt</summary>
          <ol className="sg-history">
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
