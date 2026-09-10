/**
 * The data behind the mascot exploration: application states, the
 * parametric expression each state maps to, the six concepts and the
 * scripted terminal loop. Everything here is invented for the prototype.
 */

export type StateId =
  | "calm"
  | "checking"
  | "working"
  | "waiting"
  | "failed"
  | "stale"
  | "verified";

export type Tone = "verified" | "working" | "waiting" | "failed" | "neutral";

export type StateMeta = {
  id: StateId;
  label: string;
  /** The product moment this expression stands for. */
  moment: string;
  tone: Tone;
};

export const STATES: StateMeta[] = [
  { id: "calm", label: "Calm", moment: "Verified, nothing needs you", tone: "verified" },
  { id: "checking", label: "Checking", moment: "Reading health checks and logs", tone: "working" },
  { id: "working", label: "Working", moment: "Recreating 2 containers", tone: "working" },
  { id: "waiting", label: "Waiting for you", moment: "Approve a new server, €5.99/mo", tone: "waiting" },
  { id: "failed", label: "Failed", moment: "A readiness check timed out", tone: "failed" },
  { id: "stale", label: "Stale", moment: "No new evidence for 26 hours", tone: "neutral" },
  { id: "verified", label: "Verified!", moment: "The restore test just passed", tone: "verified" },
];

export const stateMeta = (id: StateId) => STATES.find((s) => s.id === id)!;

export type EyeShape = "open" | "happy" | "closed" | "wide" | "sparkle" | "squint";
export type MouthShape = "smile" | "open" | "o" | "wobbly" | "flat" | "grin";
export type LoopId = "breathe" | "look" | "busy" | "wait" | "steady" | "doze" | "none";

/** One face and posture. Every field transitions smoothly in CSS. */
export type Expression = {
  eyes: EyeShape;
  /** Vertical eye openness, 0 closed to 1 open. */
  open: number;
  /** Resting gaze in character units (about ±6 across, ±4 down). */
  gazeX: number;
  gazeY: number;
  /** Brow angle in degrees: positive is worried (inner ends up), negative focused. */
  brow: number;
  browLift: number;
  /** Extra lift for the right brow only: the curious raised brow. */
  browAsym: number;
  browOpacity: number;
  mouth: MouthShape;
  /** 1 neutral, below 1 squashed, above 1 stretched. */
  squash: number;
  tilt: number;
  loop: LoopId;
};

export const EXPRESSIONS: Record<StateId, Expression> = {
  calm: {
    eyes: "open", open: 1, gazeX: 0, gazeY: 0, brow: 0, browLift: 0, browAsym: 0,
    browOpacity: 0, mouth: "smile", squash: 1, tilt: 0, loop: "breathe",
  },
  checking: {
    eyes: "open", open: 1, gazeX: 0, gazeY: -1, brow: 0, browLift: 3, browAsym: 5,
    browOpacity: 1, mouth: "o", squash: 1.03, tilt: -4, loop: "look",
  },
  working: {
    eyes: "open", open: 0.82, gazeX: 1, gazeY: 3, brow: -5, browLift: 1, browAsym: 0,
    browOpacity: 1, mouth: "flat", squash: 1, tilt: 0, loop: "busy",
  },
  waiting: {
    eyes: "wide", open: 1, gazeX: 0, gazeY: 0, brow: 5, browLift: 4, browAsym: 0,
    browOpacity: 1, mouth: "smile", squash: 1.02, tilt: 4, loop: "wait",
  },
  failed: {
    eyes: "open", open: 0.9, gazeX: 0, gazeY: 1, brow: 12, browLift: 2, browAsym: 0,
    browOpacity: 1, mouth: "flat", squash: 0.97, tilt: 0, loop: "steady",
  },
  stale: {
    eyes: "squint", open: 0.42, gazeX: -1, gazeY: 2, brow: -3, browLift: -2, browAsym: 0,
    browOpacity: 0, mouth: "flat", squash: 0.95, tilt: -5, loop: "doze",
  },
  verified: {
    eyes: "happy", open: 1, gazeX: 0, gazeY: 0, brow: 0, browLift: 5, browAsym: 0,
    browOpacity: 0, mouth: "grin", squash: 1, tilt: 0, loop: "none",
  },
};

/** Short, human description of an expression for the expressions sheet. */
export function describeExpression(e: Expression): string {
  const brow =
    e.browOpacity === 0 ? "no brows" : e.brow > 0 ? `brows +${e.brow}°` : e.brow < 0 ? `brows ${e.brow}°` : "brows up";
  return `eyes ${e.eyes} · ${brow} · mouth ${e.mouth} · body ${e.squash.toFixed(2)}`;
}

export type ConceptId = "otter" | "crab" | "tardigrade" | "lantern" | "beaver" | "mote";

export type Concept = {
  id: ConceptId;
  name: string;
  species: string;
  pitch: string;
  metaphor: string;
  words: [string, string, string];
  /** The single characterful accent the concept introduces. */
  accent: string;
  accentName: string;
};

export const CONCEPTS: Concept[] = [
  {
    id: "otter",
    name: "Tuck",
    species: "Sea otter",
    pitch: "Floats on its back, unbothered, with your data tucked safely under its arm.",
    metaphor:
      "Otters keep a favourite stone in a pouch under the arm. Tuck's pebble is your data: held, polished, never dropped.",
    words: ["Calm", "Loyal", "Playful"],
    accent: "#7d5238",
    accentName: "Cocoa brown",
  },
  {
    id: "crab",
    name: "Nook",
    species: "Hermit crab",
    pitch: "Carries a tiny server rack as its shell. Self-hosting is carrying your own home.",
    metaphor:
      "The rack is the shell: a home you own and move with. Eye-stalks do the acting; when worried it tucks in and peeks out.",
    words: ["Curious", "Shy", "Scrappy"],
    accent: "#d4694b",
    accentName: "Terracotta",
  },
  {
    id: "tardigrade",
    name: "Moss",
    species: "Tardigrade",
    pitch: "The near-indestructible moss piglet. Data that survives the host.",
    metaphor:
      "Tardigrades survive by curling into a tun and uncurling when it's safe. Moss does the same under stress, then gets back to work.",
    words: ["Sturdy", "Earnest", "Unflappable"],
    accent: "#e2c69a",
    accentName: "Oatmeal",
  },
  {
    id: "lantern",
    name: "Wick",
    species: "Lantern keeper",
    pitch: "A small lantern whose flame is its heart, keeping the night watch.",
    metaphor:
      "Backups run at 03:00 while you sleep. Wick stays up: brightness and flicker show where its attention is.",
    words: ["Cosy", "Watchful", "Sleepy"],
    accent: "#ffbf4d",
    accentName: "Flame",
  },
  {
    id: "beaver",
    name: "Birch",
    species: "Beaver",
    pitch: "Builds the dam, then keeps fixing it. Earnest, a bit goofy, pencil behind the ear.",
    metaphor:
      "Beavers build and maintain. Birch gnaws through the work, and slaps its tail when something needs attention.",
    words: ["Earnest", "Handy", "Goofy"],
    accent: "#a8683f",
    accentName: "Russet",
  },
  {
    id: "mote",
    name: "Mote",
    species: "Pebble sprite",
    pitch: "A soft sea-glass pebble with two eyes. All acting is squash, stretch and shape.",
    metaphor:
      "No limbs, no props: just a little presence that is always there. The most universal concept and the clearest at 16px.",
    words: ["Simple", "Warm", "Bouncy"],
    accent: "#9ec3e6",
    accentName: "Sea glass",
  },
];

export type LogLine = {
  text: string;
  state: StateId;
  kind: "plain" | "ok" | "fail" | "wait" | "work";
  /** Milliseconds before the next line appears. */
  hold: number;
};

export const TERMINAL_SCRIPT: LogLine[] = [
  { text: "Last evidence for grafana: 26 h ago", state: "stale", kind: "plain", hold: 2600 },
  { text: "Checking Grafana health…", state: "checking", kind: "work", hold: 2600 },
  { text: "✓ database ok", state: "calm", kind: "ok", hold: 1800 },
  { text: "Recreating 2 containers…", state: "working", kind: "work", hold: 3000 },
  { text: "Waiting for your approval: create server €5.99/mo", state: "waiting", kind: "wait", hold: 3600 },
  { text: "Approved · creating cx22 in fsn1…", state: "working", kind: "work", hold: 2600 },
  { text: "✗ prometheus /-/ready timed out", state: "failed", kind: "fail", hold: 3000 },
  { text: "Retrying…", state: "working", kind: "work", hold: 2600 },
  { text: "✓ Verified", state: "verified", kind: "ok", hold: 4200 },
];
