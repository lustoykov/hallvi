// PROTOTYPE · opus-ui-improvements · throwaway.
// What the Storage and Backups pages say: the volumes on the server and
// what each holds, what the backup plan copies from them, the copies and
// restore tests on record, and what survives a container replacement or
// losing the server. Built on the story the Processes and Database pages
// read (stack-model.ts). Nothing here is observed live: the copies are the
// ones on record, and scheduled copies the record doesn't show are unknown.

import type { ApplicationFacts } from "@/server/application-facts";
import {
  persistentState,
  type ApplicationStack,
} from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";

import { settledAt } from "../history-prototype/history-model";
import {
  buildStackStory,
  type StackStory,
} from "../stack-prototype/stack-model";

// The five the Flow and Calendar designs draw are shared with the records
// path, so they live beside those designs rather than inside this builder.
export type { Check, Dated, Piece, Vol } from "./protect-story";
import type { Check, Dated, Piece, Vol } from "./protect-story";

export interface ProtectStory extends StackStory {
  volumes: Vol[];
  pieces: Piece[];
  createdAt: string | null;
  /** When the containers were replaced and the volumes kept. */
  keptAt: string | null;
  /** The isolated reference never draws a loss; the records path can. */
  lostAt: string | null;
  disk: { usedGb: number; totalGb: number; measuredAt: string } | null;
  /** Copies off the server on record, newest first. */
  copies: Dated[];
  /** When the schedule was set or changed, newest first. */
  schedules: Dated[];
  /** Restore tests on record, newest first. */
  restores: Dated[];
  /** What the newest restore test checked, and what it left untested. */
  checks: Check[];
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const newestFirst = (list: Dated[]) =>
  list.toSorted((a, b) => b.at.localeCompare(a.at));

/** "5 h 43 min", "1 day 22 h". */
export function lasting(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}${hours % 24 ? ` ${hours % 24} h` : ""}`;
}
/** "Sep 9". */
export const dayOf = (at: number | string) =>
  new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
/** "a, b and c". */
export const listed = (words: string[]) =>
  words.length > 1
    ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
    : (words[0] ?? "");
/** A label set mid-sentence: "Other files in x" → "other files in x". */
export const soft = (label: string) =>
  /^(Other|Everything|The) /.test(label)
    ? label.charAt(0).toLowerCase() + label.slice(1)
    : label;

export function buildProtectStory(input: {
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
}): ProtectStory {
  const base = buildStackStory(input);
  const { record, stack, facts, operations } = input;
  const release = currentFacts(record);
  const events = record?.events ?? [];
  const sizes = new Map(
    (facts.storage?.volumes ?? []).map((item) => [item.name, item]),
  );
  const planned = new Map(
    persistentState(stack).map((item) => [item.key, item.method]),
  );

  // ---- Each volume, and the pieces of it the backup plan copies. A SQLite
  // volume is copied through its database file alone; the rest of it stays.
  const volumes: Vol[] = stack.volumes.map((volume) => {
    const recorded = release?.volumes.find((item) => item.name === volume.name);
    const process = base.processes.find((item) => item.name === volume.usedBy);
    const owner = process?.product ?? cap(volume.usedBy);
    const sqlite =
      recorded?.sqlite ??
      volume.mounts
        ?.find((mount) => mount.sqlite)
        ?.sqlite?.split("/")
        .at(-1) ??
      null;
    const retention = process?.command?.match(
      /--storage\.tsdb\.retention\.time=(\d+)d\b/,
    )?.[1];
    const measured = sizes.get(volume.name);
    const whole = planned.get(`volume:${volume.name}`) ?? null;
    const throughDatabase =
      volume.kind === "database"
        ? (stack.databases
            .filter(
              (item) =>
                item.name === volume.usedBy ||
                (item.kind === "postgres" && volume.usedBy === "postgres"),
            )
            .map((item) => planned.get(`database:${item.name}`))
            .find(Boolean) ?? null)
        : null;
    const piece = (key: string, label: string, method: string | null) => ({
      key: `${volume.name}:${key}`,
      label,
      volume: volume.name,
      method,
    });
    const pieces: Piece[] = whole
      ? [
          piece(
            "all",
            volume.kind === "files"
              ? `${owner}'s files`
              : `Everything in ${volume.name}`,
            whole,
          ),
        ]
      : volume.kind === "database"
        ? [
            piece("db", sqlite ?? "The database", throughDatabase),
            piece("rest", `Other files in ${volume.name}`, null),
          ]
        : [piece("all", `${owner}'s files`, null)];
    return {
      name: volume.name,
      owner,
      ownerName: volume.usedBy,
      mount: volume.mount,
      docker: recorded?.dockerName ?? null,
      note: retention ? `keeps ${retention} days` : null,
      sizeGb: measured?.sizeGb ?? null,
      measuredAt: measured?.measuredAt ?? null,
      pieces,
    };
  });

  // ---- The copies, schedule changes and restore tests on record: the
  // protection history when a capability records it, otherwise the
  // verified operations.
  const verified = operations.filter((op) => op.state === "verified");
  const dated = (list: ApplicationOperation[]) =>
    newestFirst(
      list.map((op) => ({ id: op.id, at: settledAt(op), detail: op.summary })),
    );
  const history = facts.protection?.history;
  const fromHistory = (kind: "backup" | "restore-test") =>
    newestFirst(
      (history ?? [])
        .filter((item) => item.kind === kind && item.outcome === "succeeded")
        .map((item) => ({ id: item.id, at: item.at, detail: item.detail })),
    );
  const copies = history
    ? fromHistory("backup")
    : dated(
        verified.filter(
          (op) => op.source.type === "backup" && !/^Configure/.test(op.title),
        ),
      );
  const restores = history
    ? fromHistory("restore-test")
    : dated(verified.filter((op) => op.source.type === "restore"));
  const schedules = dated(
    verified.filter(
      (op) => op.source.type === "backup" && /^Configure/.test(op.title),
    ),
  );
  const tested = restores[0]?.detail ?? "";
  const checks: Check[] = restores[0]
    ? [
        { label: "Restored into an isolated place", state: "pass" },
        ...(/checks/i.test(tested)
          ? [{ label: "Its database and file checks", state: "pass" as const }]
          : []),
        ...(/boot/i.test(tested)
          ? [
              {
                label: "Starting the application on it",
                state: "untested" as const,
              },
            ]
          : []),
        ...(/cutover/i.test(tested)
          ? [
              {
                label: "Switching production over to it",
                state: "untested" as const,
              },
            ]
          : []),
      ]
    : [];

  const recreated = operations.find(
    (op) =>
      op.source.type === "release" &&
      op.state === "verified" &&
      /retained their named volumes/.test(op.summary),
  );
  const created =
    events.find((event) =>
      /^(Host prepared|Building the application)/.test(event.message),
    )?.at ?? null;

  return {
    ...base,
    volumes,
    pieces: volumes.flatMap((volume) => volume.pieces),
    createdAt: created,
    lostAt: null,
    keptAt: recreated ? settledAt(recreated) : null,
    disk: facts.storage?.hostDisk ?? null,
    copies:
      copies.length || !base.protection.backup
        ? copies
        : [{ id: "protection", ...base.protection.backup }],
    schedules,
    restores,
    checks,
  };
}
