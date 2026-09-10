"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject,
} from "react";

import type { Mood } from "./pose";
import type { FamilyId } from "./roster";
import { MascotStage, type Framing } from "./stage";

import "./mascot-family.css";

export type LiveHandle = {
  pressStart(): void;
  /** Ends a press: the character springs back and reacts. */
  pressEnd(): void;
  /** A poke without a pointer press, e.g. from the keyboard. */
  poke(): void;
  /** The character's favourite dance. */
  surprise(): void;
  /** Plays the idle behaviour; returns its length, or 0 when out of place. */
  idle(): number;
  celebrate(): void;
  /** Walking direction along the terminal's top edge: -1, 0 or 1. */
  walk(direction: number): void;
  /** Looking down at a log line. */
  look(down: boolean): void;
};

type Props = {
  id: FamilyId;
  mood: Mood;
  /** Reduced motion: expressions change; nothing loops, travels or flips. */
  still: boolean;
  framing?: Framing;
  /** The gaze follows the pointer over this element; defaults to the stage. */
  trackRef?: RefObject<HTMLElement | null>;
  celebrateDelay?: number;
  handleRef?: Ref<LiveHandle>;
  className?: string;
};

const SPARKS = [
  "#ffc94d",
  "#ffffff",
  "#8fb3ff",
  "#ffffff",
  "#ffc94d",
  "#8fb3ff",
  "#ffffff",
  "#8fb3ff",
];

/** Eight sparkles fan up and out from above the head, never over the face. */
function burst(fx: HTMLElement | null, spread: number) {
  fx?.querySelectorAll<HTMLElement>(".mf-spark").forEach((el, i) => {
    const a = (-170 + (i * 160) / 7) * (Math.PI / 180);
    const d = (i % 2 ? 58 : 84) * spread;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.8 - 6;
    const mid = `translate(${(x * 0.86).toFixed(1)}px, ${(y * 0.86).toFixed(1)}px)`;
    const end = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.animate(
      [
        { transform: "translate(0px, 0px) scale(0) rotate(0deg)", opacity: 1 },
        {
          offset: 0.55,
          transform: `${mid} scale(1) rotate(80deg)`,
          opacity: 1,
        },
        { transform: `${end} scale(0.2) rotate(140deg)`, opacity: 0 },
      ],
      {
        duration: 900,
        delay: (i % 3) * 30,
        easing: "cubic-bezier(.2,.8,.3,1)",
      },
    );
  });
}

/**
 * One live family member: its own WebGL canvas, DOM sparkles and z's, and a
 * handle for pokes, surprises, idles and walking.
 */
export function LiveMascot({
  id,
  mood,
  still,
  framing = "stage",
  trackRef,
  celebrateDelay = 0,
  handleRef,
  className = "",
}: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const fxRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<MascotStage | null>(null);
  const pokes = useRef<number[]>([]);
  const timers = useRef<number[]>([]);
  const [glyph, setGlyph] = useState(false);
  // The latest props, for a renderer created once and for event handlers.
  const latest = useRef({ id, mood, still });
  useEffect(() => {
    latest.current = { id, mood, still };
  });

  // One renderer per live character, released on unmount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = MascotStage.create(framing);
    if (!stage) {
      // No WebGL: the fallback face shows instead.
      host.dataset.broken = "1";
      return;
    }
    const now = latest.current;
    stage.setMember(now.id);
    stage.setMood(now.mood);
    stage.setStill(now.still);
    stage.mount(host, trackRef?.current ?? host);
    stageRef.current = stage;
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, [framing, trackRef]);

  useEffect(() => {
    stageRef.current?.setMember(id);
  }, [id]);
  useEffect(() => {
    stageRef.current?.setStill(still);
  }, [still]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  /** Sparkles over the canvas; under reduced motion a still glyph instead. */
  const sparkle = (delay: number) => {
    if (latest.current.still) {
      setGlyph(true);
      timers.current.push(window.setTimeout(() => setGlyph(false), 1400));
      return;
    }
    const spread = framing === "walker" ? 0.55 : 1;
    timers.current.push(
      window.setTimeout(() => burst(fxRef.current, spread), delay),
    );
  };
  const celebrate = () => {
    if (!stageRef.current) return;
    stageRef.current.play("celebrate");
    sparkle(280);
  };

  useImperativeHandle(
    handleRef,
    () => {
      const surprise = () => {
        const stage = stageRef.current;
        if (!stage) return;
        pokes.current = [];
        const ms = stage.play("dance");
        sparkle(Math.max(0, ms - 260));
      };
      const poke = () => {
        const stage = stageRef.current;
        if (!stage) return;
        const now = performance.now();
        const busy = stage.current();
        if (busy?.kind === "dance") return;
        pokes.current = [...pokes.current.filter((t) => now - t < 1100), now];
        if (pokes.current.length >= 3) {
          surprise();
          return;
        }
        if (busy?.kind === "poke") return;
        stage.play("poke");
      };
      return {
        pressStart: () => stageRef.current?.pressStart(),
        pressEnd: () => {
          if (stageRef.current?.pressEnd()) poke();
        },
        poke: () => {
          stageRef.current?.bounce();
          poke();
        },
        surprise,
        idle: () => {
          const stage = stageRef.current;
          return stage && !stage.current() ? stage.play("idle") : 0;
        },
        celebrate,
        walk: (direction) => stageRef.current?.setWalk(direction),
        look: (down) => stageRef.current?.setLook(down),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [framing],
  );

  // State changes: celebrate a verified check, flinch on a failure, and
  // drop small reactions.
  const prevMood = useRef(mood);
  useEffect(() => {
    const stage = stageRef.current;
    const prev = prevMood.current;
    prevMood.current = mood;
    if (!stage) return;
    stage.setMood(mood);
    if (prev === mood) return;
    if (mood === "celebrating") {
      const t = window.setTimeout(celebrate, celebrateDelay);
      return () => clearTimeout(t);
    }
    if (mood === "attention") stage.play("flinch");
    else stage.interrupt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, celebrateDelay]);

  const glyphOn = glyph || (still && mood === "celebrating");
  return (
    <span
      ref={hostRef}
      className={`mf-live ${className}`}
      data-framing={framing}
      data-still={still ? "1" : undefined}
      data-glyph={glyphOn ? "1" : undefined}
      aria-hidden="true"
    >
      <span className="mf-fx" ref={fxRef}>
        {SPARKS.map((c, i) => (
          <i
            key={i}
            className="mf-spark"
            style={{ "--c": c } as CSSProperties}
          />
        ))}
      </span>
      <span className="mf-glyph">
        <i />
        <i />
      </span>
      <span className="mf-z">
        <b>z</b>
        <b>z</b>
      </span>
      <span className="mf-fallback">
        ▰<br />• •<br />⌣
      </span>
    </span>
  );
}
