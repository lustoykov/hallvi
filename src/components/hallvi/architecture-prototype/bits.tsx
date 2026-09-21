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
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { Certainty, Part } from "./model";

const icons: Record<Certainty | "checking", ReactNode> = {
  verified: <Check weight="bold" />,
  stale: <ClockCounterClockwise weight="bold" />,
  unknown: <CircleDashed weight="bold" />,
  planned: <PencilSimpleLine weight="bold" />,
  absent: <MinusCircle weight="bold" />,
  failed: <Warning weight="bold" />,
  warning: <Warning weight="bold" />,
  checking: <SpinnerGap weight="bold" className="ax-spin" />,
};

export const certaintyWord: Record<Certainty, string> = {
  verified: "Verified",
  stale: "Held",
  unknown: "Not observed",
  planned: "Planned",
  absent: "Not set up",
  failed: "Failed",
  warning: "Wants looking at",
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
  const recorded = part?.checking
    ? "checking"
    : (certainty ?? part?.evidence.certainty ?? "unknown");
  // The two parts the pulse asks about directly: the machine, over SSH, and
  // the web process, through the application's own address. When either just
  // answered, its aged tag is simply current again.
  const beat =
    part?.kind === "host"
      ? pulse.server
      : part?.kind === "web"
        ? pulse.app
        : undefined;
  const aged = recorded === "stale" && part ? agedAs(beat) : "aged";
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
          : (children ?? (part?.checking ? "Checking…" : part?.evidence.short))}
    </span>
  );
}

export function FactList({ part }: { part: Part }) {
  if (!part.facts.length) return null;
  return (
    <dl className="ax-facts">
      {part.facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`}>
          <dt>{fact.label}</dt>
          <dd className={fact.mono ? "ax-mono" : undefined}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
