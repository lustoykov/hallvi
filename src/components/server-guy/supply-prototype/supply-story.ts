// What the Manifest, Origin, Queue and Rota designs draw, and nothing else.
// SupplyStory satisfies it structurally, so the visual reference is untouched.

/** Who decided a value: the release plan, the owner, us, or a connection. */
export type Decider = "plan" | "you" | "generated" | "connection";

export interface Value {
  id: string;
  name: string;
  /** The process it is given to. */
  service: string;
  product: string;
  who: Decider;
  /** Held on the host rather than stated in the repository. */
  held: boolean;
  /** Where the value lives, in words. Never the value itself. */
  where: string;
  /** Why it was asked for, when the request recorded a reason. */
  why: string | null;
  /** Recorded but not yet reached the running processes. */
  pending: boolean;
  /**
   * The owner may ask to see this one.
   *
   * True only for a credential the controller generated: the owner has never
   * seen it, and it is in their database and nowhere else they can reach.
   * A value they typed is never revealable — reading it back would tell them
   * nothing and would turn the store into an oracle for secrets given in
   * confidence.
   */
  revealable?: boolean;
  /** A replacement is part-way through and not yet proven. */
  changing?: boolean;
}

export interface ConfigFile {
  id: string;
  name: string;
  service: string;
  product: string;
  /** Where the process reads it. */
  target: string;
  readOnly: boolean;
  bytes: number;
  mode: string;
  sha: string;
}

/** Something asked for that nobody has supplied yet. */
export interface Waiting {
  name: string;
  reason: string;
}

export interface Broker {
  name: string;
  product: string;
  role: string;
  persistence: string | null;
  reach: string;
}

export interface QueueLine {
  library: string;
  backedBy: string;
  workers: string[];
  backlog: number | null;
  oldestSeconds: number | null;
  failedLastHour: number | null;
  at: string | null;
}

export interface JobLine {
  name: string;
  command: string;
  schedule: string;
  timezone: string;
  nextAt: string | null;
  paused: boolean;
  last: { outcome: string; at: string; seconds: number | null } | null;
}

/** Work that repeats, owned by another destination. */
export interface Recurring {
  id: string;
  title: string;
  words: string;
  detail: string;
  at: string | null;
  where: "backups" | "deployment" | "domains";
}

export interface SupplyView {
  /** What the application is called, for the pages' sentences. */
  name: string;
  revision: string | null;
  appliedAt: string | null;
  values: Value[];
  files: ConfigFile[];
  waiting: Waiting[];
  place: string | null;
  machine: string | null;
  address: string | null;
  cdn: {
    on: boolean;
    provider: string | null;
    /** One line about what is and is not cached. */
    detail: string;
    /** The address the cache forwards to, when a record names one. */
    origin?: string | null;
    /**
     * Whether the cache can get an answer out of the origin. Separate from
     * `on` on purpose: a cache in front of a dead origin is still in front,
     * and still serves an error page to every visitor.
     */
    originReachable?: "yes" | "no" | "unchecked";
    /** Said when the cache forwards somewhere this application is not. */
    concern?: string | null;
  };
  brokers: Broker[];
  queues: QueueLine[];
  workers: string[];
  jobs: JobLine[];
  runs: { id: string; jobName: string; outcome: string; at: string }[];
  recurring: Recurring[];
  /** Set only in the isolated visual reference; always null on records. */
  invented: string | null;
}

export interface SupplyProps {
  story: SupplyView;
  now: number;
  /**
   * Needed only so a generated credential can be revealed to the owner from
   * the panel that describes it. The visual reference has no such control,
   * and every other surface here works without knowing the id.
   */
  applicationId?: string;
  head: import("react").ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: import("react").ReactNode;
  onAsk: (draft: string) => void;
  onOpenDestination: (
    destination: import("../application-sections").ApplicationSection,
  ) => void;
}
