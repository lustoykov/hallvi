"use client";

import { ArrowRight } from "@phosphor-icons/react";

import type { Issue } from "@/server/application-facts";

import { monitoringStatus } from "../fact-status";
import { relativeTime } from "../operation-model";
import {
  Condition,
  Facts,
  LinkButton,
  Pill,
  Planned,
  SubHeading,
  TextLink,
  When,
  verifiedText,
  type ViewProps,
} from "./bits";

function usage(used: number, total: number) {
  return Math.round((used / total) * 100);
}

/** One in-app issue: what happened, what it means, evidence and the way on. */
export function IssueCard({
  issue,
  now,
  chats,
  onOpenConversation,
  onAction,
  busy,
}: {
  issue: Issue;
  now: number;
  chats: ViewProps["chats"];
  onOpenConversation: ViewProps["onOpenConversation"];
  onAction?: ViewProps["onAction"];
  busy?: string | null;
}) {
  const conversation = chats.find((chat) => chat.id === issue.conversationId);
  return (
    <div
      className={`sg-issue sg-issue-${issue.state}${issue.unread ? " sg-issue-unread" : ""}`}
    >
      <div className="sg-issue-head">
        <Pill
          tone={
            issue.state === "recovered"
              ? "ok"
              : issue.state === "acknowledged"
                ? "warn"
                : "bad"
          }
        >
          {issue.state === "recovered"
            ? "Recovered"
            : issue.state === "acknowledged"
              ? "Acknowledged"
              : "Open"}
        </Pill>
        <strong>{issue.title}</strong>
        <span className="sg-op-rel">
          {issue.state === "recovered" && issue.recoveredAt
            ? `recovered ${relativeTime(issue.recoveredAt, now)}`
            : `detected ${relativeTime(issue.detectedAt, now)}`}
        </span>
      </div>
      <p>{issue.impact}</p>
      <p className="sg-issue-evidence">
        <span>Evidence</span>
        {issue.evidence}
      </p>
      {issue.state !== "recovered" && (
        <p className="sg-op-next">Next: {issue.next}</p>
      )}
      <div className="sg-op-links">
        {conversation ? (
          <LinkButton
            onClick={() =>
              onOpenConversation(conversation.id, issue.operationId ?? null)
            }
          >
            Open {conversation.title} <ArrowRight aria-hidden="true" />
          </LinkButton>
        ) : onAction && issue.state !== "recovered" ? (
          <LinkButton
            disabled={busy === `investigate:${issue.id}`}
            onClick={() =>
              onAction({ type: "investigate-issue", issue: issue.id })
            }
          >
            Investigate <ArrowRight aria-hidden="true" />
          </LinkButton>
        ) : null}
        {issue.state === "open" && onAction && (
          <LinkButton
            disabled={busy === `acknowledge:${issue.id}`}
            onClick={() =>
              onAction({ type: "acknowledge-issue", issue: issue.id })
            }
          >
            Acknowledge
          </LinkButton>
        )}
      </div>
    </div>
  );
}

/**
 * Monitoring says what is watched, what was observed and when, never that
 * something is healthy because nothing was heard. Issues are durable, in
 * app, deduplicated, and link to the conversation investigating them.
 */
export function MonitoringView(props: ViewProps) {
  const { stack, facts, deployment, now } = props;
  const monitoring = facts.monitoring;
  if (!monitoring)
    return (
      <>
        <Facts
          rows={[
            ["Last application verification", verifiedText(deployment)],
            ["Continuous monitoring", "Not running"],
            [
              "Watched",
              stack.recorded
                ? `${stack.processes.length} process${stack.processes.length === 1 ? "" : "es"}${stack.databases.length ? `, ${stack.databases.length} database${stack.databases.length === 1 ? "" : "s"}` : ""}${stack.jobs.length ? `, ${stack.jobs.length} scheduled job${stack.jobs.length === 1 ? "" : "s"}` : ""} · no checks configured`
                : "Nothing recorded yet",
            ],
            ["Issues", "No in-app issues recorded"],
            ["Notifications", "In-app only · no external provider"],
            ["CPU, memory and disk", "Not measured"],
          ]}
        />
        <Planned title="Know when your application needs you">
          Health, errors, job results and host resources will be collected over
          time, independently of an open dashboard. Server Guy will record
          issues here and in-app, with evidence and a next action. External
          notification providers are not selected yet.
        </Planned>
      </>
    );
  const collector = monitoring.collector;
  const status = monitoringStatus(monitoring, now);
  return (
    <>
      <Condition tone={status.tone} title={status.title}>
        {collector.detail}
        {collector.lastObservationAt
          ? ` · last observation ${relativeTime(collector.lastObservationAt, now)}`
          : ""}
        {collector.hostReachable === false ? " · host unreachable" : ""}
      </Condition>
      {monitoring.issues.length > 0 && (
        <>
          <SubHeading>Issues</SubHeading>
          <div className="sg-issues">
            {monitoring.issues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                now={now}
                chats={props.chats}
                onOpenConversation={props.onOpenConversation}
                onAction={props.onAction}
                busy={props.busy}
              />
            ))}
          </div>
        </>
      )}
      <SubHeading>Checks</SubHeading>
      <div className="sg-checks">
        <div className="sg-check-row sg-table-head">
          <span>Check</span>
          <span>Target</span>
          <span>State</span>
          <span>Last result</span>
        </div>
        {monitoring.checks.map((check) => (
          <div className="sg-check-row" key={check.id}>
            <span>
              <strong>{check.name}</strong>
              <small>{check.kind}</small>
            </span>
            <span>
              <code>{check.target}</code>
            </span>
            <span>
              <Pill
                tone={
                  check.state === "passing"
                    ? "ok"
                    : check.state === "failing"
                      ? "bad"
                      : "muted"
                }
              >
                {check.state === "passing"
                  ? "Passing"
                  : check.state === "failing"
                    ? "Failing"
                    : "Unknown"}
              </Pill>
            </span>
            <span>
              {check.lastAt ? <When at={check.lastAt} now={now} /> : "Never"}
              <small>{check.detail}</small>
            </span>
          </div>
        ))}
      </div>
      <SubHeading>Resources</SubHeading>
      {monitoring.resources ? (
        <div className="sg-resources">
          {[
            {
              label: "CPU",
              percent: monitoring.resources.cpuPercent,
              detail: `${monitoring.resources.cpuPercent}% of the instance`,
            },
            {
              label: "Memory",
              percent: usage(
                monitoring.resources.memoryUsedMb,
                monitoring.resources.memoryTotalMb,
              ),
              detail: `${(monitoring.resources.memoryUsedMb / 1024).toFixed(1)} of ${(monitoring.resources.memoryTotalMb / 1024).toFixed(0)} GB`,
            },
            {
              label: "Disk",
              percent: usage(
                monitoring.resources.diskUsedGb,
                monitoring.resources.diskTotalGb,
              ),
              detail: `${monitoring.resources.diskUsedGb} of ${monitoring.resources.diskTotalGb} GB`,
            },
          ].map((item) => (
            <div className="sg-resource" key={item.label}>
              <div className="sg-resource-head">
                <strong>{item.label}</strong>
                <span
                  className={
                    item.percent >= 90
                      ? "sg-outcome-bad"
                      : item.percent >= 75
                        ? "sg-outcome-warn"
                        : undefined
                  }
                >
                  {item.detail}
                </span>
              </div>
              <div className="sg-meter" aria-hidden="true">
                <span
                  className={
                    item.percent >= 90
                      ? "bad"
                      : item.percent >= 75
                        ? "warn"
                        : ""
                  }
                  style={{ width: `${Math.min(100, item.percent)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="sg-section-note">
            Sampled on the host{" "}
            <When at={monitoring.resources.measuredAt} now={now} />. Samples
            continue while this dashboard is closed.
          </p>
        </div>
      ) : (
        <p className="sg-section-note">Resources are not measured yet.</p>
      )}
      <SubHeading>Notifications</SubHeading>
      <Facts
        rows={[
          [
            "In app",
            `Issues stay here with unread state · ${monitoring.issues.filter((issue) => issue.unread).length} unread`,
          ],
          [
            "External",
            monitoring.providers.length
              ? monitoring.providers
                  .map((provider) => `${provider.kind} · ${provider.detail}`)
                  .join(", ")
              : "No provider connected · Server Guy cannot reach you outside the app yet",
          ],
        ]}
      />
      <p className="sg-section-note">
        Monitoring runs on the host; a stale collector is shown as stale, never
        as healthy.{" "}
        <TextLink onClick={() => props.onOpenDestination("logs")}>
          Logs
        </TextLink>{" "}
        keep the evidence behind each check.
      </p>
    </>
  );
}
