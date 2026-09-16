"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Logs.
// Paper: no diagram. The read is printed on continuous paper from a printer
// that prints only when asked. Each process has a highlighter, index tabs
// mark where a process said it was ready and where it warned, and the paper
// is torn where the read stopped, and at the top when a process had written
// more than was read. Earlier reads peek out from behind and come forward
// when picked; nothing moves on arrival.

import { ChatCircleText, MagnifyingGlass } from "@phosphor-icons/react";
import { useRef, useState, type ReactNode } from "react";

import { useReducedMotion } from "../architecture-prototype/motion";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { lasting, listed } from "../backup-prototype/model";
import { ago, when } from "../stack-prototype/stack-model";
import type { SignalStory } from "./signal-model";
/** What the Monitoring page hands this layout. */
export interface SignalDirectionProps {
  story: SignalStory;
  now: number;
  head: ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: ReactNode;
  onAsk: (draft: string) => void;
}
import { CAP, toneOf, type LogLine } from "./signal-model";
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

export function PaperDirection({
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
