"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Reads the live record from the main checkout's dev server through this
// worktree's /live-record proxy, GET requests only, and falls back to the
// worktree's own copy of the database when that server is not reachable.

import { useCallback, useEffect, useState } from "react";

import type { SecurityFacts } from "@/server/application-facts";

import type { LiveRecord } from "./model";

export function useLiveRecord(applicationId: string, fallback: LiveRecord) {
  const [record, setRecord] = useState<LiveRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const [security, setSecurity] = useState<SecurityFacts | null>(null);

  const load = useCallback(async () => {
    try {
      const [view, deployment] = await Promise.all(
        [
          `/live-record/applications/${applicationId}`,
          `/live-record/applications/${applicationId}/deployment`,
        ].map(async (url) => {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) throw new Error(`${url}: ${response.status}`);
          return response.json();
        }),
      );
      setRecord({
        application: view.application,
        facts: view.facts ?? {},
        operations: deployment.operations ?? view.operations ?? [],
        deployment: deployment.deployment ?? null,
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [applicationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // One read of the firewall per visit, as opening Security does. The
  // provider answers with the rules it holds; nothing is changed.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/live-record/applications/${applicationId}/firewall`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.security) setSecurity(body.security as SecurityFacts);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [applicationId]);

  return {
    record: record ?? fallback,
    source: record
      ? ("live" as const)
      : failed
        ? ("local" as const)
        : ("loading" as const),
    security,
    refresh: load,
  };
}
