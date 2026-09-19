"use client";

// Requests as they arrive, and what the last few minutes of them add up to.
//
// Everything here is about the window the page has seen: a few minutes of
// backlog the server sends on connect, then whatever happens while the page
// is open. It is never presented as a day, a week or a trend.

import { useEffect, useRef, useState } from "react";

import type { AccessLine, TrafficEvent } from "@/server/access-log";

export type TrafficState =
  "connecting" | "live" | "lost" | "no-log" | "no-server";

/** A request the page has seen, numbered so a list can key on it. */
export type SeenLine = AccessLine & { id: number };

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
  /** Distinct source addresses in the observed window, not people. */
  visitors: number;
  requests: number;
  failed: number;
  perMinute: number;
  lanes: Lane[];
  /** Called with each request that has only just happened. */
  onArrival: (listener: (line: AccessLine, lane: string) => void) => () => void;
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
    seen,
    lanes,
    visitors: new Set(seen.map((line) => line.visitor)).size,
    requests: seen.length,
    failed: seen.filter((line) => line.status >= 500).length,
    perMinute: seen.filter((line) => now - line.at <= 60_000).length,
  };
}

export function useTraffic(applicationId: string): Traffic {
  const lines = useRef<SeenLine[]>([]);
  const counter = useRef(0);
  const listeners = useRef(new Set<(line: AccessLine, lane: string) => void>());
  const [state, setState] = useState<TrafficState>("connecting");
  const [detail, setDetail] = useState<string | null>(null);
  const [summary, setSummary] = useState(() => summarise([], 0));

  useEffect(() => {
    const source = new EventSource(
      `/api/applications/${applicationId}/traffic`,
    );
    const refresh = () => {
      const next = summarise(lines.current, Date.now());
      lines.current = next.seen;
      setSummary(next);
    };
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as TrafficEvent;
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
          setSummary(summarise([], Date.now()));
        }
        return;
      }
      const now = Date.now();
      const arrived = event.lines.map((line) => ({
        ...line,
        id: counter.current++,
      }));
      const visible = new Set(
        summarise([...lines.current, ...arrived], now).lanes.map(
          (lane) => lane.name,
        ),
      );
      for (const line of arrived) {
        lines.current.push(line);
        // Backlog is counted but not replayed as if it were happening now.
        if (now - line.at > 4_000) continue;
        const lane = laneOf(line.path);
        for (const listener of listeners.current)
          listener(line, visible.has(lane) ? lane : OTHER);
      }
      refresh();
    };
    // EventSource reconnects by itself; until it does, say so.
    source.onerror = () =>
      setState((current) =>
        current === "no-log" || current === "no-server" ? current : "lost",
      );
    const ageing = window.setInterval(refresh, 5_000);
    return () => {
      source.close();
      window.clearInterval(ageing);
    };
  }, [applicationId]);

  return {
    state,
    detail,
    recent: summary.seen.slice(-7).reverse(),
    visitors: summary.visitors,
    requests: summary.requests,
    failed: summary.failed,
    perMinute: summary.perMinute,
    lanes: summary.lanes,
    onArrival: (listener) => {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
  };
}
