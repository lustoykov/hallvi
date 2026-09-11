"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Direction C, Paper: no diagram. Logs is the read printed on continuous
// paper from a printer that prints only when asked. Each process has a
// highlighter, index tabs mark where a process said it was ready and where
// it warned, and the paper is torn where the read stopped, and at the top
// when a process had written more than was read. Monitoring is a stack of
// inspection reports, one for each time Server Guy checked the application.
// The blanks nobody filled in are what nothing watches, and a note on the
// desk says how old the top report is. Earlier sheets peek out from behind
// and come forward when picked; nothing moves on arrival.

import { ChatCircleText, MagnifyingGlass } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { useReducedMotion } from "../architecture-prototype/motion";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { dayOf, lasting, listed } from "../backup-prototype/model";
import { ago, when } from "../stack-prototype/stack-model";
import type { SignalDirectionProps } from "./index";
import {
  CAP,
  toneOf,
  type LogLine,
  type Look,
  type SignalStory,
} from "./signal-model";
import "./paper.css";

const stamp = (at: string | null, fraction = true) =>
  at
    ? new Date(at).toLocaleTimeString(undefined, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        ...(fraction ? { fractionalSecondDigits: 3 as const } : {}),
      })
    : "";
const day = (at: string) =>
  new Date(at)
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();

function Lede({
  say,
  tone,
  word,
  sub,
  ask,
  onAsk,
}: {
  say: string;
  tone: Tone;
  word: string;
  sub: string;
  ask: { label: string; draft: string };
  onAsk: (draft: string) => void;
}) {
  return (
    <div className="axpa-lede">
      <div>
        <h2 className="axpa-say">{say}</h2>
        <p className="axpa-sure">
          <Tag tone={tone}>{word}</Tag>
          <span>{sub}</span>
        </p>
      </div>
      <button
        type="button"
        className="ax-button axpa-ask"
        onClick={() => onAsk(ask.draft)}
      >
        <ChatCircleText weight="bold" />
        {ask.label}
      </button>
    </div>
  );
}

/** Sheets that peek out from behind the one in front. */
function Behind({
  sheets,
  onPick,
}: {
  sheets: { id: string; label: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <>
      {sheets.map((sheet, index) => (
        <button
          key={sheet.id}
          type="button"
          className="axpa-behind"
          style={{
            zIndex: sheets.length - index,
            top: `${-34 - index * 16}px`,
          }}
          onClick={() => onPick(sheet.id)}
        >
          {sheet.label}
        </button>
      ))}
    </>
  );
}

// ---------- Logs: the read, printed ----------

function PaperLogs({
  story,
  now,
  head,
  activity,
  onAsk,
}: SignalDirectionProps) {
  const reduced = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState(story.collections[0].id);
  const [shuffled, setShuffled] = useState(false);
  const [pen, setPen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const read =
    story.collections.find((item) => item.id === front) ?? story.collections[0];
  const newest = story.collections[0];
  const failing = story.looks.find((look) => look.state === "failing") ?? null;
  const shown = read.lines.filter((line) =>
    line.raw.toLowerCase().includes(query.toLowerCase()),
  );
  const who = (service: string) =>
    read.speakers.findIndex((item) => item.service === service);
  const cut = read.speakers.filter((item) => item.cut);

  // Index tabs: where each process last said it was ready, and each warning
  // or error, placed by how far down the read it is.
  const ready = new Map<string, LogLine>();
  for (const line of shown) if (line.milestone) ready.set(line.service, line);
  const tabs = [
    ...[...ready.values()].map((line) => ({ line, kind: "ready" })),
    ...shown
      .filter((line) => line.level === "warn" || line.level === "error")
      .slice(0, 6)
      .map((line) => ({ line, kind: line.level })),
  ]
    .map((tab) => ({
      ...tab,
      top: ((shown.indexOf(tab.line) + 0.5) / Math.max(1, shown.length)) * 100,
    }))
    .sort((a, b) => a.top - b.top)
    // Neighbouring tabs step down so each stays readable.
    .reduce<{ line: LogLine; kind: string; top: number }[]>(
      (list, tab) => [
        ...list,
        { ...tab, top: Math.max(tab.top, (list.at(-1)?.top ?? -10) + 4.5) },
      ],
      [],
    );
  const go = (id: string) => {
    const box = frame.current;
    const row = box?.querySelector<HTMLElement>(`[data-line="${id}"]`);
    if (box && row)
      box.scrollTo({
        top:
          row.getBoundingClientRect().top -
          box.getBoundingClientRect().top +
          box.scrollTop -
          56,
        behavior: reduced ? "auto" : "smooth",
      });
    setFlash((value) => ({ id, n: (value?.n ?? 0) + 1 }));
  };

  const warns = read.speakers.reduce((sum, item) => sum + item.warns, 0);
  const holds = newest.speakers.map((speaker) =>
    speaker.cut
      ? `${speaker.name}'s last ${CAP} lines (earlier ones weren't read)`
      : `all ${speaker.lines} of ${speaker.name}'s`,
  );
  const lede = {
    say: `The newest output on record was read ${when(newest.at)}.`,
    tone: failing ? ("failed" as Tone) : toneOf(newest.at, now),
    word: `Printed ${ago(newest.at, now)}`,
    sub: [
      failing &&
        `${failing.name} is failing now (invented); this printout came before that.`,
      `It holds ${listed(holds)}. Nothing prints between reads; Server Guy reads the output only when someone asks.`,
    ]
      .filter(Boolean)
      .join(" "),
    ask: {
      label: "Ask Server Guy to print the latest output",
      draft: `Read the latest logs from each of ${story.name}'s processes and tell me whether anything looks wrong.`,
    },
  };

  return (
    <section className="axpa" aria-label="Logs">
      {head}
      {activity}
      <Lede {...lede} onAsk={onAsk} />
      <div className="axpa-desk">
        <div className="axpa-tools">
          <label className="axpa-filter">
            <MagnifyingGlass aria-hidden="true" />
            <input
              aria-label="Filter log lines"
              placeholder="Filter collected logs…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div
            className="axpa-pens"
            role="group"
            aria-label="Highlight one process"
          >
            {read.speakers.map((speaker, index) => (
              <button
                key={speaker.service}
                type="button"
                data-who={index}
                aria-pressed={pen === speaker.service}
                onClick={() =>
                  setPen(pen === speaker.service ? null : speaker.service)
                }
              >
                <i aria-hidden="true" />
                {speaker.name}
                <small>{speaker.lines}</small>
              </button>
            ))}
          </div>
          <small className="axpa-count">
            {query
              ? `${shown.length} of ${read.lines.length} lines match`
              : `${read.lines.length} lines${warns ? ` · ${warns} ${warns === 1 ? "warning" : "warnings"}` : ""}`}
          </small>
        </div>

        <div className="axpa-stack">
          <Behind
            sheets={story.collections
              .filter((item) => item.id !== read.id)
              .map((item) => ({
                id: item.id,
                label: `${item.id === newest.id ? "Newest read" : "Earlier read"} · ${when(item.at)} · ${item.lines.length} lines`,
              }))}
            onPick={(id) => {
              setFront(id);
              setShuffled(true);
            }}
          />
          <div className="axpa-printer">
            <span className="axpa-slot" aria-hidden="true" />
            <span>
              Printed on request · {when(read.at)}:
              {stamp(read.at, false).slice(-2)}
            </span>
            <LittleServer
              mood={
                failing
                  ? "attention"
                  : toneOf(newest.at, now) === "verified"
                    ? "ready"
                    : "resting"
              }
              className="axpa-guy"
            />
          </div>
          <div className="axpa-roll">
            <div ref={frame} className="axpa-frame">
              <article
                key={read.id}
                className="axpa-sheet"
                data-torn={cut.length ? "both" : "end"}
                data-shuffled={shuffled || undefined}
                aria-label="Collected application logs"
              >
                {cut.length > 0 && (
                  <p className="axpa-tear">
                    {listed(cut.map((item) => item.name))} had written more than
                    the last {CAP} lines, so the paper starts mid-way.
                  </p>
                )}
                <div className="axpa-rows">
                  {shown.map((line) => (
                    <div
                      key={
                        flash?.id === line.id
                          ? `${line.id}-${flash.n}`
                          : line.id
                      }
                      className="axpa-row"
                      data-line={line.id}
                      data-level={line.level}
                      data-milestone={line.milestone || undefined}
                      data-dim={(pen && line.service !== pen) || undefined}
                      data-flash={flash?.id === line.id || undefined}
                    >
                      <time>{stamp(line.at)}</time>
                      <mark data-who={who(line.service)}>{line.speaker}</mark>
                      <span>
                        {line.text}
                        {line.rest && <small> {line.rest}</small>}
                      </span>
                    </div>
                  ))}
                  {!shown.length && (
                    <p className="axpa-none">No lines match your filter.</p>
                  )}
                </div>
                <p className="axpa-end">
                  End of the read · {when(read.at)} · read by Server Guy
                </p>
              </article>
            </div>
            <nav className="axpa-tabs" aria-label="Places in the read">
              {tabs.map((tab) => (
                <button
                  key={tab.line.id}
                  type="button"
                  data-kind={tab.kind}
                  style={{ top: `${tab.top}%` }}
                  title={`${tab.line.speaker}: ${tab.line.text}`}
                  onClick={() => go(tab.line.id)}
                >
                  {tab.line.speaker}: {tab.line.text}
                </button>
              ))}
            </nav>
          </div>
          <p className="axpa-blank">
            Nothing printed since · {lasting(now - Date.parse(newest.at))}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------- Monitoring: the inspection reports ----------

interface Report {
  id: string;
  at: string;
  until: string;
  by: string;
  invented: boolean;
  rows: { look: Look; at: string }[];
  reads: { look: Look; at: string; text: string }[];
}

/** One report for each run of checks: checks less than a minute apart. */
function reportsOf(story: SignalStory): Report[] {
  const items = story.looks
    .filter((look) => look.kind === "check" && !look.invented)
    .flatMap((look) => look.evidence.map((item) => ({ look, at: item.at })))
    .sort((a, b) => a.at.localeCompare(b.at));
  const runs: Report[] = [];
  for (const item of items) {
    const run = runs.at(-1);
    if (run && Date.parse(item.at) - Date.parse(run.until) < 60_000) {
      run.rows.push(item);
      run.until = item.at;
    } else
      runs.push({
        id: `run-${runs.length}`,
        at: item.at,
        until: item.at,
        by: "Server Guy, while deploying",
        invented: false,
        rows: [item],
        reads: [],
      });
  }
  const outputs = story.looks.filter((look) => look.kind === "output");
  for (const run of runs)
    run.reads = outputs.flatMap((look) =>
      look.evidence
        .filter(
          (item) =>
            item.at >= run.at &&
            Date.parse(item.at) - Date.parse(run.until) < 30_000,
        )
        .map((item) => ({ look, at: item.at, text: item.text })),
    );
  const invented = story.looks.filter((look) => look.invented && look.at);
  if (invented.length) {
    const times = invented.map((look) => look.at!).sort();
    runs.push({
      id: "watch",
      at: times[0],
      until: times.at(-1)!,
      by: story.watcher?.detail ?? "A collector on the host (invented)",
      invented: true,
      rows: invented.map((look) => ({ look, at: look.at! })),
      reads: [],
    });
  }
  return runs.reverse();
}

const sections: { where: Look["where"]; title: string }[] = [
  { where: "outside", title: "From outside the server" },
  { where: "inside", title: "Inside the server" },
  { where: "host", title: "On the server" },
];

function PaperWatch({
  story,
  now,
  head,
  activity,
  server,
  onAsk,
}: SignalDirectionProps) {
  const reports = reportsOf(story);
  const [front, setFront] = useState(reports[0]?.id ?? "");
  const [shuffled, setShuffled] = useState(false);
  const report = reports.find((item) => item.id === front) ?? reports[0];
  const failing = story.looks.find((look) => look.state === "failing") ?? null;
  const watching = story.watcher?.state === "running";
  const top = reports[0];
  const health = story.unwatched.find((gap) => gap.id === "watch");
  const guard = story.looks.filter((look) => look.kind === "backup");
  const blanks = [
    {
      label: "Next inspection",
      words: watching ? "in about a minute (invented)" : "not scheduled",
      filled: watching,
    },
    ...(health
      ? [
          {
            label: "If a process stops",
            words: "nothing restarts it",
            filled: false,
          },
        ]
      : []),
    ...story.unwatched
      .filter((gap) => gap.id !== "watch")
      .map((gap) => ({
        label: gap.title,
        words:
          gap.id === "notify"
            ? "no provider"
            : gap.id.startsWith("unchecked")
              ? "no check"
              : "not measured",
        filled: false,
      })),
  ];
  const failed = (item: Report) =>
    item.rows.some((row) => row.look.state === "failing");
  const note = !top
    ? `Nothing has inspected ${story.name}: the deployment recorded no checks.`
    : failing
      ? `${failing.name} failed ${ago(failing.at!, now)}: ${failing.detail}. (Invented scenario.)`
      : watching
        ? "A collector inspects it every minute (invented)."
        : `The newest report is ${lasting(now - Date.parse(top.until))} old. Nothing has inspected ${story.name} since, and no next inspection is scheduled.`;

  const lede = failing
    ? {
        say: `${failing.name} failed its inspection.`,
        tone: "failed" as Tone,
        word: `Failed ${ago(failing.at!, now)}`,
        sub: `${failing.detail}. ${story.watcher?.detail ?? ""}.`,
        ask: {
          label: "Ask Server Guy to look into it",
          draft: `${failing.name} is failing: ${failing.detail}. Find out why and tell me what you would change.`,
        },
      }
    : {
        say: top
          ? `${story.name} was last inspected ${when(top.until)}.`
          : `${story.name} has never been inspected.`,
        tone: toneOf(top?.until ?? null, now),
        word: top ? `${ago(top.until, now)}` : "No report",
        sub: top
          ? `Every check passed then, while it was deploying. No next inspection is scheduled: nothing inspects it between deployments.`
          : "The deployment recorded no checks.",
        ask: {
          label: "Ask Server Guy to schedule inspections",
          draft: `Set up a health watch for ${story.name}: check each process every minute, restart one that stops, and tell me when something fails.`,
        },
      };
  const mood: MascotMood = failing
    ? "attention"
    : watching
      ? "checking"
      : toneOf(top?.until ?? null, now) === "verified"
        ? "ready"
        : "resting";

  return (
    <section className="axpa" aria-label="Monitoring">
      {head}
      {activity}
      <Lede {...lede} onAsk={onAsk} />
      <div className="axpa-desk axpa-desk-reports">
        <div className="axpa-stack">
          <Behind
            sheets={reports
              .filter((item) => item.id !== report?.id)
              .map((item) => ({
                id: item.id,
                label: `Inspection report · ${when(item.at)}${item.invented ? " · invented" : ""}`,
              }))}
            onPick={(id) => {
              setFront(id);
              setShuffled(true);
            }}
          />
          {report ? (
            <article
              key={report.id}
              className="axpa-sheet axpa-report"
              data-torn="none"
              data-shuffled={shuffled || undefined}
              aria-label={`Inspection report, ${when(report.at)}`}
            >
              <header className="axpa-form-head">
                <h3>Inspection report</h3>
                <dl>
                  <div>
                    <dt>Application</dt>
                    <dd>{story.name}</dd>
                  </div>
                  <div>
                    <dt>Server</dt>
                    <dd>
                      {server
                        ? `${server.label}${server.city ? `, ${server.city}` : ""}`
                        : "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt>Inspected</dt>
                    <dd>
                      {dayOf(report.at)}, {stamp(report.at, false)}
                      {report.until !== report.at
                        ? `–${stamp(report.until, false)}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>By</dt>
                    <dd>{report.by}</dd>
                  </div>
                </dl>
              </header>
              {sections.map((section) => {
                const rows = report.rows.filter(
                  (row) => row.look.where === section.where,
                );
                return rows.length ? (
                  <section key={section.where} className="axpa-form-part">
                    <h4>{section.title}</h4>
                    {rows.map((row, index) => (
                      <div
                        key={index}
                        className="axpa-check"
                        data-state={row.look.state}
                      >
                        <span>
                          {row.look.name}
                          <code>{row.look.how}</code>
                          {row.look.state === "failing" && row.look.detail && (
                            <small>{row.look.detail}</small>
                          )}
                        </span>
                        <b>
                          {row.look.state === "failing"
                            ? "Failed"
                            : row.look.state === "passing"
                              ? "Passed"
                              : "No result"}
                        </b>
                        <time>{stamp(row.at, false)}</time>
                      </div>
                    ))}
                  </section>
                ) : null;
              })}
              {report.reads.length > 0 && (
                <section className="axpa-form-part">
                  <h4>Output</h4>
                  {report.reads.map((row, index) => (
                    <div key={index} className="axpa-check" data-state="seen">
                      <span>
                        {row.look.name}
                        <code>{row.text}</code>
                      </span>
                      <b>Read</b>
                      <time>{stamp(row.at, false)}</time>
                    </div>
                  ))}
                </section>
              )}
              <section className="axpa-form-part axpa-blanks">
                <h4>Left blank</h4>
                {blanks.map((blank) => (
                  <div
                    key={blank.label}
                    className="axpa-field"
                    data-filled={blank.filled || undefined}
                  >
                    <span>{blank.label}</span>
                    <i aria-hidden="true" />
                    <em>{blank.words}</em>
                  </div>
                ))}
              </section>
              {report === top && guard.length > 0 && (
                <p className="axpa-also">
                  Also on record:{" "}
                  {guard
                    .map(
                      (look) => `${look.name.toLowerCase()} ${when(look.at!)}`,
                    )
                    .join("; ")}
                  . Backups has the details.
                </p>
              )}
              <footer className="axpa-sign">
                <span>Signed</span>
                <b>
                  {report.invented ? "Host collector (invented)" : "Server Guy"}
                </b>
              </footer>
              <div
                className="axpa-stamp"
                data-state={failed(report) ? "failed" : "passed"}
                data-faded={
                  toneOf(report.until, now) !== "verified" || undefined
                }
                aria-hidden="true"
              >
                {failed(report) ? "Failed" : "Passed"}
                <small>{day(report.until)}</small>
              </div>
            </article>
          ) : (
            <article className="axpa-sheet axpa-report" data-torn="none">
              <p className="axpa-none">No inspection is on record.</p>
            </article>
          )}
        </div>
        <aside className="axpa-note-wrap">
          <LittleServer mood={mood} className="axpa-note-guy" />
          <div
            className="axpa-note"
            data-state={failing ? "failed" : undefined}
          >
            <p>{note}</p>
            {health && !watching && <small>{health.detail}</small>}
            <button
              type="button"
              className="axpa-ask-small"
              onClick={() => onAsk(lede.ask.draft)}
            >
              <ChatCircleText weight="bold" />
              Ask in the conversation
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function PaperDirection(props: SignalDirectionProps) {
  return props.page === "logs" ? (
    <PaperLogs {...props} />
  ) : (
    <PaperWatch {...props} />
  );
}
