"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Server Guy's report: Little Server says how things are, and stands on the
// console that keeps the work behind it, folded to its latest line. The
// console opens by hand; a simulated re-check streams into it and Little
// Server hops with each line, celebrates a pass and worries at a failure.

import { ArrowsClockwise, CaretDown, SpinnerGap } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { MascotMood } from "../home/mascot-scene";
import { CertaintyTag } from "./bits";
import type { PageContext } from "./index";
import {
  ago,
  type ArchitectureModel,
  type Certainty,
  type LogLine,
  type Part,
} from "./model";
import {
  burstAt,
  reducedMotion,
  sparklePalettes,
  useReducedMotion,
} from "./motion";
import type { Recheck } from "./use-recheck";
import "./journey-v2.css";

const LittleServer = dynamic(
  () => import("../home/mascot-scene").then((module) => module.MascotScene),
  { ssr: false },
);

const conditionWord: Record<Certainty, string> = {
  verified: "Verified",
  stale: "Out of date",
  failed: "Failed",
  planned: "Planned",
  unknown: "Not observed",
  absent: "Not set up",
};

/** What a simulated check of a part would say it saw. */
function checkLine(part: Part) {
  const fact = (label: string) =>
    part.facts.find((item) => item.label === label)?.value;
  switch (part.kind) {
    case "host":
      return `${fact("Address") ?? part.name} answered over SSH`;
    case "gate":
      return `${part.name}: open to ${fact("Allowed from") ?? "its rule"}`;
    case "web":
      return `${fact("Health") ?? "GET /"} → 200 · ${part.name} is healthy`;
    case "private":
      return `${fact("Readiness") ?? "readiness"} → ready · ${part.name}`;
    default:
      return `${part.name} answered`;
  }
}

const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
const day = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const glyph: Record<LogLine["tone"], string> = {
  pass: "✓",
  fail: "✗",
  work: "›",
  info: "·",
};
const tagOf = (line: LogLine | undefined) =>
  line?.invented ? (line.id.startsWith("live:") ? "sim" : "invented") : undefined;

export function ServerGuyReport({
  model,
  recheck,
  page,
  onOpenDestination,
  headline,
  showVerdict = true,
  children,
}: {
  model: ArchitectureModel;
  recheck: Recheck;
  page?: PageContext;
  onOpenDestination: (destination: "history") => void;
  /** What the page leads with, above the verdict. */
  headline?: string;
  /** Hide the verdict when the cards below already say it. */
  showVerdict?: boolean;
  /** What needs you, or an idea, between the verdict and the console. */
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [liveLines, setLiveLines] = useState<LogLine[]>([]);
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<MascotMood | null>(null);
  const [gesture, setGesture] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const terminal = useRef<HTMLDivElement>(null);
  const mascot = useRef<HTMLDivElement>(null);
  const seenMarks = useRef<Record<string, string>>({});
  const run = useRef(0);
  const lastPhase = useRef(recheck.phase);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const say = useCallback(
    (text: string, ms = 2800) => {
      setBubble(text);
      later(() => setBubble((current) => (current === text ? null : current)), ms);
    },
    [later],
  );

  // A change of record, said once.
  const lastCondition = useRef(model.condition.certainty);
  useEffect(() => {
    if (lastCondition.current === model.condition.certainty) return;
    lastCondition.current = model.condition.certainty;
    if (reducedMotion()) return;
    const timer = window.setTimeout(() => {
      if (model.condition.certainty === "stale")
        say("I haven't looked in a while.", 3200);
      if (model.condition.certainty === "planned")
        say("Nothing to look after yet.", 3200);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [model.condition.certainty, say]);

  // The simulated re-check writes to the console, step by step. Each run
  // starts a fresh page of lines, with ids of its own.
  useEffect(() => {
    const starting =
      recheck.phase === "running" && lastPhase.current !== "running";
    lastPhase.current = recheck.phase;
    if (recheck.phase === "idle") {
      seenMarks.current = {};
      const timer = window.setTimeout(() => setLiveLines([]), 0);
      return () => window.clearTimeout(timer);
    }
    if (starting) {
      run.current += 1;
      seenMarks.current = {};
    }
    const at = new Date().toISOString();
    const prefix = `live:${run.current}`;
    const add: LogLine[] = [];
    for (const [id, mark] of Object.entries(recheck.marks)) {
      if (seenMarks.current[id] === mark) continue;
      const part = model.byId[id];
      if (!part) continue;
      add.push(
        mark === "checking"
          ? { id: `${prefix}:${id}:checking`, at, tone: "work", text: `Checking ${part.name}…`, invented: true }
          : mark === "passed"
            ? { id: `${prefix}:${id}:passed`, at, tone: "pass", text: checkLine(part), invented: true }
            : {
                id: `${prefix}:${id}:failed`,
                at,
                tone: "fail",
                text: `${part.name} isn't answering · ${part.evidence.detail.replace(/^Simulated re-check\. /, "")}`,
                invented: true,
              },
      );
    }
    seenMarks.current = { ...recheck.marks };
    if (recheck.phase === "passed")
      add.push({ id: `${prefix}:done`, at, tone: "pass", text: "Everything answered.", invented: true });
    if (!add.length && !starting) return;
    const timer = window.setTimeout(
      () =>
        setLiveLines((previous) =>
          starting
            ? add
            : [
                ...previous,
                ...add.filter((line) => !previous.some((old) => old.id === line.id)),
              ],
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [recheck.marks, recheck.phase, model.byId]);

  // A pass is celebrated; a failure is felt.
  useEffect(() => {
    const local: number[] = [];
    const at = (fn: () => void, ms: number) => local.push(window.setTimeout(fn, ms));
    if (recheck.phase === "passed") {
      at(() => {
        setMood("celebrating");
        setGesture((value) => value + 1);
        burstAt(mascot.current, {
          count: 22,
          spread: 64,
          size: 10,
          palette: sparklePalettes.verified,
        });
      }, 120);
      at(() => setMood(null), 2800);
    } else if (recheck.phase === "failed") {
      at(
        () =>
          burstAt(mascot.current, {
            count: 8,
            spread: 30,
            palette: sparklePalettes.failed,
          }),
        120,
      );
    }
    return () => local.forEach((timer) => window.clearTimeout(timer));
  }, [recheck.phase]);

  const lines = useMemo(
    () => [...model.log, ...liveLines].slice(-8),
    [model.log, liveLines],
  );
  const latest = lines[lines.length - 1];
  // Little Server hops once for each new line of simulated work.
  const newestId = latest?.id;
  useEffect(() => {
    const element = mascot.current;
    if (!element || !newestId?.startsWith("live:") || reducedMotion()) return;
    element.animate(
      [
        { translate: "0 0" },
        { translate: "0 -12px", offset: 0.4 },
        { translate: "0 0" },
      ],
      { duration: 380, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" },
    );
  }, [newestId]);

  const service = model.parts.find((part) => part.kind === "private");
  const order = ["host", "gate:http", "app", service?.id].filter(
    (id): id is string => Boolean(id && model.byId[id]),
  );
  const planned = model.status !== "live";
  const host = model.byId.host;
  const simulating = recheck.phase !== "idle";
  const running = recheck.phase === "running";
  const failedPart = model.parts.find(
    (part) => part.evidence.certainty === "failed",
  );
  const mascotMood: MascotMood =
    mood ??
    (running
      ? "checking"
      : recheck.phase === "failed" || failedPart
        ? "attention"
        : model.condition.certainty === "stale"
          ? "resting"
          : "ready");
  const greet = () => {
    setMood("waving");
    setGesture((value) => value + 1);
    say(
      planned
        ? "I'll build this once you approve the plan."
        : "Hi! I look after this server from your network.",
    );
    later(() => setMood(null), 2600);
  };

  return (
    <div className={`axj3-report${simulating ? " is-live" : ""}`}>
      <div className="axj3-report-head">
        <div
          ref={mascot}
          className={`axj2-mascot${running ? " is-working" : ""}`}
          onClick={greet}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              greet();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Little Server. Say hello."
        >
          <LittleServer
            color={3}
            mood={mascotMood}
            gesture={gesture}
            paused={reduced}
          />
          {bubble && (
            <div className="axj2-bubble" key={bubble}>
              {bubble}
            </div>
          )}
        </div>
        <div className="axj3-report-say">
          {headline && (
            <h2 className="axj3-headline" key={headline}>
              {headline}
            </h2>
          )}
          {showVerdict && (
            <div className="axj2-condition axj3-verdict">
              <CertaintyTag certainty={model.condition.certainty}>
                {conditionWord[model.condition.certainty]}
              </CertaintyTag>
              <p key={model.condition.text}>{model.condition.text}</p>
            </div>
          )}
        </div>
        {!planned && (
          <button
            type="button"
            className="ax-button axj3-recheck"
            disabled={running}
            onClick={() => recheck.run(order, 1100)}
          >
            {running ? (
              <SpinnerGap weight="bold" className="ax-spin" />
            ) : (
              <ArrowsClockwise weight="bold" />
            )}
            {running ? "Checking…" : "Re-check"}
            <span className="ax-invented">simulated</span>
          </button>
        )}
      </div>
      {children}
      <div
        ref={terminal}
        className={`axj2-term${open ? " is-open" : ""}${simulating ? " is-live" : ""}`}
      >
        <div className="axj2-term-bar">
          <button
            type="button"
            className="axj2-term-toggle"
            aria-expanded={open}
            aria-controls="axj2-term-body"
            onClick={() => {
              const next = !open;
              setOpen(next);
              // Opened by hand: bring the work into view once it unfolds.
              if (next)
                later(
                  () =>
                    terminal.current?.scrollIntoView({
                      block: "nearest",
                      behavior: reducedMotion() ? "auto" : "smooth",
                    }),
                  440,
                );
            }}
          >
            {open && !running ? (
              <span className="axj2-term-title">
                server-guy · {model.headline.toLowerCase()} ·{" "}
                {host?.name.toLowerCase() ?? "server"}
              </span>
            ) : (
              <span className="axj2-term-ticker" data-tone={latest?.tone ?? "info"}>
                <b aria-hidden="true">{latest ? glyph[latest.tone] : "·"}</b>
                <span data-tag={tagOf(latest)}>
                  {latest?.text ??
                    (planned
                      ? "Nothing has run yet. The plan waits for your approval."
                      : "No work recorded yet.")}
                </span>
              </span>
            )}
            <em className={simulating ? "is-simulated" : undefined}>
              {simulating
                ? running
                  ? "Simulated re-check · nothing is contacted"
                  : "Simulated re-check · nothing was contacted"
                : latest
                  ? open
                    ? `Recorded work · last ${ago(latest.at, model.now)}`
                    : ago(latest.at, model.now)
                  : ""}
            </em>
            <CaretDown weight="bold" className="axj2-term-caret" aria-hidden="true" />
            <span className="ax-visually-hidden">
              {open ? "Hide Server Guy's work" : "Show Server Guy's work"}
            </span>
          </button>
        </div>
        <div className="axj2-term-body" id="axj2-term-body">
          <div>
            {page?.last && (
              <p className="axj2-term-origin">
                # Last change: {page.last.title}
                {page.last.conversation && page.last.open && (
                  <>
                    {" "}· from{" "}
                    <button type="button" onClick={page.last.open}>
                      {page.last.conversation}
                    </button>
                  </>
                )}{" "}
                · {ago(page.last.at, model.now)}
                {page.earlier > 0 && (
                  <>
                    {" "}·{" "}
                    <button type="button" onClick={() => onOpenDestination("history")}>
                      {page.earlier} earlier
                    </button>
                  </>
                )}
              </p>
            )}
            <div className="axj2-term-lines" role="log" aria-live="polite">
              {lines.length === 0 && (
                <div className="axj2-term-line" data-tone="info">
                  <time>--:--:--</time>
                  <b>·</b>
                  <span>
                    {planned
                      ? "Nothing has run yet. The plan waits for your approval."
                      : "No work recorded yet."}
                  </span>
                </div>
              )}
              {lines.map((line, i) => {
                const previous = lines[i - 1];
                const isNewest = i === lines.length - 1;
                return (
                  <Fragment key={line.id}>
                    {(!previous || day(previous.at) !== day(line.at)) && (
                      <div className="axj2-term-day">{day(line.at)}</div>
                    )}
                    <div
                      className={`axj2-term-line${isNewest ? " is-newest" : ""}${line.invented ? " is-invented" : ""}`}
                      data-tone={line.tone}
                    >
                      <time>{clock(line.at)}</time>
                      <b aria-hidden="true">{glyph[line.tone]}</b>
                      <span data-tag={tagOf(line)}>
                        {line.text}
                        {isNewest && running && (
                          <i className="axj2-caret" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
