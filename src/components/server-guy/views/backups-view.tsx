"use client";

import { ArrowRight } from "@phosphor-icons/react";

import { persistentState } from "@/server/application-stack";

import { protectionStatus } from "../fact-status";
import { LocalTime } from "../local-time";
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
  type ViewProps,
} from "./bits";
import { Tally, Timeline, type Tone } from "./visuals";

const coverageTone = {
  protected: "ok",
  behind: "warn",
  failed: "bad",
  unprotected: "warn",
  "not-covered": "muted",
} as const;
const coverageWord = {
  protected: "Protected",
  behind: "Behind policy",
  failed: "Last attempt failed",
  unprotected: "Not backed up",
  "not-covered": "Not covered",
} as const;
const historyTone: Record<string, Tone> = {
  succeeded: "ok",
  partial: "warn",
  failed: "bad",
};

/**
 * Protection is a set of facts, never an inference: destination, policy,
 * what each kind of state is protected with, the last attempt, the last
 * isolated restore and the history. Without facts the view lists what would
 * need protection and says nothing is backed up.
 */
export function BackupsView(props: ViewProps) {
  const { stack, facts, now, operations, onOpenConversation, chats } = props;
  const protection = facts.protection;
  const needed = persistentState(stack);
  const backupsLinkless = needed.length === 0;
  if (!protection)
    return (
      <>
        <Condition
          tone={needed.length ? "warn" : "muted"}
          title={
            needed.length
              ? needed.length === 1
                ? `${needed[0].label} is not backed up`
                : "Your data is not backed up"
              : stack.recorded
                ? "Nothing persistent recorded to protect"
                : "No protection plan configured"
          }
        >
          {backupsLinkless && stack.recorded
            ? "This application records no database or file volume. Protection becomes relevant when it keeps state on its instance."
            : "A persistent volume survives container replacement. It does not protect against losing the host."}
        </Condition>
        {needed.length > 0 && (
          <div className="sg-band">
            <SubHeading>What needs protection</SubHeading>
            <div className="sg-coverage">
              {needed.map((item) => (
                <div className="sg-coverage-row sg-row-warn" key={item.key}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>
                      {item.detail} · would be copied as {item.method}
                    </small>
                  </div>
                  <Pill tone="warn">Not backed up</Pill>
                  <span className="sg-op-muted">No copy exists</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="sg-band">
          <SubHeading>Protection setup</SubHeading>
          <Facts
            rows={[
              ["Backup destination", "Not connected"],
              ["Schedule", "Not configured"],
              ["Last successful backup", "No backup recorded"],
              ["Restore verification", "Not tested"],
            ]}
          />
        </div>
        <Planned title="Connect storage. Let Server Guy handle the rest.">
          The planned flow recommends Cloudflare R2 or AWS S3, asks for scoped
          access, configures a schedule and retention per kind of state, and
          verifies an isolated restore. Backup execution is not available yet.
        </Planned>
      </>
    );
  const status = protectionStatus(protection);
  const failed = status.tone === "bad";
  const last = protection.history.find(
    (item) => item.kind === "backup" && item.outcome === "succeeded",
  );
  const destination = protection.destination;
  const policyOperation = operations.find(
    (operation) => operation.id === protection.policy?.operationId,
  );
  const recoveryPoints = protection.history.filter(
    (item) => item.kind === "backup" || item.kind === "restore-test",
  );
  const oldest = recoveryPoints.at(-1);
  const counted = {
    protected: protection.coverage.filter((item) => item.state === "protected")
      .length,
    behind: protection.coverage.filter(
      (item) => item.state === "behind" || item.state === "unprotected",
    ).length,
    failed: protection.coverage.filter((item) => item.state === "failed")
      .length,
    uncovered: protection.coverage.filter(
      (item) => item.state === "not-covered",
    ).length,
  };
  return (
    <>
      <Condition
        tone={status.tone}
        title={status.title}
        aside={
          props.onAction && (
            <div className="sg-op-links">
              <LinkButton
                disabled={props.busy === "run-backup"}
                onClick={() => props.onAction?.({ type: "run-backup" })}
              >
                Back up now
              </LinkButton>
              <LinkButton
                disabled={props.busy === "test-restore"}
                onClick={() => props.onAction?.({ type: "test-restore" })}
              >
                Test a restore
              </LinkButton>
            </div>
          )
        }
      >
        {last
          ? `Last good recovery point ${relativeTime(last.at, now)}`
          : "No successful backup yet"}
        {protection.restoreTest
          ? ` · restore tested ${relativeTime(protection.restoreTest.at, now)}`
          : " · restore not tested"}
        {failed && protection.lastAttempt?.reason
          ? ` · ${protection.lastAttempt.reason}`
          : ""}
      </Condition>
      {oldest && (
        <section className="sg-band" aria-label="Recovery points">
          <div className="sg-band-head">
            <h2>Recovery points</h2>
            {protection.policy && (
              <span className="sg-visual-caption">
                {protection.policy.schedule} {protection.policy.timezone} · kept{" "}
                {protection.policy.retention}
              </span>
            )}
          </div>
          <Timeline
            points={recoveryPoints.map((item) => ({
              id: item.id,
              at: item.at,
              tone:
                item.kind === "restore-test"
                  ? "working"
                  : (historyTone[item.outcome] ?? "muted"),
              label: item.kind === "restore-test" ? "Restore test" : "Backup",
              detail: item.detail,
            }))}
            from={Date.parse(oldest.at)}
            to={now}
            startLabel={<LocalTime value={oldest.at} variant="compact" />}
            endLabel="now"
            caption="Each mark is a recorded attempt: green succeeded, amber partial, red failed, blue a verified restore. A gap is a period with no recoverable copy."
          />
        </section>
      )}
      <section className="sg-band" aria-label="Coverage">
        <SubHeading>Coverage</SubHeading>
        <Tally
          label="Protection coverage"
          items={[
            { label: "failed", count: counted.failed, tone: "bad" },
            { label: "not protected", count: counted.behind, tone: "warn" },
            { label: "not covered", count: counted.uncovered, tone: "muted" },
            { label: "protected", count: counted.protected, tone: "ok" },
          ]}
        />
        <div className="sg-coverage">
          {protection.coverage.map((item) => (
            <div
              className={`sg-coverage-row${item.state === "failed" ? " sg-row-bad" : item.state === "behind" || item.state === "unprotected" ? " sg-row-warn" : ""}`}
              key={item.key}
            >
              <div>
                <strong>{item.label}</strong>
                <small>{item.method}</small>
              </div>
              <Pill tone={coverageTone[item.state]}>
                {coverageWord[item.state]}
              </Pill>
              <span>
                {item.lastSuccessfulAt ? (
                  <>
                    <When at={item.lastSuccessfulAt} now={now} />
                    {item.size ? ` · ${item.size}` : ""}
                  </>
                ) : (
                  <span className="sg-op-muted">No copy yet</span>
                )}
                {item.note && <small>{item.note}</small>}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="sg-band" aria-label="Destination and policy">
        <SubHeading>Destination and proof</SubHeading>
        <Facts
          rows={[
            [
              "Destination",
              destination ? (
                <>
                  {destination.provider === "r2" ? "Cloudflare R2" : "AWS S3"} ·{" "}
                  <code>{destination.bucket}</code> · {destination.region}
                  <small className="sg-fact-note">
                    {destination.access} · connected{" "}
                    <When at={destination.connectedAt} now={now} />
                  </small>
                </>
              ) : (
                "Not connected"
              ),
            ],
            [
              "Policy",
              protection.policy ? (
                <>
                  {protection.policy.schedule} {protection.policy.timezone} ·
                  kept {protection.policy.retention}
                  {policyOperation?.origin && (
                    <small className="sg-fact-note">
                      Set in{" "}
                      <TextLink
                        onClick={() =>
                          onOpenConversation(
                            policyOperation.origin!.chatId,
                            policyOperation.origin!.messageId,
                          )
                        }
                      >
                        {chats.find(
                          (chat) => chat.id === policyOperation.origin?.chatId,
                        )?.title ?? "a conversation"}
                      </TextLink>
                    </small>
                  )}
                </>
              ) : (
                "Not configured"
              ),
            ],
            [
              "Last attempt",
              protection.lastAttempt ? (
                <>
                  <When at={protection.lastAttempt.at} now={now} /> ·{" "}
                  {protection.lastAttempt.outcome === "succeeded" ? (
                    <Pill tone="ok">Succeeded</Pill>
                  ) : protection.lastAttempt.outcome === "partial" ? (
                    <Pill tone="warn">Partial</Pill>
                  ) : (
                    <Pill tone="bad">Failed</Pill>
                  )}
                  {protection.lastAttempt.reason && (
                    <small className="sg-fact-note">
                      {protection.lastAttempt.reason}
                    </small>
                  )}
                </>
              ) : (
                "None"
              ),
            ],
            [
              "Restore test",
              protection.restoreTest ? (
                <>
                  <When at={protection.restoreTest.at} now={now} /> ·{" "}
                  {protection.restoreTest.verified}
                  <small className="sg-fact-note">
                    Isolated restore of the recovery point from{" "}
                    <When
                      at={protection.restoreTest.recoveryPointAt}
                      now={now}
                    />
                    . The running data was not touched.
                  </small>
                </>
              ) : (
                <span className="sg-outcome-warn">
                  Not tested · a backup is not proven until a restore is
                </span>
              ),
            ],
          ]}
        />
      </section>
      <section className="sg-band" aria-label="History">
        <SubHeading>History</SubHeading>
        <ol className="sg-history">
          {protection.history.slice(0, 8).map((item) => (
            <li key={item.id}>
              <Pill
                tone={
                  item.outcome === "succeeded"
                    ? "ok"
                    : item.outcome === "partial"
                      ? "warn"
                      : "bad"
                }
              >
                {item.kind === "backup"
                  ? "Backup"
                  : item.kind === "restore-test"
                    ? "Restore test"
                    : item.kind === "upload"
                      ? "Upload"
                      : "Policy"}
              </Pill>
              <span>
                {item.detail}
                <small>
                  <When at={item.at} now={now} />
                </small>
              </span>
              {item.operationId &&
                (() => {
                  const operation = operations.find(
                    (candidate) => candidate.id === item.operationId,
                  );
                  return operation?.origin ? (
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
                  ) : null;
                })()}
            </li>
          ))}
        </ol>
      </section>
      <p className="sg-section-note">
        Creation, off-host transfer and verification are recorded separately. A
        local dump with a failed upload never counts as protection.
      </p>
    </>
  );
}
