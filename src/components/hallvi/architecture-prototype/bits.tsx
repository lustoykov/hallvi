"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// The certainty tag every direction shares: one icon, one short phrase, one
// tint per state. Verified is green only with evidence younger than a day.

import { agedAs, usePulse } from "../pulse";
import {
  Check,
  CircleDashed,
  ClockCounterClockwise,
  MinusCircle,
  PencilSimpleLine,
  Warning,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { Certainty, Part } from "./model";

const icons: Record<Certainty, ReactNode> = {
  verified: <Check weight="bold" />,
  stale: <ClockCounterClockwise weight="bold" />,
  unknown: <CircleDashed weight="bold" />,
  planned: <PencilSimpleLine weight="bold" />,
  absent: <MinusCircle weight="bold" />,
  failed: <Warning weight="bold" />,
  warning: <Warning weight="bold" />,
};

export function CertaintyTag({
  part,
  certainty,
  children,
}: {
  part?: Part;
  certainty?: Certainty;
  children?: ReactNode;
}) {
  const pulse = usePulse();
  const recorded = certainty ?? part?.evidence.certainty ?? "unknown";
  // Not by kind of part. A web process's tag may rest on "its container is
  // running", and a page that loads does not establish that. The projection
  // names the question only when the tag's own check asked it.
  const reasked = part?.evidence.reasked;
  const aged =
    recorded === "stale" && reasked ? agedAs(pulse[reasked]) : "aged";
  const state =
    aged === "verified" ? "verified" : aged === "silent" ? "warning" : recorded;
  return (
    <span className="ax-tag" data-c={state}>
      <span className="ax-tag-icon" aria-hidden="true">
        {icons[state]}
      </span>
      {aged === "verified"
        ? "Answered just now"
        : aged === "silent"
          ? "Did not answer just now"
          : (children ?? part?.evidence.short)}
    </span>
  );
}
