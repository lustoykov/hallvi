"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { useContext, useEffect, useRef, useState } from "react";

import { LiveMascot, type LiveHandle } from "../mascot-family/live-mascot";
import type { Member } from "../mascot-family/roster";
import { MOOD_FOR, TERMINAL_SCRIPT, type StateId } from "./model";
import { MotionContext } from "./motion";

/** Width of the walker's canvas; its floor line sits on the top edge. */
const WALKER = 176;
const START_X = 12;
const LOOP = TERMINAL_SCRIPT.length + 1;

/** A night-watch clock for each line: the loop starts at 03:00. */
function clock(i: number) {
  const ms = TERMINAL_SCRIPT.slice(0, i).reduce((sum, l) => sum + l.hold, 0);
  return `03:00:${String(Math.round(ms / 1000) + 4).padStart(2, "0")}`;
}

/**
 * A decorative terminal that plays a scripted Server Guy log. The selected
 * character walks the top edge to the end of each new line, looks down at
 * it, takes the line's state, and celebrates only on "✓ Verified".
 */
export function TerminalPlayground({ member }: { member: Member }) {
  const { reduced, hidden } = useContext(MotionContext);
  const [playing, setPlaying] = useState(true);
  // Counts up forever; the lines shown are the step within the loop.
  const [step, setStep] = useState(0);
  // The step whose "✓ Verified" celebration has finished.
  const [settled, setSettled] = useState(-1);
  const termRef = useRef<HTMLDivElement>(null);
  const walkerRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const mascot = useRef<LiveHandle | null>(null);
  const travel = useRef<{ x: number; anim: Animation | null }>({
    x: START_X,
    anim: null,
  });
  const shown = step % LOOP;
  const line = shown ? TERMINAL_SCRIPT[shown - 1] : null;
  const state: StateId = !line
    ? "calm"
    : line.state === "verified" && settled === step
      ? "calm"
      : line.state;

  // Script clock: the next line after the current line's hold; clear and
  // loop at the end.
  useEffect(() => {
    if (!playing || hidden) return;
    const delay = shown === 0 ? 900 : TERMINAL_SCRIPT[shown - 1].hold;
    const t = window.setTimeout(() => setStep((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [playing, hidden, shown]);

  // The newest line: walk to it and look down at it. No travel under
  // reduced motion.
  useEffect(() => {
    if (shown === 0) return;
    const term = termRef.current;
    const span = textRefs.current[shown - 1];
    const walker = walkerRef.current;
    const settle = () => {
      mascot.current?.walk(0);
      mascot.current?.look(true);
    };
    if (!term || !span || !walker) return;
    if (reduced) {
      settle();
      return;
    }
    const tr = term.getBoundingClientRect();
    const sr = span.getBoundingClientRect();
    const end = sr.right - tr.left - WALKER * 0.5;
    const target = Math.round(
      Math.min(Math.max(end, 8), tr.width - WALKER - 8),
    );
    let from = travel.current.x;
    if (travel.current.anim) {
      from = new DOMMatrixReadOnly(getComputedStyle(walker).transform).m41;
      travel.current.anim.cancel();
    }
    const dist = target - from;
    if (Math.abs(dist) < 6) {
      settle();
      return;
    }
    mascot.current?.walk(dist < 0 ? -1 : 1);
    mascot.current?.look(false);
    const anim = walker.animate(
      [
        { transform: `translateX(${from}px)` },
        { transform: `translateX(${target}px)` },
      ],
      {
        duration: Math.max(420, Math.abs(dist) / 0.17),
        easing: "cubic-bezier(.45,.05,.4,1)",
        fill: "forwards",
      },
    );
    travel.current = { x: target, anim };
    anim.onfinish = () => {
      walker.style.transform = `translateX(${target}px)`;
      anim.cancel();
      travel.current.anim = null;
      settle();
    };
  }, [shown, reduced]);

  // Verified is a moment: back to Calm after the celebration.
  useEffect(() => {
    if (line?.state !== "verified") return;
    const t = window.setTimeout(() => setSettled(step), 1500);
    return () => clearTimeout(t);
  }, [line, step]);

  return (
    <section className="mc-section" aria-labelledby="mc-term-title">
      <div className="mc-section-head">
        <div>
          <h2 id="mc-term-title">Terminal playground</h2>
          <p>
            {member.name} walks the top edge of a scripted log, stops at each
            new line and takes its state. It celebrates only on “✓ Verified”.
          </p>
        </div>
        <button
          type="button"
          className="mc-btn"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? (
            <Pause size={14} weight="bold" aria-hidden="true" />
          ) : (
            <Play size={14} weight="bold" aria-hidden="true" />
          )}
          {playing ? "Pause" : "Play"}
        </button>
      </div>
      <div className="mc-term" ref={termRef}>
        <div
          className="mc-term-walker"
          ref={walkerRef}
          style={{ transform: `translateX(${START_X}px)` }}
        >
          <LiveMascot
            id={member.id}
            mood={MOOD_FOR[state]}
            still={reduced}
            framing="walker"
            handleRef={mascot}
          />
        </div>
        <div className="mc-term-bar">
          <span>server-guy · grafana stack</span>
          <span className="mc-term-tag">
            Decorative · scripted loop, not a real session
          </span>
        </div>
        <div className="mc-term-body" aria-hidden="true">
          {TERMINAL_SCRIPT.slice(0, shown).map((l, i) => (
            <div
              key={i}
              className="mc-term-line"
              data-kind={l.kind}
              data-current={i === shown - 1 ? "1" : undefined}
            >
              <span className="mc-term-time">{clock(i)}</span>
              <span
                className="mc-term-text"
                ref={(el) => {
                  textRefs.current[i] = el;
                }}
              >
                {l.text}
              </span>
            </div>
          ))}
          <div className="mc-term-line mc-term-prompt">
            <span className="mc-term-time">›</span>
            <span className="mc-term-caret" />
          </div>
        </div>
      </div>
    </section>
  );
}
