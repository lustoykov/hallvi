"use client";

// Backups, as the chain it actually is, with the things themselves inside it.
//
// The selected design (C inside F). Being backed up is not one fact. It is
// three, in order: something is set up to copy this, a copy exists, and
// somebody has opened one. The page that merged any two of them is the page
// this review kept finding — a schedule reported as protection, a copy
// reported as a recovery. So they are three stages with three states, which
// makes merging them structurally impossible rather than a thing to be
// careful about.
//
// C asked the other question: what actually comes back. Its answer was a list
// of the real things on disk, with sizes and paths, and it belongs inside the
// stages rather than beside them — running both would make a reader read the
// same facts twice in two shapes. So Set up opens on what this application
// keeps and what copies it, Latest backup opens on one particular copy, and
// Last restore test opens on what that restore found.
//
// Every line in here is a record or an absence. Where the prototype could
// invent a file listing inside an object or a per-item restore result, this
// says which record answered — the copy's own, the restore that opened it, or
// nothing at all — because "nobody wrote down what is in there" is a third
// answer and not a weaker version of the other two.
//
// Server Guy's own recovery is a second track, not a fourth stage. It is the
// same three questions about a different subject, and the whole confusion
// this page exists to end is those two subjects being read as one.

import { useState } from "react";

import type { ControllerProtectionFacts } from "@/server/application-facts";

import type { Piece, Vol } from "./backup-prototype/protect-story";
import {
  CLASS_MEANING,
  type BackupCopy,
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

/** A path or an object name, next to the one thing a reader wants to do. */
function Copyable({ value, label }: { value: string; label: string }) {
  const [said, setSaid] = useState(false);
  return (
    <span className="bs-copy">
      <code>{value}</code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => setSaid(true),
            () => setSaid(false),
          );
          setTimeout(() => setSaid(false), 1400);
        }}
      >
        {said ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

/** How big it is, in the words the record used. */
function sizeOf(volume: Vol | undefined) {
  if (!volume) return null;
  if (volume.sizeText) return volume.sizeText;
  return volume.sizeGb === null ? null : `${volume.sizeGb} GB`;
}

/**
 * Whether the newest copy holds one particular thing, and which record says
 * so.
 *
 * Three answers, never two. A restore that opened the copy and looked is the
 * strongest; the copy's own record of what it captured is next; nothing at
 * all is the third, and it is not a quieter version of "missing".
 */
function inNewestCopy(protection: Protection, id: string) {
  const { basis, missing } = protection.newestCopyCoverage;
  if (basis === "unrecorded")
    return {
      held: null,
      says: "No record says whether the latest copy holds this.",
    };
  const gone = missing.some((item) => item.id === id);
  return {
    held: !gone,
    says: gone
      ? basis === "restore"
        ? "A restore opened the latest copy and did not find this."
        : "The latest copy's own record does not list this."
      : basis === "restore"
        ? "A restore opened the latest copy and brought this back."
        : "The latest copy's own record lists this.",
  };
}

/**
 * What this application keeps, one row each, and what happens to it.
 *
 * C's question, answered from records alone: the volumes Pi has written down,
 * their size and mount as it measured them, the plan that copies each one in
 * the plan's own words, and whether the latest copy holds it. A volume nobody
 * has written down is not a row here — an invented gap would be worse than a
 * short list.
 */
function Inventory({
  protection,
  volumes,
  pieces,
}: {
  protection: Protection;
  volumes: Vol[];
  pieces: Piece[];
}) {
  const byId = new Map(volumes.map((volume) => [volume.name, volume]));
  if (!pieces.length)
    return (
      <p className="bs-unknown">
        Nothing has established what this application keeps on disk, so there is
        nothing yet to say a plan would cover.
      </p>
    );
  return (
    <ul className="bs-inv">
      {pieces.map((piece) => {
        const volume = byId.get(piece.volume);
        const size = sizeOf(volume);
        const held = inNewestCopy(protection, piece.volume);
        return (
          <li key={piece.key} data-state={piece.method ? "kept" : "gap"}>
            <div className="bs-inv-head">
              <b>{piece.label}</b>
              {size && <span className="bs-size">{size}</span>}
            </div>
            {volume && volume.mount !== "Not recorded" && (
              <p className="bs-where">
                At <Copyable value={volume.mount} label="the path" />
                {volume.docker ? ` in ${volume.docker}` : ""}
              </p>
            )}
            {piece.method ? (
              // The plan's own words, which may be a destination or a
              // schedule. Printing the bare value left "s3://shop-backups"
              // sitting under a volume with nothing saying what it was.
              <p className="bs-note" data-kind="kept">
                Copied by the plan: {piece.method}
              </p>
            ) : (
              <p className="bs-note" data-kind="gap">
                No plan on record copies this. Losing the server loses it.
              </p>
            )}
            <p
              className="bs-note"
              data-kind={
                held.held === null ? "unknown" : held.held ? "kept" : "gap"
              }
            >
              {held.says}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** The copies on record, newest first, each saying where it went. */
function CopiesKept({
  copies,
  protection,
  now,
}: {
  copies: BackupCopy[];
  protection: Protection;
  now: number;
}) {
  return (
    <ul className="bs-kept">
      {copies.map((copy) => {
        const proved = protection.verifiedCopies.get(copy.id);
        return (
          <li key={copy.id} data-newest={copy === copies[0] || undefined}>
            <b>
              {ago(copy.at, now)} · {CLASS_MEANING[copy.kind].word}
            </b>
            <small>
              {copy.destination ?? "Destination not recorded"}
              {copy.covers.length
                ? ` · holds ${list(copy.covers.map((id) => protection.names.get(id) ?? id))}`
                : " · no record says what went into it"}
            </small>
            <small>
              {proved
                ? `Opened by a restore ${ago(proved.at, now)}.`
                : "Nobody has opened this one."}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What it would take to get this application back, from one copy.
 *
 * Closed until asked for, because it is a question a reader has on one day
 * and not on the others. What it needs is named and never shown; the values
 * are Server Guy's to ask for when it runs, and no page of this product
 * reveals one.
 */
function HowToRecover({
  protection,
  applicationName,
  now,
  onAsk,
}: {
  protection: Protection;
  applicationName: string;
  now: number;
  onAsk: (draft: string) => void;
}) {
  const copies = protection.copies;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(copies[0]?.id ?? "");
  const [mode, setMode] = useState<"isolated" | "replace">("isolated");
  const copy = copies.find((one) => one.id === picked) ?? copies[0] ?? null;
  const proved = copy ? protection.verifiedCopies.get(copy.id) : undefined;

  const needs = copy
    ? [
        copy.kind === "off-site"
          ? `Access to the storage that holds it${copy.destination ? `, ${copy.destination}` : ""}`
          : copy.kind === "controller"
            ? "This computer, where the copy is"
            : copy.kind === "provider"
              ? "The provider account that holds the snapshot"
              : copy.kind === "same-server"
                ? "The application's server, which this copy is on"
                : "Wherever this copy went, which no record classifies",
        "A place to put it: a fresh instance, or the running one",
      ]
    : [];

  return (
    <section className="bs-recover" data-open={open || undefined}>
      <button
        type="button"
        className="bs-recover-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <b>How to recover {applicationName}</b>
        <small>What it would take, and what it would change</small>
        <span className="bs-chev" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="bs-recover-body">
          {!copy ? (
            <p className="bs-unknown">
              There is no copy on record to recover from. A plan is not a copy,
              and neither is a page saying so.
            </p>
          ) : (
            <>
              {copies.length > 1 && (
                <label className="bs-pick">
                  <span>Which copy</span>
                  <select
                    value={picked}
                    onChange={(event) => setPicked(event.target.value)}
                  >
                    {copies.map((one) => (
                      <option key={one.id} value={one.id}>
                        {ago(one.at, now)} · {CLASS_MEANING[one.kind].word}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <dl>
                <div>
                  <dt>What comes back</dt>
                  <dd>
                    {copy.covers.length
                      ? list(
                          copy.covers.map(
                            (id) => protection.names.get(id) ?? id,
                          ),
                        )
                      : "No record says what went into this copy."}
                    <small>
                      {proved
                        ? `A restore opened this copy ${ago(proved.at, now)}, so this is what came back rather than what was meant to.`
                        : "Nobody has opened this copy, so this is what its own record claims."}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>What it needs</dt>
                  <dd>
                    <ul className="bs-needs">
                      {needs.map((need) => (
                        <li key={need}>{need}</li>
                      ))}
                    </ul>
                    <small>
                      Named, never shown. Server Guy asks for anything else when
                      it runs this, and no page here reveals a value.
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Where it goes</dt>
                  <dd>
                    <div
                      className="bs-modes"
                      role="group"
                      aria-label="Where to restore"
                    >
                      <button
                        type="button"
                        data-picked={mode === "isolated" || undefined}
                        onClick={() => setMode("isolated")}
                      >
                        Into an isolated copy
                      </button>
                      <button
                        type="button"
                        data-picked={mode === "replace" || undefined}
                        onClick={() => setMode("replace")}
                      >
                        Over the running application
                      </button>
                    </div>
                    <small>
                      {mode === "isolated"
                        ? `A separate instance with no way in from outside. ${applicationName} keeps serving, and you find out whether the copy is good before anything depends on the answer.`
                        : `${applicationName} stops, its data is replaced by this copy, and anything written since it was taken is gone. Server Guy will say that back to you before it starts.`}
                    </small>
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="bs-action"
                onClick={() =>
                  onAsk(
                    mode === "isolated"
                      ? `Restore the backup copy taken ${ago(copy.at, now)} into an isolated copy of ${applicationName}, check the data is actually there, and tell me what you found. Do not touch the running application.`
                      : `Restore the backup copy taken ${ago(copy.at, now)} over the running ${applicationName}. Tell me exactly what would be lost before you start, and wait for me to say yes.`,
                  )
                }
              >
                Ask Server Guy to do this
                <em>asks Server Guy</em>
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function BackupStages({
  protection,
  verdict,
  now,
  applicationName,
  volumes,
  pieces,
  controller,
  onAsk,
}: {
  protection: Protection;
  verdict: ProtectionVerdict;
  now: number;
  applicationName: string;
  /** What Storage read off the same records: size, mount, what holds it. */
  volumes: Vol[];
  /** One per thing on disk, carrying how the plan copies it, in its words. */
  pieces: Piece[];
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
  const copyFailed =
    failed?.source === "copy" && (!newest || failed.at >= newest.at)
      ? failed
      : null;

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
        <>
          <dl>
            <div>
              <dt>On its own schedule</dt>
              <dd>
                {protection.summary.schedule?.words ?? "Not recorded"}
                {protection.nextRunAt && (
                  <small>
                    Next run{" "}
                    <LocalTime value={protection.nextRunAt} variant="compact" />
                  </small>
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
          {/* The things themselves. A reader who wants to know whether their
            uploads come back is asking about one row of this, not about the
            plan in the abstract. */}
          <h4 className="bs-sub">What this application keeps</h4>
          <Inventory
            protection={protection}
            volumes={volumes}
            pieces={pieces}
          />
        </>
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
        <>
          <dl>
            <div>
              <dt>Where it went</dt>
              <dd>
                {newest.destination ?? "Not recorded"}
                <small>{CLASS_MEANING[newest.kind].word}</small>
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
              <dt>What it means</dt>
              <dd>{CLASS_MEANING[newest.kind].means}</dd>
            </div>
          </dl>
          {protection.copies.length > 1 && (
            <>
              <h4 className="bs-sub">Copies kept</h4>
              <CopiesKept
                copies={protection.copies}
                protection={protection}
                now={now}
              />
            </>
          )}
        </>
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
        <>
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
          {/* Item by item, and only where a restore actually looked. Reading
            this off the plan would turn an intention into a finding. */}
          {coverage.basis === "restore" &&
            protection.requiredData.length > 0 && (
              <>
                <h4 className="bs-sub">What it found</h4>
                <ul className="bs-found">
                  {protection.requiredData.map((item) => {
                    const gone = coverage.missing.some(
                      (one) => one.id === item.id,
                    );
                    return (
                      <li key={item.id} data-ok={!gone || undefined}>
                        <b>{item.label}</b>
                        <small>
                          {gone
                            ? "The restore did not bring this back."
                            : "Came back in the restored copy."}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
        </>
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
      // A row that says when it last copied, while the latest attempt failed,
      // is a tick over a failure. The band under this asks the owner to do
      // something about it; the row has to be the thing that says it broke.
      says:
        controller?.state === "failing" ? (
          copiedItself ? (
            <>
              the last attempt failed · last copy{" "}
              <LocalTime value={controller!.lastCopyAt!} variant="compact" />
            </>
          ) : (
            "the last attempt failed, and nothing has been copied yet"
          )
        ) : copiedItself ? (
          <>
            <LocalTime value={controller!.lastCopyAt!} variant="compact" />
            {" · after each piece of work, at most hourly, and once a day · "}
            keeping the last {controller!.keep}
          </>
        ) : (
          "never"
        ),
      state:
        controller?.state === "failing"
          ? "failed"
          : copiedItself
            ? "done"
            : "waiting",
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

      {/* Only where there is something to recover from. "How to recover" over
          "there is no copy on record" is a door onto a wall. */}
      {protection.copies.length > 0 && (
        <HowToRecover
          protection={protection}
          applicationName={applicationName}
          now={now}
          onAsk={onAsk}
        />
      )}

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
