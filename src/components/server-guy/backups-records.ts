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
  /** A record states there is no plan — different from nobody having looked. */
  declaredAbsent: boolean;
  /** A plan is on record, whether or not it states a schedule. */
  planned: boolean;
  /**
   * Pi marked one of these records a warning, and what it said.
   *
   * A judgement, not a reading: it outranks a passing check on the same
   * record and does not age. Overview's lane learned this first; the verdict
   * has to know it too, or delegating the lane to the verdict would quietly
   * undo it.
   */
  judged: string | null;
  /**
   * The classes of destination any live plan or copy declares. Empty means no
   * plan declared one, which the page reports as unclassified rather than
   * assuming the safe answer.
   */
  destinations: DestinationKind[];
  /** The newest failure of each kind, which no later success hides. */
  failures: { copy: Dated | null; restore: Dated | null };
  /** Retention, coverage and the next run, for the facts row. */
  nextRunAt: string | null;
  /** Retention exactly as Pi wrote it, when it is not a bare number. */
  keepText: string | null;
}

const newestFirst = (a: Dated, b: Dated) => b.at.localeCompare(a.at);

/** A relative time for prose. The facts row uses LocalTime instead. */
function when(at: string, now: number) {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return "at an unrecorded time";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "taken just now";
  if (minutes < 60) return `taken ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `taken ${hours} h ago`;
  return `taken ${Math.round(hours / 24)} d ago`;
}

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
  let keepText: string | null = null;
  let scheduleWords: { words: string; at: string } | null = null;

  const destinations = new Set<DestinationKind>();
  let declaredAbsent = false;
  let judged: string | null = null;
  let brokenPlan: Dated | null = null;
  for (const record of live) {
    const kind = record.presentation?.states?.ref?.kind ?? "";
    if (!kind.startsWith("backup") && kind !== "restore-test") continue;
    if (record.presentation?.status === "warning" && !judged)
      judged = record.body?.trim() || record.title;
    // A check that ran and failed on a plan is a failed backup, whatever the
    // record's own status says. "The timer is not running" is not a warning
    // about protection, it is the absence of it.
    const broken = (record.presentation?.checks ?? []).find(
      (check) => check.status === "failed",
    );
    if ((record.presentation?.status === "failed" || broken) && !brokenPlan)
      brokenPlan = {
        id: record.presentation?.states?.ref?.id ?? record.id,
        at: record.establishedAt ?? record.createdAt,
        detail: broken?.label ?? record.title,
      };
  }
  let nextRunAt: string | null = null;
  for (const ref of plans) {
    const presence = presenceOf(live, ref);
    if (presence.known && presence.presence === "absent") {
      // Somebody looked and wrote down that there is no plan. That is a
      // finding, and quite different from no record existing.
      declaredAbsent = true;
      continue;
    }
    const facts = currentFacts(live, ref);
    const fact = (key: string) => facts.get(key)?.value.value ?? null;
    const schedule = fact("schedule");
    const destination = fact("destination");
    const at = facts.get("schedule")?.record.establishedAt ?? null;
    // Pi writes prose here as often as a bare number — "7 daily copies" — and
    // a page that parses it to NaN and prints "Not recorded" is calling a
    // recorded fact absent.
    const kept = fact("keep");
    if (kept) {
      keepText = kept;
      const parsed = Number.parseInt(kept, 10);
      if (Number.isFinite(parsed)) keep = parsed;
    }
    // What the plan covers, as Pi wrote it. Ids are matched by a reader;
    // prose is kept whole so a page can still print it.
    // Declared, never inferred from the destination's prose: "/var/backups"
    // and "s3://bucket" are both destinations and one dies with the machine.
    const declared = fact("destination-kind");
    if (declared && DESTINATION_KINDS.has(declared as DestinationKind))
      destinations.add(declared as DestinationKind);
    else if (destination) destinations.add("unclassified");
    const next = fact("next-run");
    if (next && (!nextRunAt || next < nextRunAt)) nextRunAt = next;
    const what = fact("covers");
    if (what)
      for (const item of what.split(",").map((part) => part.trim()))
        if (item)
          covers.set(item, destination ?? schedule ?? "Copied by the plan");
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
  const failures: { copy: Dated | null; restore: Dated | null } = {
    copy: null,
    restore: null,
  };
  for (const ref of subjectsOfKind(live, "backup-copy")) {
    const presence = presenceOf(live, ref);
    if (presence.known && presence.presence === "absent") continue;
    if (!presence.known) continue;
    const at = presence.record.establishedAt;
    if (!at) continue;
    const facts = currentFacts(live, ref);
    const size = facts.get("size")?.value.value;
    const destination = facts.get("destination")?.value.value;
    const declared = facts.get("destination-kind")?.value.value;
    if (declared && DESTINATION_KINDS.has(declared as DestinationKind))
      destinations.add(declared as DestinationKind);
    const dated = {
      id: ref.id,
      at,
      detail:
        [destination, size].filter(Boolean).join(" · ") ||
        presence.record.title,
    };
    // A copy whose own record failed is not a copy. It is kept out of the
    // list entirely and remembered as the newest failure, which no later
    // success is allowed to hide.
    if (presence.record.presentation?.status === "failed") {
      if (!failures.copy || at > failures.copy.at) failures.copy = dated;
      continue;
    }
    copies.push(dated);
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
    if (presence.record.presentation?.status === "failed") {
      const dated = { id: ref.id, at, detail: presence.record.title };
      if (!failures.restore || at > failures.restore.at)
        failures.restore = dated;
      continue;
    }
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
    assessed:
      plans.length + copies.length + restores.length > 0 ||
      Boolean(failures.copy || failures.restore),
    declaredAbsent,
    planned: plans.length > 0,
    judged,
    keepText,
    destinations: [...destinations],
    failures: {
      // A copy that actually failed is the more specific finding and keeps
      // its place; a plan whose own check failed fills in when no copy did,
      // so "the timer is not running" still reads as a failed backup rather
      // than a warning about one.
      copy: failures.copy ?? brokenPlan,
      restore: failures.restore,
    },
    nextRunAt,
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

/**
 * Where a copy goes, and therefore what losing something would cost.
 *
 * This is the whole question the Backups page exists to answer, and it cannot
 * be guessed from prose: "/var/backups/shop" and "s3://bucket/shop" are both
 * destinations and one of them dies with the machine. So Pi declares it under
 * a key, the same way the host declares its region, and a plan that does not
 * declare one reads as unclassified rather than as safe.
 */
export type DestinationKind =
  /** Beside the application. Gone if the server is gone. */
  | "same-server"
  /** The machine running Server Guy. Survives the application host, and
      depends on that machine still existing and being reachable. */
  | "controller"
  /** Object storage nobody in this picture owns. */
  | "off-site"
  /** The provider's own snapshot of the whole disk. */
  | "provider"
  /** A destination is recorded and its class was never declared. */
  | "unclassified";

const DESTINATION_KINDS = new Set<DestinationKind>([
  "same-server",
  "controller",
  "off-site",
  "provider",
]);

/** What each class does and does not protect against, in the page's words. */
export const destinationMeaning: Record<DestinationKind, string> = {
  "same-server":
    "On the application's own server. This recovers from a mistake inside the application and from nothing else: if the server is lost, the copies are lost with it.",
  controller:
    "On the machine running Server Guy. That survives losing the application's server, and depends on this machine still existing and being reachable.",
  "off-site":
    "In object storage independent of both machines, subject to the access and retention configured there.",
  provider:
    "The provider's snapshot of the whole disk. It can rebuild the machine; it is not an application-aware copy and says nothing about the data being consistent.",
  unclassified:
    "A destination is recorded, but nothing says whether it survives losing the server. Until it does, treat this as unproven.",
};

/**
 * The one verdict the page leads with.
 *
 * Ordered worst-first and deliberately not collapsible into "green/amber":
 * each state is a different sentence because each wants a different next
 * action. The two that matter most are the ones the reader most wants to
 * conflate — a schedule that exists is not a copy, and a copy that exists is
 * not a recovery.
 */
export type ProtectionState =
  | "not-assessed"
  | "none-configured"
  | "scheduled-no-copy"
  | "local-only"
  | "offsite-untested"
  | "restore-verified"
  | "backup-failed"
  | "backup-overdue"
  | "restore-failed"
  | "evidence-stale";

export interface ProtectionVerdict {
  state: ProtectionState;
  /** Verified, limited, failed, or nobody has looked. */
  tone: "verified" | "warning" | "failed" | "unknown";
  /** The headline, as the page prints it. */
  says: string;
  /** What it does not cover, when that is the point. */
  limit: string | null;
  /** The draft the primary action puts in the conversation. */
  next: { label: string; draft: string } | null;
}

/** How long a daily plan may go without a copy before it is overdue. */
const OVERDUE_MS = 36 * 60 * 60 * 1000;
/** When the newest evidence is old enough that the page stops vouching. */
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

export function protectionVerdict(
  protection: Protection,
  now: number,
): ProtectionVerdict {
  const { copies, schedules, restores, failures, destinations, nextRunAt } =
    protection;
  /**
   * Pi's judgement, applied to whatever the arithmetic concluded.
   *
   * It can only ever make the answer less reassuring: a `warning` never
   * upgrades anything, and it never overrides a failure. This is the rule
   * Overview's lane learned first — a same-host plan whose one check passes
   * must not read verified because Pi already said in as many words that it
   * does not survive losing the machine.
   */
  const temper = (said: ProtectionVerdict): ProtectionVerdict =>
    protection.judged
      ? {
          ...said,
          // A warning never upgrades anything and never overrides a failure.
          tone: said.tone === "verified" ? "warning" : said.tone,
          // Pi's own words about the limit always reach the reader: it is the
          // only place they learn *what* the limit is.
          limit: [said.limit, protection.judged].filter(Boolean).join(" "),
        }
      : said;
  const newestCopy = copies[0] ?? null;
  const newestRestore = restores[0] ?? null;
  const offsite = destinations.some(
    (kind) => kind === "off-site" || kind === "controller",
  );

  if (!protection.assessed)
    return {
      state: "not-assessed",
      tone: "unknown",
      says: "Nobody has looked at whether this application's data is copied anywhere.",
      limit: null,
      next: {
        label: "Ask Server Guy to look",
        draft:
          "Is anything copying this application's data off the server? Check and record what you find.",
      },
    };

  if (protection.declaredAbsent && !schedules.length && !copies.length)
    return {
      state: "none-configured",
      tone: "warning",
      says: "Nothing is copying this application's data. Server Guy checked, and there is no backup.",
      limit: "Losing the server would lose the data.",
      next: {
        label: "Set up backups",
        draft:
          "Set up backups for this application: work out what needs copying, recommend a destination and a schedule, and tell me the trade-offs before you change anything.",
      },
    };

  if (failures.restore)
    return {
      state: "restore-failed",
      tone: "failed",
      says: "A restore was attempted and it did not work.",
      limit:
        "Copies exist, and the last attempt to use one failed, so treat them as unproven until that is understood.",
      next: {
        label: "Investigate the failed restore",
        draft:
          "The last restore test failed. Find out why, and tell me whether the existing copies can be recovered from at all.",
      },
    };

  if (failures.copy)
    return {
      state: "backup-failed",
      tone: "failed",
      says: "The last backup attempt failed.",
      limit: newestCopy
        ? `The newest copy that did succeed is from ${newestCopy.at}.`
        : "No copy has ever succeeded.",
      next: {
        label: "Investigate the failure",
        draft:
          "The last backup attempt failed. Find out why and fix it, then take a copy and verify it.",
      },
    };

  if ((schedules.length || protection.planned) && !copies.length)
    return temper({
      state: "scheduled-no-copy",
      tone: "warning",
      says: "Backups are scheduled, and none has run yet.",
      limit: "A schedule is not a copy. Nothing has been written anywhere.",
      next: {
        label: "Back up now",
        draft:
          "Take a backup now rather than waiting for the schedule, and verify the copy is readable.",
      },
    });

  // Only where the words actually say daily, or a next run is on record and
  // has passed. "On demand after a consistent snapshot" and "Weekly on
  // Sundays" are both schedules and neither is overdue after 36 hours;
  // treating every schedule as daily put the wrong sentence on the page and
  // named a plan the application does not have.
  const daily = schedules.some((schedule) =>
    /daily|every day|nightly/i.test(schedule.detail),
  );
  const pastDue = Boolean(nextRunAt && Date.parse(nextRunAt) < now);
  if (
    (daily || pastDue) &&
    newestCopy &&
    now - Date.parse(newestCopy.at) > OVERDUE_MS
  )
    return {
      state: "backup-overdue",
      tone: "warning",
      says: daily
        ? "A daily backup is scheduled, and the newest copy is older than that."
        : "A scheduled backup was due, and the newest copy is older than that.",
      limit:
        "Either the schedule is not running or its copies are not landing.",
      next: {
        label: "Find out why it stopped",
        draft:
          "The backup schedule looks overdue: the newest copy is older than the schedule implies. Check whether the timer is running and whether its copies are landing, and record what you find.",
      },
    };

  if (newestRestore && newestCopy) {
    // A restore proves the copy it restored, not every copy made since. When
    // the newest copy postdates the newest restore, the copies being taken
    // now have never been opened — which is the same position as never having
    // tested one, except that an earlier copy is known to have worked. The
    // page says both rather than letting the older proof vouch for the newer
    // file.
    if (Date.parse(newestCopy.at) > Date.parse(newestRestore.at))
      return {
        state: offsite ? "offsite-untested" : "local-only",
        tone: "warning",
        says: offsite
          ? "Copies are reaching a destination off the application's server, and the newest one has not been restored."
          : "Copies exist on the application's own server, and the newest one has not been restored.",
        limit:
          `An earlier copy was restored and checked, so recovery has worked ` +
          `at least once. The newest copy, ${when(newestCopy.at, now)}, has ` +
          `not been.${offsite ? "" : " These copies would also go with the server."}`,
        next: {
          label: "Test a restore of the newest copy",
          draft:
            "Restore the newest backup copy — not an older one — into an isolated copy of this application, verify the data and files are actually there, and record which copy it proved.",
        },
      };
    const stale = now - Date.parse(newestRestore.at) > STALE_MS;
    return temper({
      state: stale ? "evidence-stale" : "restore-verified",
      tone: stale ? "warning" : "verified",
      says: stale
        ? "A restore was proved once, long enough ago that it no longer says much about the copies being made now."
        : "A copy was restored and checked, so recovery has actually been done and not just planned.",
      limit: offsite
        ? stale
          ? "Test a current copy to bring the evidence back."
          : null
        : "Every copy is on the application's own server, so this proves the data is recoverable and not that it survives losing the machine.",
      next: stale
        ? {
            label: "Test a restore again",
            draft:
              "Test a restore from the newest backup copy into an isolated copy of the application, and record exactly what it proved.",
          }
        : offsite
          ? null
          : {
              label: "Add an off-server destination",
              draft:
                "Every backup copy is on the application's own server. Recommend an off-server destination, tell me the trade-offs and the cost, and set it up when I agree.",
            },
    });
  }

  if (copies.length && !offsite)
    return temper({
      state: "local-only",
      tone: "warning",
      says: "Copies exist, and all of them are on the application's own server.",
      limit:
        "This recovers from a mistake inside the application. It does not survive losing the server, and no restore has been tested.",
      next: {
        label: "Add an off-server destination",
        draft:
          "Every backup copy is on the application's own server. Recommend an off-server destination, tell me the trade-offs and the cost, and set it up when I agree.",
      },
    });

  if (copies.length)
    return temper({
      state: "offsite-untested",
      tone: "warning",
      says: "Copies are reaching a destination off the application's server, and none has been restored.",
      limit:
        "A copy nobody has restored is a file nobody has opened. Until one is, recovery is untested.",
      next: {
        label: "Test a restore",
        draft:
          "Restore the newest backup copy into an isolated copy of the application and verify the data and files are actually there. Record exactly what it proved.",
      },
    });

  return {
    state: "not-assessed",
    tone: "unknown",
    says: "Records mention backups without saying whether any copy exists.",
    limit: null,
    next: {
      label: "Ask Server Guy to check",
      draft:
        "Check whether this application's data is actually being copied anywhere, and record what you find.",
    },
  };
}
