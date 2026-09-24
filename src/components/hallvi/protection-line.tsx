"use client";

// The whole backup situation in one line, for a page that does not own it.
//
// Backups owns copies, plans and restores. Storage and Database each ask a
// question of their own and used to answer this one as well, in their own
// words, from their own reading of the records. Three tellings drift, and
// they did. Now each prints this line and points at the page that owns it.
//
// It is a line and not a card: a card would be the third telling in smaller
// type. The link is the point.

import type {
  DestinationKind,
  Protection,
  ProtectionVerdict,
} from "./backups-records";
import { Go, Tag, ago, type Tone } from "./register";

/** A protection state, in the fewest words that stay true. */
export interface Reading {
  word: string;
  tone: Tone;
  detail: string;
}

/** Where the newest copy went, in the words the line needs. */
const WHERE: Record<DestinationKind, string> = {
  "off-site": "off the server",
  controller: "off the server",
  "same-server": "beside the data",
  provider: "in a provider snapshot of the disk",
  unclassified: "somewhere no record names",
};

/** The two classes that survive losing the server, as the verdict reads it. */
const survives = (kind: DestinationKind) =>
  kind === "off-site" || kind === "controller";

/**
 * The backup situation, once, for a page that no longer tells it.
 *
 * Nobody having looked is grey and says so; a plan with no copy is not a
 * copy; a copy nobody has opened is the one thing here worth amber.
 */
export function protectionOneLine(
  protection: Protection,
  verdict: ProtectionVerdict,
  now: number,
): Reading {
  const newest = protection.copies[0] ?? null;

  if (!newest) {
    if (!protection.assessed)
      return {
        word: "Not checked",
        tone: "plain",
        detail: "No record says whether this data is copied anywhere.",
      };
    if (protection.declaredAbsent)
      return {
        word: "Not set up",
        tone: "plain",
        detail: "Hallvi looked, and no backup plan exists.",
      };
    if (protection.summary.schedule)
      return {
        word: "Scheduled, no copy yet",
        tone: "warn",
        detail: protection.summary.schedule.words,
      };
    if (protection.planned)
      return {
        word: "A plan, no copy yet",
        tone: "warn",
        detail: "A plan is on record and nothing has run it.",
      };
    return {
      word: "No copy on record",
      tone: "plain",
      detail: "Nothing has copied this data.",
    };
  }

  const proved = protection.verifiedCopies.get(newest.id) ?? null;
  return {
    word: `Copied ${ago(newest.at, now)}, ${proved ? "restore tested" : "restore untested"}`,
    // Pi's own judgement reaches the reader here too, and never upgrades.
    tone:
      verdict.tone === "failed"
        ? "bad"
        : proved && survives(newest.kind) && verdict.tone !== "warning"
          ? "good"
          : "warn",
    detail: `The newest copy is ${WHERE[newest.kind]}. ${newest.detail}`,
  };
}

/** One read-only line of a story Backups owns, and the way to it. */
export function ProtectionLine({
  protection,
  verdict,
  now,
  onOpenBackups,
}: {
  protection: Protection;
  verdict: ProtectionVerdict;
  now: number;
  onOpenBackups: () => void;
}) {
  const line = protectionOneLine(protection, verdict, now);
  return (
    <p className="hv-rg-line">
      <span className="hv-rg-label">Protection</span>
      <Tag tone={line.tone}>{line.word}</Tag>
      <span className="hv-rg-line-detail" title={line.detail}>
        {line.detail}
      </span>
      <Go onGo={onOpenBackups}>Backups</Go>
    </p>
  );
}
