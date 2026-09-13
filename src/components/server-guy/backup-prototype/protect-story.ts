// What the Flow and Calendar designs draw, and nothing else.
//
// The prototype's ProtectStory extends StackStory, which carries Processes
// and Database too because one builder produced all four from the old
// deployment model. Storage and Backups are separate questions with separate
// records, so each gets its own projection and this is the list they share.
//
// ProtectStory still satisfies it structurally, so the isolated visual
// reference keeps working untouched.

/** One thing that lives in a volume, and how (or whether) it is copied. */
export interface Piece {
  key: string;
  label: string;
  volume: string;
  /** How a copy of it is taken. Null means nothing copies it. */
  method: string | null;
}

export interface Vol {
  name: string;
  owner: string;
  ownerName: string;
  mount: string;
  docker: string | null;
  note: string | null;
  sizeGb: number | null;
  /** As Pi measured it. Shown when it is too small to round to a megabyte. */
  sizeText?: string | null;
  measuredAt: string | null;
  pieces: Piece[];
}

export interface Dated {
  id: string;
  at: string;
  detail: string;
}

export interface Check {
  label: string;
  state: "pass" | "untested";
}

export interface ProtectView {
  volumes: Vol[];
  pieces: Piece[];
  /** When the volume was made, so "since" has a start. */
  createdAt: string | null;
  /** When the data was last proved to survive a container replacement. */
  keptAt: string | null;
  /**
   * When a replacement was tried and the data did not survive. Distinct from
   * keptAt being null, which only means nobody has tried.
   */
  lostAt: string | null;
  disk: { usedGb: number; totalGb: number; measuredAt: string } | null;
  copies: Dated[];
  schedules: Dated[];
  restores: Dated[];
  checks: Check[];
  protection: {
    schedule: { words: string; at: string } | null;
    backup: { at: string; detail: string } | null;
    restore: { at: string; detail: string } | null;
    keep: number | null;
  };
}

export interface ProtectProps {
  story: ProtectView;
  now: number;
  head: import("react").ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: import("react").ReactNode;
  /** The server it all lives on. */
  server: { label: string; city: string | null } | null;
  onAsk: (draft: string) => void;
}
