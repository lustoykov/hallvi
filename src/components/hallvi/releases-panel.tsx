"use client";

// What is running, and every release since.
//
// The selected design (the register). An application's life is its releases,
// so the page is one inventory of them, newest first: a strip that says what
// is serving now, and a table whose rows open onto the commands that produced
// each release and what those commands printed.
//
// One list, not two. The release that is serving is a row in it, marked, and
// the strip above is the only place the page states what is true now. Those
// are different questions whenever the newest release is not the one running,
// and the strip keeps them as two figures rather than one sentence.
//
// The commands sit beside what they printed, in the opened row. The output
// used to be a trip to Command output and back; it is the same executions,
// and a reader looking at a step wants what that step said. One pane per
// release, never one terminal per step.
//
// The machine a command ran on is a fact on that command and not a filter
// above the list: the application is on the server, always, and only some of
// the commands ran anywhere else.

import { useState } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";

import type { ApplicationSection } from "./application-sections";
import type { Reachability } from "./deployment-prototype/page-head";
import { LocalTime } from "./local-time";
import {
  Ask,
  Board,
  Chips,
  Clip,
  Facts,
  Figure,
  Go,
  Name,
  None,
  Note,
  Num,
  Opened,
  Pips,
  Register,
  Strip,
  Sub,
  Tag,
  ago,
  duration,
  type Column,
  type Tone,
} from "./register";
import {
  releaseHeadline,
  workFor,
  type Release,
  type ReleaseStep,
  type ReleaseView,
} from "./release-records";

import "./releases-panel.css";

const STEP_TONE: Record<ExecutionRecord["status"], Tone> = {
  "awaiting-approval": "warn",
  running: "working",
  succeeded: "good",
  failed: "bad",
  declined: "idle",
  interrupted: "warn",
};

const STEP_STATE: Record<ExecutionRecord["status"], string> = {
  "awaiting-approval": "waiting for you",
  running: "still running",
  succeeded: "finished",
  failed: "failed",
  declined: "you declined it",
  interrupted: "interrupted",
};

/**
 * How long it took, or why there is no answer.
 *
 * A command with no end time is not necessarily still going: a record can
 * simply not have one. Saying "still running" over a step that finished, and
 * whose output is sitting beside it, is the page inventing a state out of a
 * missing field.
 */
function took(seconds: number | null, outcome?: ReleaseStep["outcome"]) {
  if (seconds === null)
    return outcome === "awaiting-approval"
      ? "waiting for approval"
      : outcome === "running"
        ? "still running"
        : "no end time";
  return duration(seconds);
}

interface Row extends Release {
  steps: ReleaseStep[];
  /** Live, superseded, failed, or never established. */
  word: string;
  tone: Tone;
  /** A release its checks proved can still contain a command that failed. */
  broke: boolean;
  serving: boolean;
}

/** The commands of one release, beside whatever the picked one printed. */
function Work({ steps }: { steps: ReleaseStep[] }) {
  // The step a reader opened the release for: the one still going, else the
  // one that failed, else the last thing that ran.
  const lead =
    steps.find((one) => one.outcome === "running") ??
    steps.find((one) => one.outcome === "failed") ??
    steps.at(-1);
  const [picked, setPicked] = useState<string | null>(lead?.id ?? null);
  const step = steps.find((one) => one.id === picked) ?? null;

  if (!steps.length)
    return (
      <Note>
        No command on record is linked to this release. That is a gap in what
        was written down, not a claim that nothing ran.
      </Note>
    );
  return (
    <div className="hv-rg-split">
      <Sub
        heads={["Step", "Outcome", "Took", "Command"]}
        picked={picked}
        onPick={setPicked}
        rows={steps.map((one) => ({
          id: one.id,
          tone: STEP_TONE[one.outcome],
          cells: [
            one.title,
            STEP_STATE[one.outcome],
            <Num key="took">{took(one.seconds, one.outcome)}</Num>,
            <Clip key="command" text={one.caption} mono />,
          ],
        }))}
      />
      <div
        className="hv-rg-term"
        data-tone={step ? STEP_TONE[step.outcome] : undefined}
      >
        <header>
          <b>{step ? step.title : "No step picked"}</b>
          {step && (
            <small>
              {[
                // "On the server · 203.0.113.60" under a title that already
                // says "On the server" is the same words twice.
                step.where?.replace(`${step.title} · `, ""),
                STEP_STATE[step.outcome],
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          )}
        </header>
        {step ? (
          <>
            <code>{step.command}</code>
            <pre>{step.output || "It printed nothing."}</pre>
          </>
        ) : (
          <p>Pick a step to see what it printed.</p>
        )}
        {step?.outcome === "running" && (
          <p>Command still running. Output updates as it arrives.</p>
        )}
      </div>
    </div>
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
  onOpenDestination,
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
   * The same answer, not a second opinion. This strip offered "Open app" over
   * a live URL while the header three lines above said the tunnel was closed,
   * which is the page disagreeing with itself about the one thing the reader
   * is most likely to click.
   */
  reachable?: Reachability;
  /** Asks Pi to reopen private access. Absent hides the offer. */
  onReopen?: () => void;
  onAsk: (draft: string) => void;
  onOpenDestination?: (destination: ApplicationSection) => void;
}) {
  const [filter, setFilter] = useState("all");
  const said = releaseHeadline(view);
  const { running, latest, access } = view;
  // Only a private address depends on the tunnel. A public one is answered by
  // the server whatever this PC is doing.
  const closed = Boolean(access?.localOnly) && reachable === "closed";
  const before = running
    ? (view.all.find(
        (one) =>
          one.outcome === "deployed" &&
          one.id !== running.id &&
          Date.parse(one.at) <= Date.parse(running.at),
      ) ?? null)
    : null;

  const rows: Row[] = view.all.map((release) => {
    const steps = workFor(release, records, executions);
    const serving = release.id === running?.id;
    return {
      ...release,
      steps,
      serving,
      broke: steps.some(
        (step) => step.outcome === "failed" || step.outcome === "interrupted",
      ),
      word:
        release.outcome === "failed"
          ? "failed"
          : release.outcome === "attempted"
            ? // Not "unknown": something ran, and what it left behind was
              // never checked.
              "not established"
            : serving
              ? "live"
              : "superseded",
      tone:
        release.outcome === "failed"
          ? "bad"
          : release.outcome === "attempted"
            ? "warn"
            : "good",
    };
  });
  const words = [...new Set(rows.map((row) => row.word))];
  const shown = rows.filter((row) => filter === "all" || row.word === filter);

  const columns: Column<Row>[] = [
    {
      key: "release",
      head: "Release",
      width: 150,
      cell: (row) => (
        <Name
          mono
          title={row.short}
          note={
            [
              row.serving ? "serving now" : "",
              // On the row, not only inside it: "live" over a migration that
              // did not run keeps a reader from the one thing they would want
              // to know at a glance.
              row.broke && row.outcome !== "failed"
                ? "a command in it failed"
                : "",
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
      ),
    },
    {
      key: "shipped",
      head: "What shipped",
      cell: (row) =>
        row.changes[0] ? <Clip text={row.changes[0]} /> : <None />,
    },
    {
      key: "steps",
      head: "Steps",
      width: 110,
      cell: (row) => (
        <Pips
          empty="none linked"
          items={row.steps.map((step) => ({
            id: step.id,
            tone: STEP_TONE[step.outcome],
            title: `${step.title}: ${STEP_STATE[step.outcome]}`,
          }))}
        />
      ),
    },
    {
      key: "took",
      head: "Took",
      width: 84,
      align: "end",
      cell: (row) => {
        const timed = row.steps.filter((step) => step.seconds !== null);
        return timed.length ? (
          <Num>
            {duration(timed.reduce((sum, step) => sum + step.seconds!, 0))}
          </Num>
        ) : (
          <None>—</None>
        );
      },
    },
    {
      key: "finished",
      head: "Released",
      width: 110,
      align: "end",
      sort: (row) => Date.parse(row.at),
      cell: (row) => <Num>{ago(row.at, now)}</Num>,
    },
    {
      key: "outcome",
      head: "Outcome",
      width: 128,
      cell: (row) => <Tag tone={row.tone}>{row.word}</Tag>,
    },
  ];

  return (
    <section className="hv-rg-sheet rp" aria-label="What is running">
      <Strip>
        {/* The lead, and the only place the page states what is serving. */}
        <Figure
          label="Live"
          value={
            running ? (
              // "Running" only while the newest attempt is the one serving.
              // After a failed or unestablished update the honest words are
              // "last verified", and the headline already chooses them.
              <span className="rp-live">{said.says.replace(/\.$/, "")}</span>
            ) : (
              "Not established"
            )
          }
          tone={running && !said.limit ? "good" : latest ? "warn" : "plain"}
          note={
            running ? (
              <>
                {/* The source it was built from, exactly, beside the machine
                    it runs on. The short form above is for reading; this is
                    for matching against a repository. */}
                <code>{running.revision.slice(0, 12)}</code> on {running.server}{" "}
                · <LocalTime value={running.at} variant="compact" />
              </>
            ) : (
              said.says
            )
          }
        />
        <Figure
          label="Before that"
          value={before ? before.short : "—"}
          note={
            before
              ? `${before.changes[0] ?? "No change recorded"} · ${ago(before.at, now)}`
              : running
                ? "This is the first release on record"
                : "No earlier release is on record"
          }
        />
        {/* Two facts, never folded into one. A reader told only that the
            update failed does not know whether their application is up. */}
        <Figure
          label="Latest attempt"
          value={
            !latest
              ? "None"
              : latest.outcome === "deployed"
                ? "Deployed"
                : latest.outcome === "failed"
                  ? "Failed"
                  : "Not established"
          }
          tone={
            !latest || latest.outcome === "deployed"
              ? "plain"
              : latest.outcome === "failed"
                ? "bad"
                : "warn"
          }
          note={
            said.limit ??
            (latest
              ? `${latest.short} · ${ago(latest.at, now)}`
              : "Nothing has been released yet")
          }
        />
        {/* The one action this page owes the reader. A link only where a
            record says there is a way in; otherwise it asks for one, rather
            than offering a button that goes nowhere. */}
        <Figure
          label="Way in"
          value={
            !access ? "None on record" : access.localOnly ? "Private" : "Public"
          }
          tone={closed ? "warn" : "plain"}
          note={
            access && closed ? (
              // The tunnel is not answering, so the address is not a way in.
              <>
                The tunnel is closed, so <code>{access.url}</code> does not
                answer from this PC.
              </>
            ) : access ? (
              <>
                {access.localOnly
                  ? reachable === "checking"
                    ? "Checking that the tunnel still answers"
                    : "From this PC only, while the tunnel is up"
                  : "Answered by the server"}
                <br />
                <code>{access.url}</code>
              </>
            ) : (
              "No record says where this application answers."
            )
          }
        >
          {access && closed ? (
            onReopen ? (
              <button
                type="button"
                className="rp-open is-ask"
                onClick={onReopen}
              >
                Open the connection again
              </button>
            ) : null
          ) : access ? (
            <a className="rp-open" href={access.url}>
              Open app
            </a>
          ) : (
            <button
              type="button"
              className="rp-open is-ask"
              onClick={() =>
                onAsk(
                  "How do I open this application? Open private access if it is not open, then give me the address and check that it answers.",
                )
              }
            >
              Open app
            </button>
          )}
        </Figure>
      </Strip>

      <Board
        title="Releases"
        note="A row opens the commands behind it and what they printed."
        tools={
          words.length > 1 ? (
            <Chips
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "All", count: rows.length },
                ...words.map((word) => ({
                  id: word,
                  label: word,
                  count: rows.filter((row) => row.word === word).length,
                })),
              ]}
            />
          ) : null
        }
      >
        <Register
          rows={shown}
          columns={columns}
          label={(row) =>
            [row.short, row.changes[0]].filter(Boolean).join(" · ")
          }
          tone={(row) =>
            row.tone === "good" ? (row.broke ? "warn" : "plain") : row.tone
          }
          // The newest attempt opens itself when it is the one that needs
          // reading. A release that simply holds stays a row.
          defaultOpen={
            latest && latest.outcome !== "deployed" ? latest.id : null
          }
          empty={`No release is recorded as ${filter}.`}
          detail={(row) => (
            <Opened
              asks={
                <>
                  <Ask
                    onAsk={onAsk}
                    tone={row.outcome === "failed" ? "bad" : "plain"}
                    prompt={
                      row.outcome === "failed"
                        ? `The release of ${row.short} failed. What went wrong, and what would make it go through?`
                        : row.outcome === "attempted"
                          ? `Nothing established what came of releasing ${row.short}. Check what is running now.`
                          : `What exactly changed between ${row.short} and the release before it?`
                    }
                  >
                    {row.outcome === "failed"
                      ? "Why did it fail?"
                      : row.outcome === "attempted"
                        ? "Check what is running"
                        : "What changed here?"}
                  </Ask>
                  {row.serving && before && (
                    <Ask
                      onAsk={onAsk}
                      prompt={`What would rolling back from ${row.short} to ${before.short} actually change?`}
                    >
                      What would a rollback change?
                    </Ask>
                  )}
                  {onOpenDestination && (
                    <Go onGo={() => onOpenDestination("logs")}>
                      All command output
                    </Go>
                  )}
                </>
              }
            >
              {row.note && <Note>{row.note}</Note>}
              <Work steps={row.steps} />
              <Facts
                items={[
                  {
                    label: "Source",
                    value: (
                      <span className="hv-rg-mono">
                        {row.revision.slice(0, 12)}
                      </span>
                    ),
                  },
                  {
                    label: "Image",
                    value: row.image ? (
                      <span className="hv-rg-mono">{row.image}</span>
                    ) : (
                      <None />
                    ),
                  },
                  { label: "Server", value: row.server },
                  {
                    label: "Released",
                    value: <LocalTime value={row.at} variant="compact" />,
                  },
                ]}
              />
              <div className="rp-lists">
                <Facts
                  items={[
                    {
                      label: "What changed",
                      value: row.changes.length ? (
                        <ul className="rp-list">
                          {row.changes.map((change) => (
                            <li key={change}>{change}</li>
                          ))}
                        </ul>
                      ) : (
                        <None />
                      ),
                    },
                    {
                      label: "What was checked",
                      value: row.checks.length ? (
                        <ul className="rp-list rp-checks">
                          {row.checks.map((check) => (
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
                      ),
                    },
                  ]}
                />
              </div>
            </Opened>
          )}
        />
      </Board>
    </section>
  );
}
