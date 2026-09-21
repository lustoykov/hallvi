"use client";

// The pulse: what answered a moment ago, for deciding how an old reading reads.
//
// The rule every destination follows, and the reason it exists: an owner who
// opens a quiet application should not be met by a page of amber. A check
// that passed nineteen hours ago is not a problem. So:
//
//   - If the pulse just proved the same thing, the reading is green, and it
//     says "now".
//   - If the pulse asked and got nothing, that is worth amber: something did
//     not answer.
//   - Otherwise it is a calm, neutral "checked 19 h ago". Never amber.
//
// Amber is kept for what needs the owner: a failed look, Pi's own warning, a
// decision that is waiting. Red is a check that ran and failed.
//
// The pulse is the controller's own probe (see `src/server/pulse.ts`). It is
// not a record and vouches only for what it actually asked: that the
// application answers, and that the server accepts SSH.

import { createContext, useContext } from "react";

export type Beat = "checking" | "answering" | "silent" | "unknown";

export interface Pulse {
  /** The application's own address, asked over HTTP or through its tunnel. */
  app: Beat;
  /** The server, asked over SSH. */
  server: Beat;
}

export const QUIET_PULSE: Pulse = { app: "checking", server: "checking" };

export const PulseContext = createContext<Pulse>(QUIET_PULSE);

export function usePulse() {
  return useContext(PulseContext);
}

/** How a pass that has aged past its horizon reads. */
export type Aged = "verified" | "aged" | "silent";

export function agedAs(beat: Beat | undefined): Aged {
  return beat === "answering"
    ? "verified"
    : beat === "silent"
      ? "silent"
      : "aged";
}

/** One check, as a row or a pip draws it. */
export function probeReading(
  probe: { passed?: boolean; fresh?: boolean },
  /** The beat that asks the same thing this check asked, when one does. */
  beat?: Beat,
): { tone: "good" | "bad" | "warn" | "plain"; word: string } {
  if (probe.passed === false) return { tone: "bad", word: "failed" };
  if (probe.fresh) return { tone: "good", word: "passed" };
  const aged = agedAs(beat);
  if (aged === "verified") return { tone: "good", word: "answering now" };
  if (aged === "silent")
    return { tone: "warn", word: "did not answer just now" };
  // An old pass is a pass. When it ran is in the next column.
  return { tone: "plain", word: "passed" };
}
