"use client";

// Overview, built from what Pi recorded.
//
// Three questions, in the order a reader asks them: what wants me, what is
// true now, and what has happened. The fourth — what is going to happen —
// needs a recurrence Pi cannot yet write, so the page ships without it rather
// than with a guess.
//
// Everything here reads the same projection Architecture does. Overview adds
// no vocabulary of its own: its four lanes come from the subject kind a check
// was about, and its headline condition comes from the one record that states
// the application itself.

import { clip, commandOf, essence } from "./execution-text";
import type { ExecutionRecord } from "@/server/operator-execution";
import type { Ref, SavedInformation } from "@/server/operator-data";
import type { ChatSummary } from "@/server/types";
import {
  checkAsNow,
  currentChecks,
  currentFacts,
  freshnessOf,
  laneOf,
  presenceOf,
  type Lane,
  type RecordCheck,
} from "@/server/record-projection";

import type { ApplicationSection } from "./application-sections";
import {
  protectionFromRecords,
  protectionVerdict,
  type ProtectionVerdict,
} from "./backups-records";
import type { Certainty, Fact } from "./architecture-prototype/model";
import type {
  Idea,
  NeedItem,
  Overview,
  RecentItem,
  Vital,
} from "./overview-prototype/overview-model";

/** The lane's own page, and the words the design puts on it. */
const chrome: Record<
  Lane,
  { label: string; destination: ApplicationSection; ask: string }
> = {
  checks: {
    label: "Checks",
    destination: "deployment",
    ask: "Check the application now and record what you find.",
  },
  backups: {
    label: "Backups",
    destination: "backups",
    ask: "Is anything copying this application's data off the server?",
  },
  server: {
    label: "Server",
    // The machine itself, which Architecture draws; Processes is about what
    // runs on it, and a reader clicking "Server" means the server.
    destination: "architecture",
    ask: "Check the server now and record what you find.",
  },
  access: {
    label: "Access",
    destination: "security",
    ask: "What can reach this application from outside?",
  },
};

const word: Record<Certainty, string> = {
  verified: "Verified",
  stale: "Out of date",
  failed: "Failed",
  // Not "Verified", and not "Failed": something is set up and it does
  // less than the lane's name suggests.
  warning: "Limited",
  planned: "Planned",
  unknown: "Not assessed",
  absent: "Not set up",
};

function when(at: string, now: number) {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return "at an unrecorded time";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** The verdict's four tones in the lane's own vocabulary. */
const verdictCertainty: Record<ProtectionVerdict["tone"], Certainty> = {
  verified: "verified",
  warning: "warning",
  failed: "failed",
  unknown: "unknown",
};

/**
 * Short captions for the four-line stack beside the timeline. The verdict's
 * full sentence is too long for this column and goes in `plain` instead.
 */
const verdictCaption: Partial<Record<ProtectionVerdict["state"], string>> = {
  // "Nobody has looked yet" was 130px in a 129px column, so it rendered as
  // "Nobody has looked ye…". Four words shorter says the same thing and fits
  // — and the distinction that matters, between nobody having checked and
  // there being nothing, survives either way.
  "not-assessed": "Not checked yet",
  "none-configured": "Nothing backs this up",
  "scheduled-no-copy": "Scheduled, no copy yet",
  "local-only": "On the server only",
  "offsite-untested": "Copied, restore untested",
  "destination-unknown": "Copied, destination unrecorded",
  "restore-verified": "Restore proved",
  "backup-failed": "A backup failed",
  "backup-overdue": "Overdue",
  "restore-failed": "A restore failed",
  "evidence-stale": "Proof has lapsed",
};

interface Held {
  check: RecordCheck;
  record: SavedInformation;
}

interface GatheredLane {
  held: Held[];
  subjects: Ref[];
}

/**
 * Every check anyone has recorded, gathered into its lane. A check with
 * nothing to place it has no lane and is not counted anywhere — which is
 * exactly what a check with no subject did before lanes were authored.
 */
function byLane(records: SavedInformation[]) {
  const subjects: Record<Lane, Map<string, Ref>> = {
    checks: new Map(),
    backups: new Map(),
    server: new Map(),
    access: new Map(),
  };
  for (const record of records) {
    if (record.retiredAt) continue;
    const stated = record.presentation?.states?.ref;
    const statedLane = laneOf(stated);
    if (stated && statedLane)
      subjects[statedLane].set(`${stated.kind}:${stated.id}`, stated);
    for (const check of record.presentation?.checks ?? []) {
      const ref = check.about ?? stated;
      const id = laneOf(ref);
      if (ref && id) subjects[id].set(`${ref.kind}:${ref.id}`, ref);
    }
  }
  return Object.fromEntries(
    (Object.keys(subjects) as Lane[]).map((id) => {
      const refs = [...subjects[id].values()];
      const held = refs.flatMap((ref) =>
        [...currentChecks(records, ref).values()].map((item) => ({
          check: item.value,
          record: item.record,
        })),
      );
      return [id, { held, subjects: refs } satisfies GatheredLane];
    }),
  ) as Record<Lane, GatheredLane>;
}

/**
 * A lane's reading, worst first. A failure outranks everything and never ages;
 * one stale claim makes the lane stale, because a lane that reports "verified"
 * on the strength of its freshest check would hide the one that has lapsed.
 *
 * A record's own `status` is read as well as its checks, because a check and a
 * judgement answer different questions. Pi recorded Shop's same-host backup
 * plan as `warning`, with a body saying in as many words that it "does not
 * protect against loss of the entire server" — and its one check, that the
 * timer is active, passed. Reading only the checks threw the judgement away
 * and printed a green "Checked 5 min ago" under the word Backups, which is
 * the most reassuring thing the page could have said and among the least
 * true. `failed` and `warning` are judgements: like a failed check they do not
 * age, and they outrank a passing one on the same record.
 */
function readLane(held: Held[], now: number): Certainty {
  if (!held.length) return "unknown";
  const judged = new Set(
    held.map((item) => item.record.presentation?.status).filter(Boolean),
  );
  if (judged.has("failed")) return "failed";
  const readings = held.map((item) => checkAsNow(item.check, item.record, now));
  if (readings.includes("failed")) return "failed";
  if (judged.has("warning")) return "warning";
  if (readings.includes("stale")) return "stale";
  if (readings.includes("verified")) return "verified";
  return "unknown";
}

/**
 * The short phrase the design prints under a lane's name. Short on purpose:
 * it sits in a 4-line stack beside the timeline, and the reference reads
 * "Reached 3 days ago", never a sentence.
 */
function laneText(held: Held[], certainty: Certainty, now: number) {
  const newest = held
    .map((item) => item.record.establishedAt)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);
  if (certainty === "absent") return "Not set up";
  if (certainty === "failed") return "A check did not pass";
  // The time it was checked is not the news here: what is set up does less
  // than the lane's name implies, and the record says what in its own words.
  if (certainty === "warning") return "Set up, with a limit";
  if (certainty === "unknown")
    return held.length ? "Recorded, not dated" : "Not checked yet";
  if (certainty === "stale") {
    // The time that belongs beside "last checked" is the lapsed claim's own,
    // not the newest in the lane. One stale claim among five fresh ones made
    // this read "Last checked 4 min ago" in amber, about something last
    // observed twenty-one hours earlier: the number invited the reader to
    // dismiss the colour.
    const lapsed = staleAt(held, now);
    return lapsed ? `Last checked ${when(lapsed, now)}` : "Checked once";
  }
  return newest ? `Checked ${when(newest, now)}` : "Checked";
}

/**
 * When the lapsed claim was established — the newest one that has nonetheless
 * gone out of window, which is the most recent honest answer to "how long ago
 * was this actually true".
 */
function staleAt(held: Held[], now: number): string | undefined {
  return held
    .filter((item) => checkAsNow(item.check, item.record, now) === "stale")
    .map((item) => item.record.establishedAt)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);
}

/**
 * The recorded lines behind the page — what Little Server says it did last.
 * Checks in the order they were established, so the newest is at the end.
 */
export function logFromRecords(records: SavedInformation[]) {
  return records
    .filter((record) => !record.retiredAt && record.establishedAt)
    .flatMap((record) =>
      (record.presentation?.checks ?? []).map((check) => ({
        id: `${record.id}:${check.key ?? check.label}`,
        at: record.establishedAt!,
        tone: (check.status === "failed"
          ? "fail"
          : check.status === "passed"
            ? "pass"
            : "info") as "pass" | "fail" | "work" | "info",
        text: check.detail ? `${check.label} — ${check.detail}` : check.label,
      })),
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-12);
}

/**
 * What an execution is called in a list of past work. The tool name alone is
 * not a reading: "bash" says nothing about whether it touched the server or a
 * throwaway copy of the repository, and those are the two things a reader
 * most needs to tell apart.
 */
function titleOf(execution: ExecutionRecord) {
  switch (execution.tool) {
    case "server_bash":
      return `Ran on the server${execution.target ? ` · ${execution.target.split("@").at(-1)?.split(":")[0]}` : ""}`;
    case "request_approval":
      return "Asked you for a decision";
    case "bash":
    case "powershell":
      return "Ran in the repository copy";
    case "read":
    case "read_file":
      return "Read a file in the repository copy";
    case "write":
    case "write_file":
    case "edit":
    case "edit_file":
      return "Changed a file in the repository copy";
    case "hetzner_request":
      return "Asked Hetzner";
    case "open_server_port":
      return "Opened a tunnel to the server";
    case "connect_server":
      return "Saved the server connection";
    default:
      return execution.tool.replaceAll("_", " ");
  }
}

export function overviewFromRecords({
  records,
  executions,
  chats,
  applicationId,
  applicationName,
  headline,
  now,
  accessClosed = false,
  onOpenConversation,
}: {
  records: SavedInformation[];
  executions: ExecutionRecord[];
  chats: ChatSummary[];
  applicationId: string;
  applicationName: string;
  /** The web part's name when the map has one. */
  headline: string;
  now: number;
  /**
   * The controller asked its own tunnel whether it is still there, and it is
   * not. This is not a record and does not become one: it is an observation
   * about now, of exactly the kind the Access lane exists to report, and the
   * page header already reports it. Without it the two disagreed on one
   * screen — "The tunnel is closed" above a green "Checked 5 min ago" — and
   * the lane was the reassuring half.
   */
  accessClosed?: boolean;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
}): Overview {
  const live = records.filter((record) => !record.retiredAt);
  const gathered = byLane(live);
  // Backups is the one lane its own checks cannot answer: a plan's timer
  // passing says nothing about a copy existing, and a copy says nothing about
  // a restore. The destination page already works that out, so the lane reads
  // the same verdict rather than forming a second opinion. It claimed to
  // share it before this and did not — a plan with a passing timer and no
  // restore read "Verified" here and "Limited" three clicks away, and on the
  // rig they agreed only because Pi happened to mark the plan a warning.
  const backups = protectionVerdict(
    protectionFromRecords(records, now, applicationId),
    now,
  );

  // ---- what wants you -------------------------------------------------
  const needs: NeedItem[] = [];
  for (const [id, gatheredLane] of Object.entries(gathered) as [
    Lane,
    GatheredLane,
  ][])
    for (const item of gatheredLane.held)
      if (checkAsNow(item.check, item.record, now) === "failed")
        needs.push({
          id: `check:${item.record.id}:${item.check.key ?? item.check.label}`,
          tone: "failed",
          title: item.check.label,
          detail:
            item.check.detail ??
            item.record.title ??
            "A check on this application did not pass.",
          primary: {
            label: "Ask about it",
            // A check's label is a sentence Pi wrote, not a noun phrase, so
            // `${label} is failing` produced "Dependency audit found
            // vulnerabilities is failing." Quoting it works whatever Pi
            // called it, "did not pass" is what the check actually says, and
            // carrying the detail means the reader is not retyping evidence
            // the page is already showing them.
            draft: [
              `The check "${item.check.label}" did not pass`,
              item.check.detail ? `: ${item.check.detail}` : ".",
              " Look into why, and tell me what you find.",
            ].join(""),
          },
          secondary: {
            label: chrome[id].label,
            destination: chrome[id].destination,
          },
        });
  for (const execution of executions)
    if (execution.status === "awaiting-approval")
      needs.push({
        id: `approval:${execution.id}`,
        tone: "waiting",
        title: "A decision is waiting",
        detail: clip(essence(commandOf(execution.input)), 200),
        primary: {
          label: "Open the conversation",
          open: () => onOpenConversation(execution.chatId, null),
        },
      });

  // ---- what Pi suggests ------------------------------------------------
  const ideas: Idea[] = live
    .filter(
      (record) =>
        record.presentation?.role === "recommendation" &&
        record.presentation.nextStep,
    )
    .map((record) => ({
      id: record.id,
      title: record.title,
      detail: record.body,
      // Pi's own words for what to do, not a sentence composed here.
      draft: record.presentation!.nextStep!,
      destination: (record.presentation!.views[0] ??
        "overview") as ApplicationSection,
    }));

  // ---- what is true now ------------------------------------------------
  const vitals: Vital[] = (Object.keys(chrome) as Lane[]).map((id) => {
    const { held, subjects } = gathered[id];
    // An absence someone wrote outranks a lane with **nothing in it**. It
    // does not outrank a lane whose other subject is present and passing:
    // Shop's public HTTP port is deliberately absent and its private tunnel
    // works, and reading the lane as "Not set up" turned the good half of
    // that arrangement into a warning.
    const presences = subjects.map((ref) => presenceOf(live, ref));
    const anyPresent = presences.some(
      (presence) => presence.known && presence.presence === "present",
    );
    const declared =
      !anyPresent &&
      presences.find(
        (presence) => presence.known && presence.presence === "absent",
      );
    // A closed tunnel is a check that ran just now and did not pass, so it
    // outranks the recorded reading the way any failure does. Only the Access
    // lane hears it: the application, its data and the server are all exactly
    // as they were, and it is only the way in from this PC that is gone.
    const verdict = id === "backups" ? backups : null;
    const certainty: Certainty =
      id === "access" && accessClosed
        ? "failed"
        : // A declared absence keeps the contract's own reading. "Nothing
          // backs this up" is a finding, and the lane's word for it is "Not
          // set up" rather than a warning — the verdict's sentence carries
          // the detail underneath.
          verdict?.state === "none-configured" || (declared && !verdict)
          ? "absent"
          : verdict
            ? verdictCertainty[verdict.tone]
            : readLane(held, now);
    const facts: Fact[] = subjects.flatMap((ref) =>
      [...currentFacts(live, ref).values()].map((item) => ({
        label: item.value.label,
        value: item.value.value,
        mono: item.value.mono,
      })),
    );
    const spoken = held.find(
      (item) => item.record.presentation?.states && item.record.body,
    )?.record.body;
    const text =
      id === "access" && accessClosed
        ? "Tunnel is closed"
        : (verdict && verdictCaption[verdict.state]) ||
          laneText(held, certainty, now);
    return {
      id,
      label: chrome[id].label,
      value: word[certainty],
      status: { certainty, text },
      lines: held.slice(0, 4).map((item) => item.check.label),
      // Needs a recurrence Pi cannot write yet.
      countdownTo: null,
      // Pi's own sentence, except where it has been overtaken: it wrote "Shop
      // is available privately from this PC" and that was true when it was
      // written. Repeating it under a closed tunnel is the same lie in
      // longer words.
      // The destination page's own sentence, so the lane and the page cannot
      // differ about what the copies add up to. The limit is part of it: a
      // lane that says a plan is limited without saying *what* the limit is
      // has told the reader only that they should worry.
      plain:
        id === "access" && accessClosed
          ? text
          : verdict
            ? [verdict.says, verdict.limit].filter(Boolean).join(" ")
            : (spoken ?? text),
      facts: facts.slice(0, 6),
      destination: chrome[id].destination,
      ask: chrome[id].ask,
    };
  });

  // ---- what has happened -----------------------------------------------
  const conversation = (chatId: string) =>
    chats.find((chat) => chat.id === chatId)?.title ?? null;
  const recent: RecentItem[] = [
    ...executions.map((execution) => ({
      id: execution.id,
      title: titleOf(execution),
      state: (execution.status === "succeeded"
        ? "verified"
        : execution.status === "failed"
          ? "failed"
          : execution.status === "declined" ||
              execution.status === "interrupted"
            ? "cancelled"
            : execution.status === "running"
              ? "working"
              : "queued") as RecentItem["state"],
      at: execution.finishedAt ?? execution.createdAt,
      from: conversation(execution.chatId),
      open: () => onOpenConversation(execution.chatId, null),
    })),
    ...live
      .filter((record) => record.establishedAt)
      .map((record) => ({
        id: record.id,
        title: record.title,
        state: (record.presentation?.status === "failed"
          ? "failed"
          : record.presentation?.status === "verified"
            ? "verified"
            : "inspected") as RecentItem["state"],
        at: record.establishedAt!,
        from: null,
        open: null,
      })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 8)
    .map(({ at, ...rest }) => ({ ...rest, when: when(at, now) }));

  return {
    headline: headline || applicationName,
    needs,
    ideas,
    vitals,
    recent,
  };
}

/**
 * The application's own condition, which is the one thing Overview cannot
 * assemble from its lanes: healthy, stale, failed, or nobody has looked.
 * It comes from the record that states the application, and from that
 * record's own `establishedAt` — evidence gathered an hour ago is an hour
 * old however recently it was written down.
 */
export function applicationCondition(
  records: SavedInformation[],
  applicationId: string,
  now: number,
): { certainty: Certainty; text: string } {
  const ref: Ref = { kind: "application", id: applicationId };
  const held = [...currentChecks(records, ref).values()];
  if (!held.length)
    return {
      certainty: "unknown",
      text: "Nothing on record says whether the application is working.",
    };
  const readings = held.map((item) => checkAsNow(item.value, item.record, now));
  const newest = held
    .map((item) => item.record.establishedAt)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);
  if (readings.includes("failed"))
    return {
      certainty: "failed",
      text: "A check on the application did not pass.",
    };
  if (readings.includes("stale")) {
    // The lapsed claim's own time, not the newest of all of them. Five checks
    // four minutes old beside one twenty-one hours old produced "It held when
    // it was last checked, 4 min ago. Enough time has passed that it may have
    // changed." — a sentence that argues with itself, and whose number is
    // about the wrong observation.
    const lapsed = held
      .filter((item) => checkAsNow(item.value, item.record, now) === "stale")
      .map((item) => item.record.establishedAt)
      .filter((at): at is string => Boolean(at))
      .sort()
      .at(-1);
    return {
      certainty: "stale",
      text: lapsed
        ? `It held when it was last checked, ${when(lapsed, now)}. Enough time has passed that it may have changed.`
        : "It held when it was last checked; enough time has passed that it may have changed.",
    };
  }
  if (readings.includes("verified"))
    return {
      certainty: "verified",
      text: newest
        ? `The application's own checks held, ${when(newest, now)}.`
        : "The application's own checks held when they were last read.",
    };
  const anyFreshness = held
    .map((item) => freshnessOf(item.value, item.record, now).kind)
    .find((kind) => kind !== "fresh");
  return {
    certainty: "unknown",
    text:
      anyFreshness === "never-established"
        ? "A record was written about the application, but it established nothing."
        : "The application has records, but none that say whether it is working.",
  };
}
