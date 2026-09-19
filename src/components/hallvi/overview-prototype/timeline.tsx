"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction A, Timeline: how it is doing, told in time. Four lanes show when
// Hallvi last checked, copied, reached the server and read the
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
  VitalPop,
  vitalIcon,
  whenWords,
} from "./shared";
import {
  laneOf,
  type Lane,
  type TimeEvent,
  type Timeline,
} from "./timeline-model";
import { Mascot, useHallvi } from "./use-hallvi";
import "./timeline.css";
import { LaneRails } from "../lane-rails";
/** Each lane as the question an owner would ask, and what it covers. */
const laneWords: Record<Lane["id"], [question: string, plain: string]> = {
  checks: [
    "Is the app working?",
    "Hallvi opens the app the way a visitor would and confirms it responds.",
  ],
  backups: [
    "Is the data safe if the server dies?",
    "Copies of the app's data, kept somewhere other than the server.",
  ],
  server: [
    "Is the server up?",
    "The rented machine everything runs on. Hallvi logs in to confirm it is there.",
  ],
  access: [
    "Is the way in working?",
    "How you reach the app: your private connection, the web address and the firewall.",
  ],
};
import { TerminalBar } from "../terminal-lights";

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

/**
 * The page's verdict, and the evidence behind it.
 *
 * This used to return null the moment anything needed attention, on the
 * reasoning that the attention cards would say it instead. The effect was
 * that Overview stopped stating its own condition exactly when the condition
 * was worth stating, leaving a process name as the largest text on the page
 * and no answer at all to "what is true right now". It answers in every
 * state now; the attention cards say what to do about it, which is a
 * different question.
 */
function subline(model: HeroProps["model"], overview: Overview) {
  if (model.status !== "live")
    return model.status === "none"
      ? "Ask Hallvi in the conversation to deploy it; this fills in as it runs."
      : "Nothing runs yet. Once you approve, Hallvi builds it, checks it and starts copying its data off the server.";
  const app = model.byId.app;
  const host = model.byId.host;
  // The Server lane directly below says "Checked 7 h ago" in its own caption,
  // so repeating it in the verdict spent a third of the sentence on something
  // already on screen — and pushed the part that matters onto another line.
  const server = "";
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
        <TerminalBar title="What it did" />
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
  offset,
  pointed,
  onPoint,
  onShow,
  onAsk,
  onOpenDestination,
  timeline,
}: HeroProps & { timeline: Timeline }) {
  const [guy, mascot] = useHallvi(model);
  const appId = record.application.id;
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
  const { now } = timeline;
  const nextIn = useCountdown(vitals.backups?.countdownTo, offset);
  const pointedLane = pointed ? laneOf(pointed) : null;

  // Attention first. The condition sentence is scoped to the application's
  // own record, so it can honestly say every check held while a domain check
  // on the same page did not — which reads as reassurance the page has not
  // earned. When something needs the reader, the verdict says so before it
  // says anything reassuring, and the cards below say what it is.
  const verdict = subline(model, overview);
  const waiting = overview.needs.length;
  const sub =
    verdict && waiting
      ? `${waiting === 1 ? "One thing needs you" : `${waiting} things need you`}. ${verdict}`
      : verdict;
  const showLog = !planned && logOpen;
  const lines = guy.lines.slice(-6);
  const newest = lines.at(-1);
  // Only recorded work is news: invented lines never are, and a first visit
  // has none.
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
  const state = planned ? "planned" : fresh.length > 0 ? "new" : "rest";
  const sparkTone =
    state === "planned"
      ? "ghost"
      : (state === "rest" && newest?.tone === "fail") ||
          (state === "new" && fresh.some((line) => line.tone === "fail"))
        ? "fail"
        : "star";
  // At rest the label keeps quiet about time: the log has its own clock, and
  // the lanes may have seen the server more recently than the log records.
  const meta = state === "new" ? `${fresh.length} new` : null;
  const tag = state === "rest" && newest?.invented ? "invented" : null;

  // The label answers: its star flares and one light crosses the words.
  // With the log open, the lines that landed while you were away warm once.
  // Never while it shows a failure.
  const answer = useCallback((withLog: boolean) => {
    const button = label.current;
    if (
      reducedMotion() ||
      !button ||
      button.querySelector(".axt-spark.is-fail")
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

  // What the arrival reads when it decides, kept current.
  const facts = {
    planned,
    needs: overview.needs.length,
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
          answer(true);
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
        // The label answers as his tap lands; no separate arrival.
        timers.push(window.setTimeout(() => answer(true), 820));
        return;
      }
      // His scene may still be loading: look again, for a few seconds.
      if (settled && Date.now() - mounted + 300 <= 6000) {
        timers.push(window.setTimeout(decide, 300));
        return;
      }
      if (news) arrive();
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
      className={`axt${planned ? " is-planned" : ""}`}
      aria-label="How it is doing"
    >
      <div className="axt-top">
        <div className="axt-words">
          {/* The verdict is the headline. The application's name is already
              in the sidebar, the switcher and the top bar; printing the web
              process's name at 30px said nothing three people had not said
              already, while the sentence that answers "what is true right
              now" sat underneath it in muted 15px — or, when anything needed
              attention, was not rendered at all. */}
          <h2 className="axt-say" key={sub ?? overview.headline}>
            {sub ?? overview.headline}
          </h2>
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

      <LaneRails
        now={now}
        mascot={
          <Mascot
            guy={guy}
            mascotRef={mascot}
            className={`axt-mascot${guy.mood === "pointing" ? " is-pointing" : ""}`}
          />
        }
        onLit={setLit}
        lanes={timeline.lanes.flatMap((lane) => {
          const vital = vitals[lane.id];
          if (!vital) return [];
          const certainty = vital.status.certainty;
          return [
            {
              id: lane.id,
              icon: vitalIcon[lane.id],
              name: vital.label,
              question: laneWords[lane.id][0],
              plain: laneWords[lane.id][1],
              status: vital.status.text,
              tone:
                certainty === "verified" ||
                certainty === "stale" ||
                certainty === "failed"
                  ? certainty
                  : ("absent" as const),
              ghost: planned ? "After deployment" : null,
              nextIn: lane.id === "backups" ? nextIn : null,
              pointed: pointedLane === lane.id,
              events: lane.events.map((event) => ({
                id: event.id,
                at: event.at,
                tone:
                  event.tone === "checking" ? ("info" as const) : event.tone,
                title: event.title,
                detail: event.lines.map((line) => line.text).join(" · "),
              })),
            },
          ];
        })}
        lanePop={(laneId, close) => (
          <VitalPop
            vital={vitals[laneId as Lane["id"]]}
            onClose={close}
            onOpenDestination={onOpenDestination}
            onAsk={onAsk}
          />
        )}
        eventPop={(laneId, eventId, close) => {
          const event = timeline.lanes
            .find((lane) => lane.id === laneId)
            ?.events.find((item) => item.id === eventId);
          return event ? (
            <EventPop
              event={event}
              vital={vitals[laneId as Lane["id"]]}
              now={now}
              onClose={close}
              onOpenDestination={onOpenDestination}
              onAsk={onAsk}
            />
          ) : null;
        }}
      />

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
              What I did last
            </span>
            {meta && <span className="axt-log-meta">· {meta}</span>}
            {tag && <em className="axt-tag">{tag}</em>}
            <CaretDown weight="bold" className="axt-log-caret" />
          </button>
        )}
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
              <TerminalBar title="Little Server's log" />
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
                        {line.invented && <em>invented</em>}
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
