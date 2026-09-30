"use client";

// PROTOTYPE · prototype/calm-asks-visuals · throwaway.
// The pieces the three wordless treatments draw with, and the prototype's own
// bar, which is deliberately not in the product's style.

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect } from "react";

import {
  setCalmVariant,
  useCalmVariant,
  VARIANTS,
  type CalmVariant,
} from "./variant";
import "./calm-asks.css";

export type OpenTone = "waiting" | "failed";

function spoken(tones: OpenTone[]) {
  const waiting = tones.filter((tone) => tone === "waiting").length;
  const failed = tones.length - waiting;
  return [
    waiting && `${waiting} awaiting approval`,
    failed && `${failed} failed`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * A: one mark per open thing. A decision waiting is an open ring, something
 * that failed is a filled dot, so the difference survives without colour.
 */
export function StateMarks({ tones }: { tones: OpenTone[] }) {
  return (
    <span
      className="cap-marks"
      role="img"
      aria-label={`Unresolved: ${spoken(tones)}`}
    >
      {tones.map((tone, index) => (
        <i key={index} data-tone={tone} />
      ))}
    </span>
  );
}

/**
 * C: Little Server, flat, holding up a note with the count on it. The note
 * is paper, not a badge: it tilts, and it is amber or red only along its top.
 */
export function NoteMascot({
  tones,
  small = false,
}: {
  tones: OpenTone[];
  /** In a filter row: the note carries lines, the row carries the count. */
  small?: boolean;
}) {
  const tone = tones.includes("failed") ? "failed" : "waiting";
  return (
    <span
      className="cap-hallvi"
      data-small={small || undefined}
      role="img"
      aria-label={`Unresolved: ${spoken(tones)}`}
    >
      <svg className="cap-hallvi-body" viewBox="0 0 40 36" aria-hidden="true">
        {[13, 23].map((x) => (
          <g key={x}>
            <path d={`M${x} 9V3.5`} stroke="#3e4a60" strokeWidth="1.4" />
            <circle cx={x} cy="2.6" r="1.9" fill="#9db8f0" />
          </g>
        ))}
        <rect x="5" y="8" width="26" height="24" rx="5.5" fill="#7a8bd6" />
        <rect x="7.5" y="11" width="21" height="11" rx="3.5" fill="#192338" />
        <g fill="#edf3ff">
          <rect x="13" y="14" width="2.2" height="4.4" rx="1.1" />
          <rect x="20.8" y="14" width="2.2" height="4.4" rx="1.1" />
        </g>
        <path
          d="M16 19.6q2 1.5 4 0"
          stroke="#d6e5ff"
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M12 26v3M15 26v3M18 26v3M21 26v3M24 26v3"
          stroke="#5b6bb5"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path d="M9 32h7v2.5H9zM20 32h7v2.5h-7z" fill="#3e4a60" />
        {/* The arm, raised to hold the note up beside him. */}
        <path
          d="M31 21.5q4.5-1 6.5-6"
          stroke="#7a8bd6"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="cap-note" data-tone={tone}>
        {small ? (
          <>
            <i />
            <i />
          </>
        ) : (
          tones.length
        )}
      </span>
    </span>
  );
}

/** The prototype's controls: ← → through the treatments, and where to look. */
export function CalmAsksBar() {
  const variant = useCalmVariant();
  const index = VARIANTS.findIndex((one) => one.key === variant);
  const step = (delta: number) =>
    setCalmVariant(
      VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]
        .key as CalmVariant,
    );
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (process.env.NODE_ENV === "production") return null;
  const go = (path: string) => `${path}?variant=${variant}`;
  return (
    <div className="cap-bar" role="region" aria-label="Prototype controls">
      <span className="cap-bar-tag">Prototype</span>
      <div className="cap-bar-variant">
        <button type="button" onClick={() => step(-1)} aria-label="Previous">
          <CaretLeft weight="bold" />
        </button>
        <span>{VARIANTS[index].name}</span>
        <button type="button" onClick={() => step(1)} aria-label="Next">
          <CaretRight weight="bold" />
        </button>
      </div>
      <nav className="cap-bar-pages" aria-label="Pages to compare">
        {PAGES.map((page) => (
          <a key={page.href} href={go(page.path) + page.hash}>
            {page.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

const PAGES = [
  {
    label: "Overview · Notes",
    path: "/applications/aaaaaaaa-0000-4000-8000-000000000008",
    hash: "#overview",
  },
  {
    label: "Overview · Four releases",
    path: "/applications/dddddddd-0000-4000-8000-000000000001",
    hash: "#overview",
  },
  {
    label: "Overview · not deployed",
    path: "/applications/aaaaaaaa-0000-4000-8000-000000000009",
    hash: "#overview",
  },
  {
    label: "History",
    path: "/applications/dddddddd-0000-4000-8000-000000000001",
    hash: "#history",
  },
].map((page) => ({ ...page, href: page.path + page.hash }));
