"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// A sliding selector you can click, drag or step with the keyboard. The
// thumb is a spring: it stretches in the direction of travel, overshoots a
// little and settles. A change is acknowledged once, with a sparkle burst
// and a single light sweep across the track.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  burst,
  reducedMotion,
  sparklePalettes,
  stepSpring,
  type Spring,
} from "./motion";

export interface SliderOption<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

export function TactileSlider<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string;
  options: SliderOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const motion = useRef({
    x: { x: 0, v: 0 } as Spring,
    w: { x: 0, v: 0 } as Spring,
    raf: 0,
    ready: false,
    drag: null as null | { offset: number; start: number; moved: boolean },
  });
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const indexRef = useRef(index);
  const [pressed, setPressed] = useState(false);

  const geometry = useCallback(
    () =>
      buttons.current.map((button) =>
        button
          ? { left: button.offsetLeft, width: button.offsetWidth }
          : { left: 0, width: 0 },
      ),
    [],
  );

  const paint = useCallback(() => {
    const m = motion.current;
    const el = thumb.current;
    if (!el) return;
    const stretch = Math.min(0.24, Math.abs(m.x.v) / 5000);
    el.style.width = `${m.w.x}px`;
    el.style.transform = `translateX(${m.x.x}px) scaleX(${1 + stretch}) scaleY(${1 - stretch * 0.5})`;
  }, []);

  const settle = useCallback(
    (i: number) => {
      const target = geometry()[i];
      const m = motion.current;
      if (!target) return;
      cancelAnimationFrame(m.raf);
      if (!m.ready || reducedMotion()) {
        m.x = { x: target.left, v: 0 };
        m.w = { x: target.width, v: 0 };
        m.ready = true;
        paint();
        return;
      }
      let last = performance.now();
      const tick = (time: number) => {
        const dt = Math.min(0.032, (time - last) / 1000);
        last = time;
        const doneX = stepSpring(m.x, target.left, dt, 420, 24);
        const doneW = stepSpring(m.w, target.width, dt, 460, 30);
        paint();
        if (doneX && doneW) {
          m.x = { x: target.left, v: 0 };
          m.w = { x: target.width, v: 0 };
          paint();
        } else m.raf = requestAnimationFrame(tick);
      };
      m.raf = requestAnimationFrame(tick);
    },
    [geometry, paint],
  );

  useLayoutEffect(() => {
    indexRef.current = index;
    settle(index);
  }, [index, settle]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      motion.current.ready = false;
      settle(indexRef.current);
    });
    observer.observe(el);
    const m = motion.current;
    return () => {
      observer.disconnect();
      cancelAnimationFrame(m.raf);
    };
  }, [settle]);

  const nearest = (center: number) => {
    const g = geometry();
    let best = 0;
    g.forEach((item, i) => {
      const a = Math.abs(item.left + item.width / 2 - center);
      const b = Math.abs(g[best].left + g[best].width / 2 - center);
      if (a < b) best = i;
    });
    return best;
  };

  function choose(i: number) {
    const option = options[i];
    if (!option) return;
    if (option.id === value) {
      settle(i);
      return;
    }
    onChange(option.id);
    const el = track.current;
    if (!el) return;
    const g = geometry()[i];
    const rect = el.getBoundingClientRect();
    burst(rect.left + g.left + g.width / 2, rect.top + rect.height / 2, {
      count: 11,
      palette: sparklePalettes.mode,
      spread: 36,
    });
    if (!reducedMotion()) {
      el.classList.remove("ax-sweeping");
      void el.offsetWidth;
      el.classList.add("ax-sweeping");
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const m = motion.current;
    const x = event.clientX - rect.left;
    const onThumb = x >= m.x.x && x <= m.x.x + m.w.x;
    m.drag = {
      offset: onThumb ? x - m.x.x : m.w.x / 2,
      start: event.clientX,
      moved: false,
    };
    setPressed(true);
    el.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const m = motion.current;
    const el = track.current;
    if (!m.drag || !el) return;
    if (Math.abs(event.clientX - m.drag.start) > 4) m.drag.moved = true;
    if (!m.drag.moved) return;
    cancelAnimationFrame(m.raf);
    const g = geometry();
    const rect = el.getBoundingClientRect();
    const min = g[0].left;
    const max = g[g.length - 1].left + g[g.length - 1].width - m.w.x;
    const x = Math.max(
      min,
      Math.min(max, event.clientX - rect.left - m.drag.offset),
    );
    m.x.v = (x - m.x.x) * 60;
    m.x.x = x;
    const target = g[nearest(x + m.w.x / 2)];
    m.w.x += (target.width - m.w.x) * 0.25;
    paint();
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const m = motion.current;
    const el = track.current;
    if (!m.drag || !el) return;
    const rect = el.getBoundingClientRect();
    const moved = m.drag.moved;
    m.drag = null;
    setPressed(false);
    if (el.hasPointerCapture(event.pointerId))
      el.releasePointerCapture(event.pointerId);
    choose(nearest(moved ? m.x.x + m.w.x / 2 : event.clientX - rect.left));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    let next = index + step;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = options.length - 1;
    if (next === index || next < 0 || next >= options.length) return;
    event.preventDefault();
    choose(next);
    buttons.current[next]?.focus();
  }

  return (
    <div
      className={`ax-slider ax-slider-${size}`}
      role="radiogroup"
      aria-label={label}
    >
      <div
        ref={track}
        className={`ax-slider-track${pressed ? " is-pressed" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          motion.current.drag = null;
          setPressed(false);
          settle(index);
        }}
        onKeyDown={onKeyDown}
        onAnimationEnd={(event) =>
          event.currentTarget.classList.remove("ax-sweeping")
        }
      >
        <span ref={thumb} className="ax-slider-thumb" aria-hidden="true" />
        {options.map((option, i) => (
          <button
            key={option.id}
            ref={(element) => {
              buttons.current[i] = element;
            }}
            type="button"
            role="radio"
            aria-checked={option.id === value}
            tabIndex={option.id === value ? 0 : -1}
            className={option.id === value ? "is-on" : undefined}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
