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
          This version supports the initial deployment. Routine releases,
          rollback and automatic deployment on push are not implemented yet.
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
      <SubHeading>Next release</SubHeading>
      {candidate ? (
        <div className="sg-candidate">
          <div>
            <strong>
              <code>{candidate.revision.slice(0, 12)}</code> {candidate.message}
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
      <SubHeading>Release history</SubHeading>
      <ol className="sg-history">
        {releases.history.map((item) => {
          const operation = operations.find(
            (candidateOperation) => candidateOperation.id === item.operationId,
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
      {releases.preparation && (
        <>
          <SubHeading>Preparation</SubHeading>
          <Facts
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
        </>
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
