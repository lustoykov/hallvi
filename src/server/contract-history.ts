// Every saved Application Contract version for one application, read for
// people: what changed against the previous version (values, sources, known
// Phase 3 work), why (the message that led to it) and which one is current.
// Earlier versions are read-only history; nothing here rewrites a record.
import { contractFieldLabel } from "./application-contract";
import {
  currentContract,
  getApplicationMessage,
  getWorkspaceById,
  listContracts,
} from "./db";
import type {
  ApplicationContractRecord,
  ChatMessage,
  ContractField,
  ContractProvenance,
  PhaseKey,
} from "./types";

export type ContractFieldChangeKind =
  "added" | "removed" | "value" | "source" | "value-and-source" | "work";

export interface ContractFieldSnapshot {
  value: string | null;
  source: ContractProvenance["kind"];
  /** Known Phase 3 work recorded on the field, if any. */
  work: { observed: string; change: string } | null;
}

export interface ContractFieldChange {
  key: string;
  label: string;
  kind: ContractFieldChangeKind;
  before: ContractFieldSnapshot | null;
  after: ContractFieldSnapshot | null;
}

export interface ContractHistoryEntry {
  id: string;
  version: number;
  commitSha: string;
  createdAt: string;
  current: boolean;
  /** The phase whose work produced this version. */
  phaseKey: PhaseKey | null;
  profileId: string;
  profileVersion: number;
  fieldCount: number;
  summary: string;
  /**
   * The message that led to this version: Server Guy's own inspection request
   * or the engineer's correction, quoted so the reason is visible without
   * opening the chat.
   */
  reason: {
    messageId: string;
    role: ChatMessage["role"];
    source: ChatMessage["source"];
    quote: string;
  } | null;
  /** The repository commit differs from the previous version's. */
  commitChanged: boolean;
  /** What differs from the previous version; empty for the first. */
  changes: ContractFieldChange[];
}

const QUOTE_LIMIT = 240;

function snapshot(field: ContractField): ContractFieldSnapshot {
  return {
    value: field.value,
    source: field.provenance.kind,
    work: field.conformance
      ? {
          observed: field.conformance.observed,
          change: field.conformance.change,
        }
      : null,
  };
}

function sameWork(
  a: ContractFieldSnapshot["work"],
  b: ContractFieldSnapshot["work"],
) {
  return (
    (a === null && b === null) ||
    (a !== null &&
      b !== null &&
      a.observed === b.observed &&
      a.change === b.change)
  );
}

/** Field-level differences between two saved versions, in the later
 * version's field order, removed fields last. */
export function describeContractVersionChanges(
  previous: ApplicationContractRecord,
  next: ApplicationContractRecord,
): ContractFieldChange[] {
  const before = new Map(
    previous.body.fields.map((field) => [field.key, field]),
  );
  const after = new Map(next.body.fields.map((field) => [field.key, field]));
  const changes: ContractFieldChange[] = [];
  for (const field of next.body.fields) {
    const old = before.get(field.key);
    const now = snapshot(field);
    if (!old) {
      changes.push({
        key: field.key,
        label: contractFieldLabel(field.key),
        kind: "added",
        before: null,
        after: now,
      });
      continue;
    }
    const was = snapshot(old);
    const valueChanged = was.value !== now.value;
    const sourceChanged = was.source !== now.source;
    const kind: ContractFieldChangeKind | null =
      valueChanged && sourceChanged
        ? "value-and-source"
        : valueChanged
          ? "value"
          : sourceChanged
            ? "source"
            : sameWork(was.work, now.work)
              ? null
              : "work";
    if (kind)
      changes.push({
        key: field.key,
        label: contractFieldLabel(field.key),
        kind,
        before: was,
        after: now,
      });
  }
  for (const field of previous.body.fields)
    if (!after.has(field.key))
      changes.push({
        key: field.key,
        label: contractFieldLabel(field.key),
        kind: "removed",
        before: snapshot(field),
        after: null,
      });
  return changes;
}

/** Newest version first. */
export function contractHistory(applicationId: string): ContractHistoryEntry[] {
  const contracts = listContracts(applicationId);
  const current = currentContract(applicationId);
  const entries = contracts.map((contract, index) => {
    const previous = index > 0 ? contracts[index - 1] : null;
    const message = getApplicationMessage(
      applicationId,
      contract.sourceMessageId,
    );
    const body = message?.body.trim() ?? "";
    return {
      id: contract.id,
      version: contract.version,
      commitSha: contract.commitSha,
      createdAt: contract.createdAt,
      current: contract.id === current?.id,
      phaseKey: getWorkspaceById(contract.workspaceId)?.phaseKey ?? null,
      profileId: contract.profileId,
      profileVersion: contract.profileVersion,
      fieldCount: contract.body.fields.length,
      summary: contract.body.summary,
      reason: message
        ? {
            messageId: message.id,
            role: message.role,
            source: message.source,
            quote:
              body.length > QUOTE_LIMIT
                ? `${body.slice(0, QUOTE_LIMIT - 1)}…`
                : body,
          }
        : null,
      commitChanged: previous
        ? previous.commitSha !== contract.commitSha
        : false,
      changes: previous
        ? describeContractVersionChanges(previous, contract)
        : [],
    } satisfies ContractHistoryEntry;
  });
  return entries.reverse();
}
