// PROTOTYPE · opus-ui-improvements · chosen for Processes and Database.
// What the Processes and Database pages say, from the deployment record, its
// derived stack and the recorded operations: what runs, how a visit reaches
// it, what each process was checked with and when, where the data lives and
// what protects it. Everything is as recorded; nothing here is observed
// live, and the pages say so.

import { ago } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";

// The four the Line design draws are shared with the records path, so they
// live beside it rather than inside this builder.
export type { Change, Gap, ProcessCard } from "./line-story";
import type { Change, Gap, ProcessCard } from "./line-story";
export type { DataStore } from "../data-prototype/data-story";
import type { DataStore } from "../data-prototype/data-story";

export interface Protection {
  schedule: { words: string; at: string } | null;
  backup: { at: string; detail: string } | null;
  restore: { at: string; detail: string } | null;
  keep: number | null;
}
export interface StackStory {
  state: "none" | "planned" | "running" | "unknown";
  tone: Tone;
  word: string;
  verifiedAt: string | null;
  name: string;
  restricted: boolean;
  from: string | null;
  processes: ProcessCard[];
  database: DataStore | null;
  protection: Protection;
  processChanges: Change[];
  processGaps: Gap[];
}

const numbers = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
/** "Two", "Seven" → "7". */
export const countWord = (n: number) => numbers[n] ?? String(n);
export const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
/** "Sep 9, 20:48". */
export const when = (at: string) =>
  `${new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${clock(at)}`;
export { ago };
