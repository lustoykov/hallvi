"use client";

// Backups, built from what Pi recorded.
//
// Three different things, and the page is wrong if it merges any two of
// them. A **plan** says copies are meant to happen. A **copy** is one dated
// copy that exists somewhere. A **restore test** is the only evidence that a
// copy is worth anything. A plan with no copies is a promise; copies with no
// restore test are files nobody has opened.
//
// So each is its own subject, each can be absent on its own, and none of them
// is inferred from another. In particular: no record at all reads "not
// assessed", never "no backups" — Server Guy not having looked is not the
// same as there being nothing there.

import type { SavedInformation } from "@/server/operator-data";
import {
  currentChecks,
  currentFacts,
  presenceOf,
  subjectsOfKind,
} from "@/server/record-projection";

import type { Check, Dated } from "./backup-prototype/protect-story";

export interface Protection {
  copies: Dated[];
  schedules: Dated[];
  restores: Dated[];
  checks: Check[];
  /** Volume id → how the plan copies it. Only a plan puts anything here. */
  covers: Map<string, string>;
  summary: {
    schedule: { words: string; at: string } | null;
    backup: { at: string; detail: string } | null;
    restore: { at: string; detail: string } | null;
    keep: number | null;
  };
  /** Whether anything at all has been established, for the empty state. */
  assessed: boolean;
}

const newestFirst = (a: Dated, b: Dated) => b.at.localeCompare(a.at);

export function protectionFromRecords(
  records: SavedInformation[],
  now: number,
): Protection {
  const live = records.filter((record) => !record.retiredAt);
  void now;

  // ---- The plan, and what it says it covers.
  const plans = subjectsOfKind(live, "backup-plan");
  const covers = new Map<string, string>();
  const schedules: Dated[] = [];
  let keep: number | null = null;
  let scheduleWords: { words: string; at: string } | null = null;

  for (const ref of plans) {
    const presence = presenceOf(live, ref);
    if (presence.known && presence.presence === "absent") continue;
    const facts = currentFacts(live, ref);
    const fact = (key: string) => facts.get(key)?.value.value ?? null;
    const schedule = fact("schedule");
    const destination = fact("destination");
    const at = facts.get("schedule")?.record.establishedAt ?? null;
    keep = Number(fact("keep")) || keep;
    for (const volume of (fact("covers") ?? "").split(/[,\s]+/).filter(Boolean))
      covers.set(volume, destination ?? schedule ?? "Copied by the plan");
    if (schedule && at) {
      schedules.push({
        id: ref.id,
        at,
        detail: destination ? `${schedule} · ${destination}` : schedule,
      });
      if (!scheduleWords || at > scheduleWords.at)
        scheduleWords = { words: schedule, at };
    }
  }

  // ---- The copies. One record per copy, so the page counts records and
  // never a number somebody incremented.
  const copies: Dated[] = [];
  for (const ref of subjectsOfKind(live, "backup-copy")) {
    const presence = presenceOf(live, ref);
    if (presence.known && presence.presence === "absent") continue;
    if (!presence.known) continue;
    const at = presence.record.establishedAt;
    if (!at) continue;
    const facts = currentFacts(live, ref);
    const size = facts.get("size")?.value.value;
    const destination = facts.get("destination")?.value.value;
    copies.push({
      id: ref.id,
      at,
      detail:
        [destination, size].filter(Boolean).join(" · ") ||
        presence.record.title,
    });
  }

  // ---- The restore tests, and what each one proved.
  const restores: Dated[] = [];
  const checks: Check[] = [];
  for (const ref of subjectsOfKind(live, "restore-test")) {
    const presence = presenceOf(live, ref);
    if (presence.known && presence.presence === "absent") continue;
    if (!presence.known) continue;
    const at = presence.record.establishedAt;
    if (!at) continue;
    restores.push({
      id: ref.id,
      at,
      detail:
        currentFacts(live, ref).get("covers")?.value.value ??
        presence.record.title,
    });
    for (const held of currentChecks(live, ref).values())
      checks.push({
        label: held.value.label,
        // A check that ran and passed is proof; anything else is untested.
        // "Failed" is not a state this list has, because a failed restore
        // belongs in the copy's own tone, not in a tick list.
        state: held.value.status === "passed" ? "pass" : "untested",
      });
  }

  copies.sort(newestFirst);
  restores.sort(newestFirst);
  schedules.sort(newestFirst);

  return {
    copies,
    schedules,
    restores,
    checks,
    covers,
    assessed: plans.length + copies.length + restores.length > 0,
    summary: {
      schedule: scheduleWords,
      backup: copies[0] ? { at: copies[0].at, detail: copies[0].detail } : null,
      restore: restores[0]
        ? { at: restores[0].at, detail: restores[0].detail }
        : null,
      keep,
    },
  };
}
