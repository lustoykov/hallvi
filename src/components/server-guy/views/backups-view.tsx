"use client";

import { ArrowRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { persistentState } from "@/server/application-stack";

import {
  backupEvidenceStatus,
  lastVerifiedProof,
  latestProof,
  protectionStatus,
} from "../fact-status";
import { LocalTime } from "../local-time";
import { relativeTime } from "../operation-model";
import { BackupEvidencePanel } from "./backup-evidence";
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
  unknown: "muted",
  protected: "ok",
  behind: "warn",
  failed: "bad",
  unprotected: "warn",
  "not-covered": "muted",
} as const;
const coverageWord = {
  unknown: "Unknown",
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
const attemptTone = {
  succeeded: "ok",
  partial: "warn",
  failed: "bad",
} as const;
const attemptWord = {
  succeeded: "Succeeded",
  partial: "Partial",
  failed: "Failed",
} as const;
const historyWord = {
  backup: "Backup",
  "restore-test": "Restore test",
  upload: "Upload",
  policy: "Policy",
} as const;

/** How long until a moment ahead; `relativeTime` only counts backwards. */
function timeUntil(at: string, now: number) {
  const minutes = Math.round((Date.parse(at) - now) / 60_000);
  if (minutes < 1) return null;
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

/**
 * Protection is a set of facts, never an inference: destination, policy,
 * what each kind of state is protected with, the last attempt, the last
 * isolated restore and the history. Without facts the view lists what would
 * need protection and says nothing is backed up.
 */
export function BackupsView(props: ViewProps) {
  const { stack, facts, now, operations, onOpenConversation, chats } = props;
  const protection = facts.protection;
  const evidence = facts.backupEvidence;
  const needed = persistentState(stack);
  const backupsLinkless = needed.length === 0;
  if (!protection) {
    // A recorded proof means a copy was made and restored at least once. The
    // page may not say no copy exists, and it may not say anything is running
    // on its own either: an operator started every one of these by hand.
    const proved = evidence ? lastVerifiedProof(evidence) : null;
    const latest = evidence ? latestProof(evidence) : null;
    const status = evidence
      ? backupEvidenceStatus(evidence)
      : {
          tone: needed.length ? ("warn" as const) : ("muted" as const),
          title: needed.length
            ? needed.length === 1
              ? `${needed[0].label} is not backed up`
              : "Your data is not backed up"
            : stack.recorded
              ? "Nothing persistent recorded to protect"
              : "No protection plan configured",
        };
    return (
      <>
        <Condition tone={status.tone} title={status.title}>
          {proved ? (
            <>
              An operator restored this application’s data from an off-host copy
              and checked it.{" "}
              {proved.finishedAt ? (
                <>
                  Proved <When at={proved.finishedAt} now={now} />.{" "}
                </>
              ) : (
                ""
              )}
              Automatic backups are not configured.
              {proved.revisionCurrent
                ? ""
                : " That proof ran against an earlier revision than the one deployed now."}
              {latest && latest.outcome !== "verified"
                ? " A later attempt has no verified restore result."
                : ""}
            </>
          ) : latest ? (
            "No completed restore is recorded. See the attempts below for the available evidence."
          ) : backupsLinkless && stack.recorded ? (
            "This application records no database or file volume. Protection becomes relevant when it keeps state on its instance."
          ) : (
            "A persistent volume survives container replacement. It does not protect against losing the host."
          )}
        </Condition>
        {facts.backupSetup ? (
          <section className="sg-band" aria-label="Set up automatic backups">
            <SubHeading>Make the next copy automatic</SubHeading>
            <Facts
              wide
              rows={[
                [
                  "Schedule",
                  <>
                    Daily at 03:00 Europe/Sofia
                    <small className="sg-fact-note">
                      The host runs the timer itself, so copies keep being taken
                      while Server Guy is offline.
                    </small>
                  </>,
                ],
                [
                  "Kept",
                  <>
                    The latest 7 successful copies, in private off-host storage
                    <small className="sg-fact-note">
                      Existing manual proof archives are left untouched.
                    </small>
                  </>,
                ],
                [
                  "While it runs",
                  "SQLite and file copies pause the application briefly; PostgreSQL stays online.",
                ],
              ]}
            />
            {facts.backupSetup.connected && props.onAction ? (
              <div className="sg-op-links">
                <button
                  type="button"
                  className="sg-primary-button"
                  disabled={Boolean(props.busy)}
                  onClick={() =>
                    props.onAction?.({ type: "configure-backups" })
                  }
                >
                  {props.busy === "configure-backups"
                    ? "Configuring…"
                    : "Enable daily backups"}
                </button>
              </div>
            ) : (
              <p className="sg-section-note">
                Connect scoped R2 or S3 storage access with Server Guy before
                enabling this schedule.
              </p>
            )}
          </section>
        ) : (
          <Planned title="Protection for this stack">
            Automatic capture is currently available for the verified
            PostgreSQL, Uptime Kuma and Grafana/Prometheus stacks. Other
            persistent state needs a supported capture and restore method before
            scheduling.
          </Planned>
        )}
        {needed.length > 0 && (
          <div className="sg-band">
            <div className="sg-band-head">
              <h2>Data to protect</h2>
              <span className="sg-visual-caption">
                {facts.backupSetup
                  ? "What that schedule would copy"
                  : proved
                    ? "Manual restore verified · newer changes need backups"
                    : "No verified restore recorded"}
              </span>
            </div>
            <Facts
              wide
              rows={needed.map((item) => [
                item.label,
                <>
                  {item.detail}
                  <small className="sg-fact-note">
                    Would be copied as a {item.method}.
                  </small>
                </>,
              ])}
            />
          </div>
        )}
        {evidence ? (
          <BackupEvidencePanel facts={evidence} now={now} />
        ) : (
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
        )}
      </>
    );
  }
  const status = protectionStatus(protection);
  const observation = protection.observation;
  const attempt = protection.lastAttempt;
  const destination = protection.destination;
  const policyOperation = operations.find(
    (operation) => operation.id === protection.policy?.operationId,
  );
  // The newest copy any kind of state actually has, with the size recorded
  // against it: one headline instead of a row-by-row hunt.
  const last =
    protection.coverage
      .flatMap((item) =>
        item.lastSuccessfulAt
          ? [{ at: item.lastSuccessfulAt, size: item.size }]
          : [],
      )
      .sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null;
  // The last attempt earns its own row when it says something the last copy
  // does not: a failure, a run under way, or a reason worth reading.
  const attemptShown = Boolean(
    attempt && (attempt.outcome !== "succeeded" || attempt.reason || !last),
  );
  const recoveryPoints = protection.history.filter(
    (item) => item.kind === "backup" || item.kind === "restore-test",
  );
  const oldest = recoveryPoints.at(-1);
  const recent = protection.history.slice(0, 8);
  const counted = {
    unknown: protection.coverage.filter((item) => item.state === "unknown")
      .length,
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
  // One sentence repeated under every row is one sentence: it belongs under
  // the list, said once.
  const notes = new Set(protection.coverage.map((item) => item.note ?? ""));
  const sharedNote =
    protection.coverage.length > 1 && notes.size === 1 ? [...notes][0] : "";
  const provedByHand = evidence ? lastVerifiedProof(evidence) : null;
  const rows: Array<[string, ReactNode]> = [
    [
      "Schedule",
      protection.policy ? (
        <>
          {protection.policy.schedule} {protection.policy.timezone}
          <small className="sg-fact-note">
            Keeps {protection.policy.retention}.
            {policyOperation?.origin && (
              <>
                {" Set in "}
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
                .
              </>
            )}
          </small>
        </>
      ) : (
        "Not configured"
      ),
    ],
  ];
  if (observation)
    rows.push([
      "Next backup",
      observation.nextAt ? (
        <>
          <LocalTime value={observation.nextAt} variant="compact" />{" "}
          <span className="sg-op-muted">
            ·{" "}
            {timeUntil(observation.nextAt, now) ??
              relativeTime(observation.nextAt, now)}
          </span>
          {!observation.timerActive && (
            <span className="sg-outcome-warn">
              {" "}
              · the host timer is not active
            </span>
          )}
        </>
      ) : (
        <span
          className={
            observation.timerActive ? "sg-op-muted" : "sg-outcome-warn"
          }
        >
          {observation.timerActive
            ? "No next run observed"
            : "The host timer is not active"}
        </span>
      ),
    ]);
  rows.push([
    "Last copy",
    last ? (
      <>
        <When at={last.at} now={now} />
        {last.size ? ` · ${last.size}` : ""}
      </>
    ) : (
      <span className="sg-op-muted">None yet</span>
    ),
  ]);
  if (attempt && attemptShown)
    rows.push([
      "Last attempt",
      <>
        <When at={attempt.at} now={now} />{" "}
        <Pill tone={attemptTone[attempt.outcome]}>
          {attemptWord[attempt.outcome]}
        </Pill>
        {attempt.reason && (
          <small className="sg-fact-note">{attempt.reason}</small>
        )}
      </>,
    ]);
  rows.push([
    "Restore tested",
    protection.restoreTest ? (
      <>
        <When at={protection.restoreTest.at} now={now} />{" "}
        <Pill tone="ok">Verified</Pill>
        <small className="sg-fact-note">
          An isolated restore of the copy taken{" "}
          <LocalTime
            value={protection.restoreTest.recoveryPointAt}
            variant="compact"
          />
          ; the running data was never touched.{" "}
          {protection.restoreTest.verified}
        </small>
      </>
    ) : (
      <span className="sg-outcome-warn">
        Not tested · a backup is not proven until a restore is
      </span>
    ),
  ]);
  rows.push([
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
  ]);
  return (
    <>
      <Condition
        tone={status.tone}
        title={status.title}
        aside={
          props.onAction && (
            <div className="sg-op-links">
              <LinkButton
                disabled={Boolean(
                  props.busy ||
                  observation?.running ||
                  observation?.cleanupPending,
                )}
                onClick={() => props.onAction?.({ type: "run-backup" })}
              >
                {props.busy === "run-backup" ? "Backing up…" : "Back up now"}
              </LinkButton>
              <LinkButton
                disabled={Boolean(
                  props.busy ||
                  observation?.running ||
                  observation?.cleanupPending ||
                  !last,
                )}
                onClick={() => props.onAction?.({ type: "test-restore" })}
              >
                {props.busy === "test-restore"
                  ? "Testing a restore…"
                  : "Test a restore"}
              </LinkButton>
            </div>
          )
        }
      >
        {last
          ? `Last copy ${relativeTime(last.at, now)}`
          : "No successful copy yet"}
        {protection.restoreTest
          ? ` · restore verified ${relativeTime(protection.restoreTest.at, now)}`
          : " · restore not tested"}
        {attempt?.reason ? ` · ${attempt.reason}` : ""}
        {observation?.cleanupPending && !observation.running
          ? " · backup cleanup is still pending"
          : ""}
      </Condition>
      <section className="sg-band" aria-label="Schedule and proof">
        <div className="sg-band-head">
          <h2>Schedule and proof</h2>
          {observation && props.onAction && (
            <TextLink
              onClick={() => props.onAction?.({ type: "refresh-backups" })}
            >
              {props.busy === "refresh-backups"
                ? "Refreshing…"
                : "Refresh status"}
            </TextLink>
          )}
        </div>
        <Facts wide rows={rows} />
        {observation && (
          <p className="sg-section-note">
            {observation.reachable ? (
              <>
                {observation.timerActive
                  ? "This schedule runs on the host, independently of Server Guy."
                  : "The host timer is stopped; no next backup is confirmed."}
                {observation.at && (
                  <>
                    {" "}
                    Last read from the host{" "}
                    <When at={observation.at} now={now} />.
                  </>
                )}
              </>
            ) : (
              <>
                Server Guy cannot read the host right now. The facts above are
                the last observation
                {observation.at && (
                  <>
                    , from{" "}
                    <LocalTime value={observation.at} variant="compact" />
                  </>
                )}
                , not confirmation that the schedule is running today. A
                configured host timer does not depend on the controller.
              </>
            )}
          </p>
        )}
      </section>
      <section className="sg-band" aria-label="Coverage">
        <SubHeading>Coverage</SubHeading>
        <Tally
          label="Protection coverage"
          items={[
            { label: "failed", count: counted.failed, tone: "bad" },
            { label: "not protected", count: counted.behind, tone: "warn" },
            { label: "not covered", count: counted.uncovered, tone: "muted" },
            { label: "unknown", count: counted.unknown, tone: "muted" },
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
                {item.note && !sharedNote && <small>{item.note}</small>}
              </span>
            </div>
          ))}
        </div>
        {sharedNote && <p className="sg-visual-caption">{sharedNote}</p>}
      </section>
      <section className="sg-band" aria-label="History">
        <div className="sg-band-head">
          <h2>History</h2>
          {protection.history.length > recent.length && (
            <span className="sg-visual-caption">
              Newest {recent.length} of {protection.history.length}
            </span>
          )}
        </div>
        {oldest && (
          <Timeline
            points={recoveryPoints.map((item) => ({
              id: item.id,
              at: item.at,
              tone:
                item.kind === "restore-test" && item.outcome === "succeeded"
                  ? "working"
                  : (historyTone[item.outcome] ?? "muted"),
              label: item.kind === "restore-test" ? "Restore test" : "Backup",
              detail: item.detail,
            }))}
            from={Date.parse(oldest.at)}
            to={now}
            startLabel={<LocalTime value={oldest.at} variant="compact" />}
            endLabel="now"
            caption="Each mark is an attempt: green is a verified transfer, amber partial, red failed, blue a verified restore. Retention may remove older copies."
          />
        )}
        <ol className="sg-history">
          {recent.map((item) => (
            <li key={item.id}>
              <Pill tone={attemptTone[item.outcome]}>
                {historyWord[item.kind]}
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
      {evidence && (
        <details className="sg-op-more sg-evidence-more">
          <summary>
            Earlier manual restore evidence
            {provedByHand?.finishedAt && (
              <>
                {" · proved "}
                <LocalTime value={provedByHand.finishedAt} variant="compact" />
              </>
            )}
          </summary>
          <BackupEvidencePanel facts={evidence} now={now} ongoingProtection />
        </details>
      )}
      <p className="sg-section-note">
        Creation, off-host transfer and verification are recorded separately. A
        local dump with a failed upload never counts as protection.
      </p>
    </>
  );
}
