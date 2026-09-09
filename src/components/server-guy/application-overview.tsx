"use client";

import { ArrowRight } from "@phosphor-icons/react";

import type { ApplicationFacts, ViewAction } from "@/server/application-facts";
import {
  persistentState,
  type ApplicationStack,
} from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { OperatorView } from "@/server/types";

import type { ApplicationSection } from "./application-sections";
import { monitoringStatus, protectionStatus } from "./fact-status";
import { LocalTime } from "./local-time";
import {
  attentionItems,
  isStale,
  labelOf,
  recentOperations,
  relativeTime,
  stepDetail,
} from "./operation-model";
import { DestinationLinks, StateChip } from "./operation-receipt";
import { IssueCard } from "./views/monitoring-view";

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
  // A later failure never erases the last verified state: the record keeps
  // its verification, address and revision until a new one replaces them.
  const live =
    deployment?.status === "live" || Boolean(facts.releases?.serving);
  const verifiedAt =
    facts.releases?.serving?.verifiedAt ?? deployment?.verifiedAt ?? null;
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
  const workers = stack.processes.filter((item) => item.role === "worker");
  const absent = [
    ...(stack.services.length || stack.queues.length ? [] : ["cache or queue"]),
    ...(workers.length ? [] : ["workers"]),
    ...(stack.jobs.length ? [] : ["scheduled jobs"]),
  ];
  const monitoringSummary = monitoring
    ? monitoringStatus(monitoring, now)
    : null;
  const condition = monitoringSummary
    ? `${monitoringSummary.title}${lastObservation ? ` · last observed ${relativeTime(lastObservation, now)}` : ""}`
    : verifiedAt
      ? stale
        ? `Last verified ${relativeTime(verifiedAt, now)} · not checked since`
        : live
          ? `Running · verified ${relativeTime(verifiedAt, now)} · HTTP`
          : `Last verified ${relativeTime(verifiedAt, now)} · later work failed`
      : "Deployment not verified";
  const dotLive = monitoringSummary
    ? monitoringSummary.tone === "ok"
    : live && !stale;
  const freshness: {
    fact: string;
    at?: string | null;
    detail: string;
    destination: ApplicationSection;
  }[] = [
    {
      fact: "Application responds and behaves",
      at: verifiedAt,
      detail: "Public HTTP checks at deployment · not continuous",
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
      at: protection?.coverage.find((item) => item.lastSuccessfulAt)
        ?.lastSuccessfulAt,
      detail: protection?.lastAttempt
        ? protection.lastAttempt.outcome === "succeeded"
          ? `${protection.lastAttempt.size ?? "Copy"} in ${protection.destination?.provider === "r2" ? "R2" : "S3"}`
          : `Last attempt ${protection.lastAttempt.outcome}`
        : "No backup recorded",
      destination: "backups",
    },
    {
      fact: "Restore test",
      at: protection?.restoreTest?.at,
      detail: protection?.restoreTest?.verified ?? "Not tested",
      destination: "backups",
    },
  ];
  return (
    <div className="sg-overview">
      <div className="sg-overview-condition">
        <span className={`sg-status-dot${dotLive ? " live" : ""}`} />
        <div>
          <h2>{application.name}</h2>
          <p>
            {condition}
            {!monitoring && (
              <span className="sg-op-muted">
                {" "}
                · no continuous monitoring yet
              </span>
            )}
          </p>
        </div>
        {verifiedAt && stale && !monitoring && (
          <button
            type="button"
            className="sg-secondary-button sg-overview-ask"
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
      </div>
      <div className="sg-overview-grid">
        <section className="sg-overview-block" aria-label="Needs you">
          <h3>Needs you</h3>
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
          {attention.length ? (
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
          ) : issues.length ? null : (
            <p className="sg-overview-empty">Nothing needs you right now.</p>
          )}
        </section>
        <section className="sg-overview-block" aria-label="Running">
          <h3>Running</h3>
          <dl className="sg-overview-facts">
            <div>
              <dt>Application</dt>
              <dd>
                {facts.releases?.serving ? (
                  <>
                    Revision{" "}
                    <code>{facts.releases.serving.revision.slice(0, 12)}</code>{" "}
                    · {facts.releases.serving.message}
                  </>
                ) : verifiedAt && deployment?.revision ? (
                  <>
                    Revision <code>{deployment.revision.slice(0, 12)}</code> ·
                    port 80 → {deployment.plan?.port}
                  </>
                ) : deployment?.revision ? (
                  <>
                    Revision <code>{deployment.revision.slice(0, 12)}</code> ·
                    not deployed yet
                  </>
                ) : (
                  "Not deployed"
                )}
              </dd>
            </div>
            <div>
              <dt>Host</dt>
              <dd>
                {deployment?.address
                  ? `${deployment.offer?.serverType.toUpperCase() ?? "Hetzner"} · ${deployment.address}${deployment.offer ? ` · ${deployment.offer.location}` : ""}`
                  : "No host recorded"}
              </dd>
            </div>
            {facts.domains?.domain && (
              <div>
                <dt>Address</dt>
                <dd>
                  <button
                    type="button"
                    className="sg-op-text-link"
                    onClick={() => onOpenDestination("domains")}
                  >
                    {facts.domains.tls.state === "valid"
                      ? "https://"
                      : "http://"}
                    {facts.domains.domain.name}
                  </button>
                  {facts.domains.domain.state !== "resolving"
                    ? " · not resolving here yet"
                    : facts.domains.tls.state === "valid"
                      ? " · certificate valid"
                      : " · HTTPS pending"}
                </dd>
              </div>
            )}
            {stack.recorded && (
              <div>
                <dt>Processes</dt>
                <dd>
                  <button
                    type="button"
                    className="sg-op-text-link"
                    onClick={() => onOpenDestination("processes")}
                  >
                    {stack.processes.length - workers.length} web
                    {workers.length
                      ? ` · ${workers.length} worker${workers.length === 1 ? "" : "s"}`
                      : ""}
                  </button>
                  {failingChecks.some((check) => check.kind === "process")
                    ? " · one is unhealthy"
                    : ""}
                </dd>
              </div>
            )}
            {stack.databases.map((database) => (
              <div key={database.name}>
                <dt>Database</dt>
                <dd>
                  {database.kind === "postgres"
                    ? `PostgreSQL ${database.version} · ${verifiedAt ? "persistent volume" : "planned with the application"}`
                    : `Embedded SQLite · ${database.location}`}
                  {facts.database
                    ? ` · ${facts.database.sizeGb < 1 ? `${Math.round(facts.database.sizeGb * 1024)} MB` : `${facts.database.sizeGb.toFixed(1)} GB`}`
                    : " · storage not measured"}
                </dd>
              </div>
            ))}
            {!stack.databases.length && (
              <div>
                <dt>Database</dt>
                <dd>No database recorded</dd>
              </div>
            )}
            {stack.services.map((service) => (
              <div key={service.name}>
                <dt>Cache & queue</dt>
                <dd>
                  {service.kind === "valkey" ? "Valkey" : "Redis"}
                  {service.version ? ` ${service.version}` : ""} ·{" "}
                  {service.role}
                  {stack.queues.length
                    ? ` · ${stack.queues.map((queue) => queue.library).join(", ")}`
                    : ""}
                </dd>
              </div>
            ))}
            {stack.jobs.length > 0 && (
              <div>
                <dt>Jobs</dt>
                <dd>
                  <button
                    type="button"
                    className="sg-op-text-link"
                    onClick={() => onOpenDestination("jobs")}
                  >
                    {stack.jobs.length} scheduled command
                    {stack.jobs.length === 1 ? "" : "s"}
                  </button>
                  {stack.jobs.some(
                    (job) => job.lastRun && job.lastRun.outcome !== "succeeded",
                  )
                    ? " · a recent run did not succeed"
                    : ""}
                </dd>
              </div>
            )}
            {stack.volumes.length > 0 && (
              <div>
                <dt>Storage</dt>
                <dd>
                  <button
                    type="button"
                    className="sg-op-text-link"
                    onClick={() => onOpenDestination("storage")}
                  >
                    {stack.volumes.length} persistent volume
                    {stack.volumes.length === 1 ? "" : "s"}
                  </button>{" "}
                  ·{" "}
                  {facts.storage?.hostDisk
                    ? `disk ${facts.storage.hostDisk.usedGb} of ${facts.storage.hostDisk.totalGb} GB used`
                    : "not measured"}
                </dd>
              </div>
            )}
            <div>
              <dt>Protection</dt>
              <dd
                className={
                  protectionState === "ok"
                    ? "sg-protection-ok"
                    : protectionState === "bad"
                      ? "sg-protection-bad"
                      : protectionState === "warn" || protectable.length
                        ? "sg-protection-warn"
                        : undefined
                }
              >
                {protection
                  ? protectionState === "ok"
                    ? `${protection.policy?.schedule ?? "Scheduled"} to ${protection.destination?.provider === "r2" ? "R2" : "S3"} · restore ${protection.restoreTest ? `tested ${relativeTime(protection.restoreTest.at, now)}` : "not tested"}`
                    : protectionSummary!.title
                  : protectable.length
                    ? `Not backed up · ${protectable.map((item) => item.label).join(", ")}`
                    : stack.recorded
                      ? "Nothing persistent recorded"
                      : "No database recorded"}
              </dd>
            </div>
            {stack.recorded && absent.length > 0 && (
              <div>
                <dt>Not used</dt>
                <dd className="sg-op-muted">
                  No {absent.join(", ")} recorded for this application.{" "}
                  {onRevealStack && (
                    <button
                      type="button"
                      className="sg-op-text-link"
                      onClick={onRevealStack}
                    >
                      Show what else it could run
                    </button>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>
      <section className="sg-overview-block" aria-label="Recent changes">
        <h3>Recent changes</h3>
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
                    ) : (
                      `from the ${labelOf(operation.destinations[0])} view`
                    )}{" "}
                    · {relativeTime(operation.updatedAt, now)} ·{" "}
                    <LocalTime value={operation.updatedAt} variant="compact" />
                  </span>
                </div>
                <DestinationLinks
                  destinations={operation.destinations}
                  onOpen={onOpenDestination}
                />
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
      <section
        className="sg-overview-block sg-fresh"
        aria-label="Evidence freshness"
      >
        <h3>Evidence freshness</h3>
        <table>
          <thead>
            <tr>
              <th>Fact</th>
              <th>Last checked</th>
              <th>Freshness</th>
            </tr>
          </thead>
          <tbody>
            {freshness.map((row) => {
              const tone = !row.at
                ? "never"
                : isStale(row.at, now)
                  ? "stale"
                  : "fresh";
              return (
                <tr key={row.fact}>
                  <td>
                    <button
                      type="button"
                      className="sg-op-text-link"
                      onClick={() => onOpenDestination(row.destination)}
                    >
                      {row.fact}
                    </button>
                    <small>{row.detail}</small>
                  </td>
                  <td>
                    {row.at ? (
                      <>
                        <LocalTime value={row.at} variant="compact" />{" "}
                        <span className="sg-op-muted">
                          · {relativeTime(row.at, now)}
                        </span>
                      </>
                    ) : (
                      "Never"
                    )}
                  </td>
                  <td className={tone}>
                    {tone === "never"
                      ? "No evidence"
                      : tone === "stale"
                        ? "Stale · over 24 h"
                        : "Fresh"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="sg-section-note">
        {monitoring
          ? "Freshness is measured against the host collector; a stale collector is shown as stale, never as healthy."
          : "Setup checks and the preparation record live with Deployment. Database measurements, backups and continuous monitoring are not implemented yet; their rows stay honest until real evidence exists."}
      </p>
    </div>
  );
}
