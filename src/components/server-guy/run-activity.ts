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
   * everything else is Server Guy working and can stay quiet.
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
  executions: ExecutionRecord[];
  activity: ActivityRecord[];
  now: number;
}): RunActivity {
  const { runId, now } = input;
  const mine = <T extends { runId: string }>(items: T[]) =>
    runId ? items.filter((item) => item.runId === runId) : [];
  const executions = mine(input.executions);

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
