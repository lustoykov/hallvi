"use client";

import { ArrowSquareOut, CaretDown } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type {
  ContractFieldChange,
  ContractHistoryEntry,
} from "@/server/contract-history";

import { api } from "./api";
import { SOURCE_LABELS } from "./format";
import { LocalTime } from "./local-time";

/** One change against the previous version, in plain words. A source-only
 * change says so; it never reads as "x → x". */
export function describeFieldChange(change: ContractFieldChange) {
  const { label, before, after } = change;
  const source = (snapshot: NonNullable<typeof after>) =>
    SOURCE_LABELS[snapshot.source];
  const value = (snapshot: NonNullable<typeof after>) =>
    snapshot.value ?? "unresolved";
  switch (change.kind) {
    case "added":
      return `${label}: added · ${value(after!)} · ${source(after!)}`;
    case "removed":
      return `${label}: removed (was ${value(before!)})`;
    case "value":
      return `${label}: ${value(before!)} → ${value(after!)}`;
    case "source":
      return `${label}: same value, source changed · ${source(before!)} → ${source(after!)}`;
    case "value-and-source":
      return `${label}: ${value(before!)} → ${value(after!)} · source ${source(before!)} → ${source(after!)}`;
    case "work":
      return after!.work
        ? `${label}: Phase 3 work updated · ${after!.work.change}`
        : `${label}: Phase 3 work no longer needed`;
  }
}

function reasonLine(entry: ContractHistoryEntry) {
  const reason = entry.reason;
  if (!reason) return "Reason not recorded.";
  if (reason.source === "user") return `You said: “${reason.quote}”`;
  if (reason.role === "user") return `Server Guy's request: “${reason.quote}”`;
  return `Server Guy: “${reason.quote}”`;
}

/** The saved versions as a read-only list; the newest is current. */
export function ContractVersionList({
  versions,
}: {
  versions: ContractHistoryEntry[];
}) {
  if (!versions.length)
    return <p className="sg-contract-versions-empty">No saved versions.</p>;
  return (
    <ol className="sg-contract-versions" aria-label="Saved contract versions">
      {versions.map((entry) => (
        <li
          className={entry.current ? "current" : undefined}
          data-version={entry.version}
          key={entry.id}
        >
          <div className="sg-contract-version-head">
            <strong>
              v{entry.version}
              {entry.current ? " · current" : " · read-only"}
            </strong>
            <small>
              commit {entry.commitSha.slice(0, 8)} ·{" "}
              <LocalTime value={entry.createdAt} variant="compact" /> ·{" "}
              {entry.fieldCount} fields
            </small>
          </div>
          <p>{reasonLine(entry)}</p>
          {entry.commitChanged && (
            <p>Repository moved to commit {entry.commitSha.slice(0, 8)}.</p>
          )}
          {entry.changes.length > 0 ? (
            <ul>
              {entry.changes.map((change) => (
                <li key={change.key} data-change={change.kind}>
                  {describeFieldChange(change)}
                </li>
              ))}
            </ul>
          ) : (
            entry.version > 1 && <p>No field changed.</p>
          )}
          {!entry.current && (
            <a
              href={`/api/contracts/${entry.id}`}
              rel="noreferrer"
              target="_blank"
            >
              Open saved version <ArrowSquareOut aria-hidden="true" />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * "Saved versions" beside the current contract: opened on demand, read from
 * the history route, never a second source of truth. Earlier versions stay
 * read-only with their commit, what changed and why.
 */
export function ContractVersions({
  applicationId,
  currentVersion,
}: {
  applicationId: string;
  currentVersion: number;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{
    forVersion: number;
    versions: ContractHistoryEntry[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stale = loaded !== null && loaded.forVersion !== currentVersion;

  // Read when opened, and again when a revision lands while it is open.
  useEffect(() => {
    if (!open || (loaded !== null && !stale)) return;
    let active = true;
    api
      .contractHistory(applicationId)
      .then(({ versions }) => {
        if (active) setLoaded({ forVersion: currentVersion, versions });
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load the saved versions.",
          );
      });
    return () => {
      active = false;
    };
  }, [open, stale, loaded, applicationId, currentVersion]);

  return (
    <div className="sg-contract-history">
      <button
        aria-expanded={open}
        className="sg-text-button"
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
        type="button"
      >
        <CaretDown
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
        Saved versions
        {currentVersion > 1 ? ` (${currentVersion})` : ""}
      </button>
      {open &&
        (error ? (
          <p className="sg-error" role="alert">
            {error}
          </p>
        ) : loaded === null || stale ? (
          <p className="sg-contract-versions-empty">Loading saved versions…</p>
        ) : (
          <ContractVersionList versions={loaded.versions} />
        ))}
    </div>
  );
}
