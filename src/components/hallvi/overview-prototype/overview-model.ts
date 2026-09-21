// What Overview says. `overviewFromRecords` builds it from what Pi recorded.
// What needs you is only what is real: a failure, an approval, a failed copy.
// Ideas that would make it sturdier are optional and phrased as what you
// would gain. Vital signs are the few things people check.

import type { OperationState } from "@/server/operation-record";

import type { ApplicationSection } from "../application-sections";
import type { Certainty, Fact } from "../architecture-prototype/model";

export interface NeedItem {
  id: string;
  /** The part it is about, to show where it is. */
  partId?: string;
  tone: "failed" | "waiting";
  title: string;
  detail: string;
  invented?: boolean;
  primary: { label: string; draft?: string; open?: () => void };
  secondary?: { label: string; destination: ApplicationSection };
}

export interface Idea {
  id: string;
  /** What you would gain, not what is wrong. */
  title: string;
  detail: string;
  draft: string;
  destination: ApplicationSection;
}

export interface Vital {
  id: "checks" | "backups" | "server" | "access";
  label: string;
  value: string;
  status: { certainty: Certainty; text: string };
  /**
   * Set only when the lane is aged and every aged check in it asked the one
   * thing the live pulse asks. Then, and only then, an answer a moment ago
   * makes the lane current. See `pulse-asks.ts`.
   */
  reasked?: "app" | "server" | null;
  lines: string[];
  /** The next scheduled copy, for a live countdown. */
  countdownTo?: string | null;
  plain: string;
  facts: Fact[];
  destination: ApplicationSection;
  ask: string;
}

export interface RecentItem {
  id: string;
  title: string;
  state: OperationState;
  when: string;
  from: string | null;
  open: (() => void) | null;
}

export interface Overview {
  headline: string;
  needs: NeedItem[];
  ideas: Idea[];
  vitals: Vital[];
  recent: RecentItem[];
}
