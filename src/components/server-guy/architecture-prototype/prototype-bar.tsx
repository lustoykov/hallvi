"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// The prototype's own controls, deliberately not in the product's style:
// which direction, which record, and a reduced-motion preview. Hidden in
// production builds by the caller.

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect } from "react";

import type { ScenarioId } from "./model";

export interface VariantEntry {
  key: string;
  id: string;
  name: string;
}

export const scenarios: {
  id: ScenarioId;
  label: string;
  note: string;
  invented: boolean;
}[] = [
  {
    id: "live",
    label: "Live record",
    note: "The recorded state, as it is now",
    invented: false,
  },
  {
    id: "later",
    label: "3 days later",
    note: "Same record, simulated clock: evidence ages",
    invented: true,
  },
  {
    id: "failing",
    label: "Prometheus failing",
    note: "Invented monitoring check",
    invented: true,
  },
  {
    id: "planned",
    label: "Before deploy",
    note: "Invented: the plan, nothing running",
    invented: true,
  },
];

export function PrototypeBar({
  variants,
  variant,
  onVariant,
  scenario,
  onScenario,
  source,
  reduced,
  onReduced,
  choices,
}: {
  variants: VariantEntry[];
  variant: VariantEntry;
  onVariant: (id: string) => void;
  scenario: ScenarioId;
  onScenario: (id: ScenarioId) => void;
  source: "live" | "local" | "loading";
  reduced: boolean;
  onReduced: (reduced: boolean) => void;
  /** The record scenarios this page can show; all of them by default. */
  choices?: ScenarioId[];
}) {
  const index = variants.findIndex((item) => item.id === variant.id);
  const step = (delta: number) =>
    onVariant(variants[(index + delta + variants.length) % variants.length].id);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("[role='radiogroup']"))
      )
        return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const current = scenarios.find((item) => item.id === scenario)!;
  return (
    <div className="ax-bar" role="region" aria-label="Prototype controls">
      <span className="ax-bar-tag">Prototype</span>
      <div className="ax-bar-variant">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous direction"
        >
          <CaretLeft weight="bold" />
        </button>
        <span className="ax-bar-name">
          <b>{variant.key}</b>
          {variant.name}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next direction"
        >
          <CaretRight weight="bold" />
        </button>
      </div>
      <div className="ax-bar-scenarios" role="radiogroup" aria-label="Record">
        {scenarios
          .filter((item) => !choices || choices.includes(item.id))
          .map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === scenario}
              title={item.note}
              onClick={() => onScenario(item.id)}
            >
              {item.label}
            </button>
          ))}
      </div>
      <span
        className={`ax-bar-source${current.invented ? " is-invented" : ""}`}
      >
        {current.invented
          ? `Invented · ${current.note}`
          : source === "live"
            ? "Live record"
            : source === "loading"
              ? "Reading the record…"
              : "Local copy (live record unavailable)"}
      </span>
      <button
        type="button"
        className="ax-bar-motion"
        aria-pressed={reduced}
        onClick={() => onReduced(!reduced)}
      >
        Reduced motion
      </button>
    </div>
  );
}
