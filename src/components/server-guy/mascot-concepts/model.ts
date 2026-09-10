/**
 * The data behind the mascot family exploration: application states, the
 * family mood each state maps to, what each cousin adds, and the scripted
 * terminal loop. Everything here is invented for the prototype.
 */

import type { Mood } from "../mascot-family/pose";
import type { FamilyId } from "../mascot-family/roster";

export type StateId =
  "calm" | "checking" | "working" | "waiting" | "failed" | "stale" | "verified";

export type Tone = "verified" | "working" | "waiting" | "failed" | "neutral";

export type StateMeta = {
  id: StateId;
  label: string;
  /** The product moment this expression stands for. */
  moment: string;
  tone: Tone;
};

export const STATES: StateMeta[] = [
  {
    id: "calm",
    label: "Calm",
    moment: "Verified, nothing needs you",
    tone: "verified",
  },
  {
    id: "checking",
    label: "Checking",
    moment: "Reading health checks and logs",
    tone: "working",
  },
  {
    id: "working",
    label: "Working",
    moment: "Recreating 2 containers",
    tone: "working",
  },
  {
    id: "waiting",
    label: "Waiting for you",
    moment: "Approve a new server, €5.99/mo",
    tone: "waiting",
  },
  {
    id: "failed",
    label: "Failed",
    moment: "A readiness check timed out",
    tone: "failed",
  },
  {
    id: "stale",
    label: "Stale",
    moment: "No new evidence for 26 hours",
    tone: "neutral",
  },
  {
    id: "verified",
    label: "Verified!",
    moment: "The restore test just passed",
    tone: "verified",
  },
];

export const stateMeta = (id: StateId) => STATES.find((s) => s.id === id)!;

/** Each application state as one of Little Server's moods. */
export const MOOD_FOR: Record<StateId, Mood> = {
  calm: "ready",
  checking: "checking",
  working: "working",
  waiting: "waiting",
  failed: "attention",
  stale: "resting",
  verified: "celebrating",
};

/** What the whole family does in each state, for the expressions sheet. */
export const STATE_POSE: Record<StateId, string> = {
  calm: "pill eyes · smile · breathing, blinking",
  checking: "squint · brows up · clipboard",
  working: "narrow eyes · flat mouth · wrench",
  waiting: "looks at you · waves once · blank card",
  failed: "worried brows · concern mouth · warm eyes",
  stale: "eyes closed · slow sway · z",
  verified: "happy eyes · joy · jump with arms up",
};

export type Profile = {
  role: string;
  pitch: string;
  metaphor: string;
  words: [string, string, string];
  poke: string;
  idle: string;
  /** What this cousin adds to a state on top of the family's shared pose. */
  signature: Partial<Record<StateId, string>>;
};

export const PROFILES: Record<FamilyId, Profile> = {
  server: {
    role: "The original · caretaker",
    pitch:
      "The one from your home page: a small, steady server with a screen for a face, looking after what you run.",
    metaphor:
      "Clipboard for checks, wrench for fixes, a wave when you arrive. Every cousin on this page is built from its parts.",
    words: ["Steady", "Friendly", "Handy"],
    poke: "pops its hatch",
    idle: "waves hello",
    signature: {},
  },
  tower: {
    role: "Tower · night watch",
    pitch:
      "A tall, patient cousin who stays up while you sleep. Its status light is the last one on in the house.",
    metaphor:
      "Backups run at 03:00 and checks run all night. Lumen's light pulses while it looks and dims when it naps.",
    words: ["Patient", "Watchful", "Quiet"],
    poke: "flashes its light",
    idle: "looks around like a lighthouse",
    signature: {
      checking: "light pulses",
      working: "bays blink",
      stale: "light dims",
    },
  },
  rack: {
    role: "1U rack · heavy lifter",
    pitch:
      "Wide, low and happiest carrying something. Tug hauls the deploy crate onto the server.",
    metaphor:
      "Rack units are built to be stacked and carried: rack ears, four stubby feet, and a crate on its back while a deploy runs.",
    words: ["Strong", "Earnest", "Unhurried"],
    poke: "wobbles like a loaf",
    idle: "naps",
    signature: { working: "crate on its back" },
  },
  pip: {
    role: "Single-board · scout",
    pitch:
      "The youngest cousin: a big face on a small board, always first to go and look.",
    metaphor:
      "Tiny computers go everywhere. Pip wears its chip on its chest and peeks around corners. The clearest at 24 px.",
    words: ["Curious", "Quick", "Bright"],
    poke: "spins around",
    idle: "hops over to peek",
    signature: { working: "board light blinks" },
  },
  vault: {
    role: "Backup keeper",
    pitch:
      "Chunky, careful and never without its disk. Trove keeps a copy of everything that matters.",
    metaphor:
      "A vault dial on the belly and drive bays beside it. It sets the disk down gently to work and picks it straight back up.",
    words: ["Careful", "Loyal", "Sturdy"],
    poke: "hugs its disk tighter",
    idle: "pats its disk",
    signature: {
      checking: "dial ticks",
      working: "dial spins · disk set down",
      failed: "holds the disk close",
      verified: "disk held high",
    },
  },
  relay: {
    role: "Relay · network and security",
    pitch:
      "A router whose antennas are ears. They perk up at every knock and droop when a line goes quiet.",
    metaphor:
      "Networks are mostly listening. Ping hears the domain, the firewall and the certificate, and its ears show what it heard.",
    words: ["Alert", "Chatty", "Protective"],
    poke: "ears go boing",
    idle: "listens, ears swivelling",
    signature: {
      checking: "ears perk and swivel",
      working: "lights chatter",
      failed: "ears droop",
      stale: "ears flop",
    },
  },
};

export type LogLine = {
  text: string;
  state: StateId;
  kind: "plain" | "ok" | "fail" | "wait" | "work";
  /** Milliseconds before the next line appears. */
  hold: number;
};

export const TERMINAL_SCRIPT: LogLine[] = [
  {
    text: "Last evidence for grafana: 26 h ago",
    state: "stale",
    kind: "plain",
    hold: 2600,
  },
  {
    text: "Checking Grafana health…",
    state: "checking",
    kind: "work",
    hold: 2600,
  },
  { text: "✓ database ok", state: "calm", kind: "ok", hold: 1800 },
  {
    text: "Recreating 2 containers…",
    state: "working",
    kind: "work",
    hold: 3000,
  },
  {
    text: "Waiting for your approval: create server €5.99/mo",
    state: "waiting",
    kind: "wait",
    hold: 3600,
  },
  {
    text: "Approved · creating cx22 in fsn1…",
    state: "working",
    kind: "work",
    hold: 2600,
  },
  {
    text: "✗ prometheus /-/ready timed out",
    state: "failed",
    kind: "fail",
    hold: 3000,
  },
  { text: "Retrying…", state: "working", kind: "work", hold: 2600 },
  { text: "✓ Verified", state: "verified", kind: "ok", hold: 4200 },
];
