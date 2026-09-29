"use client";

// Requests as they arrive, and what the last few minutes of them add up to.
//
// Everything here is about the window the page has seen: a few minutes of
// backlog the server sends on connect, then whatever happens while the page
// is open. It is never presented as a day, a week or a trend.
//
// The stream sends arrivals (with a country, a source and a device) and a
// "now" count, so Overview's flow and the Traffic page's map read one thing.

import { useCallback, useEffect, useRef, useState } from "react";

import type { Arrival } from "@/server/traffic/contract";

import { useTrafficSource } from "../traffic/source";

export type TrafficState =
  "connecting" | "live" | "lost" | "no-log" | "no-server";

/** A request the page has seen, numbered so a list can key on it. */
export type SeenLine = Arrival & { id: number };

export interface Lane {
  /** A path, grouped so one product page is not one lane each. */
  name: string;
  requests: number;
  failed: number;
}

export interface Traffic {
  state: TrafficState;
  detail: string | null;
  /** Newest first, for the tape. */
  recent: SeenLine[];
  /** Page views that arrived while the page was open, newest first. */
  arrivals: SeenLine[];
  /** Distinct source addresses in the observed window, not people. */
  visitors: number;
  /**
   * The server's own estimate of distinct browsers in its window, when it
   * sends one; otherwise the browsers that opened a page in this one.
   */
  recentVisitors: number;
  /** Pages open right now, from the script's pings; null without it. */
  openNow: number | null;
  /** When these numbers were last worked out, for saying "12 s ago". */
  clock: number;
  requests: number;
  failed: number;
  perMinute: number;
  lanes: Lane[];
  /** Called with each request that has only just happened. */
  onArrival: (listener: (line: SeenLine, lane: string) => void) => () => void;
}

export const WINDOW_MINUTES = 5;
const WINDOW = WINDOW_MINUTES * 60_000;
const LANES = 5;
export const OTHER = "everything else";

const asset =
  /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|txt|xml|json)$/i;
/** `/products/42/reviews` is `/products`; a stylesheet is `assets`. */
export function laneOf(path: string) {
  if (asset.test(path)) return "assets";
  const first = path.split("/")[1] ?? "";
  return first ? `/${first}` : "/";
}

function summarise(lines: SeenLine[], now: number) {
  const seen = lines.filter((line) => now - line.at <= WINDOW);
  const counts = new Map<string, Lane>();
  for (const line of seen) {
    const name = laneOf(line.path);
    const lane = counts.get(name) ?? { name, requests: 0, failed: 0 };
    lane.requests++;
    if (line.status >= 500) lane.failed++;
    counts.set(name, lane);
  }
  const ranked = [...counts.values()].sort((a, b) => b.requests - a.requests);
  const lanes = ranked.slice(0, LANES);
  const rest = ranked.slice(LANES);
  if (rest.length)
    lanes.push({
      name: OTHER,
      requests: rest.reduce((sum, lane) => sum + lane.requests, 0),
      failed: rest.reduce((sum, lane) => sum + lane.failed, 0),
    });
  return {
    at: now,
    seen,
    lanes,
    visitors: new Set(seen.map((line) => line.visitor)).size,
    // Browsers that opened a page, which is nearer to visitors than every
    // address that asked for a file.
    viewers: new Set(
      seen.filter((line) => line.kind === "view").map((line) => line.visitor),
    ).size,
    requests: seen.length,
    failed: seen.filter((line) => line.status >= 500).length,
    perMinute: seen.filter((line) => now - line.at <= 60_000).length,
  };
}

export function useTraffic(applicationId: string): Traffic {
  const source = useTrafficSource();
  const lines = useRef<SeenLine[]>([]);
  const counter = useRef(0);
  const listeners = useRef(new Set<(line: SeenLine, lane: string) => void>());
  const [state, setState] = useState<TrafficState>("connecting");
  const [detail, setDetail] = useState<string | null>(null);
  const [summary, setSummary] = useState(() => summarise([], 0));
  const [now, setNow] = useState<{
    openNow: number | null;
    recentVisitors: number;
  } | null>(null);
  // The same function for the life of the hook, so a subscriber's effect
  // does not end and start again on every render.
  const onArrival = useCallback(
    (listener: (line: SeenLine, lane: string) => void) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );

  useEffect(() => {
    const refresh = () => {
      const next = summarise(lines.current, Date.now());
      lines.current = next.seen;
      setSummary(next);
    };
    const arrive = (arrived: SeenLine[]) => {
      const at = Date.now();
      const visible = new Set(
        summarise([...lines.current, ...arrived], at).lanes.map(
          (lane) => lane.name,
        ),
      );
      for (const line of arrived) {
        lines.current.push(line);
        // Backlog is counted but not replayed as if it were happening now.
        if (at - line.at > 4_000) continue;
        const lane = laneOf(line.path);
        for (const listener of listeners.current)
          listener(line, visible.has(lane) ? lane : OTHER);
      }
      refresh();
    };
    const close = source.live(applicationId, {
      event(event) {
        if (event.type === "state") {
          setState(event.state);
          setDetail(event.state === "lost" ? event.detail : null);
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
    detail,
    recent: summary.seen.slice(-7).reverse(),
    arrivals: summary.seen
      .filter((line) => line.kind === "view")
      .slice(-12)
      .reverse(),
    visitors: summary.visitors,
    recentVisitors: now?.recentVisitors ?? summary.viewers,
    openNow: now?.openNow ?? null,
    clock: summary.at,
    requests: summary.requests,
    failed: summary.failed,
    perMinute: summary.perMinute,
    lanes: summary.lanes,
    onArrival,
  };
}
