"use client";

// Little Server stops by for a nice moment — a first visitor, a first visit
// from a new country, a record day — says so in a few words, and leaves.
//
// Each moment happens once for each viewer: what a viewer has seen is kept in
// this browser, and nowhere else. He rises from behind the edge of whatever
// he visits, the same flat figure that works beside a running reply, and is
// absent under reduced motion; the words still show, briefly.

import { useEffect, useState } from "react";

import { WorkingMascot } from "../working-mascot";
import type { Moment } from "./model";

const STAY = 6_400;
const key = (applicationId: string) =>
  `hallvi.traffic.moments.${applicationId}`;

function seen(applicationId: string): string[] {
  try {
    const kept = JSON.parse(
      window.localStorage.getItem(key(applicationId)) ?? "[]",
    );
    return Array.isArray(kept) ? kept : [];
  } catch {
    return [];
  }
}

function remember(applicationId: string, id: string) {
  try {
    const kept = seen(applicationId);
    window.localStorage.setItem(
      key(applicationId),
      JSON.stringify([...kept, id].slice(-200)),
    );
  } catch {
    // Without storage he may visit again; that is all it costs.
  }
}

/**
 * The first moment this viewer has not seen, while he visits; then null.
 * Moments that arrive later — a new country, live — wait their turn.
 */
export function useMoment(applicationId: string, candidates: Moment[]) {
  const [visiting, setVisiting] = useState<Moment | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const next = candidates.find((one) => !done.includes(one.id)) ?? null;
  const nextId = next?.id ?? null;

  useEffect(() => {
    if (visiting || !nextId) return;
    if (seen(applicationId).includes(nextId)) {
      // Seen on an earlier look: skip it without a visit.
      const skip = window.setTimeout(
        () => setDone((current) => [...current, nextId]),
        0,
      );
      return () => window.clearTimeout(skip);
    }
    const moment = candidates.find((one) => one.id === nextId)!;
    remember(applicationId, nextId);
    // A beat after the page settles, so he is not part of its arrival.
    const arrive = window.setTimeout(() => setVisiting(moment), 900);
    return () => window.clearTimeout(arrive);
    // `candidates` is read only for the moment `nextId` names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, nextId, visiting]);

  useEffect(() => {
    if (!visiting) return;
    const leave = window.setTimeout(() => {
      setDone((current) => [...current, visiting.id]);
      setVisiting(null);
    }, STAY);
    return () => window.clearTimeout(leave);
  }, [visiting]);

  return visiting;
}

/** Little Server, visiting, with what the moment is. */
export function Visit({
  moment,
  place,
}: {
  moment: Moment;
  /** Where he stands: the map's corner, a number's side, a list's row. */
  place: "corner" | "beside" | "row" | "line";
}) {
  return (
    <span className="tf-visit" data-place={place} role="status">
      <WorkingMascot />
      <span className="tf-visit-words">{moment.words}</span>
    </span>
  );
}
