"use client";

// Where the traffic pages get their numbers.
//
// The pages read stored totals and the live stream through one small source,
// so a development preview can hand them invented numbers without the pages
// knowing (`src/app/prototype/traffic`). In the product it is always the
// controller's own routes.

import { createContext, useContext, useEffect, useState } from "react";

import type {
  Collection,
  LiveEvent,
  ReleaseImpact,
  TrafficHistory,
  TrafficRange,
} from "@/server/traffic/contract";

import { api } from "../api";
import { trafficListed } from "./model";

export type CollectionAction = "keep" | "stop" | "forget";

/** What the live stream sends. */
export type StreamEvent = LiveEvent;

export interface TrafficSource {
  history(applicationId: string, range: TrafficRange): Promise<TrafficHistory>;
  collection(applicationId: string): Promise<Collection>;
  act(applicationId: string, action: CollectionAction): Promise<Collection>;
  impact(applicationId: string, at: string[]): Promise<ReleaseImpact[]>;
  /** Opens the live stream, and returns what closes it. */
  live(
    applicationId: string,
    on: { event: (event: StreamEvent) => void; error: () => void },
  ): () => void;
}

const controller: TrafficSource = {
  history: api.trafficHistory,
  collection: api.trafficCollection,
  act: api.setTrafficCollection,
  impact: api.releaseImpact,
  live(applicationId, on) {
    const stream = new EventSource(
      `/api/applications/${applicationId}/traffic`,
    );
    stream.onmessage = (message) =>
      on.event(JSON.parse(message.data) as StreamEvent);
    // EventSource reconnects by itself; until it does, the page says so.
    stream.onerror = on.error;
    return () => stream.close();
  },
};

export const TrafficSourceContext = createContext<TrafficSource>(controller);
export const useTrafficSource = () => useContext(TrafficSourceContext);

// A choice made on the Traffic page has to reach the sidebar at once, and
// the sidebar is not inside the page. One event, keyed by application.
const CHANGED = "hv-traffic-collection";

/**
 * Whether history is kept, and what the collector last saw. `null` until it
 * has been read, which is never the same as off.
 */
export function useCollection(applicationId: string | null | undefined) {
  const source = useTrafficSource();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [read, setRead] = useState<string | null>(null);
  // A different application is a different answer: forget the old one while
  // the new one is read, rather than showing it under the wrong name.
  if (read !== (applicationId ?? null)) {
    setRead(applicationId ?? null);
    setCollection(null);
  }
  useEffect(() => {
    if (!applicationId) return;
    let live = true;
    const load = () =>
      source
        .collection(applicationId)
        .then((next) => live && setCollection(next))
        // Unread stays unread: no route, no claim.
        .catch(() => {});
    load();
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        applicationId: string;
        collection: Collection;
      };
      if (detail.applicationId === applicationId && live)
        setCollection(detail.collection);
    };
    window.addEventListener(CHANGED, changed);
    // The collector moves on its own — catching up, live, lost — so the
    // answer is read again now and then while a page is open.
    const timer = window.setInterval(load, 60_000);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, changed);
      window.clearInterval(timer);
    };
  }, [applicationId, source]);

  const act = async (action: CollectionAction) => {
    if (!applicationId) return;
    const next = await source.act(applicationId, action);
    window.dispatchEvent(
      new CustomEvent(CHANGED, {
        detail: { applicationId, collection: next },
      }),
    );
  };
  return { collection, act };
}

/** Whether this application lists Traffic, for the sidebar. */
export function useTrafficListed(applicationId: string | null | undefined) {
  return trafficListed(useCollection(applicationId).collection);
}

/**
 * One range of stored totals, read again every minute: today's numbers are
 * provisional and the collector keeps them current.
 */
export function useHistory(
  applicationId: string | null,
  range: TrafficRange,
  /** False skips the read, for an application that keeps no history. */
  wanted = true,
) {
  const source = useTrafficSource();
  const [state, setState] = useState<{
    key: string;
    history: TrafficHistory | null;
    error: string | null;
  }>({ key: "", history: null, error: null });
  const key = `${applicationId}:${range}`;
  useEffect(() => {
    if (!applicationId || !wanted) return;
    let live = true;
    const load = () =>
      source
        .history(applicationId, range)
        .then((history) => live && setState({ key, history, error: null }))
        .catch(
          (error: unknown) =>
            live &&
            setState((current) => ({
              ...current,
              key,
              error: error instanceof Error ? error.message : String(error),
            })),
        );
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [applicationId, range, wanted, key, source]);
  return {
    // The previous range stays drawn while the next one is read, so the
    // switch does not flash an empty page.
    history: state.history,
    current: state.key === key,
    error: state.key === key ? state.error : null,
  };
}

/** What followed each release, by release time. Quiet releases are absent. */
export function useImpacts(applicationId: string | null, at: string[]) {
  const source = useTrafficSource();
  const [impacts, setImpacts] = useState<Map<string, ReleaseImpact>>(
    () => new Map(),
  );
  const key = at.join("|");
  useEffect(() => {
    if (!applicationId || !key) return;
    let live = true;
    source
      .impact(applicationId, key.split("|"))
      .then((answers) => {
        if (!live) return;
        setImpacts(
          new Map(answers.map((answer) => [answer.releaseAt, answer])),
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [applicationId, key, source]);
  return impacts;
}
