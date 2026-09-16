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
  subjectsMentioned,
  subjectsOfKind,
  topologyOf,
} from "@/server/record-projection";

import type { Check, Dated } from "./backup-prototype/protect-story";

/**
 * One copy, with the two things that are true of it and of nothing else:
 * where it went, and what it holds.
 *
 * Both used to be collected across every copy into one set, and both were
 * wrong in the same way restore proof was. An off-site copy from last week
 * does not put this morning's local copy off the server, and a plan widened
 * today does not put uploads into an archive written yesterday.
 */
export interface BackupCopy extends Dated {
  /** The class this copy actually reached. Unclassified when it did not say. */
  kind: DestinationKind;
  /** Where, in Pi's words, for the reader. */
  destination: string | null;
  /** The subject ids this copy recorded capturing.
   *  Empty means it did not say. */
  covers: string[];
}

export interface Protection {
  copies: BackupCopy[];
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
   * Where the copies that exist actually went, read from the copy records
   * alone. Empty means no copy declared a class, which the page reports as
   * unclassified rather than assuming the safe answer.
   *
   * Copies only. A plan's destination used to land in this same set, so a
   * local copy beside an off-site *intention* printed "Copies are reaching a
   * destination off the application's server" — a sentence about a transfer
   * that had never happened, on the one page whose whole job is to say
   * whether it had.
   */
  destinations: DestinationKind[];
  /**
   * Where a plan says copies are meant to go. Intent, kept apart from
   * evidence, and never enough on its own to claim a copy exists anywhere.
   */
  plannedDestinations: DestinationKind[];
  /**
   * What the newest copy is known to be missing, and which record said so.
   *
   * Only two records can answer: a restore of that copy, which brought its
   * contents back and looked at them, or the copy's own record of what it
   * captured. A plan cannot, at any age. It describes what copies are meant
   * to contain, which is not a statement about one that already exists — and
   * "the plan is older than the copy" does not promote intent into evidence,
   * it only means the intent is old.
   *
   * So `unrecorded` is a third answer and not a weaker version of the first
   * two: nothing is missing and nothing is covered, because nobody wrote down
   * what is in there.
   */
  newestCopyCoverage: {
    missing: { id: string; label: string }[];
    basis: "restore" | "copy" | "unrecorded";
  };
  /**
   * Copy id → the restore test that opened that copy.
   *
   * By identity, because time cannot answer this: making copy B and then
   * restoring older copy A leaves the newest restore later than the newest
   * copy, and a page comparing the two timestamps calls B verified when
   * nothing has ever opened it. A restore proves the copy it restored.
   */
  verifiedCopies: Map<string, Dated>;
  /** What is on record as being on this application's disk, with its label. */
  requiredData: { id: string; label: string }[];
  /**
   * Subject id → the owner's words for it, where a record gives any.
   *
   * So a page can print "PostgreSQL's data" where a record says
   * `shop-postgres`, instead of showing the reader the plumbing.
   */
  names: Map<string, string>;
  /** What the plan says it covers, in those words. */
  coverLabels: string[];
  /**
   * Data the application is recorded as having that no plan says it copies.
   *
   * A plan may cover a volume by naming it, or by naming the database whose
   * files live in it — a nightly dump covers those bytes as surely as copying
   * the volume would. Both count. What is left is a hole, and a verdict that
   * did not mention it could say "restore proved" about an application whose
   * uploads were in no copy at all.
   */
  uncovered: { id: string; label: string }[];
  /**
   * The newest failure of each kind, which no later success hides.
   *
   * `source` on the copy failure says which record failed. A plan whose own
   * check failed still means the data is not being copied, so the verdict
   * treats the two alike; a page that words it as "the attempt failed" must
   * not, because nothing attempted anything.
   */
  failures: {
    copy: (Dated & { source: "copy" | "plan" }) | null;
    restore: Dated | null;
  };
  /** Retention, coverage and the next run, for the facts row. */
  nextRunAt: string | null;
  /** Retention exactly as Pi wrote it, when it is not a bare number. */
  keepText: string | null;
}

const newestFirst = (a: Dated, b: Dated) => b.at.localeCompare(a.at);

/** What to ask for when data on this application's disk is in no copy. */
function coverDraft(names: string) {
  return (
    `The newest backup does not contain ${names}, and this application's disk ` +
    `does. Decide what actually needs keeping — a cache does not — then extend ` +
    `the plan and take a copy that includes it.`
  );
}

/**
 * A subject id as the owner's words, where a record gives one.
 *
 * Pi records coverage as ids — `shop-uploads`, `shop-postgres` — because a
 * page has to match them, and every page then printed them. A volume record
 * carries `holds`; a database, cache or process record carries a name or a
 * product. An id nothing names comes through as itself, which is honest and
 * is also a sign that nobody has written that subject down.
 */
function namesFor(live: SavedInformation[]) {
  const names = new Map<string, string>();
  for (const kind of [
    "volume",
    "database",
    "cache",
    "queue",
    "process",
  ] as const)
    for (const ref of subjectsMentioned(live, kind)) {
      const facts = currentFacts(live, ref);
      const said =
        facts.get("holds")?.value.value ??
        facts.get("product")?.value.value ??
        facts.get("engine")?.value.value ??
        null;
      if (said && !names.has(ref.id)) names.set(ref.id, said);
    }
  return names;
}

/** A comma-separated `covers` fact as the subject ids it names. */
function idList(value: string | undefined | null) {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** "a", "a and b", "a, b and c". A sentence, not a join. */
function list(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

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
  /**
   * Needed only to read the map, and only to decide coverage: a plan naming a
   * database covers the volume that database's files live in, and the `disk`
   * edge is the only thing that says which volume that is. Without it,
   * coverage is left unstated rather than guessed.
   */
  applicationId?: string,
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
  const plannedDestinations = new Set<DestinationKind>();
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
  /**
   * Plans that are actually on record.
   *
   * `plans` is every subject a record *speaks about*, which includes one
   * whose entire content is "there is no plan". Counting those as plans meant
   * an application Server Guy had checked and found unprotected read as
   * planned — latent in the verdict, because the declared-absent branch is
   * tested first, and live the moment anything else asks the question.
   */
  let stated = 0;
  for (const ref of plans) {
    const presence = presenceOf(live, ref);
    if (presence.known && presence.presence === "absent") {
      // Somebody looked and wrote down that there is no plan. That is a
      // finding, and quite different from no record existing.
      declaredAbsent = true;
      continue;
    }
    stated += 1;
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
      plannedDestinations.add(declared as DestinationKind);
    else if (destination) plannedDestinations.add("unclassified");
    const next = fact("next-run");
    if (next && (!nextRunAt || next < nextRunAt)) nextRunAt = next;
    const what = fact("covers");
    if (what)
      for (const item of idList(what))
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
  const copies: BackupCopy[] = [];
  const failures: {
    copy: (Dated & { source: "copy" }) | null;
    restore: Dated | null;
  } = {
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
    const destination = facts.get("destination")?.value.value ?? null;
    const declared = facts.get("destination-kind")?.value.value;
    // A copy that exists and does not say where it went is unclassified, the
    // same as a plan that does not. Reading it as anything else is a
    // statement about a location no record has made.
    const kind: DestinationKind =
      declared && DESTINATION_KINDS.has(declared as DestinationKind)
        ? (declared as DestinationKind)
        : "unclassified";
    const dated: BackupCopy = {
      id: ref.id,
      at,
      detail:
        [destination, size].filter(Boolean).join(" · ") ||
        presence.record.title,
      kind,
      destination,
      covers: idList(facts.get("covers")?.value.value),
    };
    // A copy whose own record failed is not a copy. It is kept out of the
    // list entirely and remembered as the newest failure, which no later
    // success is allowed to hide — and it contributes no destination either,
    // because an attempt that failed reached nowhere.
    if (presence.record.presentation?.status === "failed") {
      if (!failures.copy || at > failures.copy.at)
        failures.copy = { ...dated, source: "copy" };
      continue;
    }
    destinations.add(kind);
    copies.push(dated);
  }

  // ---- The restore tests, and what each one proved.
  const restores: Dated[] = [];
  const checks: Check[] = [];
  const verifiedCopies = new Map<string, Dated>();
  const restoredCoverage = new Map<string, string[]>();
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
    const restoreFacts = currentFacts(live, ref);
    const dated = {
      id: ref.id,
      at,
      detail: restoreFacts.get("covers")?.value.value ?? presence.record.title,
    };
    restores.push(dated);
    // Which copy it opened. A restore test that does not say proves recovery
    // has worked; it does not vouch for any particular file being kept now.
    const restored = restoreFacts.get("restored-copy")?.value.value;
    if (restored) {
      const held = verifiedCopies.get(restored);
      if (!held || at > held.at) verifiedCopies.set(restored, dated);
      // What the restore actually brought back, which outranks what the copy
      // claimed to hold: one of them was opened and looked at.
      restoredCoverage.set(
        restored,
        idList(restoreFacts.get("covers")?.value.value),
      );
    }
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

  // ---- What is on record as being there, and what does not hold it.
  //
  // Only ever a subtraction from what records actually state: a volume nobody
  // has written down is not a hole, it is a thing nobody has looked at, and
  // saying otherwise would put an invented gap on the page.
  const required: { id: string; label: string }[] = [];
  const map = applicationId
    ? (topologyOf(live, applicationId)?.value ?? null)
    : null;
  if (applicationId)
    for (const ref of subjectsMentioned(live, "volume")) {
      const presence = presenceOf(live, ref);
      if (!(presence.known && presence.presence === "present")) continue;
      const holds = currentFacts(live, ref).get("holds")?.value.value ?? null;
      required.push({ id: ref.id, label: holds ?? ref.id });
    }

  /**
   * What a list of covered ids leaves out.
   *
   * A list naming a database covers the volume that database's files live in
   * — a nightly dump copies those bytes as surely as copying the volume would
   * — and the map's `disk` edge is the only record of which volume that is.
   */
  const missingFrom = (named: string[]) => {
    const reach = new Set(named);
    for (const item of named) {
      const edge = map?.edges.find(
        (edge) => edge.network === "disk" && edge.from === item,
      );
      if (edge) reach.add(edge.to);
    }
    return required.filter((item) => !reach.has(item.id));
  };

  const uncovered = stated ? missingFrom([...covers.keys()]) : [];
  const names = namesFor(live);
  const say = (id: string) => names.get(id) ?? id;
  const coverLabels = [...covers.keys()].map(say);

  // What the *newest copy* is known to hold, which is a different question
  // from what the plan intends to copy next time. A plan widened this morning
  // cannot reach back and put uploads into an archive written last night.
  const newest = copies[0] ?? null;
  const provedCoverage = newest ? restoredCoverage.get(newest.id) : undefined;
  const newestCopyCoverage: Protection["newestCopyCoverage"] =
    provedCoverage?.length
      ? { missing: missingFrom(provedCoverage), basis: "restore" }
      : newest?.covers.length
        ? { missing: missingFrom(newest.covers), basis: "copy" }
        : { missing: [], basis: "unrecorded" };

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
    planned: stated > 0,
    judged,
    keepText,
    destinations: [...destinations],
    plannedDestinations: [...plannedDestinations],
    verifiedCopies,
    requiredData: required,
    names,
    coverLabels,
    uncovered,
    newestCopyCoverage,
    failures: {
      // A copy that actually failed is the more specific finding and keeps
      // its place; a plan whose own check failed fills in when no copy did,
      // so "the timer is not running" still reads as a failed backup rather
      // than a warning about one.
      copy:
        failures.copy ??
        (brokenPlan ? { ...brokenPlan, source: "plan" as const } : null),
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

/**
 * What each destination class is called, and what it does and does not
 * protect against — one entry per class, in one place.
 *
 * The name and the meaning used to live in two files: the banner kept the
 * words and the projection kept the sentences, so a second page showing a
 * destination had to pick one and invent the other.
 */
export const CLASS_MEANING: Record<
  DestinationKind,
  { word: string; means: string }
> = {
  "same-server": {
    word: "On the application's server",
    means:
      "This recovers from a mistake inside the application and from nothing else: if the server is lost, the copies are lost with it.",
  },
  controller: {
    word: "On this computer",
    means:
      "That survives losing the application's server, and depends on this machine still existing and being reachable.",
  },
  "off-site": {
    word: "Off-site storage",
    means:
      "In object storage independent of both machines, subject to the access and retention configured there.",
  },
  provider: {
    word: "Provider snapshot",
    means:
      "The provider's snapshot of the whole disk. It can rebuild the machine; it is not an application-aware copy and says nothing about the data being consistent.",
  },
  unclassified: {
    word: "Destination not classified",
    means:
      "A destination is recorded, but nothing says whether it survives losing the server. Until it does, treat this as unproven.",
  },
};

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
  /** Copies exist and no record says where they were written. */
  | "destination-unknown"
  | "restore-verified"
  | "backup-failed"
  | "backup-overdue"
  | "restore-failed"
  | "evidence-stale";

export interface ProtectionVerdict {
  state: ProtectionState;
  /**
   * Verified, limited, failed, nobody has looked, or quiet: an established
   * absence on an application small enough that it is not yet a problem.
   */
  tone: "verified" | "warning" | "failed" | "unknown" | "quiet";
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
  const { copies, schedules, restores, failures, nextRunAt } = protection;
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
  /**
   * Where the *newest* copy went. Not the union of every copy's destination:
   * an off-site copy from last week does not move this morning's local copy
   * off the server, and reading the set let it say so.
   *
   * A plan's destination is not consulted here at all: intent cannot
   * establish a transfer.
   */
  const newestKind = newestCopy?.kind ?? null;
  const offsite = newestKind === "off-site" || newestKind === "controller";
  /** Nothing says where the newest copy went, so nothing may call it safe. */
  const placeless = newestKind === null || newestKind === "unclassified";
  /** The most recent copy off the server, when that is not this one. */
  const olderOffsite =
    offsite || !newestCopy
      ? null
      : (copies.find(
          (copy) => copy.kind === "off-site" || copy.kind === "controller",
        ) ?? null);
  const elsewhere = olderOffsite
    ? ` The most recent copy off the server is the older one, ${when(olderOffsite.at, now)}.`
    : "";
  /** The restore that opened the newest copy, if one has. */
  const provesNewest = newestCopy
    ? (protection.verifiedCopies.get(newestCopy.id) ?? null)
    : null;
  /**
   * What is on record as being there that the newest copy is not known to
   * hold. Appended to whatever the verdict concluded rather than replacing
   * it: a plan can be reaching object storage nightly, and its copies can be
   * restorable, and the uploads can still be in none of them.
   *
   * Which record answered matters, because widening a plan cannot put data
   * into an archive that was written before it.
   */
  const coverage = protection.newestCopyCoverage;
  const names = list(coverage.missing.map((item) => item.label));
  /**
   * What to say about what the newest copy holds.
   *
   * Two different sentences, and the difference between them matters more
   * than either. A record that opened the copy, or that wrote down what went
   * into it, can say data is **missing**, and that is a warning. When neither
   * exists, the only true sentence is that nobody wrote it down. That is not
   * an accusation, it does not make the restore that did happen count for
   * less, and it must not ask for another backup. It asks what is in the one
   * already there.
   *
   * A plan answers neither question, at any age. It says what copies are
   * meant to contain, which is not a statement about one that exists — and a
   * plan being older than the copy does not promote intent into evidence, it
   * only means the intent is old.
   */
  const missingData =
    coverage.missing.length && coverage.basis !== "unrecorded"
      ? {
          says:
            coverage.basis === "restore"
              ? `The restore did not bring back ${names}.`
              : `The newest copy does not include ${names}.`,
          next: { label: "Cover the rest", draft: coverDraft(names) },
        }
      : null;
  /**
   * Raised only where something is on record as being on disk. With nothing
   * established either way the page has no subject to be uncertain about, and
   * its empty state says that better than a qualification would.
   */
  const unrecordedCoverage =
    !missingData &&
    coverage.basis === "unrecorded" &&
    newestCopy &&
    protection.requiredData.length
      ? {
          says: "No record says what that copy contains.",
          next: {
            label: "Check what the copy holds",
            draft:
              "Look inside the newest backup copy and record what is actually in it — which databases, which files — against what this application keeps on disk. Do not take a new backup to answer this.",
          },
        }
      : null;
  const withHoles = (said: ProtectionVerdict): ProtectionVerdict =>
    missingData
      ? {
          ...said,
          tone: said.tone === "verified" ? "warning" : said.tone,
          limit: [said.limit, missingData.says].filter(Boolean).join(" "),
          next: said.next ?? missingData.next,
        }
      : unrecordedCoverage
        ? {
            // Not a downgrade. The restore happened and proved what it
            // proved; this says only that its extent was never written down.
            ...said,
            limit: [said.limit, unrecordedCoverage.says]
              .filter(Boolean)
              .join(" "),
            next: said.next ?? unrecordedCoverage.next,
          }
        : said;

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

  // An established absence, calmly. Most first applications are small, and a
  // page that greets their owner with an amber "no backup" teaches them to
  // ignore the page. The fact is stated, the consequence is stated once in
  // plain words, and the offer is a sentence, not an alarm. When the data has
  // grown to deserve more, Pi raises the record's own status and this page
  // follows it (PRODUCT.md, "Most first users run something small").
  if (protection.declaredAbsent && !schedules.length && !copies.length)
    return {
      state: "none-configured",
      tone: "quiet",
      says: "Nothing copies this application's data yet. Server Guy checked.",
      limit:
        "For a small application that is a reasonable place to start. A copy becomes worth having as the data grows, and if the server were lost the data would go with it.",
      next: {
        label: "Set up a nightly copy",
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

  // A copy that actually failed, and nothing newer has succeeded since. A
  // plan whose own check failed is not an attempt at anything, and a copy
  // written after the check makes the check the older news of the two: saying
  // "the last backup attempt failed" over a copy taken three minutes ago
  // contradicts the stage directly below it, which is reading the same
  // records.
  // A failed check on a plan that a record says is ABSENT is the absence
  // being reported, not a plan that broke. Saying "the backup plan is not
  // working" there invents a plan directly above a stage saying there is
  // none, so it falls through and the copies speak instead.
  const standing =
    failures.copy &&
    !(newestCopy && newestCopy.at > failures.copy.at) &&
    !(failures.copy.source === "plan" && protection.declaredAbsent)
      ? failures.copy
      : null;
  if (standing)
    return standing.source === "copy"
      ? {
          state: "backup-failed",
          tone: "failed",
          says: "The last backup attempt failed.",
          limit: newestCopy
            ? `The newest copy that did succeed was ${when(newestCopy.at, now)}.`
            : "No copy has ever succeeded.",
          next: {
            label: "Investigate the failure",
            draft:
              "The last backup attempt failed. Find out why and fix it, then take a copy and verify it.",
          },
        }
      : {
          // The plan's own check failed. Nothing attempted a backup, so
          // nothing failed at one, and the timer not running is the absence
          // of protection rather than a warning about it.
          state: "backup-failed",
          tone: "failed",
          says: "The backup plan is not working.",
          limit: newestCopy
            ? `A check on it failed, and the newest copy was ${when(newestCopy.at, now)}.`
            : "A check on it failed and no copy has ever been written.",
          next: {
            label: "Find out why",
            draft:
              "A check on this application's backup plan failed. Find out why nothing is running, fix it, then take a copy and verify it.",
          },
        };

  if ((schedules.length || protection.planned) && !copies.length)
    return temper({
      state: "scheduled-no-copy",
      tone: "warning",
      says: "Backups are scheduled, and none has run yet.",
      // The one place a plan's own coverage is the right thing to read: there
      // is no copy for it to be a false description of, and what it leaves
      // out is what the first copy will leave out.
      limit:
        "A schedule is not a copy. Nothing has been written anywhere." +
        (protection.uncovered.length
          ? ` The plan does not say it copies ${list(protection.uncovered.map((item) => item.label))}.`
          : ""),
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

  if (newestRestore && newestCopy && !provesNewest)
    // A restore proves the copy it restored and no other. Reaching this means
    // a restore has passed and none of them opened the copy being kept now —
    // either because it opened an older one, or because no record says which
    // one it opened. Both leave the newest file unproven, and the page says
    // which of the two it is rather than letting an older proof vouch for a
    // newer file.
    return withHoles({
      state: placeless
        ? "destination-unknown"
        : offsite
          ? "offsite-untested"
          : "local-only",
      tone: "warning",
      says: placeless
        ? "Copies exist, and nothing records where the newest one went or whether it can be opened."
        : offsite
          ? "The newest copy reached a destination off the application's server, and it has not been restored."
          : "The newest copy is on the application's own server, and it has not been restored.",
      limit:
        (protection.verifiedCopies.size
          ? `An earlier copy was restored and checked, so recovery has worked at least once. The newest copy, ${when(newestCopy.at, now)}, has not been.`
          : `A restore was tested, and no record says which copy it opened, so it does not vouch for the copy ${when(newestCopy.at, now)}.`) +
        (placeless
          ? ` Nothing states where the newest copy went either.${elsewhere}`
          : offsite
            ? ""
            : ` The newest copy would also go with the server.${elsewhere}`),
      next: {
        label: "Test a restore of the newest copy",
        draft:
          "Restore the newest backup copy — not an older one — into an isolated copy of this application, verify the data and files are actually there, and record which copy it proved.",
      },
    });

  if (provesNewest && newestCopy) {
    // Freshness is the proof's age, not the newest restore's: a later restore
    // of an older copy says nothing about how long ago this one was proved.
    const stale = now - Date.parse(provesNewest.at) > STALE_MS;
    return withHoles(
      temper({
        state: stale ? "evidence-stale" : "restore-verified",
        tone: stale ? "warning" : "verified",
        says: stale
          ? "The newest copy was restored and checked, long enough ago that it no longer says much about the copies being made now."
          : "The newest copy was restored and checked, so recovery has actually been done and not just planned.",
        limit: placeless
          ? `Nothing records where the newest copy went, so this proves the data is recoverable and not that it survives losing the machine.${elsewhere}`
          : offsite
            ? stale
              ? "Test a current copy to bring the evidence back."
              : null
            : `The newest copy is on the application's own server, so this proves the data is recoverable and not that it survives losing the machine.${elsewhere}`,
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
                draft: olderOffsite
                  ? "The newest backup copy is on the application's own server; only an older one reached anywhere else. Find out why the copies stopped leaving the machine, and make the current ones go where the older one went."
                  : "Every backup copy is on the application's own server. Recommend an off-server destination, tell me the trade-offs and the cost, and set it up when I agree.",
              },
      }),
    );
  }

  if (copies.length && placeless)
    return withHoles(
      temper({
        state: "destination-unknown",
        tone: "warning",
        says: "Copies exist, and nothing records where the newest one went.",
        limit:
          "No record says whether it survives losing the server, and no restore has been tested. Treat it as unproven until one of those is answered." +
          elsewhere,
        next: {
          label: "Find out where the copies go",
          draft:
            "Copies of this application's data exist and nothing records where they are written. Find out, record the destination and whether it survives losing this server, and say whether that is good enough.",
        },
      }),
    );

  if (copies.length && !offsite)
    return withHoles(
      temper({
        state: "local-only",
        tone: "warning",
        says: olderOffsite
          ? "The newest copy is on the application's own server, and only an older one reached anywhere else."
          : "Copies exist, and all of them are on the application's own server.",
        limit:
          "This recovers from a mistake inside the application. It does not survive losing the server, and no restore has been tested." +
          elsewhere,
        next: {
          label: "Add an off-server destination",
          draft: olderOffsite
            ? "The newest backup copy is on the application's own server; only an older one reached anywhere else. Find out why the copies stopped leaving the machine, and make the current ones go where the older one went."
            : "Every backup copy is on the application's own server. Recommend an off-server destination, tell me the trade-offs and the cost, and set it up when I agree.",
        },
      }),
    );

  if (copies.length)
    return withHoles(
      temper({
        state: "offsite-untested",
        tone: "warning",
        says: "The newest copy reached a destination off the application's server, and none has been restored.",
        limit:
          "A copy nobody has restored is a file nobody has opened. Until one is, recovery is untested.",
        next: {
          label: "Test a restore",
          draft:
            "Restore the newest backup copy into an isolated copy of the application and verify the data and files are actually there. Record exactly what it proved.",
        },
      }),
    );

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
