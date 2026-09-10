"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject,
} from "react";

import { beaver } from "./beaver";
import { crab } from "./crab";
import { lantern } from "./lantern";
import { EXPRESSIONS, type ConceptId, type StateId } from "./model";
import { mote } from "./mote";
import { otter } from "./otter";
import { Glyph, Sparkles, type CharacterDef } from "./parts";
import { REACTIONS, type Override, type ReactCtx, type ReactionKind } from "./reactions";
import { tardigrade } from "./tardigrade";

export const CHARACTERS: Record<ConceptId, CharacterDef> = { otter, crab, tardigrade, lantern, beaver, mote };

/** Page-wide motion: reduced (system setting or preview toggle) and whether the tab is hidden. */
export const MotionContext = createContext({ reduced: false, hidden: false });

export type MascotHandle = {
  pressStart(): void;
  pressEnd(): void;
  poke(): void;
  surprise(): void;
  /** Plays the idle behaviour; returns its duration, or 0 when busy. */
  idle(): number;
  celebrate(): void;
};

type Props = {
  concept: ConceptId;
  state: StateId;
  size: number;
  /** Blinks and reacts to state changes on its own. */
  live?: boolean;
  /** Eyes follow the pointer over trackRef (or the parent element). */
  track?: boolean;
  trackRef?: RefObject<HTMLElement | null>;
  celebrateDelay?: number;
  /** Resting gaze override, e.g. looking down at a log line. */
  look?: [number, number] | null;
  walking?: boolean;
  handleRef?: Ref<MascotHandle>;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Mascot({
  concept,
  state,
  size,
  live = false,
  track = false,
  trackRef,
  celebrateDelay = 0,
  look = null,
  walking = false,
  handleRef,
  className = "",
}: Props) {
  const { reduced } = useContext(MotionContext);
  const def = CHARACTERS[concept];
  const uid = `mc${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [override, setOverride] = useState<Override | null>(null);
  const timers = useRef<number[]>([]);
  const busy = useRef<{ until: number; kind: ReactionKind | null }>({ until: 0, kind: null });
  const pokes = useRef<number[]>([]);

  // Everything a reaction needs, kept current for handlers created once.
  const live$ = useRef({ reduced, concept });
  live$.current = { reduced, concept };

  const api = useRef({
    reset() {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      svgRef.current?.getAnimations({ subtree: true }).forEach((a) => {
        if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.cancel();
      });
      setOverride(null);
      busy.current = { until: 0, kind: null };
    },
    run(kind: ReactionKind) {
      const root = svgRef.current;
      if (!root) return 0;
      this.reset();
      const ctx: ReactCtx = {
        root,
        reduced: live$.current.reduced,
        set: setOverride,
        later: (ms, fn) => void timers.current.push(window.setTimeout(fn, ms)),
      };
      const ms = REACTIONS[live$.current.concept][kind](ctx);
      busy.current = { until: performance.now() + ms, kind };
      return ms;
    },
    springBack() {
      if (live$.current.reduced) return;
      svgRef.current?.querySelector(".mc-press")?.animate(
        [
          { transform: "scale(1.1, 0.86)" },
          { offset: 0.35, transform: "scale(0.94, 1.08)" },
          { offset: 0.7, transform: "scale(1.03, 0.98)" },
          { transform: "scale(1, 1)" },
        ],
        { duration: 460, easing: "ease-out" },
      );
    },
    poke() {
      const now = performance.now();
      const b = busy.current;
      if (b.kind === "surprise" && now < b.until) return;
      pokes.current = [...pokes.current.filter((t) => now - t < 1100), now];
      if (pokes.current.length >= 3) {
        pokes.current = [];
        this.run("surprise");
        return;
      }
      if (now < b.until && b.kind === "poke") return;
      this.run("poke");
    },
  });

  useEffect(() => {
    const t = timers;
    return () => t.current.forEach(clearTimeout);
  }, []);

  useImperativeHandle(
    handleRef,
    () => ({
      pressStart() {
        if (svgRef.current) svgRef.current.dataset.press = "1";
      },
      pressEnd() {
        const el = svgRef.current;
        if (!el?.dataset.press) return;
        delete el.dataset.press;
        api.current.springBack();
        api.current.poke();
      },
      poke() {
        api.current.springBack();
        api.current.poke();
      },
      surprise() {
        pokes.current = [];
        api.current.run("surprise");
      },
      idle() {
        return performance.now() < busy.current.until ? 0 : api.current.run("idle");
      },
      celebrate() {
        api.current.run("celebrate");
      },
    }),
    [],
  );

  // React to state changes: celebrate a verified check, flinch on a failure.
  const prevState = useRef(state);
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    if (!live || prev === state) return;
    if (state === "verified") {
      const t = window.setTimeout(() => api.current.run("celebrate"), celebrateDelay);
      return () => clearTimeout(t);
    }
    if (state === "failed") api.current.run("fail");
    else if (performance.now() < busy.current.until && busy.current.kind !== "surprise") api.current.reset();
  }, [state, live, celebrateDelay]);

  // Random blinks, 2.5 to 6 seconds apart.
  useEffect(() => {
    if (!live || reduced) return;
    let t = 0;
    const next = () => {
      t = window.setTimeout(() => {
        const el = svgRef.current;
        if (el && !document.hidden) {
          el.dataset.blink = "1";
          window.setTimeout(() => delete el.dataset.blink, 120);
        }
        next();
      }, 2500 + Math.random() * 3500);
    };
    next();
    return () => clearTimeout(t);
  }, [live, reduced]);

  // Eyes follow the pointer and the body leans, smoothed in one rAF loop that stops when settled.
  useEffect(() => {
    const svg = svgRef.current;
    const area = trackRef?.current ?? svg?.parentElement;
    if (!track || reduced || !svg || !area) return;
    let raf = 0;
    let tx = 0, ty = 0, tl = 0, x = 0, y = 0, l = 0;
    const write = () => {
      svg.style.setProperty("--mc-gx", x.toFixed(2));
      svg.style.setProperty("--mc-gy", y.toFixed(2));
      svg.style.setProperty("--mc-lean", l.toFixed(2));
    };
    const tick = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      l += (tl - l) * 0.12;
      write();
      raf = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tl - l) < 0.02 ? 0 : requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const s = Math.max(r.width, 120);
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.45);
      tx = clamp(dx / s, -1, 1) * 6;
      ty = clamp(dy / s, -1, 1) * 4.5;
      tl = clamp(dx / (s * 2), -1, 1) * 5;
      kick();
    };
    const leave = () => {
      tx = ty = tl = 0;
      kick();
    };
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerleave", leave);
    return () => {
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
      x = y = l = 0;
      write();
    };
  }, [track, reduced, trackRef]);

  const expr = {
    ...EXPRESSIONS[state],
    ...(look ? { gazeX: look[0], gazeY: look[1] } : null),
    ...override?.expr,
  };
  const extras = { ...def.extras[state], ...override?.extras };
  const vars: Record<string, string | number> = {
    "--mc-open": expr.open,
    "--mc-gx0": expr.gazeX,
    "--mc-gy0": expr.gazeY,
    "--mc-brow": expr.brow,
    "--mc-brow-lift": expr.browLift,
    "--mc-brow-asym": expr.browAsym,
    "--mc-brow-o": expr.browOpacity,
    "--mc-sq": reduced ? 1 : expr.squash,
    "--mc-tilt": reduced ? 0 : expr.tilt,
    "--mc-sw": Math.max(2.75, 300 / size).toFixed(2),
    "--mc-fw": Math.max(4.6, 150 / size).toFixed(2),
  };
  for (const [k, v] of Object.entries(extras)) vars[`--mc-x-${k}`] = v;
  const Art = def.Art;

  return (
    <svg
      ref={svgRef}
      className={`mc-char mc-char--${concept} ${className}`}
      viewBox="0 0 240 240"
      width={size}
      height={size}
      style={vars as CSSProperties}
      data-state={state}
      data-eyes={expr.eyes}
      data-mouth={expr.mouth}
      data-loop={reduced ? "none" : expr.loop}
      data-react={override?.react}
      data-size={size <= 32 ? "xs" : size <= 64 ? "s" : "l"}
      data-walking={walking ? "1" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="mc-shadow" cx={120} cy={229} rx={def.shadowRx} ry={6.5} />
      <Sparkles at={def.sparkleAt} />
      <g className="mc-react">
        <g className="mc-lean">
          <g className="mc-pose">
            <g className="mc-loop">
              <g className="mc-press">
                <Art uid={uid} />
              </g>
            </g>
          </g>
        </g>
      </g>
      <Glyph at={def.glyphAt} />
    </svg>
  );
}
