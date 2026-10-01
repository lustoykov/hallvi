"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// The floating bar: previous, the variant's name and what it bets on, next.
// Dark on purpose, so nobody mistakes it for part of the page being judged.
// Never shipped.

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect } from "react";

import { VARIANTS, setOverviewVariant, type OverviewVariant } from "./variant";

export function OverviewSwitcher({ value }: { value: OverviewVariant }) {
  const index = Math.max(
    0,
    VARIANTS.findIndex((one) => one.key === value),
  );
  const current = VARIANTS[index];

  useEffect(() => {
    const step = (by: number) =>
      setOverviewVariant(
        VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key,
      );
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable]") ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index]);

  if (process.env.NODE_ENV === "production") return null;
  const go = (by: number) =>
    setOverviewVariant(
      VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key,
    );
  return (
    <div className="ovx-switcher" role="toolbar" aria-label="Prototype">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
      >
        <CaretLeft weight="bold" />
      </button>
      <p>
        <b>{current.name}</b>
        <span>{current.note}</span>
      </p>
      <ol aria-label="Variants">
        {VARIANTS.map((one) => (
          <li key={one.key}>
            <button
              type="button"
              aria-label={one.name}
              aria-current={one.key === current.key || undefined}
              onClick={() => setOverviewVariant(one.key)}
            />
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        <CaretRight weight="bold" />
      </button>
    </div>
  );
}
