"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Little Server's behaviour on Overview: what he says, how he feels, when he
// points, and the simulated re-check he streams. The Timeline stages him.

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { MascotMood } from "../home/mascot-scene";
import type {
  ArchitectureModel,
  LogLine,
  Part,
} from "../architecture-prototype/model";
import {
  burstAt,
  reducedMotion,
  sparklePalettes,
  useReducedMotion,
} from "../architecture-prototype/motion";
import type { Recheck } from "../architecture-prototype/use-recheck";

const LittleServer = dynamic(
  () => import("../home/mascot-scene").then((module) => module.MascotScene),
  { ssr: false },
);

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

export interface Hallvi {
  mood: MascotMood;
  gesture: number;
  bubble: string | null;
  greet: () => void;
  /** Points at something beside him, with a line to say why. */
  point: (text?: string) => void;
  /** Recorded work, then the lines of a simulated re-check. */
  lines: LogLine[];
  live: LogLine[];
  running: boolean;
  simulating: boolean;
  reduced: boolean;
  run: () => void;
}

export function useHallvi(
  model: ArchitectureModel,
  recheck: Recheck,
  { narrate = false }: { narrate?: boolean } = {},
): [Hallvi, RefObject<HTMLDivElement | null>] {
  const reduced = useReducedMotion();
  const [live, setLive] = useState<LogLine[]>([]);
  const [mood, setMood] = useState<MascotMood | null>(null);
  const [gesture, setGesture] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const mascot = useRef<HTMLDivElement>(null);
  const seen = useRef<Record<string, string>>({});
  const runId = useRef(0);
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
      later(
        () => setBubble((current) => (current === text ? null : current)),
        ms,
      );
    },
    [later],
  );

  // A rare invitation: the arm is the arrow, the bubble says why, and both
  // stay up for three seconds, long enough to read. With reduced motion he
  // only says it. A check starting in the meantime takes the stage.
  const pointRun = useRef(0);
  const point = useCallback(
    (text?: string) => {
      const run = ++pointRun.current;
      if (text)
        later(() => {
          if (pointRun.current === run) say(text, 2700);
        }, 300);
      if (reducedMotion()) return;
      setMood("pointing");
      setGesture((value) => value + 1);
      later(
        () => setMood((current) => (current === "pointing" ? null : current)),
        3000,
      );
    },
    [later, say],
  );
  const lowerPoint = useCallback(() => {
    pointRun.current += 1;
    setMood((current) => (current === "pointing" ? null : current));
  }, []);

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

  // The simulated re-check, step by step. Each run starts a fresh page of
  // lines, with ids of its own.
  useEffect(() => {
    const starting =
      recheck.phase === "running" && lastPhase.current !== "running";
    lastPhase.current = recheck.phase;
    if (recheck.phase === "idle") {
      seen.current = {};
      const timer = window.setTimeout(() => setLive([]), 0);
      return () => window.clearTimeout(timer);
    }
    if (starting) {
      runId.current += 1;
      seen.current = {};
    }
    const at = new Date(model.now).toISOString();
    const prefix = `live:${runId.current}`;
    const add: LogLine[] = [];
    for (const [id, mark] of Object.entries(recheck.marks)) {
      if (seen.current[id] === mark) continue;
      const part = model.byId[id];
      if (!part) continue;
      add.push(
        mark === "checking"
          ? {
              id: `${prefix}:${id}:checking`,
              at,
              tone: "work",
              text: `Checking ${part.name}…`,
              invented: true,
            }
          : mark === "passed"
            ? {
                id: `${prefix}:${id}:passed`,
                at,
                tone: "pass",
                text: checkLine(part),
                invented: true,
              }
            : {
                id: `${prefix}:${id}:failed`,
                at,
                tone: "fail",
                text: `${part.name} isn't answering · ${part.evidence.detail.replace(/^Simulated re-check\. /, "")}`,
                invented: true,
              },
      );
    }
    seen.current = { ...recheck.marks };
    if (recheck.phase === "passed")
      add.push({
        id: `${prefix}:done`,
        at,
        tone: "pass",
        text: "Everything answered.",
        invented: true,
      });
    if (!add.length && !starting) return;
    const timer = window.setTimeout(() => {
      setLive((previous) =>
        starting
          ? add
          : [
              ...previous,
              ...add.filter(
                (line) => !previous.some((old) => old.id === line.id),
              ),
            ],
      );
      const newest = add[add.length - 1];
      if (narrate && newest)
        say(newest.text, recheck.phase === "running" ? 6000 : 3200);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [recheck.marks, recheck.phase, model.byId, model.now, narrate, say]);

  // A pass is celebrated; a failure is felt.
  useEffect(() => {
    const local: number[] = [];
    const at = (fn: () => void, ms: number) =>
      local.push(window.setTimeout(fn, ms));
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

  // Little Server hops once for each new line of simulated work.
  const newestId = live[live.length - 1]?.id;
  useEffect(() => {
    const element = mascot.current;
    if (!element || !newestId || reducedMotion()) return;
    element.animate(
      [
        { translate: "0 0" },
        { translate: "0 -12px", offset: 0.4 },
        { translate: "0 0" },
      ],
      { duration: 380, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" },
    );
  }, [newestId]);

  const planned = model.status !== "live";
  const running = recheck.phase === "running";
  const failedPart = model.parts.find(
    (part) => part.evidence.certainty === "failed",
  );
  const service = model.parts.find((part) => part.kind === "private");
  const order = ["host", "gate:http", "app", service?.id].filter(
    (id): id is string => Boolean(id && model.byId[id]),
  );
  const lines = useMemo(() => [...model.log, ...live], [model.log, live]);

  const guy: Hallvi = {
    mood:
      mood ??
      (running
        ? "checking"
        : recheck.phase === "failed" || failedPart
          ? "attention"
          : model.condition.certainty === "stale"
            ? "resting"
            : "ready"),
    gesture,
    bubble,
    greet: () => {
      setMood("waving");
      setGesture((value) => value + 1);
      say(
        planned
          ? "I'll build this once you approve the plan."
          : "Hi! I look after this server from your network.",
      );
      later(() => setMood(null), 2600);
    },
    point,
    lines,
    live,
    running,
    simulating: recheck.phase !== "idle",
    reduced,
    run: () => {
      // A check starting lowers a point still in the air.
      lowerPoint();
      recheck.run(order, 1100);
    },
  };
  return [guy, mascot];
}

/** Little Server, clickable to say hello, with its speech bubble. */
export function Mascot({
  guy,
  mascotRef,
  className,
}: {
  guy: Hallvi;
  mascotRef: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  return (
    <div
      ref={mascotRef}
      className={`axj2-mascot axo-mascot${guy.running ? " is-working" : ""}${className ? ` ${className}` : ""}`}
      onClick={guy.greet}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          guy.greet();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Little Server. Say hello."
    >
      <LittleServer
        color={3}
        mood={guy.mood}
        gesture={guy.gesture}
        paused={guy.reduced}
      />
      {guy.bubble && (
        <div className="axj2-bubble" key={guy.bubble}>
          {guy.bubble}
        </div>
      )}
    </div>
  );
}
