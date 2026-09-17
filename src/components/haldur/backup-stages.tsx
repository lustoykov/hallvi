"use client";

import {
  ArrowDown,
  CaretRight,
  CheckCircle,
  CloudArrowUp,
  HardDrive,
  HardDrives,
  Question,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { Piece, Vol } from "./backup-prototype/protect-story";
import {
  CLASS_MEANING,
  type BackupCopy,
  type Protection,
  type ProtectionVerdict,
} from "./backups-records";
import { LocalTime } from "./local-time";

import "./backup-stages.css";

type ItemTone = "included" | "planned" | "gap" | "unknown";

function ago(at: string | null | undefined, now: number) {
  if (!at) return "never";
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return "at an unknown time";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} d ago`;
}

function list(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function Copyable({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="bs-copy">
      <code>{value}</code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          );
          window.setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function sizeOf(volume: Vol | undefined) {
  if (!volume) return null;
  if (volume.sizeText) return volume.sizeText;
  return volume.sizeGb === null ? null : `${volume.sizeGb} GB`;
}

function inNewestCopy(protection: Protection, id: string) {
  const { basis, missing } = protection.newestCopyCoverage;
  // The missing list only compares presence-confirmed volumes. A volume
  // merely mentioned by another record is outside that comparison.
  if (
    basis === "unrecorded" ||
    !protection.requiredData.some((item) => item.id === id)
  )
    return {
      held: null,
      says: "The latest copy does not say whether it contains this.",
    };
  const missingItem = missing.some((item) => item.id === id);
  return {
    held: !missingItem,
    says: missingItem
      ? basis === "restore"
        ? "The restore did not bring this back."
        : "The latest copy does not list this."
      : basis === "restore"
        ? "The restore brought this back."
        : "The latest copy lists this.",
  };
}

function itemState(
  protection: Protection,
  piece: Piece,
): { tone: ItemTone; label: string; detail: string } {
  if (!protection.copies.length)
    return piece.method
      ? {
          tone: "planned",
          label: "In the backup plan",
          detail: "No completed copy exists yet.",
        }
      : protection.declaredAbsent || protection.planned
        ? {
            tone: "gap",
            label: "Not in the backup plan",
            detail: "No plan says it copies this.",
          }
        : {
            tone: "unknown",
            label: "Backup status not established",
            detail: "Haldur has not established whether a plan covers this.",
          };
  const held = inNewestCopy(protection, piece.volume);
  if (held.held === true)
    return { tone: "included", label: "In the latest copy", detail: held.says };
  if (held.held === false)
    return {
      tone: "gap",
      label: "Missing from the latest copy",
      detail: held.says,
    };
  return {
    tone: "unknown",
    label: "Latest copy contents unknown",
    detail: held.says,
  };
}

function ItemIcon({ tone }: { tone: ItemTone }) {
  return tone === "included" ? (
    <CheckCircle weight="fill" />
  ) : tone === "gap" ? (
    <WarningCircle weight="fill" />
  ) : tone === "planned" ? (
    <CloudArrowUp weight="duotone" />
  ) : (
    <Question weight="bold" />
  );
}

function Inventory({
  protection,
  volumes,
  pieces,
}: {
  protection: Protection;
  volumes: Vol[];
  pieces: Piece[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const byId = new Map(volumes.map((volume) => [volume.name, volume]));
  const item = pieces.find((piece) => piece.key === selected) ?? null;
  const volume = item ? byId.get(item.volume) : undefined;
  const state = item ? itemState(protection, item) : null;

  if (!pieces.length)
    return (
      <p className="bs-empty-data">
        Haldur has not established what this application keeps on disk.
      </p>
    );

  return (
    <>
      <ul className="bs-inventory" aria-label="Application data">
        {pieces.map((piece) => {
          const recorded = byId.get(piece.volume);
          const size = sizeOf(recorded);
          const status = itemState(protection, piece);
          const open = selected === piece.key;
          return (
            <li key={piece.key}>
              <button
                type="button"
                data-tone={status.tone}
                data-selected={open || undefined}
                aria-expanded={open}
                onClick={() => setSelected(open ? null : piece.key)}
              >
                <span className="bs-data-icon" aria-hidden="true">
                  <HardDrive weight="duotone" />
                </span>
                <span className="bs-data-name">
                  <b>{piece.label}</b>
                  <small>{size ?? "Size not measured"}</small>
                </span>
                <span className="bs-data-state">
                  <ItemIcon tone={status.tone} />
                  {status.label}
                </span>
                <CaretRight className="bs-data-caret" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {item && state && (
        <section
          className="bs-item-detail"
          aria-label={`${item.label} details`}
        >
          <div>
            <b>{item.label}</b>
            <p>{state.detail}</p>
          </div>
          <dl>
            <div>
              <dt>Path</dt>
              <dd>
                {volume && volume.mount !== "Not recorded" ? (
                  <Copyable value={volume.mount} label="path" />
                ) : (
                  "Not known"
                )}
              </dd>
            </div>
            <div>
              <dt>Backup plan</dt>
              <dd>
                {item.method ??
                  (protection.planned || protection.declaredAbsent
                    ? "Not included"
                    : "Not known")}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="bs-detail-close"
            onClick={() => setSelected(null)}
          >
            Close
          </button>
        </section>
      )}
    </>
  );
}

function Disclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="bs-disclosure">
      <summary>
        <span>
          <b>{title}</b>
          <small>{summary}</small>
        </span>
        <CaretRight className="bs-chevron" weight="bold" aria-hidden="true" />
      </summary>
      <div className="bs-disclosure-body">{children}</div>
    </details>
  );
}

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
      {copies.map((copy, index) => {
        const proved = protection.verifiedCopies.get(copy.id);
        return (
          <li key={copy.id} data-newest={index === 0 || undefined}>
            <b>{index === 0 ? "Latest completed copy" : ago(copy.at, now)}</b>
            <small>{copy.detail}</small>
            <small>
              {proved
                ? `Restored and checked ${ago(proved.at, now)}`
                : "No restore test for this copy"}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

function BackupPlan({
  protection,
  onAsk,
}: {
  protection: Protection;
  onAsk: (draft: string) => void;
}) {
  const failure =
    protection.failures.copy?.source === "plan"
      ? protection.failures.copy
      : null;
  return (
    <Disclosure
      title="Backup plan"
      summary={
        protection.planned
          ? (protection.summary.schedule?.words ??
            "A plan exists without a schedule")
          : protection.declaredAbsent
            ? "No backup plan"
            : "No plan has been established"
      }
    >
      {failure && <p className="bs-failure">{failure.detail}</p>}
      <dl className="bs-facts">
        <div>
          <dt>Schedule</dt>
          <dd>
            {protection.summary.schedule?.words ?? "Not known"}
            {protection.nextRunAt && (
              <small>
                Next run{" "}
                <LocalTime value={protection.nextRunAt} variant="compact" />
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>
            {protection.plannedDestinations.length
              ? protection.plannedDestinations
                  .map((kind) => CLASS_MEANING[kind].word)
                  .join(", ")
              : "Not known"}
          </dd>
        </div>
        <div>
          <dt>Retention</dt>
          <dd>
            {protection.keepText ??
              (protection.summary.keep
                ? `${protection.summary.keep} copies`
                : "Not known")}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        className="bs-action"
        onClick={() =>
          onAsk(
            protection.planned
              ? "Show me this application's backup plan in full: what it copies, where, how often and how many it keeps. Tell me what you would change."
              : "Set up backups for this application. Work out what needs copying, recommend a destination and schedule, and tell me the trade-offs before you change anything.",
          )
        }
      >
        {protection.planned ? "Review the plan" : "Draft a backup plan"}
        <em>opens the conversation</em>
      </button>
    </Disclosure>
  );
}

function LatestCopy({
  protection,
  limit,
  now,
  onAsk,
}: {
  protection: Protection;
  limit: string | null;
  now: number;
  onAsk: (draft: string) => void;
}) {
  const copy = protection.copies[0] ?? null;
  const proved = copy ? protection.verifiedCopies.get(copy.id) : undefined;
  const earlier = protection.restores[0] ?? null;
  const failed =
    protection.failures.copy?.source === "copy"
      ? protection.failures.copy
      : null;
  const newerFailure =
    failed && (!copy || failed.at >= copy.at) ? failed : null;
  return (
    <Disclosure
      title="Latest copy"
      summary={
        copy ? `${ago(copy.at, now)} · ${copy.detail}` : "No completed copy"
      }
    >
      {limit && <p className="bs-limit">{limit}</p>}
      {newerFailure && (
        <p className="bs-failure">
          <b>Latest attempt failed {ago(newerFailure.at, now)}.</b>{" "}
          {newerFailure.detail}
        </p>
      )}
      {copy ? (
        <dl className="bs-facts">
          <div>
            <dt>Destination</dt>
            <dd>
              {copy.destination ?? "Not known"}
              <small>{CLASS_MEANING[copy.kind].means}</small>
            </dd>
          </div>
          <div>
            <dt>Contents</dt>
            <dd>
              {copy.covers.length
                ? list(copy.covers.map((id) => protection.names.get(id) ?? id))
                : "The copy does not list its contents"}
            </dd>
          </div>
          <div>
            <dt>Restore proof</dt>
            <dd>
              {proved
                ? `This copy was restored and checked ${ago(proved.at, now)}`
                : earlier
                  ? `An earlier copy was restored ${ago(earlier.at, now)}. This copy has not been.`
                  : "This copy has not been restored"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="bs-unknown">No completed backup copy is on record.</p>
      )}
      {protection.failures.restore && (
        <p className="bs-failure">
          <b>A restore failed {ago(protection.failures.restore.at, now)}.</b>{" "}
          {protection.failures.restore.detail}
        </p>
      )}
      {protection.copies.length > 1 && (
        <>
          <h4>Copies kept</h4>
          <CopiesKept
            copies={protection.copies}
            protection={protection}
            now={now}
          />
        </>
      )}
      <button
        type="button"
        className="bs-action"
        onClick={() =>
          onAsk(
            "Take a backup of this application now and record what it captured and where it went.",
          )
        }
      >
        Draft a backup request
        <em>opens the conversation</em>
      </button>
    </Disclosure>
  );
}

function HowToRestore({
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
  const [picked, setPicked] = useState(copies[0]?.id ?? "");
  const [mode, setMode] = useState<"isolated" | "replace">("isolated");
  const copy = copies.find((one) => one.id === picked) ?? copies[0] ?? null;
  const proved = copy ? protection.verifiedCopies.get(copy.id) : undefined;
  const contents = proved?.covers.length ? proved.covers : (copy?.covers ?? []);

  if (!copy) return null;

  return (
    <Disclosure
      title="How to restore"
      summary="Choose a copy and draft a request in the conversation"
    >
      {copies.length > 1 && (
        <label className="bs-pick">
          <span>Copy</span>
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
      <dl className="bs-restore-facts">
        <div>
          <dt>Data</dt>
          <dd>
            {contents.length
              ? list(contents.map((id) => protection.names.get(id) ?? id))
              : "The copy does not list its contents"}
            <small>
              {proved
                ? `A restore test opened this copy ${ago(proved.at, now)}.`
                : "No restore test has opened this copy."}
            </small>
          </dd>
        </div>
        <div>
          <dt>Access needed</dt>
          <dd>
            {copy.kind === "off-site"
              ? `Storage access${copy.destination ? ` for ${copy.destination}` : ""}`
              : copy.kind === "controller"
                ? "This computer, where the copy is"
                : copy.kind === "provider"
                  ? "The provider account that holds the snapshot"
                  : copy.kind === "same-server"
                    ? "The application's server"
                    : "The copy's destination, which has not been classified"}
          </dd>
        </div>
        <div>
          <dt>Restore into</dt>
          <dd>
            <div
              className="bs-modes"
              role="group"
              aria-label="Restore destination"
            >
              <button
                type="button"
                data-picked={mode === "isolated" || undefined}
                onClick={() => setMode("isolated")}
              >
                An isolated copy
              </button>
              <button
                type="button"
                data-picked={mode === "replace" || undefined}
                onClick={() => setMode("replace")}
              >
                The running application
              </button>
            </div>
            <small>
              {mode === "isolated"
                ? `${applicationName} keeps serving while Haldur checks the restored copy.`
                : `${applicationName} stops, and data written after this copy is lost. Haldur must confirm that with you before it starts.`}
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
              ? `Restore backup copy ${copy.id}, taken at ${copy.at}, into an isolated copy of ${applicationName}. Check the data and tell me what you found. Do not touch the running application.`
              : `Restore backup copy ${copy.id}, taken at ${copy.at}, over the running ${applicationName}. Tell me exactly what would be lost before you start, and wait for me to say yes.`,
          )
        }
      >
        Draft restore request
        <em>opens the conversation</em>
      </button>
    </Disclosure>
  );
}

export function BackupStages({
  protection,
  verdict,
  now,
  applicationName,
  hostName,
  volumes,
  pieces,
  onAsk,
}: {
  protection: Protection;
  verdict: ProtectionVerdict;
  now: number;
  applicationName: string;
  hostName: string;
  volumes: Vol[];
  pieces: Piece[];
  onAsk: (draft: string) => void;
}) {
  const newest = protection.copies[0] ?? null;
  const failed = protection.failures.copy;
  const copyFailed =
    failed?.source === "copy" && (!newest || failed.at >= newest.at)
      ? failed
      : null;
  const destination = newest
    ? (newest.destination ?? CLASS_MEANING[newest.kind].word)
    : protection.planned
      ? protection.plannedDestinations.length
        ? protection.plannedDestinations
            .map((kind) => CLASS_MEANING[kind].word)
            .join(", ")
        : "Destination not known"
      : "No destination";

  return (
    <div className="bs">
      <section
        className="bs-application"
        aria-label={`${applicationName} data`}
      >
        <header className="bs-source">
          <span className="bs-source-icon" aria-hidden="true">
            <HardDrives weight="duotone" />
          </span>
          <span>
            <b>{applicationName}</b>
            <small>Data on {hostName}</small>
          </span>
        </header>
        <Inventory protection={protection} volumes={volumes} pieces={pieces} />
      </section>

      <div className="bs-route" aria-hidden="true">
        <span />
        <ArrowDown weight="bold" />
      </div>

      <section className="bs-summary" data-tone={verdict.tone}>
        <span className="bs-summary-icon" aria-hidden="true">
          {verdict.tone === "failed" ? (
            <XCircle weight="fill" />
          ) : verdict.tone === "verified" ? (
            <CheckCircle weight="fill" />
          ) : verdict.tone === "warning" ? (
            <WarningCircle weight="fill" />
          ) : (
            <CloudArrowUp weight="duotone" />
          )}
        </span>
        <div className="bs-summary-copy">
          <b>{verdict.says}</b>
          <small>
            {newest
              ? `${ago(newest.at, now)} · ${destination}`
              : protection.planned
                ? `Planned for ${destination}; no completed copy yet`
                : "No completed copy"}
          </small>
          {copyFailed && <p>{copyFailed.detail}</p>}
        </div>
        {verdict.next && (
          <button
            type="button"
            className="bs-primary"
            onClick={() => onAsk(verdict.next!.draft)}
          >
            {verdict.next.label}
            <em>opens the conversation</em>
          </button>
        )}
      </section>

      <div className="bs-details">
        <LatestCopy
          protection={protection}
          limit={verdict.limit}
          now={now}
          onAsk={onAsk}
        />
        <BackupPlan protection={protection} onAsk={onAsk} />
        <HowToRestore
          protection={protection}
          applicationName={applicationName}
          now={now}
          onAsk={onAsk}
        />
      </div>
    </div>
  );
}
