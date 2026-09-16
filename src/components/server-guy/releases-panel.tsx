"use client";

// What is running, and everything since.
//
// The selected design (the spine, with K's interior). An application's life
// is its releases, and everything else happened between two of them. So the
// page is one list of releases, newest first, with what is serving named
// above it and the commands that produced each release inside it.
//
// One list, not two. Separating "running" from "before it" made the same
// release appear twice whenever the newest one was also the one serving, and
// a reader comparing two rows had to hold one of them in their head.
//
// One output pane per release, never one terminal per step. Two terminals on
// one page was where this review started.
//
// The machine a command ran on is a fact on that command and not a filter
// above the list. Narrowing a release by machine asks a question nobody
// arrives at Deployment with: the application is on the server, always, and
// only some of the commands ran anywhere else. The filter belongs on Command
// output, which is a list of commands.

import { useState } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";

import type { Reachability } from "./deployment-prototype/page-head";
import { LocalTime } from "./local-time";
import {
  releaseHeadline,
  workFor,
  type Release,
  type ReleaseStep,
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

/**
 * How long it took, or why there is no answer.
 *
 * A command with no end time is not necessarily still going: a record can
 * simply not have one. Saying "still running" over a step that finished, and
 * whose output is sitting underneath it, is the page inventing a state out of
 * a missing field.
 */
function took(seconds: number | null, outcome?: ReleaseStep["outcome"]) {
  if (seconds === null)
    return outcome === "running" || outcome === "awaiting-approval"
      ? "still running"
      : "no end time recorded";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const WHERE_WORD: Record<ReleaseStep["where"], string> = {
  server: "on the server",
  here: "on this Mac",
  provider: "at the provider",
  you: "with you",
};

const STEP_STATE: Record<ExecutionRecord["status"], string> = {
  "awaiting-approval": "waiting for you",
  running: "still running",
  succeeded: "finished",
  failed: "failed",
  declined: "you declined it",
  interrupted: "interrupted",
};

/** The commands of one release, and one pane for whichever is picked. */
function Work({ steps }: { steps: ReleaseStep[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const step = steps.find((one) => one.id === picked) ?? null;
  if (!steps.length)
    return (
      <p className="rp-quiet">
        No command on record is linked to this release. That is a gap in what
        was written down, not a claim that nothing ran.
      </p>
    );
  return (
    <>
      <h4 className="rp-sub">What was done</h4>
      <ol className="rp-steps">
        {steps.map((one) => (
          <li key={one.id} data-outcome={one.outcome}>
            <button
              type="button"
              className="rp-step"
              data-picked={one.id === picked || undefined}
              aria-pressed={one.id === picked}
              onClick={() => setPicked(one.id === picked ? null : one.id)}
            >
              <span className="rp-step-mark" aria-hidden="true" />
              <span className="rp-step-body">
                <b>{one.title}</b>
                <code>{one.caption}</code>
              </span>
              <small>
                {WHERE_WORD[one.where]} · {took(one.seconds, one.outcome)}
              </small>
            </button>
            <button
              type="button"
              className="rp-full-toggle"
              aria-expanded={full === one.id}
              onClick={() => setFull(full === one.id ? null : one.id)}
            >
              {full === one.id ? "Hide the full command" : "Full command"}
            </button>
            {full === one.id && <pre className="rp-full">{one.command}</pre>}
          </li>
        ))}
      </ol>
      <div className="rp-output" data-outcome={step?.outcome}>
        <header>
          <span className="rp-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <b>{step ? step.title : "No step picked"}</b>
          {step && (
            <small>
              {STEP_STATE[step.outcome]}
              {step.seconds !== null ? ` · ${took(step.seconds)}` : ""}
            </small>
          )}
        </header>
        {step ? (
          <pre>{step.output || "It printed nothing."}</pre>
        ) : (
          <p className="rp-quiet">Pick one above to see what it printed.</p>
        )}
        {step?.outcome === "running" && (
          <p className="rp-quiet">
            Nothing new has printed since. That is what is on record; it is not
            a claim about how far along it is.
          </p>
        )}
      </div>
    </>
  );
}

export function ReleasesPanel({
  view,
  records = [],
  executions = [],
  now,
  reachable = "checking",
  onReopen,
  onAsk,
}: {
  view: ReleaseView;
  /** The records the releases came from, to reach each one's own evidence. */
  records?: SavedInformation[];
  /** What actually ran. Each release shows only the commands it cites. */
  executions?: ExecutionRecord[];
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
  // Only a private address depends on the tunnel. A public one is answered by
  // the server whatever this Mac is doing.
  const closed = Boolean(access?.localOnly) && reachable === "closed";

  return (
    <section className="rp" aria-label="What is running">
      <div className="rp-now" data-limit={said.limit ? "yes" : undefined}>
        {/* The lead, and the only place the page states what is serving. The
            list below is what happened; this is what is true now, and they
            are different questions whenever the newest release is not the one
            running. */}
        <div>
          <p className="rp-says">{said.says}</p>
          {/* Two facts, never folded into one. A reader told only that the
              update failed does not know whether their application is up. */}
          {said.limit && <p className="rp-limit">{said.limit}</p>}
          {running && (
            <p className="rp-sub">
              <code>{running.revision.slice(0, 12)}</code> on {running.server} ·{" "}
              <LocalTime value={running.at} variant="compact" />
            </p>
          )}
        </div>

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

      {view.all.length > 0 && (
        <>
          <h3 className="rp-head">Everything since</h3>
          {/* One list. The release that is serving is a row in it, marked, not
              a second card above it saying the same revision again. */}
          <ol className="rp-list">
            {view.all.map((release) => {
              const steps = workFor(release, records, executions);
              // A release its checks proved can still contain a command that
              // failed. "Deployed · serving now" over a migration that did
              // not run is the row keeping a reader from the one thing they
              // would want to know at a glance.
              const broke = steps.some(
                (step) =>
                  step.outcome === "failed" || step.outcome === "interrupted",
              );
              return (
                <li key={release.id} data-outcome={release.outcome}>
                  <button
                    type="button"
                    aria-expanded={open === release.id}
                    onClick={() =>
                      setOpen(open === release.id ? null : release.id)
                    }
                  >
                    <span className="rp-dot" aria-hidden="true" />
                    <span className="rp-when">{ago(release.at, now)}</span>
                    <span className="rp-main">
                      <b>
                        <code>{release.short}</code>
                        {release.changes[0] ? ` · ${release.changes[0]}` : ""}
                      </b>
                      <small>
                        {OUTCOME_WORD[release.outcome]}
                        {release.id === running?.id ? " · serving now" : ""}
                        {broke && release.outcome !== "failed"
                          ? " · a command in it failed"
                          : ""}
                      </small>
                    </span>
                    <span className="rp-chev" aria-hidden="true">
                      {open === release.id ? "▾" : "▸"}
                    </span>
                  </button>
                  {open === release.id && (
                    <div className="rp-detail">
                      {release.note && (
                        <p className="rp-note">{release.note}</p>
                      )}
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
                          <dt>Image</dt>
                          <dd>
                            <code>{release.image ?? "not recorded"}</code>
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
                      <Work steps={steps} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
