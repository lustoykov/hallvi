"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedInformation } from "@/server/operator-data";
import { accessRouteIdentity } from "@/server/access-record";
import type { Reachability } from "./deployment-prototype/page-head";
import { QUIET_PULSE, type Pulse } from "./pulse";

interface Answer {
  applicationId: string;
  routeIdentity: string | null;
  state: Reachability;
  pulse: Pulse;
  reconnectable?: boolean;
}

/** Page-bound observations only; this never opens a tunnel or asks Pi. */
export function useAccessObservation(
  applicationId: string | undefined,
  record: SavedInformation | undefined,
) {
  const routeIdentity = accessRouteIdentity(record);
  const [answered, setAnswered] = useState<Answer | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    let latestRead = 0;
    const unknown = (state: "unknown" | "unavailable", readId: number) => {
      if (!cancelled && readId === latestRead)
        setAnswered({
          applicationId,
          routeIdentity,
          state,
          pulse: { app: "unknown", server: "unknown" },
        });
    };
    const read = async () => {
      const readId = ++latestRead;
      try {
        const response = await fetch(
          `/api/applications/${applicationId}/access`,
        );
        if (!response.ok) {
          unknown("unknown", readId);
          return;
        }
        const body = await response.json().catch(() => null);
        if (!body) {
          unknown("unknown", readId);
          return;
        }
        if (cancelled || readId !== latestRead) return;
        if (body.routeIdentity !== routeIdentity) {
          unknown("unknown", readId);
          return;
        }
        setAnswered({
          applicationId,
          routeIdentity,
          reconnectable: body.reconnectable === true,
          state:
            body.open === true
              ? "open"
              : body.open === false
                ? "closed"
                : "unknown",
          pulse: {
            // Private open checks SSH, not the application over HTTP.
            app:
              body.mode === "public"
                ? body.open === true
                  ? "answering"
                  : body.open === false
                    ? "silent"
                    : "unknown"
                : "unknown",
            server: body.server ?? "unknown",
          },
        });
      } catch {
        unknown("unavailable", readId);
      }
    };
    void read();
    const timer = window.setInterval(read, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applicationId, routeIdentity, revision]);
  const current =
    answered?.applicationId === applicationId &&
    answered?.routeIdentity === routeIdentity
      ? answered
      : null;
  return {
    reachable: current?.state ?? "checking",
    pulse: current?.pulse ?? QUIET_PULSE,
    routeIdentity,
    reconnectable: current?.reconnectable === true,
    refresh,
  };
}
