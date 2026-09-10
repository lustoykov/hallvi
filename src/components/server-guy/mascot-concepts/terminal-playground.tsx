"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { useContext, useEffect, useRef, useState } from "react";

import { Mascot, MotionContext } from "./mascot";
import { CONCEPTS, TERMINAL_SCRIPT, type ConceptId, type StateId } from "./model";

const WALKER = 76;
const START_X = 16;

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
export function TerminalPlayground({ concept }: { concept: ConceptId }) {
  const { reduced, hidden } = useContext(MotionContext);
  const [playing, setPlaying] = useState(true);
  const [shown, setShown] = useState(0);
  const [state, setState] = useState<StateId>("calm");
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [look, setLook] = useState<[number, number] | null>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const walkerRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const walk = useRef<{ x: number; anim: Animation | null }>({ x: START_X, anim: null });
  const name = CONCEPTS.find((c) => c.id === concept)!.name;

  // Script clock: the next line after the current line's hold; clear and loop at the end.
  useEffect(() => {
    if (!playing || hidden) return;
    const delay = shown === 0 ? 900 : TERMINAL_SCRIPT[shown - 1].hold;
    const t = window.setTimeout(() => setShown((n) => (n >= TERMINAL_SCRIPT.length ? 0 : n + 1)), delay);
    return () => clearTimeout(t);
  }, [playing, hidden, shown]);

  // The newest line: take its state, walk to it, look down at it.
  useEffect(() => {
    if (shown === 0) return;
    setState(TERMINAL_SCRIPT[shown - 1].state);
    const term = termRef.current;
    const span = textRefs.current[shown - 1];
    const walker = walkerRef.current;
    if (!term || !span || !walker) return;
    if (reduced) {
      setLook([0, 4]);
      return;
    }
    const tr = term.getBoundingClientRect();
    const sr = span.getBoundingClientRect();
    const target = Math.round(Math.min(Math.max(sr.right - tr.left - WALKER * 0.5, 8), tr.width - WALKER - 8));
    let from = walk.current.x;
    if (walk.current.anim) {
      from = new DOMMatrixReadOnly(getComputedStyle(walker).transform).m41;
      walk.current.anim.cancel();
    }
    const dist = target - from;
    if (Math.abs(dist) < 6) {
      setLook([0, 4]);
      return;
    }
    setFacing(dist < 0 ? -1 : 1);
    setWalking(true);
    setLook(null);
    const anim = walker.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${target}px)` }], {
      duration: Math.max(420, Math.abs(dist) / 0.17),
      easing: "cubic-bezier(.45,.05,.4,1)",
      fill: "forwards",
    });
    walk.current = { x: target, anim };
    anim.onfinish = () => {
      walker.style.transform = `translateX(${target}px)`;
      anim.cancel();
      walk.current.anim = null;
      setWalking(false);
      setLook([0, 4]);
    };
  }, [shown, reduced]);

  // Verified is a moment: back to Calm after the celebration.
  useEffect(() => {
    if (state !== "verified") return;
    const t = window.setTimeout(() => setState("calm"), 1300);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <section className="mc-section" aria-labelledby="mc-term-title">
      <div className="mc-section-head">
        <div>
          <h2 id="mc-term-title">Terminal playground</h2>
          <p>
            {name} walks the top edge of a scripted log, stops at each new line and takes its state. It celebrates only
            on “✓ Verified”.
          </p>
        </div>
        <button type="button" className="mc-btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause size={14} weight="bold" aria-hidden="true" /> : <Play size={14} weight="bold" aria-hidden="true" />}
          {playing ? "Pause" : "Play"}
        </button>
      </div>
      <div className="mc-term" ref={termRef}>
        <div className="mc-term-walker" ref={walkerRef} style={{ transform: `translateX(${START_X}px)` }}>
          <div className="mc-term-facing" style={{ transform: `scaleX(${facing})` }}>
            <Mascot concept={concept} state={state} size={WALKER} live look={look} walking={walking} />
          </div>
        </div>
        <div className="mc-term-bar">
          <span>server-guy · grafana stack</span>
          <span className="mc-term-tag">Decorative · scripted loop, not a real session</span>
        </div>
        <div className="mc-term-body" aria-hidden="true">
          {TERMINAL_SCRIPT.slice(0, shown).map((l, i) => (
            <div key={i} className="mc-term-line" data-kind={l.kind} data-current={i === shown - 1 ? "1" : undefined}>
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
