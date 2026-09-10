"use client";

import { currentFacts } from "@/server/release-facts";
import { ArrowRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { ApplicationFacts, ViewAction } from "@/server/application-facts";
import {
  persistentState,
  type ApplicationStack,
} from "@/server/application-stack";
import { deploymentRuntime } from "@/server/deployment-runtime";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { OperatorView } from "@/server/types";

import type { ApplicationSection } from "./application-sections";
import {
  backupEvidenceStatus,
  lastVerifiedProof,
  monitoringStatus,
  protectionStatus,
} from "./fact-status";
import { LocalTime } from "./local-time";
import {
  attentionItems,
  isStale,
  labelOf,
  recentOperations,
  relativeTime,
  stepDetail,
} from "./operation-model";
import { StateChip } from "./operation-receipt";
import { IssueCard } from "./views/monitoring-view";

interface Run {
  key: string;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "warn" | "bad";
  destination?: ApplicationSection;
}

/**
 * One thing this application runs: its name, what it is, and one fact about
 * it. Laid out as a grid rather than a column of label-and-value rows, so
 * eight components read as one block instead of eight lines.
 */
function RunEntry({
  run,
  onOpen,
}: {
  run: Run;
  onOpen: (destination: ApplicationSection) => void;
}) {
  const body = (
    <>
      <span className="sg-run-label">{run.label}</span>
      <strong className="sg-run-value">{run.value}</strong>
      {run.note && (
        <span className={`sg-run-note${run.tone ? ` sg-run-${run.tone}` : ""}`}>
          {run.tone && <i className="sg-dot" aria-hidden="true" />}
          {run.note}
        </span>
      )}
    </>
  );
  return run.destination ? (
    <button
      type="button"
      className="sg-run sg-run-open"
      onClick={() => onOpen(run.destination!)}
    >
      {body}
    </button>
  ) : (
    <div className="sg-run">{body}</div>
  );
}

/**
 * Overview answers four questions in order: what is running, what needs you,
 * what changed, and how fresh the evidence is. Only recorded facts appear;
 * continuous monitoring counts only while its collector is running.
 */
export function ApplicationOverview({
  view,
  deployment,
  stack,
  facts = {},
  operations,
  now,
  onOpenDestination,
  onOpenConversation,
  onAsk,
  onRevealStack,
  onAction,
  busy,
}: {
  view: OperatorView;
  deployment: DeploymentRecord | null;
  stack: ApplicationStack;
  facts?: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  onOpenDestination: (destination: ApplicationSection) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  /** Drafts a message in the conversation that started the deployment. */
  onAsk: (chatId: string | null, draft: string) => void;
  /** Shows the hidden stack destinations in navigation. */
  onRevealStack?: () => void;
  onAction?: (action: ViewAction) => void;
  busy?: string | null;
}) {
  const application = view.application;
  if (!application) return null;
  const chatTitle = (id: string) =>
    view.chats.find((chat) => chat.id === id)?.title ?? "another conversation";
  const runtime = deploymentRuntime(deployment);
  const uncertainRuntime = runtime.state === "unknown";
  const observedRuntime = runtime.state === "observed";
  const configuration = currentFacts(deployment);
  const live = runtime.state === "verified" || Boolean(facts.releases?.serving);
  const verifiedAt =
    runtime.lastVerified?.checkedAt ??
    facts.releases?.serving?.verifiedAt ??
    deployment?.verifiedAt ??
    null;
  const monitoring = facts.monitoring;
  const lastObservation = monitoring?.collector.lastObservationAt ?? null;
  const watching = monitoring?.collector.state === "running";
  const stale = isStale(watching ? lastObservation : verifiedAt, now);
  const issues = (monitoring?.issues ?? []).filter(
    (issue) => issue.state !== "recovered",
  );
  const failingChecks = (monitoring?.checks ?? []).filter(
    (check) => check.state === "failing",
  );
  // An issue already carries Investigate for the operation it records.
  const attention = attentionItems(operations).filter(
    (operation) => !issues.some((issue) => issue.operationId === operation.id),
  );
  const changes = recentOperations(operations).slice(0, 6);
  const postgres = stack.databases.find((item) => item.kind === "postgres");
  const protectable = persistentState(stack);
  const protection = facts.protection;
  const protectionSummary = protection ? protectionStatus(protection) : null;
  const protectionState = protectionSummary?.tone;
  // Manual restore proofs. They keep this row off "Not backed up" without
  // ever becoming a schedule: a proof is a date, not ongoing protection.
  const evidence = facts.backupEvidence;
  const proved = evidence ? lastVerifiedProof(evidence) : null;
  const provedAt = proved?.finishedAt ?? proved?.startedAt ?? null;
  const cleanupPending = evidence?.proofs.some(
    (proof) => proof.cleanupNotes.length > 0,
  );
  const workers = stack.processes.filter((item) => item.role === "worker");
  const absent = [
    ...(stack.services.length || stack.queues.length ? [] : ["cache or queue"]),
    ...(workers.length ? [] : ["workers"]),
    ...(stack.jobs.length ? [] : ["scheduled jobs"]),
  ];
  const monitoringSummary = monitoring
    ? monitoringStatus(monitoring, now)
    : null;
  // The headline is the state, not the name: the name is in navigation.
  const headline = uncertainRuntime
    ? "Runtime needs verification"
    : observedRuntime
      ? "Running · behavior not verified"
      : monitoringSummary
        ? monitoringSummary.title
        : verifiedAt
          ? stale
            ? "Last verified over a day ago"
            : live
              ? "Running"
              : "Earlier deployment verified"
          : deployment
            ? "Deployment not verified"
            : "Not deployed yet";
  const detail = uncertainRuntime
    ? "A deployment change may have reached the host. Earlier checks are historical; follow the latest operation to reconcile the outcome."
    : observedRuntime
      ? "The latest release runs its recorded images and passed readiness; its behavior is not verified. Earlier checks are historical."
      : monitoringSummary
        ? [
            monitoring?.collector.detail,
            lastObservation
              ? `last observed ${relativeTime(lastObservation, now)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : verifiedAt
          ? `Verified ${relativeTime(verifiedAt, now)} ${configuration?.httpAccess === "controller" ? "from the controller’s network" : "by public HTTP checks"} · no continuous monitoring yet`
          : "Nothing has been verified on a host yet.";
  const conditionTone = uncertainRuntime
    ? "warn"
    : observedRuntime
      ? "warn"
      : monitoringSummary
        ? monitoringSummary.tone
        : verifiedAt
          ? stale
            ? "warn"
            : live
              ? "ok"
              : "warn"
          : "muted";

  const runs: Run[] = [
    {
      key: "application",
      label: "Application",
      value: runtime.lastVerified ? (
        <code>{runtime.lastVerified.revision.slice(0, 12)}</code>
      ) : facts.releases?.serving ? (
        <code>{facts.releases.serving.revision.slice(0, 12)}</code>
      ) : deployment?.revision ? (
        <code>{deployment.revision.slice(0, 12)}</code>
      ) : (
        "Not deployed"
      ),
      note: uncertainRuntime
        ? "Earlier evidence · current runtime unverified"
        : (facts.releases?.serving?.message ??
          (verifiedAt
            ? `Verified ${relativeTime(verifiedAt, now)}`
            : deployment?.revision
              ? "Not deployed yet"
              : "No revision selected")),
      destination: "deployment",
    },
    {
      key: "host",
      label: "Host",
      value: deployment?.offer?.serverType.toUpperCase() ?? "No host recorded",
      note: deployment?.address
        ? `${deployment.address}${deployment.offer ? ` · ${deployment.offer.location}` : ""}`
        : "Selected and priced at deployment",
      destination: "architecture",
    },
  ];
  if (stack.recorded)
    runs.push({
      key: "processes",
      label: "Processes",
      value: `${stack.processes.length - workers.length} web${
        workers.length
          ? ` · ${workers.length} worker${workers.length === 1 ? "" : "s"}`
          : ""
      }`,
      note: failingChecks.some((check) => check.kind === "process")
        ? "One is unhealthy"
        : monitoring
          ? "All responding"
          : "Health not watched",
      tone: failingChecks.some((check) => check.kind === "process")
        ? "bad"
        : undefined,
      destination: "processes",
    });
  if (facts.domains)
    runs.push({
      key: "address",
      label: "Address",
      value: facts.domains.domain
        ? `${facts.domains.tls.state === "valid" ? "https://" : "http://"}${facts.domains.domain.name}`
        : (facts.domains.address ?? "No public address"),
      note: !facts.domains.domain
        ? "No custom domain"
        : facts.domains.domain.state !== "resolving"
          ? "Not resolving here yet"
          : facts.domains.tls.state === "valid"
            ? "Certificate valid"
            : "HTTPS pending",
      tone:
        facts.domains.domain && facts.domains.domain.state !== "resolving"
          ? "warn"
          : undefined,
      destination: "domains",
    });
  for (const database of stack.databases)
    runs.push({
      key: `database:${database.name}`,
      label: "Database",
      value:
        database.kind === "postgres"
          ? `PostgreSQL ${database.version}`
          : "Embedded SQLite",
      note: facts.database
        ? `${facts.database.sizeGb < 1 ? `${Math.round(facts.database.sizeGb * 1024)} MB` : `${facts.database.sizeGb.toFixed(1)} GB`} measured`
        : database.kind === "postgres"
          ? "Storage not measured"
          : database.location,
      destination: "database",
    });
  if (!stack.databases.length)
    runs.push({
      key: "database",
      label: "Database",
      value: "None",
      note: "This application keeps no database",
    });
  for (const service of stack.services)
    runs.push({
      key: `service:${service.name}`,
      label: "Cache & queue",
      value: `${service.kind === "valkey" ? "Valkey" : "Redis"}${service.version ? ` ${service.version}` : ""}`,
      note: stack.queues.length
        ? `${service.role} · ${stack.queues.map((queue) => queue.library).join(", ")}`
        : service.role,
      destination: "cache",
    });
  if (stack.volumes.length)
    runs.push({
      key: "storage",
      label: "Storage",
      value: `${stack.volumes.length} volume${stack.volumes.length === 1 ? "" : "s"}`,
      note: facts.storage?.hostDisk
        ? `Disk ${facts.storage.hostDisk.usedGb} of ${facts.storage.hostDisk.totalGb} GB used`
        : "Sizes not measured",
      destination: "storage",
    });
  if (stack.jobs.length)
    runs.push({
      key: "jobs",
      label: "Jobs",
      value: `${stack.jobs.length} scheduled`,
      note: stack.jobs.some(
        (job) => job.lastRun && job.lastRun.outcome !== "succeeded",
      )
        ? "A recent run did not succeed"
        : "Last runs succeeded",
      tone: stack.jobs.some(
        (job) => job.lastRun && job.lastRun.outcome !== "succeeded",
      )
        ? "warn"
        : undefined,
      destination: "jobs",
    });
  runs.push({
    key: "protection",
    label: "Protection",
    value: protection
      ? protectionState === "ok"
        ? (protection.policy?.schedule ?? "Scheduled")
        : protectionSummary!.title
      : proved
        ? "Restore proved"
        : evidence
          ? "No verified proof"
          : protectable.length
            ? "Not backed up"
            : "Nothing to protect",
    note: protection
      ? protectionState === "ok"
        ? `To ${protection.destination?.provider === "r2" ? "R2" : "S3"} · restore ${protection.restoreTest ? `tested ${relativeTime(protection.restoreTest.at, now)}` : "not tested"}`
        : (protection.lastAttempt?.reason ?? "Off-host copies are incomplete")
      : cleanupPending
        ? "Temporary restore resources need cleanup. Review Backups."
        : proved
          ? `${provedAt ? `${relativeTime(provedAt, now)} · ` : ""}${proved.revisionCurrent ? "by hand" : "an earlier revision"} · nothing scheduled`
          : evidence
            ? "The last attempt did not restore this data"
            : protectable.length
              ? protectable.map((item) => item.label).join(", ")
              : stack.recorded
                ? "No database or file volume recorded"
                : "Known after the first deployment",
    tone:
      protectionState === "bad"
        ? "bad"
        : protectionState === "ok"
          ? undefined
          : evidence && !protection
            ? backupEvidenceStatus(evidence).tone === "bad"
              ? "bad"
              : "warn"
            : protectable.length || protection
              ? "warn"
              : undefined,
    destination: "backups",
  });
  runs.push({
    key: "watching",
    label: "Watching",
    value: monitoring
      ? `${monitoring.checks.length} check${monitoring.checks.length === 1 ? "" : "s"}`
      : "Not watched",
    note: monitoring
      ? failingChecks.length
        ? `${failingChecks.length} failing`
        : "All passing"
      : "Verified once, at deployment",
    tone: failingChecks.length ? "bad" : undefined,
    destination: "monitoring",
  });

  const freshness: {
    fact: string;
    at?: string | null;
    detail: string;
    destination: ApplicationSection;
  }[] = [
    {
      fact: "Application responds and behaves",
      at: verifiedAt,
      detail:
        configuration?.httpAccess === "controller"
          ? "HTTP checks from the controller’s network · not continuous"
          : "Public HTTP checks at deployment · not continuous",
      destination: "deployment",
    },
    ...(monitoring
      ? [
          {
            fact: "Host observation",
            at: lastObservation,
            detail: watching
              ? "Collector running on the host"
              : monitoring.collector.detail,
            destination: "monitoring" as const,
          },
        ]
      : []),
    {
      fact: "Host logs snapshot",
      at: facts.logs?.snapshot?.at ?? deployment?.logsCollectedAt,
      detail: facts.logs
        ? `Collected on request · ${facts.logs.retention} on the host`
        : "Collected on request · no live stream",
      destination: "logs",
    },
    {
      fact: "Database storage",
      at: facts.database?.measuredAt,
      detail: facts.database
        ? `${facts.database.sizeGb.toFixed(1)} GB measured on the host`
        : postgres || stack.databases.length
          ? "Not measured"
          : "No database recorded",
      destination: "database",
    },
    {
      fact: "Off-host backup",
      at:
        protection?.coverage.find((item) => item.lastSuccessfulAt)
          ?.lastSuccessfulAt ??
        proved?.capturedAt ??
        proved?.uploadedAt,
      detail: protection?.lastAttempt
        ? protection.lastAttempt.outcome === "succeeded"
          ? `${protection.lastAttempt.size ?? "Copy"} in ${protection.destination?.provider === "r2" ? "R2" : "S3"}`
          : `Last attempt ${protection.lastAttempt.outcome}`
        : proved
          ? "Copied to R2 during a proof · nothing scheduled since"
          : "No backup recorded",
      destination: "backups",
    },
    {
      fact: "Restore test",
      at: protection?.restoreTest?.at ?? provedAt,
      detail:
        protection?.restoreTest?.verified ??
        (proved
          ? `Restored in isolation and checked${proved.revisionCurrent ? "" : ", for an earlier revision"}`
          : "Not tested"),
      destination: "backups",
    },
  ];
  const known = freshness.filter((row) => row.at).length;
  const fresh = freshness.filter(
    (row) => row.at && !isStale(row.at, now),
  ).length;
  return (
    <div className="sg-overview">
      <section className={`sg-hero sg-hero-${conditionTone}`}>
        <span className="sg-hero-dot" aria-hidden="true" />
        <div className="sg-hero-text">
          <h2>{headline}</h2>
          <p>{detail}</p>
        </div>
        {verifiedAt && stale && !monitoring && (
          <button
            type="button"
            className="sg-secondary-button sg-hero-action"
            onClick={() =>
              onAsk(
                deployment?.chatId ?? null,
                "What was verified at the last deployment check, and how can I confirm the application is still healthy?",
              )
            }
          >
            Ask about the last verification
          </button>
        )}
      </section>
      {(issues.length > 0 || attention.length > 0) && (
        <section className="sg-band" aria-label="Needs you">
          <h2>Needs you</h2>
          {issues.length > 0 && (
            <div className="sg-issues sg-issues-overview">
              {issues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  now={now}
                  chats={view.chats}
                  onOpenConversation={onOpenConversation}
                  onAction={onAction}
                  busy={busy}
                />
              ))}
            </div>
          )}
          {attention.length > 0 && (
            <ul className="sg-attention">
              {attention.map((operation) => (
                <li key={operation.id} className={operation.state}>
                  <div className="sg-attention-head">
                    <StateChip
                      state={operation.state}
                      detail={stepDetail(operation)}
                    />
                    <strong>{operation.title}</strong>
                  </div>
                  <p>
                    {operation.state === "failed"
                      ? (operation.next ?? operation.summary)
                      : (operation.approval?.note ?? operation.summary)}
                  </p>
                  <div className="sg-op-links">
                    {operation.origin ? (
                      <button
                        type="button"
                        className="sg-op-link"
                        onClick={() =>
                          onOpenConversation(
                            operation.origin!.chatId,
                            operation.origin!.messageId,
                          )
                        }
                      >
                        {operation.state === "proposed"
                          ? "Review and approve"
                          : "Open the conversation"}{" "}
                        <ArrowRight aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="sg-op-link"
                        onClick={() =>
                          onAsk(
                            null,
                            `Investigate “${operation.title}”: what happened and what should I do next?`,
                          )
                        }
                      >
                        Investigate <ArrowRight aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="sg-op-link"
                      onClick={() =>
                        onOpenDestination(operation.destinations[0])
                      }
                    >
                      Open {labelOf(operation.destinations[0])}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="sg-band" aria-label="What is running">
        <div className="sg-band-head">
          <h2>What is running</h2>
          {stack.recorded && absent.length > 0 && (
            <span className="sg-visual-caption">
              No {absent.join(", ")} recorded.{" "}
              {onRevealStack && (
                <button
                  type="button"
                  className="sg-op-text-link"
                  onClick={onRevealStack}
                >
                  Show what else it could run
                </button>
              )}
            </span>
          )}
        </div>
        <div className="sg-runlist">
          {runs.map((run) => (
            <RunEntry key={run.key} run={run} onOpen={onOpenDestination} />
          ))}
        </div>
      </section>
      <section className="sg-band" aria-label="Recent changes">
        <div className="sg-band-head">
          <h2>Recent changes</h2>
          <button
            type="button"
            className="sg-op-link"
            onClick={() => onOpenDestination("history")}
          >
            All history <ArrowRight />
          </button>
        </div>
        {changes.length ? (
          <ol className="sg-changes">
            {changes.map((operation) => (
              <li key={operation.id}>
                <StateChip
                  state={operation.state}
                  detail={stepDetail(operation)}
                />
                <div>
                  <strong>{operation.title}</strong>
                  <span className="sg-change-meta">
                    {operation.origin ? (
                      <>
                        from{" "}
                        <button
                          type="button"
                          className="sg-op-text-link"
                          onClick={() =>
                            onOpenConversation(
                              operation.origin!.chatId,
                              operation.origin!.messageId,
                            )
                          }
                        >
                          {chatTitle(operation.origin.chatId)}
                        </button>
                      </>
                    ) : ["check", "backup", "job", "release", "issue"].includes(
                        operation.source.type,
                      ) ? (
                      "automatic"
                    ) : operation.source.type === "logs" ? (
                      "Log collection"
                    ) : (
                      `from the ${labelOf(operation.destinations[0])} view`
                    )}{" "}
                    · {relativeTime(operation.updatedAt, now)} ·{" "}
                    {labelOf(operation.destinations[0])}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="sg-overview-empty">
            No operations recorded yet. Ask Server Guy to deploy the
            application, or open Deployment.
          </p>
        )}
      </section>
      <section className="sg-band sg-fresh" aria-label="Evidence freshness">
        <div className="sg-band-head">
          <h2>Evidence</h2>
          <span className="sg-visual-caption">
            {fresh} of {freshness.length} checked in the last 24 hours
            {freshness.length - known
              ? ` · ${freshness.length - known} never checked`
              : ""}
          </span>
        </div>
        <ul className="sg-fresh-list">
          {freshness.map((row) => {
            const tone = !row.at
              ? "never"
              : isStale(row.at, now)
                ? "stale"
                : "fresh";
            return (
              <li key={row.fact} className={tone}>
                <i
                  className={`sg-dot ${
                    tone === "fresh"
                      ? "sg-fill-ok"
                      : tone === "stale"
                        ? "sg-fill-warn"
                        : "sg-fill-muted"
                  }`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="sg-op-text-link"
                  onClick={() => onOpenDestination(row.destination)}
                >
                  {row.fact}
                </button>
                <span>
                  {row.at ? (
                    <>
                      <LocalTime value={row.at} variant="compact" />
                      <span className="sg-op-muted">
                        {" "}
                        · {relativeTime(row.at, now)}
                      </span>
                    </>
                  ) : (
                    "Not recorded"
                  )}
                </span>
                <small className="sg-evidence-detail">{row.detail}</small>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="sg-section-note">
        {monitoring
          ? "Freshness is measured against the host collector; a stale collector is shown as stale, never as healthy."
          : evidence
            ? "Setup checks and the preparation record live with Deployment. The backup rows come from restore proofs an operator ran by hand; scheduled backups, database measurements and continuous monitoring are not implemented yet."
            : "Setup checks and the preparation record live with Deployment. Database measurements, backups and continuous monitoring are not implemented yet; their rows stay honest until real evidence exists."}
      </p>
    </div>
  );
}
