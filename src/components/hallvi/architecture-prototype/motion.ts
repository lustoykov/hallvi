"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Shared motion for the three Architecture directions: one sparkle burst,
// one spring, one reduced-motion switch. Motion here acknowledges an action,
// explains a change, shows activity or celebrates a verified result; nothing
// loops on its own.

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function reducedMotion() {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia(QUERY).matches ||
    document.documentElement.dataset.axMotion === "reduced"
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setReduced(reducedMotion());
    update();
    query.addEventListener("change", update);
    window.addEventListener("ax-motion", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("ax-motion", update);
    };
  }, []);
  return reduced;
}

/** The prototype bar's "Reduced motion" preview, for judging the fallback. */
export function setMotionPreview(reduced: boolean) {
  if (reduced) document.documentElement.dataset.axMotion = "reduced";
  else delete document.documentElement.dataset.axMotion;
  window.dispatchEvent(new Event("ax-motion"));
}

export const sparklePalettes = {
  mode: ["#285ad8", "#6f8ff0", "#9fb4f5", "#5ab0e6", "#ffffff"],
  verified: ["#14945f", "#3fbf86", "#9bdcbc", "#f2c94c", "#ffffff"],
  failed: ["#a6312b", "#d9776f", "#f2d3d0"],
};

let layer: HTMLDivElement | null = null;
function sparkleLayer() {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement("div");
  layer.className = "ax-sparkle-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  return layer;
}

const STAR =
  '<svg viewBox="0 0 10 10"><path d="M5 0C5.5 3.3 6.7 4.5 10 5 6.7 5.5 5.5 6.7 5 10 4.5 6.7 3.3 5.5 0 5 3.3 4.5 4.5 3.3 5 0Z" fill="currentColor"/></svg>';

export interface BurstOptions {
  count?: number;
  palette?: string[];
  spread?: number;
  size?: number;
  duration?: number;
  rise?: number;
}

/** A small four-point sparkle burst at a viewport position. */
export function burst(
  x: number,
  y: number,
  {
    count = 12,
    palette = sparklePalettes.mode,
    spread = 44,
    size = 9,
    duration = 760,
    rise = 10,
  }: BurstOptions = {},
) {
  if (reducedMotion()) return;
  const host = sparkleLayer();
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "ax-sparkle";
    const s = size * (0.55 + Math.random() * 0.8);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${s}px`;
    el.style.height = `${s}px`;
    el.style.color = palette[i % palette.length];
    el.innerHTML = STAR;
    host.appendChild(el);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.7;
    const distance = spread * (0.5 + Math.random() * 0.75);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - rise;
    const spin = (Math.random() - 0.5) * 240;
    const animation = el.animate(
      [
        {
          transform: "translate(-50%, -50%) scale(0) rotate(0deg)",
          opacity: 1,
        },
        {
          transform: `translate(calc(-50% + ${dx * 0.72}px), calc(-50% + ${dy * 0.72}px)) scale(1) rotate(${spin * 0.6}deg)`,
          opacity: 1,
          offset: 0.42,
        },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 16}px)) scale(0.15) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: duration * (0.8 + Math.random() * 0.4),
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );
    animation.onfinish = () => el.remove();
  }
}

export function burstAt(element: Element | null, options?: BurstOptions) {
  if (!element) return;
  const r = element.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, options);
}

export interface Spring {
  x: number;
  v: number;
}

/** One semi-implicit Euler step; true once the spring has settled. */
export function stepSpring(
  s: Spring,
  target: number,
  dt: number,
  stiffness = 380,
  damping = 26,
) {
  const a = -stiffness * (s.x - target) - damping * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
  return Math.abs(s.x - target) < 0.02 && Math.abs(s.v) < 0.02;
}
