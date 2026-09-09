import type {
  MonitoringFacts,
  ProtectionFacts,
} from "@/server/application-facts";

import { isStale } from "./operation-model";

/** Missing observations and acknowledged issues do not prove recovery. */
export function monitoringStatus(facts: MonitoringFacts, now: number) {
  const { collector, checks, issues } = facts;
  const unresolved = issues.filter((issue) => issue.state !== "recovered");
  const failing = checks.filter((check) => check.state === "failing");
  const uncertain =
    !checks.length ||
    checks.some(
      (check) => check.state === "unknown" || isStale(check.lastAt, now),
    );
  if (collector.state === "not-running")
    return { tone: "muted", title: "Not monitored" } as const;
  if (collector.hostReachable === false)
    return { tone: "bad", title: "Host unreachable" } as const;
  if (collector.state === "stale" || isStale(collector.lastObservationAt, now))
    return { tone: "muted", title: "Monitoring is stale" } as const;
  if (unresolved.length)
    return {
      tone: unresolved.some((issue) => issue.state === "open") ? "bad" : "warn",
      title: `${unresolved.length} issue${unresolved.length === 1 ? "" : "s"} need${unresolved.length === 1 ? "s" : ""} attention`,
    } as const;
  if (failing.length)
    return {
      tone: "bad",
      title: `${failing.length} check${failing.length === 1 ? "" : "s"} failing`,
    } as const;
  if (uncertain)
    return {
      tone: "muted",
      title: "Waiting for current check results",
    } as const;
  return { tone: "ok", title: "All checks passing" } as const;
}

/** A configured policy alone does not prove a recoverable off-host copy. */
export function protectionStatus(facts: ProtectionFacts) {
  if (
    facts.lastAttempt?.outcome === "failed" ||
    facts.coverage.some((item) => item.state === "failed")
  )
    return { tone: "bad", title: "The last backup attempt failed" } as const;
  if (facts.coverage.some((item) => item.state === "behind"))
    return {
      tone: "warn",
      title: "Protection is behind the agreed policy",
    } as const;
  if (
    facts.lastAttempt?.outcome === "partial" ||
    facts.coverage.some(
      (item) => item.state === "unprotected" || item.state === "not-covered",
    )
  )
    return {
      tone: "warn",
      title: "Some state is still not backed up",
    } as const;
  if (
    !facts.destination ||
    !facts.policy ||
    !facts.coverage.length ||
    facts.coverage.some((item) => !item.lastSuccessfulAt)
  )
    return {
      tone: "muted",
      title: "Backup protection is not verified",
    } as const;
  return { tone: "ok", title: `Protected · ${facts.policy.schedule}` } as const;
}
