"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Direction A, Scope: a round scope with Little Server at the centre, now.
// Everything that looked at the application is a mark, and its distance
// from the centre is how long ago it looked: fresh marks sit close, inside
// the green, and old ones drift out as time passes. What nothing watches
// waits on the hatched rim. The sweep arm is the watcher, parked while
// nothing watches between deployments. Monitoring marks every check; Logs
// strings each process's lines around its ring, and pointing along a string
// reads it. Pointing sends a ping out from the centre; nothing moves on
// arrival.

import { ChatCircleText, MagnifyingGlass } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { MascotMood } from "../home/mascot-scene";
import { useReducedMotion } from "../architecture-prototype/motion";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { lasting, listed } from "../backup-prototype/model";
import { ago, clock, countWord, when } from "../stack-prototype/stack-model";
import type { SignalDirectionProps } from "./index";
import {
  CAP,
  toneOf,
  type Look,
  type SignalStory,
  type Unwatched,
} from "./signal-model";
import "./scope.css";

const PAD = 24;
const C = 500;
/** Just outside Little Server. */
const R0 = 104;
/** A week old. */
const RW = 392;
/** Never: the middle of the hatched rim. */
const RIM = 424;
const OUT = 456;
const WEEK = 7 * 86_400_000;
const rings = [
  { label: "1 hour", ms: 3_600_000 },
  { label: "1 day", ms: 86_400_000 },
  { label: "1 week", ms: WEEK },
];

/** Minutes sit near the centre and a week near the rim, on a log scale. */
const radiusOf = (ms: number) =>
  R0 +
  (RW - R0) *
    Math.min(
      1,
      Math.log1p(Math.max(0, ms) / 60_000) / Math.log1p(WEEK / 60_000),
    );
const polar = (r: number, deg: number) => ({
  x: C + r * Math.cos((deg * Math.PI) / 180),
  y: C + r * Math.sin((deg * Math.PI) / 180),
});
const pct = (value: number) => `${((value + PAD) / (1000 + 2 * PAD)) * 100}%`;
function arc(r: number, from: number, to: number) {
  const a = polar(r, from);
  const b = polar(r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}
const stamp = (at: string | null) =>
  at
    ? new Date(at).toLocaleTimeString(undefined, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
      })
    : "";
const whereWords: Record<Look["where"], string> = {
  outside: "From outside the server, as a visitor would",
  inside: "Inside the server, on its private network",
  host: "On the server",
  "off-server": "Off the server",
};
const resultWord: Record<Look["state"], string> = {
  passing: "Passed",
  failing: "Failed",
  unknown: "No result",
  seen: "Read",
};

// ---------- The scope itself, shared by both pages ----------

function Scope({
  sectors,
  watching,
  mood,
  now,
  caption,
  svg,
  children,
  onPointerMove,
  onPointerLeave,
  onClick,
}: {
  sectors: { id: string; label: string; alert?: boolean }[];
  watching: boolean;
  mood: MascotMood;
  now: number;
  caption: string;
  svg?: ReactNode;
  children?: ReactNode;
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: () => void;
  onClick?: () => void;
}) {
  const step = 360 / Math.max(1, sectors.length);
  const trail = polar(OUT, -90 - 34);
  const tip = polar(OUT, -90);
  return (
    <div
      className="axsc-scope"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <svg
        className="axsc-svg"
        viewBox={`${-PAD} ${-PAD} ${1000 + 2 * PAD} ${1000 + 2 * PAD}`}
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="axsc-hatch"
            width="11"
            height="11"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="11" height="11" className="axsc-hatch-ground" />
            <line x1="0" y1="0" x2="0" y2="11" className="axsc-hatch-line" />
          </pattern>
        </defs>
        <circle
          className="axsc-rim"
          cx={C}
          cy={C}
          r={(RW + OUT) / 2}
          strokeWidth={OUT - RW}
        />
        <circle className="axsc-old" cx={C} cy={C} r={RW} />
        <circle className="axsc-fresh" cx={C} cy={C} r={radiusOf(86_400_000)} />
        {rings.map((ring) => (
          <circle
            key={ring.label}
            className="axsc-ring"
            cx={C}
            cy={C}
            r={radiusOf(ring.ms)}
          />
        ))}
        <circle className="axsc-ring" cx={C} cy={C} r={OUT} />
        {sectors.length > 1 &&
          sectors.map((sector, index) => {
            const a = polar(R0, -90 + index * step);
            const b = polar(OUT, -90 + index * step);
            return (
              <line
                key={sector.id}
                className="axsc-spoke"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
              />
            );
          })}
        {sectors.map((sector, index) => {
          const mid = -90 + (index + 0.5) * step;
          const p = polar(OUT + 30, mid);
          const cos = Math.cos((mid * Math.PI) / 180);
          return (
            <text
              key={sector.id}
              className="axsc-sector"
              data-alert={sector.alert || undefined}
              x={p.x}
              y={p.y}
              textAnchor={cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle"}
              dominantBaseline="middle"
            >
              {sector.label}
            </text>
          );
        })}
        {rings.map((ring) => (
          <text
            key={ring.label}
            className="axsc-ring-label"
            x={C + 12}
            y={C - radiusOf(ring.ms) + 24}
          >
            {ring.label}
          </text>
        ))}
        <text className="axsc-ring-label" x={C + 12} y={C - RIM + 8}>
          never
        </text>
        {watching ? (
          <g className="axsc-sweep">
            <path
              className="axsc-wedge"
              d={`M ${C} ${C} L ${trail.x} ${trail.y} A ${OUT} ${OUT} 0 0 1 ${tip.x} ${tip.y} Z`}
            />
            <line x1={C} y1={C - R0} x2={C} y2={C - OUT} />
          </g>
        ) : (
          <g className="axsc-parked">
            <line x1={C} y1={C - R0} x2={C} y2={C - OUT} />
            <circle cx={C} cy={C - OUT} r={7} />
          </g>
        )}
        {svg}
      </svg>
      <div className="axsc-center">
        <LittleServer mood={mood} className="axsc-guy" />
        <small>Now · {clock(new Date(now).toISOString())}</small>
      </div>
      {children}
      <p className="axsc-caption" data-watching={watching || undefined}>
        {caption}
      </p>
    </div>
  );
}

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
    <div className="axsc-lede">
      <div>
        <h2 className="axsc-say">{say}</h2>
        <p className="axsc-sure">
          <Tag tone={tone}>{word}</Tag>
          <span>{sub}</span>
        </p>
      </div>
      <button
        type="button"
        className="ax-button axsc-ask"
        onClick={() => onAsk(ask.draft)}
      >
        <ChatCircleText weight="bold" />
        {ask.label}
      </button>
    </div>
  );
}

// ---------- Monitoring: every look, placed by its age ----------

interface Mark {
  id: string;
  part: string;
  look: Look | null;
  gap: Unwatched | null;
  deg: number;
  x: number;
  y: number;
}

function askFor(mark: Mark, story: SignalStory) {
  const { look, gap } = mark;
  if (look?.kind === "output")
    return `Read the latest output from ${look.part} and tell me whether anything looks wrong.`;
  if (look?.kind === "backup")
    return `Check that the newest backup copy of ${story.name} is still there and readable.`;
  if (look)
    return `Check "${look.name}" on ${story.name} now and tell me what you find.`;
  if (gap?.id === "notify")
    return `How could I hear about problems with ${story.name} outside the app?`;
  if (gap?.part === "Server")
    return `Measure ${story.name}'s server: its CPU, memory and disk.`;
  return `Add a check for ${gap?.part ?? story.name} to the deployment.`;
}

function ScopeWatch({
  story,
  now,
  head,
  activity,
  onAsk,
}: SignalDirectionProps) {
  const reduced = useReducedMotion();
  const failing = story.looks.find((look) => look.state === "failing") ?? null;
  const watching = story.watcher?.state === "running";
  const newestCheck = story.looks
    .filter((look) => look.kind === "check" && look.at)
    .toSorted((a, b) => b.at!.localeCompare(a.at!))[0];
  const [selected, setSelected] = useState(
    failing?.id ?? newestCheck?.id ?? story.looks[0]?.id ?? "",
  );
  const [hot, setHot] = useState<string | null>(null);
  const step = 360 / Math.max(1, story.parts.length);

  const marks: Mark[] = story.parts.flatMap((part, index) => {
    const items: (Look | Unwatched)[] = [
      ...story.looks.filter((look) => look.part === part),
      ...story.unwatched.filter((gap) => gap.part === part),
    ];
    return items.map((item, k) => {
      const deg = -90 + index * step + (step * (k + 1)) / (items.length + 1);
      const look = "kind" in item ? item : null;
      const r = look?.at ? radiusOf(now - Date.parse(look.at)) : RIM;
      return {
        id: item.id,
        part,
        look,
        gap: look ? null : (item as Unwatched),
        deg,
        ...polar(r, deg),
      };
    });
  });
  const toneOfMark = (mark: Mark) =>
    mark.gap
      ? "ghost"
      : mark.look!.state === "failing"
        ? "failed"
        : mark.look!.state === "unknown"
          ? "planned"
          : toneOf(mark.look!.at, now);
  const point = (id: string) => ({
    onPointerEnter: () => setHot(id),
    onPointerLeave: () => setHot(null),
    onFocus: () => setHot(id),
    onBlur: () => setHot(null),
  });

  const lit = marks.find((mark) => mark.id === hot);
  const from = lit ? polar(R0, lit.deg) : null;
  const ping = lit && from && (
    <g key={lit.id} className="axsc-ping" data-still={reduced || undefined}>
      <line x1={from.x} y1={from.y} x2={lit.x} y2={lit.y} pathLength={1} />
      <circle cx={lit.x} cy={lit.y} r={22} />
    </g>
  );

  // ---------- What it says ----------
  const health = story.unwatched.find((gap) => gap.id === "watch");
  const passedThen = story.looks.filter(
    (look) =>
      look.kind === "check" && look.state === "passing" && !look.invented,
  ).length;
  const lede = failing
    ? {
        say: `${failing.name} is failing.`,
        tone: "failed" as Tone,
        word: `Failing · ${ago(failing.at!, now)}`,
        sub: `${failing.detail}. ${story.watcher?.detail ?? ""}.`,
        ask: {
          label: "Ask Server Guy to look into it",
          draft: `${failing.name} is failing: ${failing.detail}. Find out why and tell me what you would change.`,
        },
      }
    : story.lastCheckAt
      ? {
          say: watching
            ? `Every check on ${story.name} is passing.`
            : `Nothing has checked ${story.name} since ${when(story.lastCheckAt)}.`,
          tone: toneOf(story.lastCheckAt, now),
          word: `Last checked ${ago(story.lastCheckAt, now)}`,
          sub: watching
            ? `${story.watcher?.detail}.`
            : `${countWord(passedThen)} ${passedThen === 1 ? "check" : "checks"} passed then, when it was deployed. Nothing watches between deployments, so every mark here only drifts outward.`,
          ask: {
            label: "Ask Server Guy to set up a health watch",
            draft: `Set up a health watch for ${story.name}: check each process every minute, restart one that stops, and tell me when something fails.`,
          },
        }
      : {
          say: `Nothing has checked ${story.name} yet.`,
          tone: "planned" as Tone,
          word: "No checks on record",
          sub: "The deployment recorded no check that looked at it.",
          ask: {
            label: "Ask Server Guy to add checks",
            draft: `Add health checks for each of ${story.name}'s processes to its deployment.`,
          },
        };

  const partWords = (part: string) => {
    const seen = story.looks
      .filter((look) => look.part === part && look.at)
      .map((look) => look.at!)
      .sort();
    if (!seen.length)
      return story.unwatched.some((gap) => gap.part === part)
        ? "Nothing watches it"
        : "";
    return `${seen.length} ${seen.length === 1 ? "look" : "looks"} · newest ${ago(seen.at(-1)!, now)}`;
  };

  return (
    <section className="axsc" aria-label="Monitoring">
      {head}
      {activity}
      <Lede {...lede} onAsk={onAsk} />
      <div className="axsc-board">
        <div className="axsc-left">
          <Scope
            sectors={story.parts.map((part) => ({
              id: part,
              label: part,
              alert: story.looks.some(
                (look) => look.part === part && look.state === "failing",
              ),
            }))}
            watching={watching}
            mood={
              failing
                ? "attention"
                : watching
                  ? "checking"
                  : toneOf(story.lastCheckAt, now) === "verified"
                    ? "ready"
                    : "resting"
            }
            now={now}
            caption={
              watching
                ? "Sweeping · a collector on the host looks every minute (invented)"
                : "Parked · nothing watches between deployments"
            }
            svg={ping}
          >
            {marks.map((mark) => {
              const tone = toneOfMark(mark);
              const name = mark.look?.name ?? mark.gap!.title;
              return (
                <button
                  key={mark.id}
                  type="button"
                  className="axsc-mark"
                  data-tone={tone}
                  data-kind={mark.look?.kind ?? "gap"}
                  data-side={mark.x >= C ? "right" : "left"}
                  data-hot={hot === mark.id || undefined}
                  aria-pressed={selected === mark.id}
                  aria-label={
                    mark.look
                      ? `${name}: ${resultWord[mark.look.state].toLowerCase()} ${mark.look.at ? ago(mark.look.at, now) : "never"}`
                      : `${name}: not watched`
                  }
                  style={{ left: pct(mark.x), top: pct(mark.y) }}
                  onClick={() => setSelected(mark.id)}
                  {...point(mark.id)}
                >
                  <i aria-hidden="true" />
                  <span>{mark.look?.short ?? mark.gap!.short}</span>
                </button>
              );
            })}
          </Scope>
          <ul className="axsc-legend">
            <li>
              <i data-tone="verified" />
              Checked within a day
            </li>
            <li>
              <i data-tone="stale" />
              Checked longer ago
            </li>
            <li>
              <i data-kind="output" />
              Output read
            </li>
            <li>
              <i data-tone="ghost" />
              Nothing watches it
            </li>
            {failing && (
              <li>
                <i data-tone="failed" />
                Failing
              </li>
            )}
          </ul>
        </div>

        <div className="axsc-roster">
          <div className="axsc-watch" data-watching={watching || undefined}>
            <b>{watching ? "Watching" : "Not watching"}</b>
            <span>
              {watching
                ? `${story.watcher?.detail}; it last looked ${story.watcher?.lastObservationAt ? ago(story.watcher.lastObservationAt, now) : "recently"}.`
                : (health?.detail ??
                  "Nothing watches the application between deployments.")}
            </span>
          </div>
          {story.parts.map((part) => (
            <section key={part} className="axsc-part">
              <h3>
                {part}
                <small>{partWords(part)}</small>
              </h3>
              <ul>
                {marks
                  .filter((mark) => mark.part === part)
                  .map((mark) => {
                    const { look, gap } = mark;
                    const open = selected === mark.id;
                    return (
                      <li key={mark.id}>
                        <button
                          type="button"
                          className="axsc-row"
                          data-tone={toneOfMark(mark)}
                          data-kind={look?.kind ?? "gap"}
                          data-hot={hot === mark.id || undefined}
                          aria-expanded={open}
                          onClick={() => setSelected(open ? "" : mark.id)}
                          {...point(mark.id)}
                        >
                          <i aria-hidden="true" />
                          <b>{look?.name ?? gap!.title}</b>
                          <small>
                            {look
                              ? `${resultWord[look.state]} ${look.at ? ago(look.at, now) : "never"}${look.invented ? " · invented" : ""}`
                              : "Not watched"}
                          </small>
                        </button>
                        {open && (
                          <div className="axsc-open">
                            {look ? (
                              <>
                                <dl>
                                  <div>
                                    <dt>How</dt>
                                    <dd className="ax-mono">{look.how}</dd>
                                  </div>
                                  <div>
                                    <dt>From</dt>
                                    <dd>{whereWords[look.where]}</dd>
                                  </div>
                                  <div>
                                    <dt>Last</dt>
                                    <dd>
                                      {look.at
                                        ? `${resultWord[look.state]} ${when(look.at)}`
                                        : "Never"}
                                    </dd>
                                  </div>
                                  {look.detail && (
                                    <div>
                                      <dt>Result</dt>
                                      <dd>{look.detail}</dd>
                                    </div>
                                  )}
                                </dl>
                                {look.evidence.length > 0 && (
                                  <div className="axsc-evidence" role="log">
                                    {look.evidence.map((item, index) => (
                                      <div key={index}>
                                        <time>{when(item.at)}</time>
                                        <span>{item.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <p className="axsc-note">
                                  {look.invented
                                    ? "The collector looks again every minute (invented)."
                                    : look.at
                                      ? `Nothing has looked again since: ${lasting(now - Date.parse(look.at))}.`
                                      : "Nothing has looked at it."}
                                </p>
                              </>
                            ) : (
                              <p className="axsc-note">{gap!.detail}</p>
                            )}
                            <button
                              type="button"
                              className="axsc-ask-small"
                              onClick={() => onAsk(askFor(mark, story))}
                            >
                              <ChatCircleText weight="bold" />
                              Ask in the conversation
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Logs: each process's lines strung around the ring ----------

function ScopeLogs({
  story,
  now,
  head,
  activity,
  onAsk,
}: SignalDirectionProps) {
  const reduced = useReducedMotion();
  const reader = useRef<HTMLDivElement>(null);
  const [readId, setReadId] = useState(story.collections[0].id);
  const [who, setWho] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hot, setHot] = useState<{
    id: string;
    from: "scope" | "reader";
  } | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [entered, setEntered] = useState<string | null>(null);
  const read =
    story.collections.find((item) => item.id === readId) ??
    story.collections[0];
  const speakers = read.speakers;
  const failing = story.looks.find((look) => look.state === "failing") ?? null;

  // Each line's place on its process's string, in the order it was written.
  const step = 360 / Math.max(1, speakers.length);
  const r = radiusOf(now - Date.parse(read.at));
  const gap = speakers.length > 1 ? Math.min(12, step * 0.12) : 1;
  const placed = speakers.flatMap((speaker, index) => {
    const lines = read.lines.filter((line) => line.service === speaker.service);
    const torn = speaker.cut ? 7 : 0;
    const start = -90 + index * step + gap + torn;
    const span = step - 2 * gap - torn;
    return lines.map((line, k) => ({
      line,
      speaker: speaker.service,
      deg: start + (span * (k + 0.5)) / lines.length,
    }));
  });
  const shown = read.lines.filter(
    (line) =>
      (!who || line.service === who) &&
      line.raw.toLowerCase().includes(query.toLowerCase()),
  );
  const visible = new Set(shown.map((line) => line.id));
  const beamId = hot?.id ?? pinned;
  const beam = placed.find((item) => item.line.id === beamId);

  // Keep the line being pointed at on the scope in view in the reader.
  useEffect(() => {
    if (!hot || hot.from !== "scope") return;
    const box = reader.current;
    const row = box?.querySelector<HTMLElement>(`[data-line="${hot.id}"]`);
    if (!box || !row) return;
    box.scrollTo({
      top: row.offsetTop - box.clientHeight / 2 + row.offsetHeight / 2,
    });
  }, [hot]);

  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const scale = (1000 + 2 * PAD) / box.width;
    const x = (event.clientX - box.left) * scale - PAD;
    const y = (event.clientY - box.top) * scale - PAD;
    if (Math.abs(Math.hypot(x - C, y - C) - r) > 64) {
      if (hot?.from === "scope") setHot(null);
      setEntered(null);
      return;
    }
    const deg = (Math.atan2(y - C, x - C) * 180) / Math.PI;
    let best: (typeof placed)[number] | null = null;
    let nearest = Infinity;
    for (const item of placed) {
      const apart = Math.abs(((deg - item.deg + 540) % 360) - 180);
      if (apart < nearest) {
        nearest = apart;
        best = item;
      }
    }
    if (!best || nearest > gap + 4) return;
    if (hot?.id !== best.line.id) setHot({ id: best.line.id, from: "scope" });
    if (entered !== best.speaker) setEntered(best.speaker);
  };

  const strings = speakers.map((speaker, index) => {
    const own = placed.filter((item) => item.speaker === speaker.service);
    const at = Math.max(
      0,
      own.findIndex((item) => item.line.id === beamId),
    );
    const move = (to: number) => {
      const next = own[Math.min(own.length - 1, Math.max(0, to))];
      if (!next) return;
      setHot({ id: next.line.id, from: "scope" });
      setPinned(next.line.id);
    };
    const start = -90 + index * step + gap;
    return (
      <g
        key={speaker.service}
        className="axsc-string"
        role="slider"
        tabIndex={0}
        aria-label={`${speaker.name}'s output, ${own.length} lines`}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, own.length)}
        aria-valuenow={at + 1}
        aria-valuetext={own[at]?.line.text ?? ""}
        onFocus={() => {
          setEntered(speaker.service);
          if (!own.some((item) => item.line.id === beamId)) move(0);
        }}
        onKeyDown={(event) => {
          const keys: Record<string, number> = {
            ArrowRight: at + 1,
            ArrowDown: at + 1,
            ArrowLeft: at - 1,
            ArrowUp: at - 1,
            Home: 0,
            End: own.length - 1,
          };
          if (!(event.key in keys)) return;
          event.preventDefault();
          move(keys[event.key]);
        }}
      >
        {speaker.cut && (
          <path className="axsc-torn" d={arc(r, start, start + 6)} />
        )}
        {own.length > 1 && (
          <path
            className="axsc-thread"
            d={arc(r, own[0].deg, own.at(-1)!.deg)}
          />
        )}
        {own.map((item) => {
          const p = polar(r, item.deg);
          const { line } = item;
          return (
            <circle
              key={line.id}
              cx={p.x}
              cy={p.y}
              r={
                line.milestone
                  ? 10
                  : line.level === "warn" || line.level === "error"
                    ? 8
                    : 5
              }
              data-level={line.level}
              data-milestone={line.milestone || undefined}
              data-dim={!visible.has(line.id) || undefined}
              data-hot={line.id === beamId || undefined}
            />
          );
        })}
      </g>
    );
  });
  const from = beam ? polar(R0, beam.deg) : null;
  const to = beam ? polar(r, beam.deg) : null;
  const svg = (
    <>
      {entered && !reduced && (
        <circle
          key={entered}
          className="axsc-wave"
          cx={C}
          cy={C}
          r={r}
          aria-hidden="true"
        />
      )}
      {strings}
      {from && to && (
        <line
          className="axsc-beam"
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
        />
      )}
    </>
  );

  // ---------- What it says ----------
  const warns = speakers.reduce((sum, speaker) => sum + speaker.warns, 0);
  const errors = speakers.reduce((sum, speaker) => sum + speaker.errors, 0);
  const holds = speakers.map((speaker) =>
    speaker.cut
      ? `${speaker.name}'s last ${CAP} lines (earlier ones weren't read)`
      : `all ${speaker.lines} of ${speaker.name}'s`,
  );
  const newest = story.collections[0];
  const lede = {
    say: `The newest output on record was read ${when(newest.at)}.`,
    tone: failing ? ("failed" as Tone) : toneOf(newest.at, now),
    word: `Read ${ago(newest.at, now)}`,
    sub: [
      failing &&
        `${failing.name} is failing now (invented); this output was read before that.`,
      `It holds ${listed(holds)}: ${warns ? `${warns} ${warns === 1 ? "warning" : "warnings"}` : "no warnings"}, ${errors ? `${errors} ${errors === 1 ? "error" : "errors"}` : "no errors"}. Nothing reads output between requests.`,
    ]
      .filter(Boolean)
      .join(" "),
    ask: {
      label: "Ask Server Guy to read the latest output",
      draft: `Read the latest logs from each of ${story.name}'s processes and tell me whether anything looks wrong.`,
    },
  };
  const cut = speakers.filter((speaker) => speaker.cut);

  return (
    <section className="axsc" aria-label="Logs">
      {head}
      {activity}
      <Lede {...lede} onAsk={onAsk} />
      <div className="axsc-board">
        <div className="axsc-left">
          <Scope
            sectors={speakers.map((speaker) => ({
              id: speaker.service,
              label: speaker.name,
              alert: speaker.errors > 0,
            }))}
            watching={false}
            mood={
              failing
                ? "attention"
                : toneOf(newest.at, now) === "verified"
                  ? "ready"
                  : "resting"
            }
            now={now}
            caption="Parked · output is read only when someone asks"
            svg={svg}
            onPointerMove={scrub}
            onPointerLeave={() => {
              if (hot?.from === "scope") setHot(null);
              setEntered(null);
            }}
            onClick={() => hot?.from === "scope" && setPinned(hot.id)}
          />
          <ul className="axsc-legend">
            <li>
              <i data-level="info" />A line
            </li>
            <li>
              <i data-level="milestone" />
              Ready or listening
            </li>
            <li>
              <i data-level="warn" />
              Warning
            </li>
            <li>
              <i data-level="error" />
              Error
            </li>
            <li className="axsc-legend-note">
              Point along a string to read it; the ring is how long ago it was
              read.
            </li>
          </ul>
        </div>

        <div className="axsc-reader">
          <header>
            {story.collections.length > 1 && (
              <div className="axsc-reads" role="radiogroup" aria-label="Read">
                {story.collections.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={item.id === read.id}
                    onClick={() => {
                      setReadId(item.id);
                      setPinned(null);
                    }}
                  >
                    {index === 0 ? "Newest read" : "Earlier read"}
                    <small>{clock(item.at)}</small>
                  </button>
                ))}
              </div>
            )}
            <div className="axsc-who">
              <button
                type="button"
                aria-pressed={who === null}
                onClick={() => setWho(null)}
              >
                All
                <small>{read.lines.length}</small>
              </button>
              {speakers.map((speaker, index) => (
                <button
                  key={speaker.service}
                  type="button"
                  data-who={index}
                  aria-pressed={who === speaker.service}
                  onClick={() =>
                    setWho(who === speaker.service ? null : speaker.service)
                  }
                >
                  {speaker.name}
                  <small>{speaker.lines}</small>
                </button>
              ))}
            </div>
            <label className="axsc-filter">
              <MagnifyingGlass aria-hidden="true" />
              <input
                aria-label="Filter log lines"
                placeholder="Filter collected logs…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </header>
          <p className="axsc-cut">
            Read {when(read.at)}, the last {CAP} lines of each process
            {cut.length
              ? `: ${listed(cut.map((speaker) => speaker.name))} had written more, so ${cut.length === 1 ? "its" : "their"} earlier lines weren't read.`
              : "; every process had written fewer, so this is all of it."}
          </p>
          <div
            ref={reader}
            className="axsc-lines"
            role="log"
            aria-label="Collected application logs"
            tabIndex={0}
          >
            {shown.length ? (
              shown.map((line) => (
                <div
                  key={line.id}
                  className="axsc-line"
                  data-line={line.id}
                  data-level={line.level}
                  data-milestone={line.milestone || undefined}
                  data-hot={line.id === beamId || undefined}
                  onPointerEnter={() => setHot({ id: line.id, from: "reader" })}
                  onPointerLeave={() => setHot(null)}
                  onClick={() => setPinned(line.id)}
                >
                  <time>{stamp(line.at)}</time>
                  <b
                    data-who={speakers.findIndex(
                      (speaker) => speaker.service === line.service,
                    )}
                  >
                    {line.speaker}
                  </b>
                  <span>
                    {line.text}
                    {line.rest && <small> {line.rest}</small>}
                  </span>
                </div>
              ))
            ) : (
              <p className="axsc-empty">No lines match your filter.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ScopeDirection(props: SignalDirectionProps) {
  return props.page === "logs" ? (
    <ScopeLogs {...props} />
  ) : (
    <ScopeWatch {...props} />
  );
}
