"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction C, Replay: the band becomes a recording you can scrub. The page
// opens at now, still. Drag the playhead or press Replay, and the release
// card, the recorded lines and the checks show the deployment as it was at
// that moment, while Little Server walks the track. Only the record moves;
// nothing is contacted.

import {
  ArrowRight,
  ChatCircleText,
  Check,
  ClockCounterClockwise,
  MinusCircle,
  Pause,
  Play,
} from "@phosphor-icons/react";
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
import { ago, localTime } from "../architecture-prototype/model";
import { reducedMotion } from "../architecture-prototype/motion";
import { useDismiss } from "../overview-prototype/shared";
import type { Phase, Tone } from "./deployment-model";
import type { DirectionProps } from "./index";
import { LittleServer } from "./little-server";
import { nextStep } from "./next-step";
import { saidOf } from "./said";
import { Tag } from "./story";
import "./replay.css";

/** The whole record replays in this long, whatever it took. */
const DURATION = 14_000;
const glyph = { pass: "✓", fail: "✗", work: "›", info: "·" } as const;
const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const shortOf: Record<string, string> = {
  inspect: "Read",
  plan: "Plan",
  approval: "You",
  provision: "Server",
  deliver: "Start",
  verify: "Check",
  retry: "Retry",
  recreate: "Recreate",
};
const clock = (at: number | string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

interface Segment {
  phase: Phase;
  from: number;
  to: number;
  x: number;
  width: number;
}

/**
 * The track's scale: each phase gets width by how long it took, but never
 * less than a twentieth, so a two-second phase can still be found. Within
 * a phase, time runs evenly.
 */
function scaleOf(phases: Phase[]) {
  const ranges = phases.map((phase, index) => {
    const from = Date.parse(phase.start);
    const next = phases[index + 1];
    const to = Math.max(
      from,
      next ? Date.parse(next.start) : Date.parse(phase.end),
    );
    return { phase, from, to };
  });
  const total = ranges.reduce((sum, item) => sum + (item.to - item.from), 0);
  const weights = ranges.map((item) =>
    Math.max(item.to - item.from, total * 0.05, 1),
  );
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = 0;
  const segments: Segment[] = ranges.map((item, index) => {
    const width = weights[index] / sum;
    const segment = { ...item, x, width };
    x += width;
    return segment;
  });
  const segmentAt = (pos: number) =>
    segments.find((item) => pos <= item.x + item.width + 1e-9) ??
    segments.at(-1)!;
  const timeAt = (pos: number) => {
    const segment = segmentAt(pos);
    const f = Math.min(1, Math.max(0, (pos - segment.x) / segment.width));
    return segment.from + f * (segment.to - segment.from);
  };
  const posAt = (time: number) => {
    const segment =
      segments.findLast((item) => time >= item.from) ?? segments[0];
    const f =
      segment.to > segment.from
        ? Math.min(
            1,
            Math.max(0, (time - segment.from) / (segment.to - segment.from)),
          )
        : 0;
    return segment.x + f * segment.width;
  };
  return { segments, segmentAt, timeAt, posAt };
}

export function ReplayDirection({
  story,
  now,
  head,
  activity,
  panel,
  onAsk,
  onOpenConversation,
  onOpenDestination,
}: DirectionProps) {
  const [pos, setPos] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [cheer, setCheer] = useState(0);
  const [cheering, setCheering] = useState(false);
  const [fact, setFact] = useState<string | null>(null);
  const close = useCallback(() => setFact(null), []);
  useDismiss(Boolean(fact), ".axd-fact", close);
  const posRef = useRef(1);
  const dragging = useRef(false);
  const tape = useRef<HTMLDivElement>(null);

  const scale = useMemo(
    () => (story.phases.length ? scaleOf(story.phases) : null),
    [story.phases],
  );
  const lines = useMemo(
    () =>
      story.phases
        .flatMap((phase) => phase.lines)
        .sort((a, b) => a.at.localeCompare(b.at)),
    [story.phases],
  );
  // Where ← and → stop: every recorded line, and both ends.
  const stops = useMemo(
    () =>
      scale
        ? [
            ...new Set([
              0,
              ...lines.map((l) => scale.posAt(Date.parse(l.at))),
              1,
            ]),
          ].sort((a, b) => a - b)
        : [],
    [scale, lines],
  );

  const seek = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    posRef.current = next;
    setPos(next);
  }, []);
  const finish = useCallback(() => {
    setPlaying(false);
    if (story.state !== "live" || reducedMotion()) return;
    setCheer((value) => value + 1);
    setCheering(true);
    window.setTimeout(() => setCheering(false), 1800);
  }, [story.state]);

  useEffect(() => {
    if (!playing || !scale) return;
    if (reducedMotion()) {
      // Phase by phase, without the glide.
      const ends = scale.segments.map((item) => item.x + item.width);
      const timer = window.setInterval(() => {
        const next = ends.find((end) => end > posRef.current + 1e-6) ?? 1;
        seek(next);
        if (next < 1) return;
        window.clearInterval(timer);
        finish();
      }, 900);
      return () => window.clearInterval(timer);
    }
    let frame = 0;
    let last = performance.now();
    const tick = (time: number) => {
      const next = Math.min(1, posRef.current + (time - last) / DURATION);
      last = time;
      seek(next);
      if (next >= 1) finish();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, scale, seek, finish]);

  const t = scale ? scale.timeAt(pos) : 0;
  const visible = lines.filter((line) => Date.parse(line.at) <= t + 1);
  const current = scale?.segmentAt(pos).phase;
  const atEnd = pos >= 0.999 && !playing;
  // The newest line stays in view as the tape fills.
  useEffect(() => {
    const element = tape.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [visible.length]);

  const toggle = () => {
    if (playing) return setPlaying(false);
    if (posRef.current >= 0.999) seek(0);
    setPlaying(true);
  };
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width;
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowRight")
      next = stops.find((stop) => stop > pos + 1e-6) ?? 1;
    else if (event.key === "ArrowLeft")
      next = stops.findLast((stop) => stop < pos - 1e-6) ?? 0;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else if (event.key !== " " && event.key !== "Enter") return;
    // The prototype bar also listens for arrows; the track keeps them.
    event.preventDefault();
    event.stopPropagation();
    if (next === null) return toggle();
    setPlaying(false);
    seek(next);
  };

  const mood: MascotMood = cheering
    ? "celebrating"
    : atEnd
      ? moodOf[story.tone]
      : current?.tone === "fail"
        ? "attention"
        : playing
          ? "working"
          : "ready";
  const step = nextStep(story, onAsk, onOpenConversation);
  const lastPass = story.checks
    .map((check) => check.at)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);

  if (story.state === "none")
    return (
      <section className="axr" aria-label="Deployment">
        {head}
        {activity}
        <div className="axd-none">{panel}</div>
      </section>
    );

  const segments = (played: boolean) =>
    scale?.segments.map((item) => (
      <span
        key={item.phase.id}
        className="axr-seg"
        data-tone={item.phase.tone}
        data-played={played || undefined}
        style={{
          left: `calc(${item.x * 100}% + 1.5px)`,
          width: `calc(${item.width * 100}% - 3px)`,
        }}
      >
        {item.width > 0.06 && (
          <b>
            {shortOf[item.phase.id.replace(/-\d+$/, "")] ?? item.phase.title}
          </b>
        )}
      </span>
    ));

  return (
    <section className="axr" aria-label="Deployment">
      {head}
      {activity}
      <section
        className="axd-live axr-live"
        data-tone={atEnd ? story.tone : "replay"}
      >
        <div className="axd-live-head">
          <div>
            <h2 className="axd-say">
              {atEnd || !current ? story.statement : saidOf(current)}
            </h2>
            <p className="axd-said">
              {atEnd || !current ? (
                <>
                  <Tag tone={story.tone}>{story.word}</Tag>
                  <span>{story.detail}</span>
                </>
              ) : (
                <span className="axr-when">
                  <ClockCounterClockwise weight="bold" />
                  As it was at {clock(t)} · replaying the record
                </span>
              )}
            </p>
          </div>
          <div className="axd-actions">
            {atEnd ? (
              step && (
                <button
                  type="button"
                  className="ax-button axd-primary"
                  onClick={step.run}
                >
                  {step.ask && <ChatCircleText weight="bold" />}
                  {step.label}
                  {!step.ask && <ArrowRight weight="bold" />}
                </button>
              )
            ) : (
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
          </div>
        </div>
        {story.facts.length > 0 && (
          <dl className="axd-facts">
            {story.facts.map((item) => (
              <div key={item.label} className="axd-fact">
                <dt>{item.label}</dt>
                <dd>
                  <button
                    type="button"
                    className="axd-fact-open"
                    aria-expanded={fact === item.label}
                    disabled={!item.exact.length}
                    onClick={() =>
                      setFact((value) =>
                        value === item.label ? null : item.label,
                      )
                    }
                  >
                    <b>{item.value}</b>
                    <small>{item.sub}</small>
                  </button>
                  {fact === item.label && (
                    <div
                      className="axd-pop"
                      role="dialog"
                      aria-label={item.label}
                    >
                      <dl>
                        {item.exact.map((row) => (
                          <div key={row.label}>
                            <dt>{row.label}</dt>
                            <dd className={row.mono ? "ax-mono" : undefined}>
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {scale && current && (
        <section className="axr-deck" aria-label="How it got there">
          <header className="axr-deck-head">
            <h2>
              {story.state === "awaiting"
                ? "How the plan was made"
                : "How it got there"}
            </h2>
            <span className="axr-readout">
              {clock(t)} · {current.title}
            </span>
            <button
              type="button"
              className="ax-button axr-play"
              aria-pressed={playing}
              onClick={toggle}
            >
              {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
              {playing ? "Pause" : atEnd ? "Replay it" : "Play"}
            </button>
          </header>
          <div className="axr-stage">
            <div className="axr-guy" style={{ left: `${pos * 100}%` }}>
              <LittleServer mood={mood} gesture={cheer} className="axr-scene" />
            </div>
            <div
              className="axr-track"
              role="slider"
              tabIndex={0}
              aria-label="Replay position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pos * 100)}
              aria-valuetext={`${clock(t)}, ${current.title}`}
              onKeyDown={onKey}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragging.current = true;
                setPlaying(false);
                seek(fromPointer(event));
              }}
              onPointerMove={(event) => {
                if (dragging.current) seek(fromPointer(event));
              }}
              onPointerUp={(event) => {
                dragging.current = false;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
            >
              <div className="axr-layer">{segments(false)}</div>
              <div
                className="axr-layer"
                style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }}
              >
                {segments(true)}
              </div>
              <span className="axr-head" style={{ left: `${pos * 100}%` }} />
            </div>
            <div className="axr-ticks" aria-hidden="true">
              {lines.map((line, index) => (
                <span
                  key={`${line.at}:${index}`}
                  className="axr-tick"
                  data-tone={line.tone}
                  data-past={Date.parse(line.at) <= t + 1 || undefined}
                  style={{ left: `${scale.posAt(Date.parse(line.at)) * 100}%` }}
                />
              ))}
            </div>
            <div className="axr-scale" aria-hidden="true">
              <span>{localTime(story.phases[0].start)}</span>
              <span>
                {story.took} · {story.attempts}{" "}
                {story.attempts === 1 ? "attempt" : "attempts"}
              </span>
              <span>{localTime(story.phases.at(-1)!.end)}</span>
            </div>
          </div>
          <div
            ref={tape}
            className="axr-tape"
            role="log"
            aria-label="Recorded lines"
          >
            {visible.map((line, index) => (
              <div
                key={`${line.at}:${index}`}
                className="axr-line"
                data-tone={line.tone}
                data-newest={
                  (!atEnd && index === visible.length - 1) || undefined
                }
              >
                <time>{clock(line.at)}</time>
                <b aria-hidden="true">{glyph[line.tone]}</b>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="axd-lower">
        {story.checks.length > 0 && (
          <section className="axd-sec axd-checks" aria-label="Checks">
            <header className="axd-sec-head">
              <h2>
                {story.state === "live" ? "Checks it passes" : "Checks it runs"}
              </h2>
              <small>
                {!atEnd
                  ? `As of ${clock(t)}`
                  : lastPass
                    ? `Last passed ${ago(lastPass, now)}`
                    : "Run when it deploys"}
              </small>
            </header>
            <ul>
              {story.checks.map((check) => (
                <li
                  key={`${check.name}:${check.probe}`}
                  className="axd-check"
                  data-passed={
                    Boolean(check.at) && Date.parse(check.at!) <= t + 1
                  }
                >
                  <span className="axd-check-mark" aria-hidden="true">
                    <Check weight="bold" />
                  </span>
                  <b>{check.name}</b>
                  <span className="axd-check-probe">
                    <code>{check.probe}</code>
                    <span>
                      {check.inside ? "inside the server" : "from your network"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="axd-side">
          <section className="axd-sec" aria-label="Not set up yet">
            <header className="axd-sec-head">
              <h2>Not set up yet</h2>
            </header>
            <div className="axd-gaps">
              {story.gaps.map((gap) => (
                <div key={gap.id} className="axd-gap">
                  <MinusCircle weight="bold" aria-hidden="true" />
                  <b>{gap.title}</b>
                  <small>{gap.detail}</small>
                </div>
              ))}
            </div>
          </section>
          {story.logs.lines.length > 0 && (
            <details className="axd-logs">
              <summary>
                <span>Latest logs</span>
                <small>
                  {story.logs.at
                    ? `collected ${ago(story.logs.at, now)}`
                    : "collected with the deployment"}
                </small>
              </summary>
              <pre className="axd-pre">{story.logs.lines.join("\n")}</pre>
              <button
                type="button"
                className="ax-textlink"
                onClick={() => onOpenDestination("logs")}
              >
                Open Logs
                <ArrowRight weight="bold" />
              </button>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
