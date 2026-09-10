"use client";

import { ArrowRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import {
  Condition,
  Facts,
  LinkButton,
  Pill,
  SubHeading,
  When,
  type ViewProps,
} from "./bits";
import { relativeTime } from "../operation-model";
import { Flow, Tally, type FlowStage } from "./visuals";

/**
 * What is serving, what could be released next, and what happened before.
 * A candidate is only ever offered; nothing releases on push. The first
 * deployment's connection, request and recorded history render as children
 * from the product's own panel.
 */
export function DeploymentView(props: ViewProps & { children?: ReactNode }) {
  const { facts, now, onAction, busy, operations, onOpenConversation } = props;
  const releases = facts.releases;
  if (!releases)
    return (
      <>
        {props.children}
        <p className="sg-section-note">
          Ask in the conversation to release an update on this application’s
          existing host. You approve the scope once; Server Guy can correct
          configuration and retry within it. Rollback and automatic deployment
          on push are not implemented yet.
        </p>
      </>
    );
  const serving = releases.serving;
  const candidate = releases.candidate;
  const releasing = operations.find(
    (operation) =>
      operation.source.type === "release" &&
      (operation.state === "working" || operation.state === "proposed"),
  );
  // Source to serving, in the order a release actually happens.
  const stages: FlowStage[] = [
    {
      key: "candidate",
      label: "Newest revision",
      value: candidate
        ? candidate.revision.slice(0, 12)
        : serving
          ? serving.revision.slice(0, 12)
          : "None pushed",
      detail: candidate
        ? `${candidate.author} · pushed ${relativeTime(candidate.pushedAt, now)}`
        : "Nothing newer than what is serving",
      state: candidate ? "pending" : "ok",
    },
    {
      key: "checks",
      label: "Repository checks",
      value: candidate
        ? candidate.ci.state === "passed"
          ? "Passed"
          : candidate.ci.state === "failed"
            ? "Failed"
            : candidate.ci.state === "running"
              ? "Running"
              : "No checks"
        : "Not waiting on any",
      detail: candidate ? candidate.ci.detail : undefined,
      state: !candidate
        ? "skipped"
        : candidate.ci.state === "passed"
          ? "ok"
          : candidate.ci.state === "failed"
            ? "failed"
            : candidate.ci.state === "none"
              ? "absent"
              : "pending",
    },
    {
      key: "approval",
      label: "Your approval",
      value: releasing
        ? releasing.state === "proposed"
          ? "Waiting for you"
          : "Approved · releasing"
        : candidate
          ? "Not requested yet"
          : "Nothing to approve",
      detail: releasing
        ? "In the conversation that started it"
        : "Nothing deploys on push",
      state: releasing
        ? releasing.state === "proposed"
          ? "pending"
          : "ok"
        : candidate
          ? "absent"
          : "skipped",
    },
    {
      key: "serving",
      label: "Serving",
      value: serving ? serving.revision.slice(0, 12) : "Nothing yet",
      detail: serving
        ? serving.verifiedAt
          ? `Verified ${relativeTime(serving.verifiedAt, now)}`
          : "Deployed, not verified"
        : "No release has been verified",
      state: serving ? (serving.verifiedAt ? "ok" : "pending") : "absent",
    },
  ];
  const verified = releases.history.filter(
    (item) => item.outcome === "verified",
  ).length;
  const rolledBack = releases.history.filter(
    (item) => item.outcome === "rolled-back",
  ).length;
  const failedReleases = releases.history.filter(
    (item) => item.outcome === "failed",
  ).length;
  return (
    <>
      <Condition
        tone={serving ? (serving.verifiedAt ? "ok" : "warn") : "muted"}
        title={
          serving
            ? `Serving ${serving.revision.slice(0, 12)}`
            : "Nothing is serving yet"
        }
      >
        {serving ? (
          <>
            {serving.message} · deployed {relativeTime(serving.deployedAt, now)}
            {serving.verifiedAt
              ? ` · verified ${relativeTime(serving.verifiedAt, now)}`
              : " · not verified"}
          </>
        ) : (
          "The first deployment appears here once it is recorded."
        )}
      </Condition>
      <Flow
        stages={stages}
        caption="A candidate is offered, never released on push. Approval happens in the conversation, and a failed candidate never replaces what is serving."
      />
      <div className="sg-band">
        <SubHeading>Next release</SubHeading>
        {candidate ? (
          <div className="sg-candidate">
            <div>
              <strong>
                <code>{candidate.revision.slice(0, 12)}</code>{" "}
                {candidate.message}
              </strong>
              <small>
                {candidate.author} · pushed{" "}
                <When at={candidate.pushedAt} now={now} />
              </small>
            </div>
            <Pill
              tone={
                candidate.ci.state === "passed"
                  ? "ok"
                  : candidate.ci.state === "failed"
                    ? "bad"
                    : candidate.ci.state === "running"
                      ? "working"
                      : "muted"
              }
            >
              {candidate.ci.state === "passed"
                ? "Checks passed"
                : candidate.ci.state === "failed"
                  ? "Checks failed"
                  : candidate.ci.state === "running"
                    ? "Checks running"
                    : "No checks"}
            </Pill>
            <span className="sg-op-muted">{candidate.ci.detail}</span>
            <div className="sg-op-links">
              {releasing?.origin ? (
                <LinkButton
                  onClick={() =>
                    onOpenConversation(
                      releasing.origin!.chatId,
                      releasing.origin!.messageId,
                    )
                  }
                >
                  {releasing.state === "proposed"
                    ? "Review and approve in the conversation"
                    : "Follow the release in the conversation"}{" "}
                  <ArrowRight aria-hidden="true" />
                </LinkButton>
              ) : onAction ? (
                <LinkButton
                  disabled={
                    candidate.ci.state === "failed" ||
                    candidate.ci.state === "running" ||
                    busy === "deploy-candidate"
                  }
                  onClick={() =>
                    onAction({
                      type: "deploy-candidate",
                      revision: candidate.revision,
                    })
                  }
                >
                  Deploy this revision <ArrowRight aria-hidden="true" />
                </LinkButton>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="sg-section-note">
            No newer revision than the one serving. Server Guy watches the
            repository and offers the exact candidate; nothing deploys on push.
          </p>
        )}
      </div>
      <div className="sg-band">
        <SubHeading>Release history</SubHeading>
        <Tally
          label="Release outcomes"
          items={[
            { label: "failed", count: failedReleases, tone: "bad" },
            { label: "rolled back", count: rolledBack, tone: "warn" },
            { label: "verified", count: verified, tone: "ok" },
          ]}
        />
        <ol className="sg-history">
          {releases.history.map((item) => {
            const operation = operations.find(
              (candidateOperation) =>
                candidateOperation.id === item.operationId,
            );
            return (
              <li key={item.id}>
                <Pill
                  tone={
                    item.outcome === "verified"
                      ? "ok"
                      : item.outcome === "rolled-back"
                        ? "warn"
                        : "bad"
                  }
                >
                  {item.outcome === "verified"
                    ? "Verified"
                    : item.outcome === "rolled-back"
                      ? "Rolled back"
                      : "Failed"}
                </Pill>
                <span>
                  <code>{item.revision.slice(0, 12)}</code> · {item.note}
                  <small>
                    <When at={item.at} now={now} />
                  </small>
                </span>
                {operation?.origin && (
                  <LinkButton
                    onClick={() =>
                      onOpenConversation(
                        operation.origin!.chatId,
                        operation.origin!.messageId,
                      )
                    }
                  >
                    Open <ArrowRight aria-hidden="true" />
                  </LinkButton>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {releases.preparation && (
        <div className="sg-band">
          <SubHeading>Preparation</SubHeading>
          <Facts
            wide
            rows={[
              [
                "Dockerfile",
                releases.preparation.dockerfile === "reused"
                  ? "Reused from the repository"
                  : "Generated by Server Guy · application code unchanged",
              ],
              [
                "Compose",
                releases.preparation.compose === "reused"
                  ? "Reused from the repository"
                  : "Generated by Server Guy",
              ],
              [
                "Verification",
                `${releases.preparation.checks} public checks per release · ${releases.preparation.detail}`,
              ],
            ]}
          />
        </div>
      )}
      {props.children}
      <p className="sg-section-note">
        Releases bind the exact revision and image; a failed candidate never
        replaces what is serving. Rolling back reuses the previous image only
        when its data and migrations are compatible.
      </p>
    </>
  );
}
