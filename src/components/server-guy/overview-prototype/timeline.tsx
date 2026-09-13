"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction A, Timeline: how it is doing, told in time. Four lanes show when
// Server Guy last checked, copied, reached the server and read the
// firewall, what is scheduled next, and how long nothing has looked.
// Little Server stands at now; a re-check lands on the lanes as it happens.
// Its log folds underneath, linked to the lanes: point at a line and its
// moment lights up, point at a moment and its lines do. The log's label
// reads like an agent at work: while a check runs, its star steps through
// its rays and a light crosses the words; when something lands, it answers
// once. Rarely, at most once a visit, Little Server points at the label:
// once to introduce it, then only when he did something while you were away.

import {
  ArrowRight,
  CaretDown,
  ChatCircleText,
  X,
} from "@phosphor-icons/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { labelOf } from "../operation-model";
import { ago, type LogLine } from "../architecture-prototype/model";
import { reducedMotion } from "../architecture-prototype/motion";
import type { HeroProps } from "./hero";
import type { Overview, Vital } from "./overview-model";
import {
  NeedCard,
  span,
  useCountdown,
  useDismiss,
  VitalPop,
  vitalIcon,
  whenWords,
} from "./shared";
import {
  buildTimeline,
  laneOf,
  type Lane,
  type TimeEvent,
  type Timeline,
} from "./timeline-model";
import { Mascot, useServerGuy } from "./use-server-guy";
import "./timeline.css";

const HOUR = 3_600_000;
const WEEK = 7 * 86_400_000;
const glyph = { pass: "✓", fail: "✗", work: "›", info: "·" } as const;
// The four-point sparkle Little Server's checks burst into (motion.ts).
const STAR =
  "M5 0C5.5 3.3 6.7 4.5 10 5 6.7 5.5 5.5 6.7 5 10 4.5 6.7 3.3 5.5 0 5 3.3 4.5 4.5 3.3 5 0Z";

const clock = (at: number | string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function dayName(at: number, now: number) {
  const day = (value: number) => {
    const date = new Date(value);
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
  };
  const days = Math.round((day(at) - day(now)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  return new Date(at).toLocaleDateString(undefined, { weekday: "long" });
}

/** What the stretch since the last look is called, per lane. */
const since: Record<Lane["id"], string> = {
  checks: "No check for",
  backups: "No copy for",
  server: "Not reached for",
  access: "Not read for",
};

/** When the lane holds nothing at all, which is not a duration. */
const nothing: Record<Lane["id"], string> = {
  checks: "No check on record",
  backups: "Never looked",
  server: "Never reached",
  access: "Never read",
};

function subline(model: HeroProps["model"], overview: Overview) {
  if (model.status !== "live")
    return model.status === "none"
      ? "Ask Server Guy in the conversation to deploy it; this fills in as it runs."
      : "Nothing runs yet. Once you approve, Server Guy builds it, checks it and starts copying its data off the server.";
  if (overview.needs.length) return null;
  const app = model.byId.app;
  const host = model.byId.host;
  const server =
    host?.evidence.certainty === "verified"
      ? ` The server answered ${ago(host.evidence.at, model.now)}.`
      : "";
  // The application's own condition, when a record states it. Reading this
  // off the web part instead would let the page say "passed its checks" about
  // the process while nothing had been established about the application.
  if (model.condition.certainty === "unknown")
    return `Nothing on record says whether ${model.headline} is working.${server}`;
  if (model.condition.certainty === "failed")
    return `A check on ${model.headline} did not pass.${server}`;
  if (model.condition.certainty === "stale")
    return `${model.condition.text}${server}`;
  // Verified takes its words and its time from the same place as the verdict.
  // Reading the sentence off the web part while the verdict came from the
  // application's own condition let the page say "passed its checks 10 h ago"
  // about evidence gathered eight minutes earlier.
  if (model.condition.certainty === "verified")
    return `${model.condition.text}${server}`;
  if (app?.evidence.certainty === "stale" && app.evidence.at)
    return `${model.headline} hasn't been checked for ${span(model.now - Date.parse(app.evidence.at))}, so it may have changed.${server}`;
  return `${model.headline} passed its checks ${ago(app?.evidence.at, model.now)}.`;
}

/** What this browser remembers about the log, per application. */
interface LogMemory {
  /** When the newest recorded line had happened, last visit. */
  seen?: string;
  /** When Little Server last pointed at the log. */
  pointed?: number;
  /** When you last opened or folded the log yourself. */
  used?: number;
  open?: boolean;
}

function recall(appId: string): LogMemory | null {
  try {
    const stored = window.localStorage.getItem(`axt-log:${appId}`);
    return stored ? (JSON.parse(stored) as LogMemory) : null;
  } catch {
    return null;
  }
}

function remember(appId: string, patch: LogMemory) {
  try {
    window.localStorage.setItem(
      `axt-log:${appId}`,
      JSON.stringify({ ...recall(appId), ...patch }),
    );
  } catch {}
}

// What he says as he points, in one line: the arm is the arrow.
const INTRO = "I keep a log of my work, just below.";
function newsLine(fresh: LogLine[]) {
  if (fresh.length > 1)
    return `I did ${fresh.length} things while you were away.`;
  const text = fresh[0]?.text ?? "";
  if (text.startsWith("Nightly copy"))
    return "I made a copy while you were away.";
  if (text.startsWith("Restore test"))
    return "I tested a restore while you were away.";
  return "I did one thing while you were away.";
}

/** Wholly on screen, not just touching it. */
function onScreen(element: Element | null | undefined) {
  if (!element) return false;
  const box = element.getBoundingClientRect();
  return (
    box.top >= 0 &&
    box.left >= 0 &&
    box.bottom <= window.innerHeight &&
    box.right <= window.innerWidth
  );
}

function Spark({ tone }: { tone: "star" | "fail" | "ghost" }) {
  return (
    <svg
      className={`axt-spark is-${tone}`}
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      <path className="axt-spark-b" d={STAR} />
      <path className="axt-spark-a" d={STAR} />
      <circle className="axt-spark-dot" cx="5" cy="5" r="2.5" />
      <circle className="axt-spark-ring" cx="5" cy="5" r="3.2" />
    </svg>
  );
}

function EventPop({
  event,
  vital,
  now,
  onClose,
  onOpenDestination,
  onAsk,
}: {
  event: TimeEvent;
  vital: Vital;
  now: number;
  onClose: () => void;
  onOpenDestination: HeroProps["onOpenDestination"];
  onAsk: HeroProps["onAsk"];
}) {
  const future = event.at > now;
  return (
    <div className="axj2-pop axt-ev-pop" role="dialog" aria-label={event.title}>
      <header>
        <span className="axj2-icon" aria-hidden="true">
          {vitalIcon[vital.id]}
        </span>
        <div>
          <b>{event.title}</b>
          <small>
            {whenWords(event.at, now).replace(/^./, (c) => c.toUpperCase())}
            {future ? "" : ` · ${ago(new Date(event.at).toISOString(), now)}`}
          </small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X weight="bold" />
        </button>
      </header>
      <div className="axt-console" role="log">
        {event.lines.map((line) => (
          <div key={line.id} className="axt-console-line" data-tone={line.tone}>
            <time>{clock(line.at)}</time>
            <b aria-hidden="true">{glyph[line.tone]}</b>
            <span>
              {line.text}
              {line.invented && (
                <em>
                  {line.id.startsWith("live:") ? "simulated" : "invented"}
                </em>
              )}
            </span>
          </div>
        ))}
      </div>
      <footer>
        <button
          type="button"
          className="ax-textlink"
          onClick={() => onOpenDestination(vital.destination)}
        >
          Open {labelOf(vital.destination)}
          <ArrowRight weight="bold" />
        </button>
        <button
          type="button"
          className="ax-textlink"
          onClick={() => onAsk(vital.ask)}
        >
          <ChatCircleText weight="bold" />
          Ask in the conversation
        </button>
      </footer>
    </div>
  );
}

export function TimelineHero({
  model,
  record,
  overview,
  recheck,
  offset,
  pointed,
  onPoint,
  onShow,
  onAsk,
  onOpenDestination,
  timeline: given,
}: HeroProps & { timeline?: Timeline }) {
  const [guy, mascot] = useServerGuy(model, recheck, { narrate: true });
  const appId = record.application.id;
  const fallback = useMemo(
    () =>
      buildTimeline({ model, record, live: guy.live, marks: recheck.marks }),
    [model, record, guy.live, recheck.marks],
  );
  const timeline = given ?? fallback;
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(Boolean(open), ".axt-pop, .axt-ev, .axt-lane-name", close);
  const toggle = (id: string) =>
    setOpen((current) => (current === id ? null : id));
  // This visit, read once from what the browser remembers of the last: how
  // the log was left, and when you last looked, so what landed since stays
  // new all visit. The hero only renders on the client, once the model
  // exists. ?looked=20h and ?looked=never stand in for a visit, for review.
  const [visit] = useState(() => {
    const memory = recall(appId);
    const looked = new URLSearchParams(window.location.search).get("looked");
    const hours = looked?.match(/^(\d+)h$/)?.[1];
    return {
      memory,
      review: looked !== null,
      intro: looked === "never",
      seenAt: hours
        ? model.now - Number(hours) * HOUR
        : looked === "never" || !memory?.seen
          ? null
          : Date.parse(memory.seen),
    };
  });
  // Open from the start unless you folded it, so the log reads as the
  // timeline's terminal.
  const [logOpen, setLogOpen] = useState(visit.memory?.open ?? true);
  // How long the running check has taken, in whole seconds.
  const [seconds, setSeconds] = useState(0);
  // The moment being pointed at, on the lanes or in the log.
  const [lit, setLit] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLButtonElement>(null);
  const shine = useRef<HTMLSpanElement>(null);
  // Which moment on the lanes each recorded line belongs to.
  const momentOf = useMemo(() => {
    const map: Record<string, string> = {};
    for (const lane of timeline.lanes)
      for (const event of lane.events)
        for (const line of event.lines) map[line.id] = event.id;
    return map;
  }, [timeline]);

  const planned = model.status !== "live";
  const vitals = Object.fromEntries(
    overview.vitals.map((vital) => [vital.id, vital]),
  ) as Record<Vital["id"], Vital>;
  const { start, end, now } = timeline;
  const x = (at: number) => ((at - start) / (end - start)) * 100;
  const nowX = x(now);
  const nextIn = useCountdown(vitals.backups?.countdownTo, offset);
  const pointedLane = pointed ? laneOf(pointed) : null;

  // Hours every six, and the days they belong to.
  const ticks: number[] = [];
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  while (first.getHours() % 6 !== 0 || first.getTime() < start)
    first.setTime(first.getTime() + HOUR);
  for (let at = first.getTime(); at <= end; at += 6 * HOUR) ticks.push(at);
  const midnights = ticks.filter((at) => new Date(at).getHours() === 0);
  const days = [start, ...midnights]
    .map((at, i, all) => ({ at, width: x(all[i + 1] ?? end) - x(at) }))
    .filter((day) => day.width > 9);

  const sub = subline(model, overview);
  const showLog = !planned && logOpen;
  const lines = guy.lines.slice(-6);
  const newest = lines.at(-1);
  // Only recorded work is news: invented and simulated lines never are, and
  // a first visit has none.
  const recorded = model.log.filter((line) => !line.invented);
  const newestRecorded = recorded.at(-1)?.at;
  const seenAt = visit.seenAt;
  const fresh =
    seenAt === null
      ? []
      : recorded.filter((line) => Date.parse(line.at) > seenAt);
  const freshIds = new Set(fresh.map((line) => line.id));
  const firstFresh = lines.find((line) => freshIds.has(line.id))?.id;

  // One state for the label, the most pressing first.
  const state = planned
    ? "planned"
    : guy.running
      ? "running"
      : recheck.phase === "passed"
        ? "passed"
        : recheck.phase === "failed"
          ? "failed"
          : fresh.length > 0
            ? "new"
            : "rest";
  const sparkTone =
    state === "planned"
      ? "ghost"
      : state === "failed" ||
          (state === "rest" && newest?.tone === "fail") ||
          (state === "new" && fresh.some((line) => line.tone === "fail"))
        ? "fail"
        : "star";
  const failedId = Object.keys(recheck.marks).find(
    (id) => recheck.marks[id] === "failed",
  );
  const failedName = model.byId[failedId ?? ""]?.name ?? "A part";
  // The news is the count; the divider and bubble say "while you were away".
  const words = state === "running" ? "What I'm doing" : "What I did last";
  // At rest the label keeps quiet about time: the log has its own clock, and
  // the lanes may have seen the server more recently than the log records.
  const meta =
    state === "running"
      ? `${seconds} s`
      : state === "new"
        ? `${fresh.length} new`
        : state === "passed"
          ? `all answered in ${seconds} s`
          : state === "failed"
            ? `${failedName} isn't answering`
            : null;
  // The check itself is labelled beside its button and on every line; the
  // label tags the results it claims.
  const tag =
    state === "passed" || state === "failed"
      ? "simulated"
      : state === "rest" && newest?.invented
        ? newest.id.startsWith("live:")
          ? "simulated"
          : "invented"
        : null;
  // Said as a check starts and as it ends; the streamed lines stay quiet.
  const said =
    state === "running"
      ? "Checking, simulated."
      : state === "passed"
        ? `Checked for ${seconds} seconds. Everything answered. Simulated.`
        : state === "failed"
          ? `Stopped. ${failedName} isn't answering. Simulated.`
          : "";

  // The label answers: its star flares and one light crosses the words.
  // With the log open, the lines that landed while you were away warm once.
  // Never while it shows a failure.
  const answer = useCallback((withLog: boolean) => {
    const button = label.current;
    if (
      reducedMotion() ||
      !button ||
      button.querySelector(".axt-spark.is-fail") ||
      button.closest('[data-state="running"]')
    )
      return;
    const flare = { duration: 900, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };
    button
      .querySelector(".axt-spark-a")
      ?.animate(
        [
          { transform: "scale(0.8)" },
          { transform: "scale(1.22)", offset: 0.28 },
          { transform: "scale(0.8)" },
        ],
        flare,
      );
    button
      .querySelector(".axt-spark-b")
      ?.animate(
        [
          { transform: "rotate(45deg) scale(0)" },
          { transform: "rotate(45deg) scale(0.85)", offset: 0.28 },
          { transform: "rotate(45deg) scale(0)" },
        ],
        flare,
      );
    const text = shine.current;
    if (text) {
      text.dataset.shine = "";
      const sweep = text.animate(
        [{ backgroundPosition: "100% 0" }, { backgroundPosition: "0% 0" }],
        {
          duration: 1100,
          easing: "cubic-bezier(0.45, 0, 0.55, 1)",
        },
      );
      // Plain words again once the last light has crossed; a check's own
      // loop, a CSS animation, doesn't keep them lit.
      const settle = () => {
        if (
          !text
            .getAnimations()
            .some((running) => !(running instanceof CSSAnimation))
        )
          delete text.dataset.shine;
      };
      sweep.onfinish = settle;
      sweep.oncancel = settle;
    }
    const box = log.current;
    if (!withLog || !box?.classList.contains("is-open")) return;
    box
      .querySelector(".axt-log-new i")
      ?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
        duration: 600,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    // One keyframe at the start: each line eases back to its own background.
    box.querySelectorAll(".axt-log-line.is-new").forEach((line, i) =>
      line.animate([{ backgroundColor: "#2c3958", offset: 0 }], {
        duration: 1400,
        easing: "ease-out",
        delay: 300 + i * 90,
      }),
    );
  }, []);

  // The next visit starts from the newest recorded line; this one keeps
  // its snapshot.
  useEffect(() => {
    if (!visit.review && newestRecorded)
      remember(appId, { seen: newestRecorded });
  }, [appId, newestRecorded, visit.review]);

  useEffect(() => {
    if (!guy.running) return;
    const began = Date.now();
    const tick = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - began) / 1000)),
      250,
    );
    return () => window.clearInterval(tick);
  }, [guy.running]);

  // A passing check lands on the label with his celebration burst.
  useEffect(() => {
    if (recheck.phase !== "passed") return;
    const timer = window.setTimeout(() => answer(false), 120);
    return () => window.clearTimeout(timer);
  }, [recheck.phase, answer]);

  // What the arrival reads when it decides, kept current.
  const facts = {
    planned,
    needs: overview.needs.length,
    phase: recheck.phase,
    fresh,
    hasRecorded: recorded.length > 0,
    copy: newsLine(fresh),
  };
  const latest = useRef(facts);
  useEffect(() => {
    latest.current = facts;
  });

  // Arrival: one decision a visit, 1.8 s in. Little Server points at the
  // label only on a settled page, fully in view, that you haven't touched,
  // with nothing that needs you: once to introduce the log, then at most
  // weekly and only for news. Otherwise news gets one answer, the first
  // time the label is fully on screen.
  const point = guy.point;
  useEffect(() => {
    const mounted = Date.now();
    let touched = false;
    const touch = () => {
      touched = true;
    };
    const inputs = ["pointerdown", "keydown", "wheel"] as const;
    inputs.forEach((kind) =>
      window.addEventListener(kind, touch, { passive: true }),
    );
    const timers: number[] = [];
    let observer: IntersectionObserver | null = null;

    const arrive = () => {
      const target = label.current;
      if (!target) return;
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.intersectionRatio >= 0.99)) return;
          observer?.disconnect();
          if (latest.current.phase === "idle") answer(true);
        },
        { threshold: 1 },
      );
      observer.observe(target);
    };

    const decide = () => {
      const facts = latest.current;
      const memory = recall(appId);
      const news =
        facts.fresh.length > 0 &&
        !facts.fresh.some((line) => line.tone === "fail");
      const intro =
        visit.intro || (!visit.review && memory?.pointed === undefined);
      const quiet =
        visit.review ||
        Date.now() - Math.max(memory?.pointed ?? 0, memory?.used ?? 0) > WEEK;
      const settled =
        !facts.planned &&
        facts.hasRecorded &&
        facts.needs === 0 &&
        facts.phase === "idle" &&
        !document.hidden &&
        !touched &&
        (intro || news) &&
        quiet &&
        onScreen(mascot.current) &&
        onScreen(label.current);
      const drawing = mascot.current
        ?.querySelector(".mascot-scene")
        ?.getAttribute("data-expression");
      if (settled && drawing) {
        point(intro ? INTRO : facts.copy);
        if (!visit.review) remember(appId, { pointed: Date.now() });
        // The label answers as his tap lands; no separate arrival. A check
        // started in the meantime has the stage.
        timers.push(
          window.setTimeout(() => {
            if (latest.current.phase === "idle") answer(true);
          }, 820),
        );
        return;
      }
      // His scene may still be loading: look again, for a few seconds.
      if (settled && Date.now() - mounted + 300 <= 6000) {
        timers.push(window.setTimeout(decide, 300));
        return;
      }
      if (news && facts.phase === "idle") arrive();
    };
    timers.push(window.setTimeout(decide, 1800));

    return () => {
      inputs.forEach((kind) => window.removeEventListener(kind, touch));
      timers.forEach((timer) => window.clearTimeout(timer));
      observer?.disconnect();
    };
  }, [appId, answer, point, mascot, visit]);

  const toggleLog = () => {
    const next = !logOpen;
    setLogOpen(next);
    remember(appId, { open: next, used: Date.now() });
    // Opened by hand: bring the log into view once it unfolds.
    if (next)
      window.setTimeout(
        () =>
          log.current?.scrollIntoView({
            block: "nearest",
            behavior: reducedMotion() ? "auto" : "smooth",
          }),
        440,
      );
  };

  return (
    <section
      className={`axt${planned ? " is-planned" : ""}${guy.simulating ? " is-live" : ""}`}
      aria-label="How it is doing"
    >
      <div className="axt-top">
        <div className="axt-words">
          <h2 className="axt-say" key={overview.headline}>
            {overview.headline}
          </h2>
          {sub && <p className="axt-sub">{sub}</p>}
        </div>
      </div>

      {overview.needs.length > 0 && (
        <div className="axt-needs">
          {overview.needs.map((need) => (
            <NeedCard
              key={need.id}
              need={need}
              onAsk={onAsk}
              onOpenDestination={onOpenDestination}
              onHover={onPoint}
              onShow={onShow}
            />
          ))}
        </div>
      )}

      <div className="axt-time" style={{ ["--now" as string]: `${nowX}%` }}>
        <div className="axt-field" aria-hidden="true">
          {ticks.map((at) => (
            <i
              key={at}
              className={`axt-grid${new Date(at).getHours() === 0 ? " is-midnight" : ""}`}
              style={{ left: `${x(at)}%` }}
            />
          ))}
          {days.map((day) => (
            <span
              key={day.at}
              className="axt-day"
              style={{ left: `${x(day.at)}%` }}
            >
              {dayName(day.at, now)}
            </span>
          ))}
          <div className="axt-future" />
          <div className="axt-now" />
        </div>
        <div className="axt-over">
          <div className="axt-stand" style={{ left: `${nowX}%` }}>
            <Mascot
              guy={guy}
              mascotRef={mascot}
              className={`axt-mascot${guy.mood === "pointing" ? " is-pointing" : ""}`}
            />
          </div>
        </div>

        {timeline.lanes.map((lane) => {
          const vital = vitals[lane.id];
          if (!vital) return null;
          const certainty = vital.status.certainty;
          const gapFrom =
            lane.lastAt !== null ? Math.max(start, lane.lastAt) : start;
          const gap =
            !planned &&
            (certainty === "stale" || certainty === "unknown") &&
            now - (lane.lastAt ?? start) > HOUR;
          return (
            <div
              key={lane.id}
              className={`axt-lane${pointedLane === lane.id ? " is-pointed" : ""}`}
              data-c={certainty}
            >
              <div className="axt-lane-head">
                <button
                  type="button"
                  className="axt-lane-name"
                  aria-expanded={open === `lane:${lane.id}`}
                  onClick={() => toggle(`lane:${lane.id}`)}
                >
                  <span className="axt-lane-icon" aria-hidden="true">
                    {vitalIcon[lane.id]}
                  </span>
                  <span className="axt-lane-text">
                    <b>{vital.label}</b>
                    <small>
                      <i aria-hidden="true" />
                      {vital.status.text}
                    </small>
                  </span>
                </button>
                {open === `lane:${lane.id}` && (
                  <div className="axt-pop is-lane">
                    <VitalPop
                      vital={vital}
                      onClose={close}
                      onOpenDestination={onOpenDestination}
                      onAsk={onAsk}
                    />
                  </div>
                )}
              </div>
              <div className="axt-track">
                {gap && (
                  <div
                    className="axt-gap"
                    data-c={certainty}
                    style={{
                      left: `${x(gapFrom)}%`,
                      width: `${nowX - x(gapFrom)}%`,
                    }}
                  >
                    {nowX - x(gapFrom) > 14 && (
                      <span>
                        {/* A lane with nothing on record has no stretch to
                            measure: borrowing the window's edge would report
                            a duration nobody observed. */}
                        {lane.lastAt === null
                          ? nothing[lane.id]
                          : `${since[lane.id]} ${span(now - lane.lastAt)}`}
                      </span>
                    )}
                  </div>
                )}
                {planned && <span className="axt-empty">After deployment</span>}
                {lane.events.map((event) => {
                  const id = `event:${event.id}`;
                  const at = x(event.at);
                  return (
                    <div key={event.id}>
                      <button
                        type="button"
                        className={`axt-ev${open === id ? " is-open" : ""}${lit === event.id ? " is-lit" : ""}${event.lines.some((line) => line.id.startsWith("live:")) ? " is-new" : ""}`}
                        data-tone={event.tone}
                        style={{ left: `${at}%` }}
                        aria-label={`${event.title}, ${whenWords(event.at, now)}`}
                        onClick={() => toggle(id)}
                        onPointerEnter={() => setLit(event.id)}
                        onPointerLeave={() => setLit(null)}
                      >
                        {event.lines.length > 1 && <b>{event.lines.length}</b>}
                      </button>
                      {event.tone === "planned" && nextIn && (
                        <span className="axt-next" style={{ left: `${at}%` }}>
                          in {nextIn}
                        </span>
                      )}
                      {open === id && (
                        <div
                          className="axt-pop"
                          data-align={
                            at > 62 ? "end" : at < 22 ? "start" : "middle"
                          }
                          style={{ left: `${at}%` }}
                        >
                          <EventPop
                            event={event}
                            vital={vital}
                            now={now}
                            onClose={close}
                            onOpenDestination={onOpenDestination}
                            onAsk={onAsk}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="axt-axis" aria-hidden="true">
          <div className="axt-ticks">
            {ticks
              .filter((at) => Math.abs(x(at) - nowX) > 7)
              .map((at) => (
                <span key={at} style={{ left: `${x(at)}%` }}>
                  {clock(at)}
                </span>
              ))}
            <span className="axt-now-label" style={{ left: `${nowX}%` }}>
              Now · {clock(now)}
            </span>
          </div>
        </div>
      </div>

      <div className="axt-sign" data-state={state}>
        <span className="axt-sign-by">Little Server, from your network</span>
        {planned ? (
          <p className="axt-log-ghost">
            <Spark tone="ghost" />
            Nothing done yet
            <span className="axt-log-meta">· I start once you approve</span>
          </p>
        ) : (
          <button
            ref={label}
            type="button"
            className="axt-log-toggle"
            aria-expanded={showLog}
            aria-controls="axt-log"
            onClick={toggleLog}
          >
            <Spark tone={sparkTone} />
            <span className="axt-shine" ref={shine}>
              {words}
            </span>
            {meta && (
              <span
                className="axt-log-meta"
                aria-hidden={state === "running" || undefined}
              >
                · {meta}
              </span>
            )}
            {tag && <em className="axt-tag">{tag}</em>}
            <CaretDown weight="bold" className="axt-log-caret" />
          </button>
        )}
        <span className="ax-visually-hidden" role="status">
          {said}
        </span>
      </div>
      {!planned && (
        <div
          className={`axt-log${showLog ? " is-open" : ""}`}
          id="axt-log"
          ref={log}
        >
          <div inert={!showLog}>
            <div
              className="axt-log-lines"
              role="log"
              aria-live="off"
              aria-label="Little Server's log"
            >
              {lines.length === 0 && (
                <div className="axt-log-line" data-tone="info">
                  <time>--:--</time>
                  <b aria-hidden="true">·</b>
                  <span>No work recorded yet.</span>
                </div>
              )}
              {lines.map((line, i) => {
                const previous = lines[i - 1];
                const day = dayName(Date.parse(line.at), now);
                const moment = momentOf[line.id];
                const last = i === lines.length - 1;
                return (
                  <Fragment key={line.id}>
                    {(!previous ||
                      dayName(Date.parse(previous.at), now) !== day) && (
                      <div className="axt-log-day">{day}</div>
                    )}
                    {line.id === firstFresh && (
                      <div className="axt-log-new">
                        While you were away
                        <i />
                      </div>
                    )}
                    <div
                      className={`axt-log-line${last ? " is-newest" : ""}${freshIds.has(line.id) ? " is-new" : ""}${moment && lit === moment ? " is-lit" : ""}`}
                      data-tone={line.tone}
                      onPointerEnter={() => setLit(moment ?? null)}
                      onPointerLeave={() => setLit(null)}
                    >
                      <time>{clock(line.at)}</time>
                      <b aria-hidden="true">{glyph[line.tone]}</b>
                      <span>
                        {line.text}
                        {line.invented && (
                          <em>
                            {line.id.startsWith("live:")
                              ? "simulated"
                              : "invented"}
                          </em>
                        )}
                        {last && guy.running && (
                          <i className="axt-caret" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
