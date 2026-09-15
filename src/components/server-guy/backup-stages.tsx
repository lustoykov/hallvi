"use client";

// Backups, as the chain it actually is.
//
// Being backed up is not one fact. It is three, in order: something is set up
// to copy this, a copy exists, and somebody has opened one. The page that
// merged any two of them is the page this review kept finding — a schedule
// reported as protection, a copy reported as a recovery.
//
// So they are three stages with three states, which makes merging them
// structurally impossible rather than a thing to be careful about. What a
// reader gets from a glance is which link is weak.
//
// Server Guy's own recovery is a second track, not a fourth stage. It is the
// same three questions about a different subject, and the whole confusion
// this page exists to end is those two subjects being read as one.

import { useState } from "react";

import type { ControllerProtectionFacts } from "@/server/application-facts";

import {
  CLASS_MEANING,
  type Protection,
  type ProtectionVerdict,
} from "./backups-records";
import { LocalTime } from "./local-time";

import "./backup-stages.css";

type StageState = "done" | "attention" | "waiting" | "failed";

const MARK: Record<StageState, string> = {
  done: "✓",
  attention: "!",
  waiting: "·",
  failed: "✕",
};

function ago(at: string | null | undefined, now: number) {
  if (!at) return "never";
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return "at an unrecorded time";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function list(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

interface Stage {
  id: string;
  title: string;
  says: string;
  state: StageState;
  detail: React.ReactNode;
  action: { label: string; draft: string } | null;
}

export function BackupStages({
  protection,
  verdict,
  now,
  controller,
  onAsk,
}: {
  protection: Protection;
  verdict: ProtectionVerdict;
  now: number;
  controller?: ControllerProtectionFacts;
  onAsk: (draft: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const newest = protection.copies[0] ?? null;
  const proved = newest ? protection.verifiedCopies.get(newest.id) : undefined;
  const planned = protection.planned;
  const coverage = protection.newestCopyCoverage;
  const missing = coverage.missing.map((item) => item.label);
  const offServer =
    newest?.kind === "off-site" || newest?.kind === "controller";
  const failed = protection.failures.copy;
  const copyFailed = failed?.source === "copy" ? failed : null;

  const stages: Stage[] = [
    {
      id: "plan",
      title: "Set up",
      says: planned
        ? [
            protection.summary.schedule?.words ?? "On no recorded schedule",
            protection.uncovered.length
              ? `missing ${list(protection.uncovered.map((item) => item.label))}`
              : null,
          ]
            .filter(Boolean)
            .join(", ")
        : protection.declaredAbsent
          ? "Nothing is copying this application's data"
          : "Nobody has established whether anything copies this",
      state: planned
        ? protection.uncovered.length
          ? "attention"
          : "done"
        : protection.declaredAbsent
          ? "failed"
          : "waiting",
      detail: (
        <dl>
          <div>
            <dt>What it copies</dt>
            <dd>
              {protection.requiredData.length ? (
                <ul className="bs-covers">
                  {protection.requiredData.map((item) => (
                    <li
                      key={item.id}
                      data-in={
                        protection.uncovered.some((gap) => gap.id === item.id)
                          ? undefined
                          : "yes"
                      }
                    >
                      {item.label}
                    </li>
                  ))}
                </ul>
              ) : protection.coverLabels.length ? (
                <ul className="bs-covers">
                  {protection.coverLabels.map((label) => (
                    <li key={label} data-in="yes">
                      {label}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="bs-unknown">
                  Nothing has established what this application keeps on disk.
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Where to</dt>
            <dd>
              {protection.plannedDestinations.length
                ? protection.plannedDestinations
                    .map((kind) => CLASS_MEANING[kind].word)
                    .join(", ")
                : "Not recorded"}
            </dd>
          </div>
          <div>
            <dt>How many kept</dt>
            <dd>
              {protection.keepText ??
                (protection.summary.keep
                  ? `${protection.summary.keep} copies`
                  : "Not recorded")}
            </dd>
          </div>
        </dl>
      ),
      action: planned
        ? {
            label: "Check backups",
            draft:
              "Show me this application's backup plan in full — what it copies, where, how often and how many it keeps — and tell me what you would change.",
          }
        : {
            label: "Set up backups",
            draft:
              "Set up backups for this application: work out what needs copying, recommend a destination and a schedule, and tell me the trade-offs before you change anything.",
          },
    },
    {
      id: "copy",
      title: "Latest backup",
      // Only a copy's own record may say an attempt failed. A plan whose
      // check failed means nothing was ever attempted, and the stage above
      // already carries that; saying "the attempt failed" here would invent a
      // backup run out of a check on a schedule.
      says: copyFailed
        ? `The attempt ${ago(copyFailed.at, now)} failed`
        : newest
          ? [
              `${ago(newest.at, now)} · ${CLASS_MEANING[newest.kind].word}`,
              coverage.basis === "copy" && missing.length
                ? `without ${list(missing)}`
                : null,
            ]
              .filter(Boolean)
              .join(", ")
          : "No copy has been written",
      // A copy that landed beside the application, or that a record says
      // left something out, is not a copy in good standing. The gap is only
      // this stage's when a record of the copy itself names it; if nothing
      // says what went in, that is the restore stage's "unrecorded", not a
      // fault here.
      state: copyFailed
        ? "failed"
        : newest
          ? offServer && !(coverage.basis === "copy" && missing.length > 0)
            ? "done"
            : "attention"
          : "waiting",
      detail: newest ? (
        <dl>
          <div>
            <dt>Where it went</dt>
            <dd>
              {newest.destination ?? "Not recorded"}
              <small>{CLASS_MEANING[newest.kind].means}</small>
            </dd>
          </div>
          <div>
            <dt>What is in it</dt>
            <dd>
              {newest.covers.length
                ? list(
                    newest.covers.map((id) => protection.names.get(id) ?? id),
                  )
                : "No record says what went into it."}
            </dd>
          </div>
          <div>
            <dt>Earlier copies</dt>
            <dd>
              {protection.copies.length > 1
                ? `${protection.copies.length - 1} more on record, oldest ${ago(
                    protection.copies.at(-1)!.at,
                    now,
                  )}`
                : "None"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="bs-unknown">
          A schedule is not a copy. Nothing has been written anywhere yet.
        </p>
      ),
      action: {
        label: "Back up now",
        draft:
          "Take a backup of this application now and record what it captured and where it went.",
      },
    },
    {
      id: "restore",
      title: "Last restore test",
      says: proved
        ? coverage.basis === "restore" && missing.length > 0
          ? `${ago(proved.at, now)} · opened the latest copy, without ${list(missing)}`
          : `${ago(proved.at, now)} · opened the latest copy`
        : protection.restores[0]
          ? `${ago(protection.restores[0].at, now)} · opened an earlier copy`
          : "No copy has ever been opened",
      // Opening the copy and finding everything are two results. A restore
      // that came back without one of the volumes proved recovery works and
      // proved this copy is not enough, and a tick would say only the first.
      state: proved
        ? coverage.basis === "restore" && missing.length > 0
          ? "attention"
          : "done"
        : protection.failures.restore
          ? "failed"
          : protection.restores[0]
            ? "attention"
            : "waiting",
      detail: (
        <dl>
          <div>
            <dt>What it proved</dt>
            <dd>
              {proved && newest
                ? `The copy taken ${ago(newest.at, now)} opens, and its data is there.`
                : protection.restores[0]
                  ? "Recovery has worked at least once, on a copy that is no longer the latest."
                  : "Nothing. A copy nobody has restored is a file nobody has opened."}
              {coverage.basis === "unrecorded" && newest && (
                <small>No record says what that copy contains.</small>
              )}
              {missing.length > 0 && (
                <small>
                  {coverage.basis === "restore"
                    ? `The restore did not bring back ${list(missing)}.`
                    : `The newest copy does not include ${list(missing)}.`}
                </small>
              )}
            </dd>
          </div>
          <div>
            <dt>Failed attempts</dt>
            <dd>
              {protection.failures.restore
                ? `A restore failed ${ago(protection.failures.restore.at, now)} and no later success replaces it.`
                : "None on record"}
            </dd>
          </div>
        </dl>
      ),
      action: {
        label: "Test restore",
        draft:
          "Restore the newest backup copy — not an older one — into an isolated copy of this application, verify the data and files are actually there, and record which copy it proved.",
      },
    },
  ];

  const settled = stages.every((stage) => stage.state === "done");

  // Server Guy's own three, in the same shape. The kit is only worth asking
  // about once there is something it would open: a passphrase nobody has
  // saved for copies nobody has taken is not a thing needing attention.
  const copiedItself = Boolean(controller?.lastCopyAt);
  const own: { title: string; says: React.ReactNode; state: StageState }[] = [
    {
      title: "Storage connected",
      says: controller?.bucket ?? "none",
      state: controller?.connected ? "done" : "waiting",
    },
    {
      title: "Copied",
      says: copiedItself ? (
        <>
          <LocalTime value={controller!.lastCopyAt!} variant="compact" />
          {" · after each piece of work, at most hourly, and once a day · "}
          keeping the last {controller!.keep}
        </>
      ) : (
        "never"
      ),
      state: copiedItself ? "done" : "waiting",
    },
    {
      title: "Recovery kit saved",
      says: controller?.kitConfirmedAt
        ? "you hold what opens the copies"
        : copiedItself
          ? "nobody can open the copies yet"
          : "nothing has been copied for it to open",
      state: controller?.kitConfirmedAt
        ? "done"
        : copiedItself
          ? "attention"
          : "waiting",
    },
  ];

  return (
    <div className="bs">
      <p className="bs-lede" data-tone={verdict.tone}>
        <span>{verdict.says}</span>
        {verdict.next && (
          <button
            type="button"
            className="bs-primary"
            onClick={() => onAsk(verdict.next!.draft)}
          >
            {verdict.next.label}
            <em>asks Server Guy</em>
          </button>
        )}
      </p>
      {verdict.limit && <p className="bs-limit">{verdict.limit}</p>}

      {/* When every link holds, the chain collapses to one line. A page of
          three green ticks is three sentences telling a reader nothing is
          wrong, which one sentence does better. */}
      <ol className="bs-track" data-settled={settled || undefined}>
        {stages.map((stage) => (
          <li key={stage.id} data-state={stage.state}>
            <button
              type="button"
              aria-expanded={open === stage.id}
              onClick={() => setOpen(open === stage.id ? null : stage.id)}
            >
              <span className="bs-mark" data-state={stage.state}>
                {MARK[stage.state]}
              </span>
              <span className="bs-body">
                <b>{stage.title}</b>
                <small>{stage.says}</small>
              </span>
            </button>
            {open === stage.id && (
              <div className="bs-detail">
                {stage.detail}
                {stage.action && (
                  <button
                    type="button"
                    className="bs-action"
                    onClick={() => onAsk(stage.action!.draft)}
                  >
                    {stage.action.label}
                    <em>asks Server Guy</em>
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {/* A second track, not a fourth stage. The same three questions about a
          different subject, and reading the two as one is the confusion this
          page exists to end. */}
      <h3 className="bs-head">Server Guy&rsquo;s own recovery</h3>
      <p className="bs-aside">
        Its connections, deployment access and decisions. Not this
        application&rsquo;s data, and connecting storage does not set up a plan
        for that.
      </p>
      <ol className="bs-track bs-track-small">
        {own.map((step) => (
          <li key={step.title} data-state={step.state}>
            <span className="bs-mark" data-state={step.state}>
              {MARK[step.state]}
            </span>
            <span className="bs-body">
              <b>{step.title}</b>
              <small>{step.says}</small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
