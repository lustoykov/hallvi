// PROTOTYPE · opus-ui-improvements · throwaway.
// What the Storage and Backups pages say: the volumes on the server and
// what each holds, what the backup plan copies from them, the copies and
// restore tests on record, and what survives a container replacement or
// losing the server. Built on the story the Processes and Database pages
// read (stack-model.ts). Nothing here is observed live: the copies are the
// ones on record, and scheduled copies the record doesn't show are unknown.

import { type StackStory } from "../stack-prototype/stack-model";

// The five the Flow and Calendar designs draw are shared with the records
// path, so they live beside those designs rather than inside this builder.
export type { Check, Dated, Piece, Vol } from "./protect-story";
import type { Check, Dated, Piece, Vol } from "./protect-story";

export interface ProtectStory extends StackStory {
  volumes: Vol[];
  pieces: Piece[];
  createdAt: string | null;
  /** When the containers were replaced and the volumes kept. */
  keptAt: string | null;
  /** The isolated reference never draws a loss; the records path can. */
  lostAt: string | null;
  disk: { usedGb: number; totalGb: number; measuredAt: string } | null;
  /** Copies off the server on record, newest first. */
  copies: Dated[];
  /** When the schedule was set or changed, newest first. */
  schedules: Dated[];
  /** Restore tests on record, newest first. */
  restores: Dated[];
  /** What the newest restore test checked, and what it left untested. */
  checks: Check[];
}

/** "5 h 43 min", "1 day 22 h". */
export function lasting(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}${hours % 24 ? ` ${hours % 24} h` : ""}`;
}
/** "Sep 9". */
export const dayOf = (at: number | string) =>
  new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
/** "a, b and c". */
export const listed = (words: string[]) =>
  words.length > 1
    ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
    : (words[0] ?? "");
/** A label set mid-sentence: "Other files in x" → "other files in x". */
export const soft = (label: string) =>
  /^(Other|Everything|The) /.test(label)
    ? label.charAt(0).toLowerCase() + label.slice(1)
    : label;
