"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Monitoring.
// Tuner: an old radio's glass dial. Each part of the application is a
// station, and its signal bars say how recently anything heard from it:
// strong for minutes, faint for a week, none for never. Tune by clicking a
// station, dragging the needle or with the arrow keys; between stations
// there is only static. The tuned station reads what was heard from it and
// when, then the silence since. The lamp lights only while something
// listens. Nothing moves on arrival.

import { ChatCircleText } from "@phosphor-icons/react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { useReducedMotion } from "../architecture-prototype/motion";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { lasting } from "../backup-prototype/model";
import { ago, countWord, when } from "../stack-prototype/stack-model";
import type { TunerProps } from "./signal-story";
import { toneOf, type Look } from "./signal-model";
import "./tuner.css";

interface Station {
  id: string;
  name: string;
  sub: string;
  /** The newest thing heard from it. */
  at: string | null;
  state: "fresh" | "stale" | "failing" | "live" | "static";
}

/** Where a station sits on the dial, in percent. */
const placeOf = (index: number, count: number) =>
  count === 1 ? 50 : 8 + (84 * index) / (count - 1);
/** How close the needle must come to a station to tune it. */
const lockOf = (count: number) => (count > 1 ? (84 / (count - 1)) * 0.3 : 30);
const barsOf = (at: string | null, now: number) => {
  if (!at) return 0;
  const hours = (now - Date.parse(at)) / 3_600_000;
  return hours < 1 ? 5 : hours < 6 ? 4 : hours < 24 ? 3 : hours < 72 ? 2 : 1;
};
const signalWords = ["No signal", "Faint", "Weak", "Fair", "Good", "Strong"];
const resultWord: Record<Look["state"], string> = {
  passing: "Passed",
  failing: "Failed",
  unknown: "No result",
  seen: "Read",
};

function Radio({
  stations,
  tuned,
  onTune,
  drag,
  onDrag,
  now,
  mood,
  live,
  note,
}: {
  stations: Station[];
  tuned: number;
  onTune: (index: number) => void;
  drag: number | null;
  onDrag: (value: number | null) => void;
  now: number;
  mood: MascotMood;
  live: boolean;
  note: string;
}) {
  const glass = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const count = stations.length;
  const nearest = (value: number) =>
    stations.reduce(
      (best, _station, index) => {
        const distance = Math.abs(placeOf(index, count) - value);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Infinity },
    );
  const valueAt = (clientX: number) => {
    const box = glass.current!.getBoundingClientRect();
    return Math.min(97, Math.max(3, ((clientX - box.left) / box.width) * 100));
  };
  // Dragging the needle tunes whatever it passes close to, and lets go on
  // the nearest station.
  const grab = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    onDrag(valueAt(event.clientX));
    const move = (next: globalThis.PointerEvent) => {
      const value = valueAt(next.clientX);
      onDrag(value);
      const near = nearest(value);
      if (near.distance < lockOf(count)) onTune(near.index);
    };
    const up = (last: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onTune(nearest(valueAt(last.clientX)).index);
      onDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="axtu-radio">
      <div className="axtu-face">
        <LittleServer mood={mood} className="axtu-guy" />
        <span className="axtu-lamp" data-on={live || undefined}>
          <i aria-hidden="true" />
          {live ? "Listening" : "Not listening"}
        </span>
        <small>{note}</small>
      </div>
      <div
        ref={glass}
        className="axtu-glass"
        role="radiogroup"
        aria-label="Stations"
        onKeyDown={(event) => {
          const next = {
            ArrowRight: tuned + 1,
            ArrowDown: tuned + 1,
            ArrowLeft: tuned - 1,
            ArrowUp: tuned - 1,
            Home: 0,
            End: count - 1,
          }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          const index = Math.min(count - 1, Math.max(0, next));
          onTune(index);
          glass.current
            ?.querySelectorAll<HTMLElement>("[role='radio']")
            [index]?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget)
            onTune(nearest(valueAt(event.clientX)).index);
        }}
      >
        <span className="axtu-ticks" aria-hidden="true" />
        {stations.map((station, index) => {
          const bars = barsOf(station.at, now);
          return (
            <button
              key={station.id}
              type="button"
              role="radio"
              aria-checked={index === tuned}
              tabIndex={index === tuned ? 0 : -1}
              className="axtu-station"
              data-state={station.state}
              style={{ left: `${placeOf(index, count)}%` }}
              onClick={() => onTune(index)}
            >
              <b>{station.name}</b>
              <span className="axtu-bars" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((n) => (
                  <i key={n} data-on={n <= bars || undefined} />
                ))}
              </span>
              <small>
                {station.state === "failing" ? "Failing" : signalWords[bars]}
              </small>
            </button>
          );
        })}
        <span
          className="axtu-needle"
          data-still={drag !== null || reduced || undefined}
          style={{ left: `${drag ?? placeOf(tuned, count)}%` }}
          onPointerDown={grab}
          aria-hidden="true"
        >
          <i />
        </span>
      </div>
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
    <div className="axtu-lede">
      <div>
        <h2 className="axtu-say">{say}</h2>
        <p className="axtu-sure">
          <Tag tone={tone}>{word}</Tag>
          <span>{sub}</span>
        </p>
      </div>
      <button
        type="button"
        className="ax-button axtu-ask"
        onClick={() => onAsk(ask.draft)}
      >
        <ChatCircleText weight="bold" />
        {ask.label}
      </button>
    </div>
  );
}

/** Static covers the transcript while the needle is between stations. */
function Transcript({
  between,
  fade,
  children,
  label,
}: {
  between: boolean;
  fade: string | null;
  children: ReactNode;
  label: string;
}) {
  return (
    <article className="axtu-transcript" aria-label={label}>
      <div
        key={fade ?? "first"}
        className="axtu-tuned"
        data-fade={fade ? "" : undefined}
      >
        {children}
      </div>
      {between && (
        <div className="axtu-static" aria-hidden="true">
          <span>Between stations</span>
        </div>
      )}
    </article>
  );
}

export function TunerDirection({
  story,
  now,
  head,
  activity,
  onAsk,
}: TunerProps) {
  const failing = story.looks.find((look) => look.state === "failing") ?? null;
  const watching = story.watcher?.state === "running";
  const roles = new Map(
    story.processes.map((item) => [item.product, item.roleWords]),
  );
  const subOf = (part: string) =>
    roles.get(part) ??
    (
      {
        Backups: "Copies of the data, off the server",
        Server: "The machine everything runs on",
        You: "How you would hear about a problem",
      } as Record<string, string>
    )[part] ??
    "";
  const stations: Station[] = story.parts.map((part) => {
    const looks = story.looks.filter((look) => look.part === part && look.at);
    const at =
      looks
        .map((look) => look.at!)
        .sort()
        .at(-1) ?? null;
    return {
      id: part,
      name: part,
      sub: subOf(part),
      at,
      state: looks.some((look) => look.state === "failing")
        ? "failing"
        : looks.some((look) => look.invented)
          ? "live"
          : !at
            ? "static"
            : toneOf(at, now) === "verified"
              ? "fresh"
              : "stale",
    };
  });
  const [tuned, setTuned] = useState(
    Math.max(
      0,
      stations.findIndex((station) => station.state === "failing"),
    ),
  );
  const [drag, setDrag] = useState<number | null>(null);
  const [fade, setFade] = useState<string | null>(null);
  const station = stations[tuned];
  const between =
    drag !== null &&
    Math.abs(placeOf(tuned, stations.length) - drag) >= lockOf(stations.length);
  const tune = (index: number) => {
    setTuned(index);
    setFade(stations[index].id);
  };

  // Everything the record heard from the tuned part, oldest first.
  const looks = story.looks.filter((look) => look.part === station.id);
  const heard = looks
    .flatMap((look) =>
      (look.evidence.length
        ? look.evidence
        : look.at
          ? [{ at: look.at, text: look.how }]
          : []
      ).map((item) => ({ ...item, look })),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const last = heard.at(-1)?.at ?? null;
  const gaps = story.unwatched.filter((gap) => gap.part === station.id);
  const health = story.unwatched.find((gap) => gap.id === "watch");
  const stationAsk =
    station.state === "failing" && failing
      ? `${failing.name} is failing: ${failing.detail}. Find out why and tell me what you would change.`
      : station.id === "Server"
        ? `Measure ${story.name}'s server: its CPU, memory and disk.`
        : station.id === "You"
          ? `How could I hear about problems with ${story.name} outside the app?`
          : station.id === "Backups"
            ? `Check that the newest backup copy of ${story.name} is still there and readable.`
            : `Watch ${station.name} on ${story.name}: check it every minute and tell me when it fails.`;

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
    : {
        say: watching
          ? `Every check on ${story.name} is passing.`
          : `Nothing is listening to ${story.name}.`,
        tone: toneOf(story.lastCheckAt, now),
        word: story.lastCheckAt
          ? `Last heard ${ago(story.lastCheckAt, now)}`
          : "Never heard",
        sub: story.lastCheckAt
          ? `The last thing heard was at its deployment, ${when(story.lastCheckAt)}, when ${countWord(passedThen).toLowerCase()} ${passedThen === 1 ? "check" : "checks"} passed. Tune in to hear what each part said.`
          : "The deployment recorded no check that heard from it.",
        ask: {
          label: "Ask Server Guy to set up a health watch",
          draft: `Set up a health watch for ${story.name}: check each process every minute, restart one that stops, and tell me when something fails.`,
        },
      };

  return (
    <section className="axtu" aria-label="Monitoring">
      {head}
      {activity}
      <Lede {...lede} onAsk={onAsk} />
      <Radio
        stations={stations}
        tuned={tuned}
        onTune={tune}
        drag={drag}
        onDrag={setDrag}
        now={now}
        mood={
          failing
            ? "attention"
            : watching
              ? "checking"
              : toneOf(story.lastCheckAt, now) === "verified"
                ? "ready"
                : "resting"
        }
        live={watching}
        note={
          watching
            ? "A collector on the host listens every minute (invented)"
            : "Nothing listens between deployments"
        }
      />
      <Transcript
        between={between}
        fade={fade}
        label={`${station.name}: what was heard`}
      >
        <header className="axtu-head">
          <div>
            <h3>{station.name}</h3>
            <p>{station.sub}</p>
          </div>
          <Tag
            tone={
              station.state === "failing"
                ? "failed"
                : station.state === "static"
                  ? "planned"
                  : toneOf(station.at, now)
            }
          >
            {station.state === "failing"
              ? "Failing"
              : station.at
                ? `Last heard ${ago(station.at, now)}`
                : "No signal"}
          </Tag>
        </header>
        {heard.length > 0 && (
          <ol className="axtu-heard">
            {heard.map((item, index) => (
              <li key={index} data-state={item.look.state}>
                <time>{when(item.at)}</time>
                <div>
                  <b>
                    {item.look.short}
                    {item.look.invented ? " · invented" : ""}
                  </b>
                  <span>
                    {item.look.kind === "output" ? item.text : item.look.how}
                  </span>
                  {item.look.state === "failing" && item.look.detail && (
                    <small>{item.look.detail}</small>
                  )}
                </div>
                <em>{resultWord[item.look.state]}</em>
              </li>
            ))}
          </ol>
        )}
        {heard.length > 0 && (
          <p className="axtu-silence" data-live={watching || undefined}>
            {watching
              ? "Listening every minute (invented)."
              : `Silence since ${when(last!)}: ${lasting(now - Date.parse(last!))} with nothing listening.`}
          </p>
        )}
        {gaps.map((gap) => (
          <div key={gap.id} className="axtu-nosignal">
            <b>{gap.title}</b>
            <p>{gap.detail}</p>
          </div>
        ))}
        {!heard.length && !gaps.length && (
          <div className="axtu-nosignal">
            <b>No signal</b>
            <p>{health?.detail ?? "Nothing has heard from it."}</p>
          </div>
        )}
        <button
          type="button"
          className="axtu-ask-small"
          onClick={() => onAsk(stationAsk)}
        >
          <ChatCircleText weight="bold" />
          Ask in the conversation
        </button>
      </Transcript>
    </section>
  );
}
