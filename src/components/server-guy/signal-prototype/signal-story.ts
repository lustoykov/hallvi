// What the Tuner design draws, and nothing else.
// SignalStory satisfies it structurally, so the visual reference is untouched.

export interface Look {
  id: string;
  /** The part of the map it watches. */
  part: string;
  name: string;
  /** The same, short enough for a row. */
  short: string;
  how: string;
  kind: "check" | "output" | "backup";
  at: string | null;
  state: "passing" | "failing" | "unknown" | "seen";
  detail: string | null;
  evidence: { at: string; text: string }[];
  /** Only ever true in the isolated visual reference. */
  invented: boolean;
}

export interface Unwatched {
  id: string;
  /** The part it would belong to, or null for the whole application. */
  part: string | null;
  title: string;
  short: string;
  detail: string;
}

export interface Watcher {
  state: "running" | "stale" | "not-running";
  lastObservationAt?: string | null;
  hostReachable: boolean | null;
  detail: string;
}

export interface TunerView {
  name: string;
  /** Every part with a station, in the order the map draws them. */
  parts: string[];
  processes: { product: string; roleWords: string }[];
  looks: Look[];
  lastCheckAt: string | null;
  watcher: Watcher | null;
  unwatched: Unwatched[];
}

export interface TunerProps {
  story: TunerView;
  now: number;
  head: import("react").ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: import("react").ReactNode;
  onAsk: (draft: string) => void;
  /** Traffic and server load, drawn between the lede and the dial. */
  usage?: import("react").ReactNode;
  /** A sentence from outside the dial the lede should carry. */
  aside?: string | null;
}
