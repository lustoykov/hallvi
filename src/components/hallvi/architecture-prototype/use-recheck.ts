"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// A simulated re-check, so each direction can show activity, a failure and
// a verified celebration with real timing. Nothing is contacted; the model
// marks every result it produces as invented.

import { useCallback, useEffect, useRef, useState } from "react";

import type { CheckMark } from "./model";

export interface Recheck {
  phase: "idle" | "running" | "passed" | "failed";
  marks: Record<string, CheckMark>;
  active: string | null;
  run: (order: string[], stepMs?: number) => void;
  reset: () => void;
}

export function useRecheck(failing: string[]): Recheck {
  const [phase, setPhase] = useState<Recheck["phase"]>("idle");
  const [marks, setMarks] = useState<Record<string, CheckMark>>({});
  const [active, setActive] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const failingRef = useRef(failing);
  useEffect(() => {
    failingRef.current = failing;
  }, [failing]);

  const clear = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  const reset = useCallback(() => {
    clear();
    setPhase("idle");
    setMarks({});
    setActive(null);
  }, [clear]);

  const run = useCallback(
    (order: string[], stepMs = 900) => {
      clear();
      setMarks({});
      setPhase("running");
      const step = (i: number) => {
        if (i >= order.length) {
          setActive(null);
          setPhase("passed");
          return;
        }
        const id = order[i];
        setActive(id);
        setMarks((current) => ({ ...current, [id]: "checking" }));
        timers.current.push(
          window.setTimeout(() => {
            const failed = failingRef.current.includes(id);
            setMarks((current) => ({
              ...current,
              [id]: failed ? "failed" : "passed",
            }));
            if (failed) {
              setPhase("failed");
              return;
            }
            step(i + 1);
          }, stepMs),
        );
      };
      step(0);
    },
    [clear],
  );

  return { phase, marks, active, run, reset };
}
