"use client";

import {
  CircleNotch,
  HourglassMedium,
  Leaf,
  MagnifyingGlass,
  MoonStars,
  Sparkle,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { STATES, stateMeta, type StateId } from "./model";
import { MotionContext } from "./motion";

export const STATE_ICONS: Record<StateId, Icon> = {
  calm: Leaf,
  checking: MagnifyingGlass,
  working: CircleNotch,
  waiting: HourglassMedium,
  failed: WarningCircle,
  stale: MoonStars,
  verified: Sparkle,
};

const SPARK_COLORS = [
  "#ffc94d",
  "#8fb3ff",
  "#ffffff",
  "#ffc94d",
  "#8fb3ff",
  "#ffffff",
  "#ffc94d",
];

/**
 * A sliding pill for the application state. The thumb is a damped spring:
 * it stretches toward where it is going, overshoots a little and settles.
 * Click a segment, drag the thumb, or use the arrow keys.
 */
export function StateSelector({
  value,
  onChange,
}: {
  value: StateId;
  onChange: (s: StateId) => void;
}) {
  const { reduced } = useContext(MotionContext);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const segs = useRef<(HTMLButtonElement | null)[]>([]);
  const fx = useRef<HTMLDivElement>(null);
  const sim = useRef({
    x: 0,
    w: 0,
    v: 0,
    vw: 0,
    tx: 0,
    tw: 0,
    raf: 0,
    last: 0,
  });
  const drag = useRef<{ id: number; startX: number; moved: boolean } | null>(
    null,
  );
  const [dragOver, setDragOver] = useState<number | null>(null);
  const index = STATES.findIndex((s) => s.id === value);
  const reduced$ = useRef(reduced);
  const valueRef = useRef(value);
  useEffect(() => {
    reduced$.current = reduced;
    valueRef.current = value;
  }, [reduced, value]);

  const paint = () => {
    const s = sim.current;
    const thumb = thumbRef.current;
    if (!thumb) return;
    const stretch = Math.min(Math.abs(s.v) * 0.045, 28);
    const left = s.v < 0 ? s.x - stretch : s.x;
    thumb.style.width = `${s.w + stretch}px`;
    thumb.style.transform = `translateX(${left}px) scaleY(${1 - stretch / 240})`;
  };

  const tick = (now: number) => {
    const s = sim.current;
    const dt = Math.min(0.032, (now - s.last) / 1000);
    s.last = now;
    const k = 300;
    const c = 23;
    s.v += (k * (s.tx - s.x) - c * s.v) * dt;
    s.x += s.v * dt;
    s.vw += (k * (s.tw - s.w) - c * s.vw) * dt;
    s.w += s.vw * dt;
    const settled =
      Math.abs(s.tx - s.x) < 0.3 &&
      Math.abs(s.v) < 6 &&
      Math.abs(s.tw - s.w) < 0.3 &&
      Math.abs(s.vw) < 6;
    if (settled) {
      Object.assign(s, { x: s.tx, w: s.tw, v: 0, vw: 0, raf: 0 });
      paint();
      return;
    }
    paint();
    s.raf = requestAnimationFrame(tick);
  };

  const moveTo = (tx: number, tw: number, instant = false) => {
    const s = sim.current;
    s.tx = tx;
    s.tw = tw;
    if (instant || reduced$.current) {
      cancelAnimationFrame(s.raf);
      Object.assign(s, { x: tx, w: tw, v: 0, vw: 0, raf: 0 });
      paint();
      return;
    }
    if (!s.raf) {
      s.last = performance.now();
      s.raf = requestAnimationFrame(tick);
    }
  };

  const segBox = (i: number) => {
    const el = segs.current[i];
    return el ? { x: el.offsetLeft, w: el.offsetWidth } : { x: 0, w: 0 };
  };

  // Place the thumb without animation on mount and whenever the layout
  // changes (fonts, resize).
  const first = useRef(true);
  useLayoutEffect(() => {
    const snap = () => {
      const b = segBox(STATES.findIndex((s) => s.id === valueRef.current));
      moveTo(b.x, b.w, true);
    };
    snap();
    const ro = new ResizeObserver(snap);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  /** Sparkles fly out of the thumb; a soft sheen sweeps across the control. */
  const celebrate = (cx: number) => {
    const host = fx.current;
    if (!host) return;
    const dir = sim.current.v >= 0 ? 1 : -1;
    const sweep = host.querySelector<HTMLElement>(".mc-sel-sweep");
    sweep?.animate(
      [
        { transform: `translateX(${dir > 0 ? -60 : 60}%)`, opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { transform: `translateX(${dir > 0 ? 60 : -60}%)`, opacity: 0 },
      ],
      { duration: 760, easing: "cubic-bezier(.3,.6,.3,1)" },
    );
    for (let i = 0; i < 7; i++) {
      const el = document.createElement("span");
      el.className = "mc-sel-spark";
      el.style.left = `${cx}px`;
      el.style.setProperty("--c", SPARK_COLORS[i]);
      host.appendChild(el);
      const a =
        -Math.PI / 2 + ((i - 3) / 3) * 1.25 + (Math.random() - 0.5) * 0.3;
      const d = 22 + Math.random() * 16;
      el.animate(
        [
          {
            transform: "translate(-50%, -50%) scale(0.2) rotate(0deg)",
            opacity: 1,
          },
          {
            transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1) rotate(90deg)`,
            opacity: 1,
            offset: 0.55,
          },
          {
            transform: `translate(calc(-50% + ${Math.cos(a) * d * 1.3}px), calc(-50% + ${Math.sin(a) * d * 1.3 + 6}px)) scale(0.3) rotate(160deg)`,
            opacity: 0,
          },
        ],
        {
          duration: 720 + i * 20,
          delay: 120,
          easing: "cubic-bezier(.2,.8,.3,1)",
        },
      ).onfinish = () => el.remove();
    }
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const b = segBox(index);
    moveTo(b.x, b.w);
    if (!reduced) celebrate(b.x + b.w / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => () => cancelAnimationFrame(sim.current.raf), []);

  const nearest = (clientX: number) => {
    const track = trackRef.current!;
    const px = clientX - track.getBoundingClientRect().left;
    let best = 0;
    let bestD = Infinity;
    STATES.forEach((_, i) => {
      const b = segBox(i);
      const d = Math.abs(b.x + b.w / 2 - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return { i: best, px };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, startX: e.clientX, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < 5) return;
    if (!d.moved) {
      d.moved = true;
      trackRef.current?.setPointerCapture(e.pointerId);
    }
    const { i, px } = nearest(e.clientX);
    const s = sim.current;
    const trackW = trackRef.current!.clientWidth;
    moveTo(
      Math.min(Math.max(px - s.tw / 2, 2), trackW - s.tw - 2),
      segBox(i).w,
    );
    setDragOver(i);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    setDragOver(null);
    const { i } = nearest(e.clientX);
    if (i !== index) onChange(STATES[i].id);
    else {
      const b = segBox(i);
      moveTo(b.x, b.w);
    }
  };

  const onKeyDown = (e: { key: string; preventDefault(): void }) => {
    const map: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: STATES.length - 1,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = Math.min(STATES.length - 1, Math.max(0, map[e.key]));
    if (next !== index) onChange(STATES[next].id);
    segs.current[next]?.focus();
  };

  const tone = stateMeta(value).tone;

  return (
    <div className="mc-sel" data-tone={tone}>
      <div
        ref={trackRef}
        className="mc-sel-track"
        role="radiogroup"
        aria-label="Application state for all characters"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        data-dragging={dragOver !== null ? "1" : undefined}
      >
        <div ref={fx} className="mc-sel-fx" aria-hidden="true">
          <div className="mc-sel-sweep-clip">
            <div className="mc-sel-sweep" />
          </div>
        </div>
        <div ref={thumbRef} className="mc-sel-thumb" aria-hidden="true" />
        {STATES.map((s, i) => {
          const I = STATE_ICONS[s.id];
          const on = i === index;
          return (
            <button
              key={s.id}
              ref={(el) => {
                segs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className="mc-sel-seg"
              data-on={on ? "1" : undefined}
              data-over={dragOver === i ? "1" : undefined}
              data-tone={s.tone}
              onClick={() => onChange(s.id)}
            >
              <I
                size={14}
                weight={on ? "bold" : "regular"}
                aria-hidden="true"
              />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
