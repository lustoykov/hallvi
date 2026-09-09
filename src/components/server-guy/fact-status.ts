import type {
  BackupEvidenceFacts,
  BackupProof,
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
  const observation = facts.observation;
  if (observation?.running && observation.reachable)
    return {
      tone: "working",
      title: "Backup work is running on the host",
    } as const;
  if (observation?.cleanupPending)
    return { tone: "bad", title: "Backup cleanup needs attention" } as const;
  if (observation && !observation.reachable)
    return {
      tone: "warn",
      title: "Current backup status is unavailable",
    } as const;
  if (observation && !observation.timerActive)
    return {
      tone: "warn",
      title: "The backup schedule is not running",
    } as const;
  if (observation?.retentionFailed)
    return {
      tone: "warn",
      title: "Copy verified · retention needs attention",
    } as const;
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
  if (observation && !facts.restoreTest)
    return { tone: "warn", title: "Backed up · restore not tested" } as const;
  return { tone: "ok", title: `Protected · ${facts.policy.schedule}` } as const;
}

/** The most recent proof of any outcome, including one still unfinished. */
export function latestProof(facts: BackupEvidenceFacts): BackupProof | null {
  return facts.proofs[0] ?? null;
}

/** The most recent proof that restored. It may be an older revision. */
export function lastVerifiedProof(
  facts: BackupEvidenceFacts,
): BackupProof | null {
  return facts.proofs.find((proof) => proof.outcome === "verified") ?? null;
}

/**
 * A proof is never protection. A verified restore earns the proof itself a
 * verified mark, but the destination is still amber while nothing is
 * scheduled, and a newer attempt that failed always leads: it never hides
 * behind an older success, and an older success is never erased by it.
 */
export function backupEvidenceStatus(facts: BackupEvidenceFacts) {
  const latest = latestProof(facts);
  if (facts.proofs.some((proof) => proof.cleanupNotes.length > 0))
    return {
      tone: "bad",
      title: "Temporary restore resources need cleanup",
    } as const;
  if (!latest)
    return {
      tone: "muted",
      title: "No restore proof for what is running now",
    } as const;
  if (latest.outcome === "failed")
    return { tone: "bad", title: "The last restore proof failed" } as const;
  if (latest.outcome === "incomplete")
    return {
      tone: "muted",
      title: "The last restore proof did not finish",
    } as const;
  if (!latest.revisionCurrent)
    return {
      tone: "warn",
      title: "Restore proved for an earlier revision",
    } as const;
  return {
    tone: "warn",
    title: "Restore proved · nothing scheduled",
  } as const;
}
