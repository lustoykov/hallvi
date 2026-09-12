"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Database.
// Timeline: the database in time, in Overview's lanes: its check, its
// copies off the server and its restore tests. Quiet stretches fold, so
// minutes of work and days of quiet share one line, and "To scale" unfolds
// them. Little Server stands at now; the stretch since the newest copy is
// shaded and named. Pointing at a moment lights it across the lanes; a
// moment opens its record.

import {
  Archive,
  ArrowCounterClockwise,
  ArrowRight,
  ChatCircleText,
  Heartbeat,
  X,
} from "@phosphor-icons/react";
import {
  Fragment,
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { MascotMood } from "../home/mascot-scene";
import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { useDismiss } from "../overview-prototype/shared";
import { ago, when } from "../stack-prototype/stack-model";
import type { Mark } from "./data-model";
import type { DataDirectionProps } from "./index";
import "./timeline.css";

const HOUR = 3_600_000;
/** Quiet stretches longer than this fold. */
const FOLD = 2 * HOUR;
// The line is laid out in units, then turned into shares of its length.
const LEAD = 4;
const TAIL = 9;
const FOLD_UNITS = 12;
/** Moments seconds apart still get room; minutes apart get a little more. */
const step = (ms: number) => 3.4 + 2.2 * Math.log10(1 + ms / 10_000);

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const day = (at: number | string) =>
  new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const hm = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const hms = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

/** "5 h 43 min", "1 day 22 h". */
function lasting(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}${hours % 24 ? ` ${hours % 24} h` : ""}`;
}

interface Axis {
  /** Where a moment sits, in percent of the track. */
  x: (at: number) => number;
  folds: { id: string; x: number; width: number; words: string }[];
  labels: { id: string; x: number; text: string }[];
  midnights: number[];
}

/**
 * Every moment gets its own place, a little further along the longer it
 * waited; a wait longer than FOLD takes a fixed fold instead. To scale, the
 * line is plain clock time.
 */
function buildAxis(times: number[], now: number, toScale: boolean): Axis {
  const moments = [...new Set([...times.filter((at) => at < now), now])].sort(
    (a, b) => a - b,
  );
  const first = moments[0];
  if (toScale) {
    const x = (at: number) =>
      LEAD +
      ((Math.min(at, now) - first) / Math.max(now - first, 1)) *
        (100 - LEAD - TAIL);
    const midnights: number[] = [];
    const next = new Date(first);
    next.setHours(24, 0, 0, 0);
    while (next.getTime() < now) {
      midnights.push(next.getTime());
      next.setDate(next.getDate() + 1);
    }
    return {
      x,
      folds: [],
      midnights,
      labels: [
        ...(first < now
          ? [{ id: "start", x: x(first), text: `${day(first)} · ${hm(first)}` }]
          : []),
        ...midnights
          .filter((at) => x(at) > x(first) + 9 && x(at) < x(now) - 9)
          .map((at) => ({ id: `day:${at}`, x: x(at), text: day(at) })),
      ],
    };
  }
  const units = [LEAD];
  for (let i = 1; i < moments.length; i++) {
    const gap = moments[i] - moments[i - 1];
    units.push(units[i - 1] + (gap > FOLD ? FOLD_UNITS : step(gap)));
  }
  const total = units[units.length - 1] + TAIL;
  const pct = (unit: number) => (unit / total) * 100;
  const x = (at: number) => {
    const i = moments.findIndex((moment) => moment >= at);
    if (i === -1) return pct(units[units.length - 1]);
    if (i === 0) return pct(units[0]);
    const share = (at - moments[i - 1]) / (moments[i] - moments[i - 1]);
    return pct(units[i - 1] + share * (units[i] - units[i - 1]));
  };
  // Each run of work is named under its middle; each fold, by how long.
  const folds: Axis["folds"] = [];
  const labels: Axis["labels"] = [];
  let start = 0;
  for (let i = 1; i <= moments.length; i++) {
    const gap = i < moments.length ? moments[i] - moments[i - 1] : Infinity;
    if (gap <= FOLD) continue;
    const run = moments.slice(start, i).filter((moment) => moment !== now);
    if (run.length) {
      const a = run[0];
      const b = run[run.length - 1];
      labels.push({
        id: `run:${a}`,
        x: (x(a) + x(b)) / 2,
        text: `${day(a)} · ${hm(a)}${hm(b) !== hm(a) ? `–${hm(b)}` : ""}`,
      });
    }
    if (i < moments.length)
      folds.push({
        id: `fold:${moments[i - 1]}`,
        x: pct(units[i - 1] + 2),
        width: pct(FOLD_UNITS - 4),
        words: lasting(gap),
      });
    start = i;
  }
  return { x, folds, labels, midnights: [] };
}

interface Lane {
  id: string;
  icon: ReactNode;
  name: string;
  status: string;
  c: "verified" | "stale" | "failed" | "absent" | "fact";
  marks: Mark[];
  /** The stretch since this last happened, once it is overdue. */
  gap: { from: string; words: string } | null;
  ghost: string | null;
  action: { label: string; run: () => void };
}

export function TimelineDirection({
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: DataDirectionProps) {
  const [toScale, setToScale] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(Boolean(open), ".axdt-pop, .axdt-ev", close);

  const store = story.database;
  const guard = story.protection;
  const copyAt = story.newestCopyAt;
  const checked = store?.probe?.at ?? null;
  const owner = store?.owner ?? "The application";
  const overdue = (at: string) => now - Date.parse(at) >= FRESH_MS;
  const marksOf = (lane: Mark["lane"]) =>
    story.marks.filter((mark) => mark.lane === lane);
  const toBackups = {
    label: "Open Backups",
    run: () => onOpenDestination("backups"),
  };

  const lanes: Lane[] = [
    {
      id: "health",
      icon: <Heartbeat weight="bold" />,
      name: "Database check",
      status: checked
        ? `Passed ${when(checked)}`
        : store?.firstFailure
          ? "Failed"
          : "No check reads it",
      c: checked
        ? overdue(checked)
          ? "stale"
          : "verified"
        : store?.firstFailure
          ? "failed"
          : "absent",
      marks: marksOf("health"),
      gap:
        checked && overdue(checked)
          ? {
              from: checked,
              words: `No check for ${lasting(now - Date.parse(checked))}`,
            }
          : null,
      ghost: marksOf("health").length ? null : "No check reads the database",
      action: {
        label: "Ask Server Guy to check it now",
        run: () => onAsk(`Check that ${owner}'s database is healthy now.`),
      },
    },
    {
      id: "copies",
      icon: <Archive weight="bold" />,
      name: "Copies off the server",
      status: copyAt ? `Newest ${when(copyAt)}` : "None on record",
      c: copyAt ? (overdue(copyAt) ? "stale" : "verified") : "absent",
      marks: marksOf("copies"),
      gap:
        copyAt && overdue(copyAt)
          ? {
              from: copyAt,
              words: `No copy on record for ${lasting(now - Date.parse(copyAt))}`,
            }
          : null,
      ghost: marksOf("copies").length ? null : "No copy on record",
      action: toBackups,
    },
    {
      id: "restores",
      icon: <ArrowCounterClockwise weight="bold" />,
      name: "Restore tests",
      status: guard.restore
        ? `Passed ${when(guard.restore.at)}`
        : "Not run yet",
      c: guard.restore ? "fact" : "absent",
      marks: marksOf("restores"),
      gap: null,
      ghost: guard.restore ? null : "No restore test yet",
      action: toBackups,
    },
  ];

  const axis = buildAxis(
    story.marks.map((mark) => Date.parse(mark.at)),
    now,
    toScale,
  );
  const nowX = axis.x(now);

  const say = copyAt
    ? `${owner}'s database was last copied off the server on ${day(copyAt)}.`
    : `${owner}'s database has no copy off the server on record.`;
  const sub = [
    checked && `It last passed its check ${when(checked)}`,
    guard.restore && `a restore test passed ${when(guard.restore.at)}`,
  ]
    .filter(Boolean)
    .join(", and ")
    .concat(checked || guard.restore ? ". Nothing newer is on record." : "");
  const note = `As recorded: nothing here is observed live.${guard.schedule ? ` ${guard.schedule.words.split(",")[0]} are scheduled, so newer copies may exist; none is on record here.` : ""}`;

  return (
    <section className="axdt" aria-label="Database">
      {head}
      {activity}
      <div className="axdt-lede">
        <div>
          <h2 className="axdt-say">{say}</h2>
          {sub && <p className="axdt-sub">{sub}</p>}
        </div>
        <button
          type="button"
          className="ax-button axdt-ask"
          onClick={() =>
            onAsk(`Back up ${owner}'s database now and verify the copy.`)
          }
        >
          <ChatCircleText weight="bold" />
          Ask Server Guy to back it up now
        </button>
      </div>

      <div className="axdt-board" data-scale={toScale ? "true" : "folded"}>
        <div
          className="axdt-time"
          style={{ "--now": `${nowX}%` } as CSSProperties}
        >
          <div className="axdt-scale" role="group" aria-label="Quiet stretches">
            <button
              type="button"
              aria-pressed={!toScale}
              onClick={() => setToScale(false)}
            >
              Folded
            </button>
            <button
              type="button"
              aria-pressed={toScale}
              onClick={() => setToScale(true)}
            >
              To scale
            </button>
          </div>
          <div className="axdt-field" aria-hidden="true">
            {axis.midnights.map((at) => (
              <i
                key={at}
                className="axdt-midnight"
                style={{ left: `${axis.x(at)}%` }}
              />
            ))}
            <i className="axdt-now" />
            {lit !== null && (
              <span className="axdt-hair" style={{ left: `${axis.x(lit)}%` }}>
                <b>{hms(lit)}</b>
              </span>
            )}
          </div>
          <div className="axdt-over" aria-hidden="true">
            <div className="axdt-stand">
              <LittleServer mood={moodOf[story.tone]} className="axdt-guy" />
            </div>
          </div>

          {lanes.map((lane) => {
            const gapX = lane.gap ? axis.x(Date.parse(lane.gap.from)) : 0;
            return (
              <div key={lane.id} className="axdt-lane" data-c={lane.c}>
                <div className="axdt-lane-head">
                  <span className="axdt-lane-icon" aria-hidden="true">
                    {lane.icon}
                  </span>
                  <span className="axdt-lane-text">
                    <b>{lane.name}</b>
                    <small>
                      <i aria-hidden="true" />
                      {lane.status}
                    </small>
                  </span>
                </div>
                <div className="axdt-track">
                  {axis.folds.map((fold) => (
                    <i
                      key={fold.id}
                      className="axdt-break"
                      aria-hidden="true"
                      style={{ left: `${fold.x}%`, width: `${fold.width}%` }}
                    />
                  ))}
                  {lane.gap && (
                    <span
                      className="axdt-gap"
                      style={{ left: `${gapX}%`, width: `${nowX - gapX}%` }}
                    >
                      <span>{lane.gap.words}</span>
                    </span>
                  )}
                  {lane.ghost && (
                    <span className="axdt-ghost">{lane.ghost}</span>
                  )}
                  {lane.marks.map((mark) => {
                    const at = Date.parse(mark.at);
                    const x = axis.x(at);
                    return (
                      <Fragment key={mark.id}>
                        <button
                          type="button"
                          className="axdt-ev"
                          data-tone={mark.tone}
                          data-lit={lit === at || undefined}
                          style={{ left: `${x}%` }}
                          aria-label={`${mark.title}, ${when(mark.at)}`}
                          aria-expanded={open === mark.id}
                          onClick={() =>
                            setOpen((value) =>
                              value === mark.id ? null : mark.id,
                            )
                          }
                          onPointerEnter={() => setLit(at)}
                          onPointerLeave={() => setLit(null)}
                          onFocus={() => setLit(at)}
                          onBlur={() => setLit(null)}
                        />
                        {open === mark.id && (
                          <div
                            className="axdt-pop"
                            role="dialog"
                            aria-label={mark.title}
                            data-align={
                              x > 62 ? "end" : x < 22 ? "start" : "middle"
                            }
                            style={{ left: `${x}%` }}
                          >
                            <header>
                              <div>
                                <b>{mark.title}</b>
                                <small>
                                  {when(mark.at)} · {ago(mark.at, now)}
                                </small>
                              </div>
                              <button
                                type="button"
                                onClick={close}
                                aria-label="Close"
                              >
                                <X weight="bold" />
                              </button>
                            </header>
                            <p>{mark.detail}</p>
                            <button
                              type="button"
                              className="ax-textlink"
                              onClick={lane.action.run}
                            >
                              {lane.action.label}
                              <ArrowRight weight="bold" />
                            </button>
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="axdt-axis" aria-hidden="true">
            <div className="axdt-ticks">
              {axis.labels.map((label) => (
                <span key={label.id} style={{ left: `${label.x}%` }}>
                  {label.text}
                </span>
              ))}
              {axis.folds.map((fold) => (
                <span
                  key={fold.id}
                  className="is-fold"
                  style={{ left: `${fold.x + fold.width / 2}%` }}
                >
                  {fold.words}
                </span>
              ))}
              <span className="is-now" style={{ left: `${nowX}%` }}>
                Now · {hm(now)}
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="axdt-note">{note}</p>
    </section>
  );
}
