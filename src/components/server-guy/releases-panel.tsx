"use client";

// What is running, and what ran before it.
//
// Deployment led with the newest deployment record and called it the release,
// so an update that built an image and could not start replaced a release
// that had been serving for days. The page below this one tells the story of
// the latest attempt, which is what its phases are; this says what is
// actually deployed, which is a different question and sometimes a different
// record.
//
// Previous releases are a list, not a transcript. A release is a thing that
// went live; the commands that produced it are inside it, where someone
// investigating goes looking.

import { useState } from "react";

import type { Reachability } from "./deployment-prototype/page-head";
import { LocalTime } from "./local-time";
import {
  releaseHeadline,
  type Release,
  type ReleaseView,
} from "./release-records";

import "./releases-panel.css";

function ago(at: string, now: number) {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return "at an unrecorded time";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const OUTCOME_WORD: Record<Release["outcome"], string> = {
  deployed: "Deployed",
  failed: "Failed",
  // Not "unknown": something ran, and what it left behind was never checked.
  attempted: "Outcome not established",
};

export function ReleasesPanel({
  view,
  now,
  reachable = "checking",
  onReopen,
  onAsk,
}: {
  view: ReleaseView;
  now: number;
  /**
   * Whether the private way in still answers, as the page header asked it.
   *
   * The same answer, not a second opinion. This card offered "Open app" over
   * a live URL while the header three lines above said the tunnel was closed,
   * which is the page disagreeing with itself about the one thing the reader
   * is most likely to click.
   */
  reachable?: Reachability;
  /** Asks Pi to reopen private access. Absent hides the offer. */
  onReopen?: () => void;
  onAsk: (draft: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const said = releaseHeadline(view);
  const { running, access } = view;
  const earlier = view.all.filter((release) => release.id !== running?.id);
  const diverged = Boolean(
    running && view.latest && running.id !== view.latest.id,
  );
  // Only a private address depends on the tunnel. A public one is answered by
  // the server whatever this Mac is doing.
  const closed = Boolean(access?.localOnly) && reachable === "closed";

  return (
    <section className="rp" aria-label="What is running">
      <div
        className="rp-now"
        data-limit={said.limit ? "yes" : undefined}
        data-only={diverged ? undefined : "access"}
      >
        {/* Only when the running release and the latest attempt are different
            records. When they are the same one, the release story below this
            already names it, in more detail than a repeat of its short
            revision adds, and two headings for one release is the page saying
            the same thing twice. There is then no column here at all: an
            empty one is a hole the reader reads as missing content.

            No fact row either. The story below carries the running image, its
            digest, the revision, the server and the tunnel's two ports. What
            this adds is the one thing that story cannot say: which release is
            running when the newest one is not. */}
        {diverged && (
          <div>
            <p className="rp-says">{said.says}</p>
            {/* Two facts, never folded into one. A reader told only that the
                update failed does not know whether their application is
                up. */}
            {said.limit && <p className="rp-limit">{said.limit}</p>}
          </div>
        )}

        {/* The one action this page owes the reader. A link only where a
            record says there is a way in; otherwise it asks for one, rather
            than offering a button that goes nowhere. */}
        <div className="rp-open">
          {access && closed ? (
            // The tunnel is not answering, so the address is not a way in.
            // Offering it anyway is the page promising something it has just
            // been told is untrue.
            <>
              {onReopen ? (
                <button
                  type="button"
                  className="rp-open-button is-ask"
                  onClick={onReopen}
                >
                  Reopen access
                </button>
              ) : (
                <span className="rp-open-button is-dead" aria-disabled="true">
                  Open app
                </span>
              )}
              <small>
                The tunnel is closed, so <code>{access.url}</code> does not
                answer from this Mac.
              </small>
            </>
          ) : access ? (
            <>
              <a className="rp-open-button" href={access.url}>
                Open app
              </a>
              <small>
                {access.localOnly
                  ? reachable === "checking"
                    ? "Private — checking that the tunnel still answers"
                    : "Private — from this Mac only, while the tunnel is up"
                  : "Public"}
                <br />
                <code>{access.url}</code>
              </small>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rp-open-button is-ask"
                onClick={() =>
                  onAsk(
                    "How do I open this application? Open private access if it is not open, then give me the address and check that it answers.",
                  )
                }
              >
                Open app
              </button>
              <small>No way in is on record yet.</small>
            </>
          )}
        </div>
      </div>

      {earlier.length > 0 && (
        <>
          <h3 className="rp-head">Before it</h3>
          <ol className="rp-list">
            {earlier.map((release) => (
              <li key={release.id} data-outcome={release.outcome}>
                <button
                  type="button"
                  aria-expanded={open === release.id}
                  onClick={() =>
                    setOpen(open === release.id ? null : release.id)
                  }
                >
                  <span className="rp-when">{ago(release.at, now)}</span>
                  <span className="rp-main">
                    <b>
                      <code>{release.short}</code>
                      {release.changes[0] ? ` · ${release.changes[0]}` : ""}
                    </b>
                    <small>{OUTCOME_WORD[release.outcome]}</small>
                  </span>
                </button>
                {open === release.id && (
                  <div className="rp-detail">
                    <dl>
                      <div>
                        <dt>What changed</dt>
                        <dd>
                          {release.changes.length ? (
                            <ul>
                              {release.changes.map((change) => (
                                <li key={change}>{change}</li>
                              ))}
                            </ul>
                          ) : (
                            "Not recorded"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>
                          <code>{release.revision.slice(0, 12)}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>What was checked</dt>
                        <dd>
                          {release.checks.length ? (
                            <ul className="rp-checks">
                              {release.checks.map((check) => (
                                <li
                                  key={check.label}
                                  data-pass={check.passed || undefined}
                                >
                                  {check.label}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "Nothing was checked."
                          )}
                        </dd>
                      </div>
                    </dl>
                    {release.note && <p className="rp-note">{release.note}</p>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
