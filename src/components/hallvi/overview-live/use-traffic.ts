"use client";

// Requests as they arrive, and who the last few minutes of them were.
//
// Everything here is about the window the page has seen: a few minutes of
// backlog the server sends on connect, then whatever happens while the page
// is open. It is never presented as a day, a week or a trend.
//
// The stream sends arrivals (with a country, a source and a device) and a
// "now" count, so Overview's live line and the Traffic page's map read one
// thing.

import { useCallback, useEffect, useRef, useState } from "react";

import type { Arrival } from "@/server/traffic/contract";

import { useTrafficSource } from "../traffic/source";

export type TrafficState =
  "connecting" | "live" | "lost" | "no-log" | "no-server";

/** A request the page has seen, numbered so a list can key on it. */
export type SeenLine = Arrival & { id: number };

export interface Traffic {
  state: TrafficState;
  /** Page views that arrived while the page was open, newest first. */
  arrivals: SeenLine[];
  /**
   * The server's own estimate of distinct browsers in its window, when it
   * sends one; otherwise the browsers that opened a page in this one.
   */
  recentVisitors: number;
  /** Pages open right now, from the script's pings; null without it. */
  openNow: number | null;
  /** When these numbers were last worked out, for saying "12 s ago". */
  clock: number;
  /**
   * Called with each arrival that has only just happened: a script's view
   * (`script`) as well as the requests the application answered.
   */
  onArrival: (listener: (line: SeenLine) => void) => () => void;
}

export const WINDOW_MINUTES = 5;
const WINDOW = WINDOW_MINUTES * 60_000;

export function summarise(lines: SeenLine[], now: number) {
  const seen = lines.filter((line) => now - line.at <= WINDOW);
  return {
    at: now,
    seen,
    // Browsers that opened a page, which is nearer to visitors than every
    // address that asked for a file. A view built from a script event counts
    // as the view it is.
    viewers: new Set(
      seen.filter((line) => line.kind === "view").map((line) => line.visitor),
    ).size,
  };
}

export function useTraffic(applicationId: string): Traffic {
  const source = useTrafficSource();
  const lines = useRef<SeenLine[]>([]);
  const counter = useRef(0);
  const listeners = useRef(new Set<(line: SeenLine) => void>());
  const [state, setState] = useState<TrafficState>("connecting");
  const [summary, setSummary] = useState(() => summarise([], 0));
  const [now, setNow] = useState<{
    openNow: number | null;
    recentVisitors: number;
  } | null>(null);
  // The same function for the life of the hook, so a subscriber's effect
  // does not end and start again on every render.
  const onArrival = useCallback((listener: (line: SeenLine) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      const next = summarise(lines.current, Date.now());
      lines.current = next.seen;
      setSummary(next);
    };
    const arrive = (arrived: SeenLine[]) => {
      const at = Date.now();
      for (const line of arrived) {
        lines.current.push(line);
        // Backlog is counted but not replayed as if it were happening now.
        if (at - line.at > 4_000) continue;
        for (const listener of listeners.current) listener(line);
      }
      refresh();
    };
    const close = source.live(applicationId, {
      event(event) {
        if (event.type === "state") {
          setState(event.state);
          // A new session resends its backlog, so the old one is dropped.
          if (
            event.state === "connecting" ||
            event.state === "no-log" ||
            event.state === "no-server"
          ) {
            lines.current = [];
            setNow(null);
            setSummary(summarise([], Date.now()));
          }
          return;
        }
        if (event.type === "now") {
          setNow({
            openNow: event.openNow,
            recentVisitors: event.recentVisitors,
          });
          return;
        }
        arrive(
          event.arrivals.map((arrival) => ({
            ...arrival,
            id: counter.current++,
          })),
        );
      },
      error: () =>
        setState((current) =>
          current === "no-log" || current === "no-server" ? current : "lost",
        ),
    });
    const ageing = window.setInterval(refresh, 5_000);
    return () => {
      close();
      window.clearInterval(ageing);
    };
  }, [applicationId, source]);

  return {
    state,
    arrivals: summary.seen
      .filter((line) => line.kind === "view")
      .slice(-12)
      .reverse(),
    recentVisitors: now?.recentVisitors ?? summary.viewers,
    openNow: now?.openNow ?? null,
    clock: summary.at,
    onArrival,
  };
}
