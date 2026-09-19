// The vocabulary the Deployment layouts are drawn in: a line, a phase, a
// check, and how long something took.
//
// The story itself is composed in `release-records.ts` out of saved records.
// What used to build one here read a deployment record the product no longer
// writes, and is gone with it.

export type LineTone = "pass" | "fail" | "work" | "info";
export interface StoryLine {
  at: string;
  text: string;
  tone: LineTone;
}
export type PhaseTone = "pass" | "fail" | "work" | "wait";
export interface Phase {
  id: string;
  title: string;
  detail: string;
  start: string;
  end: string;
  tone: PhaseTone;
  lines: StoryLine[];
}
export interface Check {
  name: string;
  probe: string;
  /** Checked inside the server, on the private network. */
  inside: boolean;
  at: string | null;
}
export interface LiveFact {
  label: string;
  value: string;
  sub: string;
  exact: { label: string; value: string; mono?: boolean }[];
}
export type StoryState =
  "none" | "working" | "awaiting" | "failed" | "live" | "unknown";
export type Tone = "verified" | "stale" | "failed" | "planned" | "checking";

export interface DeploymentStory {
  state: StoryState;
  name: string;
  revision: string | null;
  statement: string;
  tone: Tone;
  word: string;
  detail: string;
  facts: LiveFact[];
  phases: Phase[];
  started: string | null;
  took: string | null;
  attempts: number;
  checks: Check[];
  logs: { at: string | null; lines: string[] };
  gaps: { id: string; title: string; detail: string }[];
  chat: { chatId: string; messageId: string | null } | null;
  repository: string;
}

/** "9 s", "1 min 22 s", "8 min 33 s", "2 h 5 min". */
export function took(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}

export function toneOf(text: string): LineTone {
  if (/failed|timed out|Stopped|error/i.test(text)) return "fail";
  if (/^Passed:|^Verified|verified|reverified/.test(text)) return "pass";
  if (
    /^(Inspecting|Reading|Checking|Creating|Waiting|Preparing|Building|Recreating|Uploading)/.test(
      text,
    )
  )
    return "work";
  return "info";
}
