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
 * `stale` is the amber one, kept for Pi's own warning on a record.
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

/** "Unresolved: 1 failed, 2 awaiting approval": what the marks are read as. */
export function unresolvedWords(tones: readonly ("waiting" | "failed")[]) {
  const failed = tones.filter((tone) => tone === "failed").length;
  const waiting = tones.length - failed;
  return `Unresolved: ${[
    failed && `${failed} failed`,
    waiting && `${waiting} awaiting approval`,
  ]
    .filter(Boolean)
    .join(", ")}`;
}

/**
 * What is unresolved, drawn rather than named: one mark per open thing, an
 * open ring for a decision awaiting approval and a filled dot for something
 * that failed, so the difference survives without colour. It is read aloud
 * as "Unresolved" and what it holds, and draws nothing when nothing is open.
 */
export function UnresolvedMarks({
  tones,
  inverse = false,
  silent = false,
}: {
  tones: readonly ("waiting" | "failed")[];
  /** On a dark surface, such as a pressed filter. */
  inverse?: boolean;
  /** Beside words that already say it: drawn, and not read a second time. */
  silent?: boolean;
}) {
  if (!tones.length) return null;
  return (
    <span
      className="hv-marks"
      data-inverse={inverse || undefined}
      {...(silent
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": unresolvedWords(tones) })}
    >
      {tones
        .toSorted((a, b) => Number(b === "failed") - Number(a === "failed"))
        .map((tone, index) => (
          <i key={index} data-tone={tone} />
        ))}
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
  if (status === "warning") return { tone: "stale", word: "Worth a look" };
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
