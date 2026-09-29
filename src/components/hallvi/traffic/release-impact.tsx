"use client";

// What followed a release, as one line on its row in Deployment: the two
// hours after it against the two before, "errors on /checkout 0 → 14, about
// 9 visitors". A release after which nothing changed says nothing at all.

import type { ReleaseImpact } from "@/server/traffic/contract";

import { comparedWords, impactLine } from "./model";
import { useImpacts, useTrafficListed } from "./source";
import "./traffic.css";

/** Only the newest releases are asked about; older ones have settled. */
const ASKED = 20;

export function useReleaseImpacts(
  applicationId: string | null,
  releases: { at: string }[],
) {
  const listed = useTrafficListed(applicationId);
  return useImpacts(
    listed ? applicationId : null,
    releases.slice(0, ASKED).map((release) => release.at),
  );
}

export function ImpactLine({
  impact,
  now,
}: {
  impact: ReleaseImpact | undefined;
  now: number;
}) {
  const line = impact ? impactLine(impact, now) : null;
  if (!line) return null;
  return (
    <span
      className="tf-impact"
      data-tone={line.tone}
      title={`${line.says} (${comparedWords(impact!)})`}
    >
      {line.says}
    </span>
  );
}

/** The question worth asking about a release that visitors paid for. */
export function impactQuestion(impact: ReleaseImpact | undefined, now: number) {
  const line = impact ? impactLine(impact, now) : null;
  if (!line || (line.tone !== "bad" && line.tone !== "warn")) return null;
  return `${line.says} (${comparedWords(impact!)}). Read the application's output since that release and tell me what broke, and whether rolling back would fix it.`;
}
