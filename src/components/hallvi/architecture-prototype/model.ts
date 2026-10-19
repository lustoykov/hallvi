// The vocabulary the Architecture and Overview layouts are drawn from: a part
// carries plain words first and exact values second, and says how sure Server
// Guy is from the evidence and its age.
//
// It no longer builds anything. The model used to be assembled here out of a
// deployment record; it is assembled in `architecture-records.ts` out of saved
// records now, and what is left here is the shape both agree on.

import type { ApplicationRecord } from "@/server/types";

import type { ApplicationSection } from "../application-sections";

export type Certainty =
  | "verified"
  | "stale"
  | "unknown"
  | "planned"
  | "absent"
  | "failed"
  /**
   * Pi judged that this wants looking at, without a check having failed. A
   * same-host backup copy is the worked example: written, readable, and no
   * protection at all against losing the machine. Like `failed` it is a
   * judgement rather than a reading, so it never ages into something softer.
   */
  | "warning";

type PartKind =
  | "controller"
  | "source"
  | "gate"
  | "tls"
  | "host"
  | "web"
  | "private"
  | "volume"
  | "offsite"
  | "monitor";

export interface Fact {
  label: string;
  value: string;
  mono?: boolean;
}

export interface Evidence {
  certainty: Certainty;
  /** A few words: "Checked 21 h ago", "Not set up". */
  short: string;
  /** What was observed, by what and when, and what was not. */
  detail: string;
  at: string | null;
  /**
   * Set only when this aged reading asked exactly what the live pulse asks,
   * so an answer a moment ago makes it current. See `pulse-asks.ts`.
   */
  reasked?: "app" | "server" | null;
}

export interface Part {
  id: string;
  kind: PartKind;
  name: string;
  role: string;
  plain: string;
  facts: Fact[];
  evidence: Evidence;
  /** Volumes: the part that mounts them. Private services: who calls them. */
  owner?: string;
  /** The endpoint port as recorded, including protocol when supplied. */
  port?: string;
  /** Gates: latest recorded connection result, never a firewall rule. */
  admits?: "open" | "refused" | "unknown";
  /** Gates: who the door's own record says may use it. */
  sources?: string;
  /**
   * Gates: the part this port leads to, when a record says which.
   *
   * Read from a topology edge leaving the gate, the same way a volume's
   * `owner` is read from its disk edge — and never from the port number or
   * the subject's name. A port called `postgres` is not evidence that
   * PostgreSQL is behind it.
   */
  serves?: string;
  destination?: ApplicationSection;
  /** Parts with no state of their own (the controller) hide their tag. */
  quiet?: boolean;
}

export type JourneyId = "visit" | "data" | "release";
export interface Journey {
  id: JourneyId;
  label: string;
  /** Part ids in travel order. */
  stops: string[];
  summary: string;
}

/**
 * What a page hands the Overview layouts about the application itself.
 *
 * It used to carry a deployment record, its derived facts and its operations.
 * Nothing wrote a deployment any more, so every page passed null and an empty
 * object, and every branch that read them was a branch that could not run.
 */
export interface LiveRecord {
  application: ApplicationRecord;
}

/** One line of the agent's recorded work, oldest first. */
export interface LogLine {
  id: string;
  at: string;
  tone: "pass" | "fail" | "work" | "info";
  text: string;
}

export interface Gap {
  id: string;
  title: string;
  detail: string;
  destination: ApplicationSection;
}

export interface ArchitectureModel {
  now: number;
  status: "live" | "planned" | "none";
  applicationName: string;
  /** The web process's product name, "Grafana", or the application name. */
  headline: string;
  parts: Part[];
  /** Recorded relationships, with transport and endpoint labels preserved. */
  edges: {
    from: string;
    to: string;
    network: "public" | "private" | "loopback" | "disk";
    label?: string;
  }[];
  byId: Record<string, Part>;
  journeys: Journey[];
  condition: { certainty: Certainty; text: string };
  gaps: Gap[];
  region: string | null;
  /**
   * How far the application can be reached from. `restricted` cannot say
   * "nobody has read this back", and its absence renders as "anyone", which
   * is a claim. So the three-way reading is what the design consults, and
   * `restricted` stays for the parts that only need the boolean.
   */
  openness: "restricted" | "public" | "unknown";
  restricted: boolean;
  monitored: boolean;
  /** When a restore of an off-site copy was last tested, if ever. */
  restoreAt: string | null;
  /** The agent's most recent recorded work: deployment events and backups. */
  log: LogLine[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/**
 * Overview's rule: verified green only while the evidence is under a day old.
 */
export const FRESH_MS = DAY;

export function ago(at: string | null | undefined, now: number) {
  if (!at) return "never";
  const ms = Math.max(0, now - Date.parse(at));
  if (ms < MINUTE) return "just now";
  // A no-break space holds the number to its unit. "7 h ago" is one fact, and
  // a line that breaks between the 7 and the h makes the reader reassemble it
  // — which happened in Overview's verdict the moment it became a sentence.
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes}\u00a0min ago`;
  const hours = Math.round(ms / HOUR);
  if (hours < 48) return `${hours}\u00a0h ago`;
  return `${Math.round(ms / DAY)}\u00a0days ago`;
}
