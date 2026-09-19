"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Little Server's behaviour on Overview: what he says, how he feels and when
// he points. The Timeline stages him.

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { MascotMood } from "../home/mascot-scene";
import type {
  ArchitectureModel,
  LogLine,
} from "../architecture-prototype/model";
import {
  reducedMotion,
  useReducedMotion,
} from "../architecture-prototype/motion";

const LittleServer = dynamic(
  () => import("../home/mascot-scene").then((module) => module.MascotScene),
  { ssr: false },
);

export interface Hallvi {
  mood: MascotMood;
  gesture: number;
  bubble: string | null;
  greet: () => void;
  /** Points at something beside him, with a line to say why. */
  point: (text?: string) => void;
  /** Recorded work. */
  lines: LogLine[];
  reduced: boolean;
}

export function useHallvi(
  model: ArchitectureModel,
): [Hallvi, RefObject<HTMLDivElement | null>] {
  const reduced = useReducedMotion();
  const [mood, setMood] = useState<MascotMood | null>(null);
  const [gesture, setGesture] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const mascot = useRef<HTMLDivElement>(null);
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
  // only says it.
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

  const planned = model.status !== "live";
  const failedPart = model.parts.find(
    (part) => part.evidence.certainty === "failed",
  );

  const guy: Hallvi = {
    mood:
      mood ??
      (failedPart
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
    lines: model.log,
    reduced,
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
      className={`axj2-mascot axo-mascot${className ? ` ${className}` : ""}`}
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
