"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction C, Replay: History as a recording. A ruler runs over the whole
// record, long quiet stretches folded and labelled, and every operation is
// a mark on it; the page opens at now. Drag Little Server back, or press
// Replay, and everything after the playhead dims: History as it stood then.
// The ruler stays in view while the record scrolls under it.

import { ClockCounterClockwise, Pause, Play } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { MascotMood } from "../home/mascot-scene";
import { stateLabel } from "../operation-model";
import { reducedMotion } from "../architecture-prototype/motion";
import { TactileSlider } from "../architecture-prototype/tactile-slider";
import { LittleServer } from "../deployment-prototype/little-server";
import { FeedRow, sentenceOf, useJump } from "./feed";
import { clockOf, dayName, FILTERS, type Entry } from "./history-model";
import type { HistoryDirectionProps } from "./index";
import "./replay.css";

/** Every mark keeps some room, and no quiet stretch takes more than this. */
const MIN = 4 * 60_000;
const CAP = 40 * 60_000;

const gapOf = (ms: number) => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
};

function rulerOf(entries: Entry[], now: number) {
  const ordered = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  const times = ordered.map((entry) => Date.parse(entry.at));
  const breaks: { at: number; real: number }[] = [];
  const marks: number[] = [];
  let length = MIN;
  times.forEach((time, index) => {
    if (index > 0) {
      const real = time - times[index - 1];
      const visual = Math.min(Math.max(real, MIN), CAP);
      if (real > CAP) breaks.push({ at: length + visual / 2, real });
      length += visual;
    }
    marks.push(length);
  });
  const tailReal = now - (times.at(-1) ?? now);
  const tail = Math.min(Math.max(tailReal, MIN), CAP);
  if (tailReal > CAP) breaks.push({ at: length + tail / 2, real: tailReal });
  length += tail;
  const xs = marks.map((mark) => mark / length);
  const days: { x: number; at: string }[] = [];
  ordered.forEach((entry, index) => {
    const key = new Date(entry.at).toDateString();
    const previous = ordered[index - 1];
    if (!previous || new Date(previous.at).toDateString() !== key)
      days.push({ x: xs[index], at: entry.at });
  });
  const anchors = [
    { x: 0, t: (times[0] ?? now) - MIN },
    ...xs.map((x, index) => ({ x, t: times[index] })),
    { x: 1, t: now },
  ];
  const timeAt = (pos: number) => {
    const index = anchors.findIndex((anchor) => anchor.x >= pos);
    if (index <= 0) return anchors[0].t;
    const a = anchors[index - 1];
    const b = anchors[index];
    return a.t + ((pos - a.x) / (b.x - a.x || 1)) * (b.t - a.t);
  };
  return {
    ordered,
    xs,
    breaks: breaks.map((item) => ({ x: item.at / length, real: item.real })),
    days,
    timeAt,
  };
}

export function ReplayHistory({
  history,
  filter,
  onFilter,
  now,
  head,
  decisionFor,
  onOpenConversation,
  onOpenDestination,
}: HistoryDirectionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const { flash, jump } = useJump(onFilter);
  const [pos, setPos] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const posRef = useRef(1);

  const entries = useMemo(
    () => [...history.open, ...history.days.flatMap((day) => day.entries)],
    [history],
  );
  const ruler = useMemo(() => rulerOf(entries, now), [entries, now]);
  const stops = useMemo(() => [...ruler.xs, 1], [ruler]);
  const indexOf = useMemo(
    () => new Map(ruler.ordered.map((entry, index) => [entry.op.id, index])),
    [ruler],
  );

  const seek = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    posRef.current = next;
    setPos(next);
  }, []);

  // A replay steps from mark to mark; the glide between them is CSS, and
  // each operation's row is brought into view as it happens.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = stops.find((stop) => stop > posRef.current + 1e-6) ?? 1;
      seek(next);
      const entry = ruler.ordered[ruler.xs.indexOf(next)];
      if (entry)
        document.getElementById(`axh-${entry.op.id}`)?.scrollIntoView({
          block: "center",
          behavior: reducedMotion() ? "auto" : "smooth",
        });
      if (next < 1) return;
      window.clearInterval(timer);
      setPlaying(false);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [playing, stops, ruler, seek]);

  const atEnd = pos >= 0.999 && !playing;
  const index = ruler.xs.findLastIndex((x) => x <= pos + 1e-6);
  const current = index >= 0 ? ruler.ordered[index] : null;
  const t = new Date(ruler.timeAt(pos)).toISOString();
  const readout = atEnd ? "Now" : `${dayName(t, now)}, ${clockOf(t)}`;
  const sentence = atEnd
    ? sentenceOf(history)
    : current
      ? `As of ${readout}: ${index + 1} of ${ruler.ordered.length} operations had happened. The latest: “${current.op.title}”, ${stateLabel[current.op.state].toLowerCase()}.`
      : `Before ${clockOf(ruler.ordered[0]?.at ?? t)}, nothing had happened yet.`;
  const unresolved = history.failed - history.resolved;
  const mood: MascotMood =
    current && !atEnd && current.op.state === "failed"
      ? "attention"
      : playing
        ? "working"
        : atEnd && unresolved > 0
          ? "attention"
          : "ready";

  const toggle = () => {
    if (playing) return setPlaying(false);
    if (posRef.current >= 0.999) seek(0);
    setPlaying(true);
  };
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const value = (event.clientX - rect.left) / rect.width;
    // A mark within reach catches the playhead.
    return ruler.xs.find((x) => Math.abs(x - value) * rect.width < 8) ?? value;
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowRight")
      next = stops.find((stop) => stop > pos + 1e-6) ?? 1;
    else if (event.key === "ArrowLeft")
      next = [0, ...stops].findLast((stop) => stop < pos - 1e-6) ?? 0;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (next === null) return toggle();
    setPlaying(false);
    seek(next);
    // A step by key brings the operation it lands on into view.
    const entry = ruler.ordered[ruler.xs.indexOf(next)];
    if (entry)
      document.getElementById(`axh-${entry.op.id}`)?.scrollIntoView({
        block: "center",
        behavior: reducedMotion() ? "auto" : "smooth",
      });
  };
  const classOf = (entry: Entry) => {
    if (atEnd) return undefined;
    const at = indexOf.get(entry.op.id) ?? -1;
    return at > index ? "is-later" : at === index ? "is-current" : undefined;
  };
  const row = (entry: Entry) => (
    <FeedRow
      key={entry.op.id}
      entry={entry}
      expanded={open === entry.op.id}
      onToggle={() =>
        setOpen((value) => (value === entry.op.id ? null : entry.op.id))
      }
      flash={flash === entry.op.id}
      onJump={jump}
      decisionFor={decisionFor}
      onOpenConversation={onOpenConversation}
      onOpenDestination={onOpenDestination}
      className={classOf(entry)}
    />
  );

  return (
    <section className="axh axhr" aria-label="History">
      {head}
      <div className="axhr-deck">
        <div className="axh-top">
          <p className="axh-sum">{sentence}</p>
          <div className="axh-filter">
            <TactileSlider
              label="Show"
              size="sm"
              options={FILTERS.map((value) => ({
                id: value,
                label: `${value} ${history.counts[value]}`,
              }))}
              value={filter}
              onChange={onFilter}
            />
          </div>
        </div>
        {ruler.ordered.length > 0 && (
          <>
            <div className="axhr-controls">
              <button
                type="button"
                className="ax-button axhr-play"
                aria-pressed={playing}
                onClick={toggle}
              >
                {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
                {playing ? "Pause" : atEnd ? "Replay the record" : "Play"}
              </button>
              {!atEnd && (
                <button
                  type="button"
                  className="ax-button"
                  onClick={() => {
                    setPlaying(false);
                    seek(1);
                  }}
                >
                  Back to now
                </button>
              )}
              <span className="axhr-readout">
                <ClockCounterClockwise weight="bold" />
                {readout}
              </span>
            </div>
            <div className={`axhr-stage${dragging ? " is-dragging" : ""}`}>
              <div className="axhr-guy" style={{ left: `${pos * 100}%` }}>
                <LittleServer mood={mood} className="axhr-scene" />
              </div>
              <div
                className="axhr-ruler"
                role="slider"
                tabIndex={0}
                aria-label="Replay position"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pos * 100)}
                aria-valuetext={readout}
                onKeyDown={onKey}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging(true);
                  setPlaying(false);
                  seek(fromPointer(event));
                }}
                onPointerMove={(event) => {
                  if (dragging) seek(fromPointer(event));
                }}
                onPointerUp={(event) => {
                  setDragging(false);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => setDragging(false)}
              >
                <span className="axhr-axis" />
                <span
                  className="axhr-played"
                  style={{ width: `${pos * 100}%` }}
                />
                {ruler.breaks.map((item) => (
                  <span
                    key={item.x}
                    className="axhr-break"
                    style={{ left: `${item.x * 100}%` }}
                  />
                ))}
                {ruler.ordered.map((entry, at) => (
                  <span
                    key={entry.op.id}
                    className="axhr-mark"
                    data-state={entry.op.state}
                    data-later={(!atEnd && at > index) || undefined}
                    style={{ left: `${ruler.xs[at] * 100}%` }}
                    title={`${clockOf(entry.at)} · ${entry.op.title}`}
                  />
                ))}
                <span className="axhr-head" style={{ left: `${pos * 100}%` }} />
              </div>
              <div className="axhr-days" aria-hidden="true">
                {ruler.days.map((day) => (
                  <span key={day.at} style={{ left: `${day.x * 100}%` }}>
                    {dayName(day.at, now)}
                  </span>
                ))}
                {ruler.breaks.map((item) => (
                  <span
                    key={item.x}
                    className="is-gap"
                    style={{ left: `${item.x * 100}%` }}
                  >
                    {gapOf(item.real)}
                  </span>
                ))}
                <span className="is-now" style={{ left: "100%" }}>
                  Now
                </span>
              </div>
            </div>
          </>
        )}
      </div>
      {history.open.length > 0 && (
        <section className="axh-group is-live" aria-label="Open now">
          <h2>Open now</h2>
          <ol className="axh-list">{history.open.map(row)}</ol>
        </section>
      )}
      {history.days.map((day) => (
        <section key={day.key} className="axh-group" aria-label={day.key}>
          <h2>{dayName(day.at, now)}</h2>
          <ol className="axh-list">{day.entries.map(row)}</ol>
        </section>
      ))}
      {!entries.length && history.total > 0 && (
        <p className="axh-empty">Nothing matches this filter.</p>
      )}
    </section>
  );
}
