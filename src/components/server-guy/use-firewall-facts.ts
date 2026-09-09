"use client";

import { useEffect, useState } from "react";
import type { SecurityFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";

type Observation = {
  key: string;
  request: number;
  security: SecurityFacts | null;
  error: string | null;
};

export function useFirewallFacts(
  deployment: DeploymentRecord | null,
  enabled: boolean,
) {
  const applicationId = deployment?.applicationId;
  const serverId = deployment?.serverId;
  const key = `${applicationId}:${serverId}:${deployment?.authority?.connectionId}`;
  const [request, setRequest] = useState(0);
  const [observation, setObservation] = useState<Observation | null>(null);
  const current = observation?.key === key ? observation : null;
  const loading = Boolean(
    enabled && serverId && (!current || current.request !== request),
  );

  useEffect(() => {
    if (
      !enabled ||
      !applicationId ||
      !serverId ||
      (observation?.key === key && observation.request === request)
    )
      return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/applications/${applicationId}/firewall`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Could not check the firewall.");
        if (body.serverId !== serverId || !body.security)
          throw new Error("Unexpected firewall response.");
        if (!controller.signal.aborted)
          setObservation({
            key,
            request,
            security: body.security,
            error: null,
          });
      } catch (failure) {
        if (!controller.signal.aborted)
          setObservation((previous) => ({
            key,
            request,
            security: previous?.key === key ? previous.security : null,
            error:
              failure instanceof Error
                ? failure.message
                : "Could not check the firewall.",
          }));
      }
    })();
    return () => controller.abort();
  }, [applicationId, serverId, key, enabled, request, observation]);

  return {
    facts: current?.security ? { security: current.security } : {},
    error: loading ? null : current?.error,
    loading,
    refresh: () => setRequest((value) => value + 1),
  };
}
