"use client";

// PROTOTYPE · chosen on claude/deployment-history.
// The certainty tag the Deployment page speaks in: verified, out of date,
// failed, planned, or checking now.

import {
  Check,
  ClockCounterClockwise,
  MinusCircle,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * `stale` is a pass that has aged, and draws calmly. `attention` is amber,
 * and is for what needs the owner: Pi's own warning, a decision waiting.
 */
export type Tone =
  "verified" | "stale" | "attention" | "failed" | "planned" | "checking";

const tagIcon: Record<Tone, ReactNode> = {
  verified: <Check weight="bold" />,
  stale: <ClockCounterClockwise weight="bold" />,
  attention: <Warning weight="bold" />,
  failed: <Warning weight="bold" />,
  planned: <MinusCircle weight="bold" />,
  checking: <SpinnerGap weight="bold" className="ax-spin" />,
};

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="ax-tag" data-c={tone}>
      <span className="ax-tag-icon" aria-hidden="true">
        {tagIcon[tone]}
      </span>
      {children}
    </span>
  );
}
