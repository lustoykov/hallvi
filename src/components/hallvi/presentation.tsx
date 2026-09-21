"use client";

// How certain a thing is, said the same way everywhere. The tag carries an
// icon as well as a tint so the state survives a colour-blind reading and a
// black-and-white print.

import {
  Check,
  Hourglass,
  MinusCircle,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { SavedInformation } from "@/server/operator-data";
import "./presentation.css";

/**
 * `aged` is a pass nobody has needed to repeat: calm, dated, never amber.
 * `stale` is the amber one, and is kept for what needs the owner — Pi's own
 * warning on a record.
 */
export type Tone =
  "verified" | "aged" | "stale" | "failed" | "unknown" | "absent";

const icons: Record<Tone, ReactNode> = {
  verified: <Check weight="bold" />,
  aged: <Check weight="bold" />,
  stale: <Warning weight="bold" />,
  failed: <Warning weight="bold" />,
  unknown: <MinusCircle weight="bold" />,
  absent: <Hourglass weight="bold" />,
};

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="hv-tag" data-tone={tone}>
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        {icons[tone]}
      </span>
      {children}
    </span>
  );
}

export function Working({ children }: { children: ReactNode }) {
  return (
    <span className="hv-tag" data-tone="unknown">
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        <SpinnerGap weight="bold" className="hv-spin" />
      </span>
      {children}
    </span>
  );
}

type Presentation = NonNullable<SavedInformation["presentation"]>;

/** The tone a saved record is read in, and the word that names it. */
export function toneOf(record: SavedInformation): { tone: Tone; word: string } {
  if (record.retiredAt) return { tone: "absent", word: "No longer current" };
  const status = record.presentation?.status ?? "info";
  if (status === "verified") return { tone: "verified", word: "Verified" };
  if (status === "failed") return { tone: "failed", word: "Failed" };
  if (status === "warning") return { tone: "stale", word: "Needs attention" };
  return { tone: "unknown", word: "Recorded" };
}

/** Attention first, then what is simply true, then what Pi suggests. */
export function rank(record: SavedInformation) {
  const presentation = record.presentation as Presentation | null;
  if (record.retiredAt) return 4;
  if (presentation?.status === "failed") return 0;
  if (presentation?.status === "warning") return 1;
  if (presentation?.role === "recommendation") return 3;
  return 2;
}
