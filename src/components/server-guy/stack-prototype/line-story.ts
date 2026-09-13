// What the Line design draws, and nothing else.
//
// The prototype's StackStory carries Processes, Database, Storage and
// Backups in one object because one builder produced all four from the old
// deployment model. The records path does not work that way: each
// destination has its own projection, so each needs to say what it actually
// needs. This is that list for Processes.
//
// StackStory still satisfies it structurally, so the isolated visual
// reference keeps working untouched.

export interface Probe {
  name: string;
  /** What was checked, in one line: "GET /health → 200". */
  probe: string;
  /** Checked from inside the server, on the private network. */
  inside: boolean;
  at: string | null;
}

export interface ProcessCard {
  name: string;
  product: string;
  role: "web" | "private" | "worker" | "service";
  roleWords: string;
  port: number | null;
  reach: string;
  health: string | null;
  image: string;
  imageShort: string;
  command: string | null;
  probes: Probe[];
  lastPassed: string | null;
}

export interface Change {
  id: string;
  title: string;
  at: string;
  /** How the change ended, as a data attribute the design colours by. */
  state: string;
  summary: string;
  origin: { chatId: string; messageId: string | null } | null;
}

/** Something Server Guy cannot do yet, drawn as a ghost and never as a reading. */
export interface Gap {
  id: string;
  title: string;
  detail: string;
}

export interface LineStory {
  state: "none" | "planned" | "running" | "unknown";
  tone: "verified" | "stale" | "planned" | "failed" | "checking";
  word: string;
  verifiedAt: string | null;
  restricted: boolean;
  /** The one address let in, when access is restricted to it. */
  from: string | null;
  processes: ProcessCard[];
  processChanges: Change[];
  processGaps: Gap[];
}

export interface LineProps {
  story: LineStory;
  head: import("react").ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: import("react").ReactNode;
  onAsk: (draft: string) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (
    destination: import("../application-sections").ApplicationSection,
  ) => void;
}
