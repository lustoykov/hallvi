"use client";

import { ArrowRight } from "@phosphor-icons/react";

import type { ApplicationOperation } from "@/server/operation-record";
import {
  persistentState,
  type ApplicationStack,
} from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { OperatorView } from "@/server/types";

import type { ApplicationSection } from "./application-sections";
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

/**
 * Overview answers four questions in order: what is running, what needs you,
 * what changed, and how fresh the evidence is. Only recorded facts appear;
 * nothing here claims continuous monitoring.
 */
export function ApplicationOverview({
  view,
  deployment,
  stack,
  operations,
  now,
  onOpenDestination,
  onOpenConversation,
  onAsk,
  onRevealStack,
}: {
  view: OperatorView;
  deployment: DeploymentRecord | null;
  stack: ApplicationStack;
  operations: ApplicationOperation[];
  now: number;
  onOpenDestination: (destination: ApplicationSection) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  /** Drafts a message in the conversation that started the deployment. */
  onAsk: (chatId: string | null, draft: string) => void;
  /** Shows the hidden stack destinations in navigation. */
  onRevealStack?: () => void;
}) {
  const application = view.application;
  if (!application) return null;
  const chatTitle = (id: string) =>
    view.chats.find((chat) => chat.id === id)?.title ?? "another conversation";
  // A later failure never erases the last verified state: the record keeps
  // its verification, address and revision until a new one replaces them.
  const live = deployment?.status === "live";
  const verifiedAt = deployment?.verifiedAt ?? null;
  const stale = isStale(verifiedAt, now);
  const attention = attentionItems(operations);
  const changes = recentOperations(operations).slice(0, 6);
  const postgres = stack.databases.find((item) => item.kind === "postgres");
  const protectable = persistentState(stack);
  const workers = stack.processes.filter((item) => item.role === "worker");
  const absent = [
    ...(stack.services.length || stack.queues.length ? [] : ["cache or queue"]),
    ...(workers.length ? [] : ["workers"]),
    ...(stack.jobs.length ? [] : ["scheduled jobs"]),
  ];
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
    {
      fact: "Host logs snapshot",
      at: deployment?.logsCollectedAt,
      detail: "Collected on request · no live stream",
      destination: "logs",
    },
    {
      fact: "Database storage",
      detail: postgres ? "Not measured" : "No database recorded",
      destination: "database",
    },
    {
      fact: "Off-host backup",
      detail: "No backup recorded",
      destination: "backups",
    },
    {
      fact: "Restore test",
      detail: "Not tested",
      destination: "backups",
    },
  ];
  return (
    <div className="sg-overview">
      <div className="sg-overview-condition">
        <span className={`sg-status-dot${live && !stale ? " live" : ""}`} />
        <div>
          <h2>{application.name}</h2>
          <p>
            {verifiedAt
              ? stale
                ? `Last verified ${relativeTime(verifiedAt, now)} · not checked since`
                : live
                  ? `Running · verified ${relativeTime(verifiedAt, now)} · HTTP`
                  : `Last verified ${relativeTime(verifiedAt, now)} · later work failed`
              : "Deployment not verified"}
            <span className="sg-op-muted"> · no continuous monitoring yet</span>
          </p>
        </div>
        {verifiedAt && stale && (
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
          ) : (
            <p className="sg-overview-empty">Nothing needs you right now.</p>
          )}
        </section>
        <section className="sg-overview-block" aria-label="Running">
          <h3>Running</h3>
          <dl className="sg-overview-facts">
            <div>
              <dt>Application</dt>
              <dd>
                {verifiedAt && deployment?.revision ? (
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
                </dd>
              </div>
            )}
            {stack.databases.map((database) => (
              <div key={database.name}>
                <dt>Database</dt>
                <dd>
                  {database.kind === "postgres"
                    ? `PostgreSQL ${database.version} · ${verifiedAt ? "persistent volume" : "planned with the application"} · storage not measured`
                    : `Embedded SQLite · ${database.location}`}
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
                    (job) =>
                      job.lastRun?.outcome !== "succeeded" && job.lastRun,
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
                  · not measured
                </dd>
              </div>
            )}
            <div>
              <dt>Protection</dt>
              <dd
                className={
                  protectable.length ? "sg-protection-warn" : undefined
                }
              >
                {protectable.length
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
        Setup checks and the preparation record live with Deployment. Database
        measurements, backups and continuous monitoring are not implemented yet;
        their rows stay honest until real evidence exists.
      </p>
    </div>
  );
}
