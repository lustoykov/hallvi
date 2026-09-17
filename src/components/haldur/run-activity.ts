"use client";

// What is happening right now, from the records that say so.
//
// A turn that is working said "Working for 6m 12s" and nothing else, which is
// the same sentence whether Pi is waiting on the model, building an image on
// the server, or waiting for the owner to approve something they have not
// noticed. Six minutes of that reads as a stall, and the owner's only move is
// to wait or to stop it.
//
// Every branch below is read from a record. Nothing here estimates progress,
// counts steps, or invents a stage: when the evidence only supports "the
// model has not answered yet", that is what it says.

import { useSyncExternalStore } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { ActivityRecord } from "@/server/pi-activity";

import { placeOf } from "./execution-text";

const noTicks = () => () => undefined;
const yes = () => true;
const no = () => false;

/**
 * False while rendering on the server and through hydration, true afterwards.
 *
 * An elapsed time cannot be server-rendered. The shell reads its clock with
 * `useState(() => Date.now())`, which runs once on the server and again in
 * the browser, so "2m 32s" is hydrated over "2m 34s" and React throws the
 * whole subtree away and redraws it. It has always been able to happen — a
 * turn only has to be more than a second old when the page is served — and
 * it is invisible except as a hydration error in the console.
 *
 * So the number is client-only, and its absence for one frame is the price.
 * Nothing else on the line depends on the clock, so the sentence itself is
 * rendered on both sides and stays put.
 */
export function useClockReady() {
  return useSyncExternalStore(noTicks, yes, no);
}

export function spell(seconds: number) {
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Seconds from an ISO time to now, or null when either is unusable. */
function secondsSince(at: string | null | undefined, now: number) {
  if (!at || !now) return null;
  const then = Date.parse(at);
  if (!Number.isFinite(then) || now < then) return null;
  return Math.floor((now - then) / 1000);
}

/**
 * A command that has stopped printing. Under twenty seconds is the gap
 * between two lines, not a silence worth reporting.
 */
function quiet(item: ExecutionRecord, now: number) {
  const since = secondsSince(item.outputAt, now);
  return since !== null && since >= 20 ? since : null;
}

export interface RunActivity {
  /** What is happening, in the reader's words. */
  says: string;
  /** How long it has been happening. Null when nothing can be timed. */
  since: string | null;
  /**
   * The owner is the thing being waited on. Only these deserve attention;
   * everything else is Haldur working and can stay quiet.
   */
  waitingOnYou: boolean;
}

/**
 * The most specific true thing about a turn in flight.
 *
 * Ordered by how much the reader can act on it: a decision only they can make
 * first, then work that is visibly happening somewhere, then the model.
 */
export function runActivity(input: {
  /** The assistant message id, which is also the run id on every record. */
  runId: string | undefined;
  status: string;
  /** When the run began, for the case where nothing more specific applies. */
  startedAt?: string | null;
  /** Whether any reply text has arrived yet. */
  hasDraft?: boolean;
  /**
   * Whether a worker is alive to carry this turn. Undefined where it has not
   * been established; this line never guesses.
   */
  workerAlive?: boolean;
  executions: ExecutionRecord[];
  activity: ActivityRecord[];
  now: number;
}): RunActivity {
  const { runId, now } = input;
  const mine = <T extends { runId: string }>(items: T[]) =>
    runId ? items.filter((item) => item.runId === runId) : [];
  const executions = mine(input.executions);

  // Nothing is reading the queue. Whatever the records below would say about
  // the turn, none of it is happening, and a spinner over an unattended queue
  // is the one thing this line must never draw.
  if (input.workerAlive === false) {
    const seconds = secondsSince(input.startedAt, now);
    return {
      says:
        input.status === "queued"
          ? "Waiting for a worker to start. Nothing is running."
          : "The worker stopped before this reply finished.",
      since: seconds === null ? null : spell(seconds),
      waitingOnYou: true,
    };
  }

  if (input.status === "queued")
    return {
      says: "Waiting to start",
      since: null,
      waitingOnYou: false,
    };

  // A command nobody has approved. The turn is not working at all — it is
  // stopped, on the reader, and six minutes of "Working" said the opposite.
  const asking = executions.find((item) => item.status === "awaiting-approval");
  if (asking) {
    const seconds = secondsSince(asking.createdAt, now);
    return {
      says: "Waiting for you to approve a command",
      since: seconds === null ? null : spell(seconds),
      waitingOnYou: true,
    };
  }

  const command = executions.find((item) => item.status === "running");
  if (command) {
    const place = placeOf(command.tool);
    const seconds = secondsSince(command.createdAt, now);
    const silence = quiet(command, now);
    return {
      says: place
        ? `Running a command ${place.charAt(0).toLowerCase()}${place.slice(1)}`
        : "Running a command",
      since: [
        seconds === null ? null : spell(seconds),
        silence === null ? null : `quiet for ${spell(silence)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      waitingOnYou: false,
    };
  }

  // Work with no execution card of its own: saving a record, searching, a
  // provider call. The card list cannot show these, so the line does.
  const call = mine(input.activity).find(
    (item) => item.kind === "tool" && item.status === "running",
  );
  if (call) {
    const place = placeOf(call.tool);
    const seconds = secondsSince(call.startedAt, now);
    return {
      says: place
        ? `Working ${place.charAt(0).toLowerCase()}${place.slice(1)}`
        : `Running ${call.tool.replaceAll("_", " ")}`,
      since: seconds === null ? null : spell(seconds),
      waitingOnYou: false,
    };
  }

  // Nothing is running anywhere, so the turn is inside a model call. Saying
  // which of the two it is costs nothing and is the difference between "it is
  // thinking" and "it is typing".
  const seconds = secondsSince(input.startedAt, now);
  return {
    says: input.hasDraft ? "Writing the reply" : "Waiting for the model",
    since: seconds === null ? null : spell(seconds),
    waitingOnYou: false,
  };
}

export interface RunFailure {
  /** What went wrong, from the evidence rather than from a template. */
  says: string;
  /** The one control to offer, and what it does. */
  action: { label: string; kind: "retry" | "ask"; draft?: string };
}

/**
 * Whether a failure is worth trying again, or worth understanding first.
 *
 * A command that exited non-zero will exit non-zero again: retrying it is a
 * way of not reading the error. A connection that dropped is a different
 * thing, and trying again is exactly right. The page offers one control, and
 * which one it is depends on what failed.
 */
const TRANSIENT =
  /\b(timed? ?out|timeout|connection (refused|reset|closed)|broken pipe|temporarily|network is unreachable|no route to host|EOF|ssh_exchange|handshake)\b/i;

/** The last line of output that says something, for a one-line explanation. */
function lastMeaningfulLine(output: string) {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^\s*$/.test(line));
  // Errors are usually last. A trailing "exit status 1" repeats the code the
  // card already shows, so step past it.
  for (const line of lines.reverse())
    if (!/^exit (status )?\d+$/i.test(line)) return line;
  return "";
}

export function runFailure(input: {
  runId: string | undefined;
  error?: string | null;
  executions: ExecutionRecord[];
}): RunFailure {
  const mine = input.runId
    ? input.executions.filter((item) => item.runId === input.runId)
    : [];
  const failed = mine
    .filter((item) => item.status === "failed")
    .sort(
      (a, b) =>
        Date.parse(b.finishedAt ?? b.createdAt) -
        Date.parse(a.finishedAt ?? a.createdAt),
    )[0];

  if (failed) {
    const place = placeOf(failed.tool);
    const where = place
      ? `${place.charAt(0).toLowerCase()}${place.slice(1)}`
      : "somewhere";
    const line = lastMeaningfulLine(failed.output ?? "");
    const code =
      typeof failed.exitCode === "number" ? ` (exit ${failed.exitCode})` : "";
    // Transient even at the command level: an SSH connection that dropped
    // mid-command is worth another go; a program that rejected its input is
    // not.
    const transient = TRANSIENT.test(line) || TRANSIENT.test(input.error ?? "");
    return {
      says: line
        ? `A command ${where} did not finish${code}: ${line}`
        : `A command ${where} did not finish${code}.`,
      action: transient
        ? { label: "Try again", kind: "retry" }
        : {
            label: "Ask what went wrong",
            kind: "ask",
            draft:
              "The last command failed. Read its output, tell me in one paragraph what actually went wrong, and say what you would do about it before doing anything.",
          },
    };
  }

  // A run's own `error` is runtime text — "Transaction failed for internal
  // Run id." — and this product has already decided it does not reach the
  // reader. That decision is right and is guarded by a test: an internal
  // identifier in a status line tells somebody nothing and looks like a
  // crash. A failed command's output is different and is used above: it is
  // the command's own words, already redacted, already on screen in its
  // terminal.
  //
  // So with no command to read, the honest line says exactly that, and the
  // offer is the one thing that might work.
  return {
    says: "The turn ended before it finished, and no command recorded why.",
    action: { label: "Try again", kind: "retry" },
  };
}
