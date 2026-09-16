// PROTOTYPE · opus-ui-improvements · throwaway.
// What the Logs and Monitoring pages say, from the deployment record and the
// recorded operations: the output Server Guy read from each process (the
// last 100 lines of each, and only when asked), the checks that looked at the
// application and when, and what nothing watches. Nothing is read live:
// these pages never collect logs or contact the server.

import type { MonitoringFacts } from "@/server/application-facts";

import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { type StackStory } from "../stack-prototype/stack-model";

/** Lines Server Guy reads from each process (`docker compose logs --tail`). */
export const CAP = 100;

export type Level = "info" | "warn" | "error" | "debug";
export interface LogLine {
  id: string;
  service: string;
  speaker: string;
  /** The time the process wrote into the line, when it wrote one. */
  at: string | null;
  level: Level;
  text: string;
  /** The line's other fields. */
  rest: string;
  /** The line as collected, without the service prefix. */
  raw: string;
  /** The process saying it is ready or listening, in its own words. */
  milestone: boolean;
}
export interface Speaker {
  service: string;
  name: string;
  lines: number;
  warns: number;
  errors: number;
  /** Its output reached the cap, so earlier lines weren't read. */
  cut: boolean;
}
export interface Collection {
  id: string;
  /** When Server Guy read it. */
  at: string;
  lines: LogLine[];
  speakers: Speaker[];
}
// The two the Tuner design draws are shared with the records path, so they
// live beside it rather than inside this builder.
export type { Look, Unwatched } from "./signal-story";
import type { Look, Unwatched } from "./signal-story";

export interface SignalStory extends StackStory {
  /** Reads of the output, newest first. */
  collections: Collection[];
  looks: Look[];
  /** The newest check of a process. */
  lastCheckAt: string | null;
  /** What watches between deployments; null when nothing does. */
  watcher: MonitoringFacts["collector"] | null;
  unwatched: Unwatched[];
  /** Everything looks and gaps belong to, in reading order. */
  parts: string[];
}

/** Verified green needs evidence under a day old. */
export const toneOf = (at: string | null, now: number): Tone =>
  !at ? "planned" : now - Date.parse(at) < FRESH_MS ? "verified" : "stale";
