// Whether the application's server answers right now.
//
// The records say when Pi last looked, and a look ages. Showing that age as a
// warning made every quiet application read as neglected: "SSH answered, 19
// hours ago" is not a problem, it is a question nobody has re-asked. So the
// controller re-asks it, on its own, whenever somebody is looking at the
// application.
//
// The command is the controller's, not Pi's: it is `true`, it reads nothing
// and changes nothing. That is why it sits outside the permission boundary,
// like the access-log tail: the boundary decides whether model-authored
// commands run, and there is no model-authored text here to decide about. It
// also means no Pi run is started, which for an owner on "always ask" would
// wait on an approval nobody is there to give.
//
// It writes no record. A beat is about now and is asked again in a moment;
// what Pi observed stays exactly as it was written.

import { operatorSettings, runHostCommand } from "./operator-execution";

/** `unknown` is no host on record, which is not the same as no answer. */
export type Beat = "answering" | "silent" | "unknown";

/** One SSH per application every two minutes, however many pages are open. */
const HOLD_MS = 120_000;
const held = new Map<string, { at: number; beat: Promise<Beat> }>();

export function serverBeat(applicationId: string): Promise<Beat> {
  const last = held.get(applicationId);
  if (last && Date.now() - last.at < HOLD_MS) return last.beat;
  const beat = ask(applicationId);
  held.set(applicationId, { at: Date.now(), beat });
  return beat;
}

async function ask(applicationId: string): Promise<Beat> {
  try {
    const host = operatorSettings(applicationId).host;
    if (!host) return "unknown";
    const { exitCode } = await runHostCommand(
      host,
      "true",
      undefined,
      undefined,
      15,
    );
    return exitCode === 0 ? "answering" : "silent";
  } catch {
    return "silent";
  }
}
