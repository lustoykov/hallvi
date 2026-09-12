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

import type { ExecutionRecord } from "@/server/operator-execution";
import type { Ref, SavedInformation } from "@/server/operator-data";
import type { ChatSummary } from "@/server/types";
import {
  checkAsNow,
  currentChecks,
  currentFacts,
  freshnessOf,
  lane,
  presenceOf,
  type Lane,
  type RecordCheck,
} from "@/server/record-projection";

import type { ApplicationSection } from "./application-sections";
import type {
  Certainty,
  Fact,
} from "./architecture-prototype/model";
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
    destination: "processes",
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

interface Held {
  check: RecordCheck;
  record: SavedInformation;
}

/**
 * Every check anyone has recorded, gathered into its lane. A check with
 * nothing to place it has no lane and is not counted anywhere — which is
 * exactly what a check with no subject did before lanes were authored.
 */
function byLane(records: SavedInformation[]) {
  const gathered: Record<Lane, Held[]> = {
    checks: [],
    backups: [],
    server: [],
    access: [],
  };
  for (const record of records) {
    if (record.retiredAt) continue;
    for (const check of record.presentation?.checks ?? []) {
      const id = lane(check, record);
      if (id) gathered[id].push({ check, record });
    }
  }
  return gathered;
}

/**
 * A lane's reading, worst first. A failure outranks everything and never ages;
 * one stale claim makes the lane stale, because a lane that reports "verified"
 * on the strength of its freshest check would hide the one that has lapsed.
 */
function readLane(held: Held[], now: number): Certainty {
  if (!held.length) return "unknown";
  const readings = held.map((item) =>
    checkAsNow(item.check, item.record, now),
  );
  if (readings.includes("failed")) return "failed";
  if (readings.includes("stale")) return "stale";
  if (readings.includes("verified")) return "verified";
  return "unknown";
}

function laneText(held: Held[], certainty: Certainty, now: number) {
  const newest = held
    .map((item) => item.record.establishedAt)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);
  if (certainty === "unknown")
    return held.length
      ? "Recorded, but nothing here says whether it still holds"
      : "Nothing has looked at this yet";
  if (certainty === "failed") return "A check did not pass";
  if (certainty === "absent") return "Pi recorded that there is none";
  if (certainty === "stale")
    return newest
      ? `Last checked ${when(newest, now)}; it may have changed since`
      : "It held when it was checked";
  return newest ? `Checked ${when(newest, now)}` : "Checked";
}

/** The subjects a lane's records speak for, so the lane can show their facts. */
function subjectsOf(held: Held[]) {
  const refs = new Map<string, Ref>();
  for (const item of held) {
    const ref = item.check.about ?? item.record.presentation?.states?.ref;
    if (ref) refs.set(`${ref.kind}:${ref.id}`, ref);
  }
  return [...refs.values()];
}

export function overviewFromRecords({
  records,
  executions,
  chats,
  applicationId,
  applicationName,
  headline,
  now,
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
  onOpenConversation: (chatId: string, messageId: string | null) => void;
}): Overview {
  const live = records.filter((record) => !record.retiredAt);
  const gathered = byLane(live);

  // ---- what wants you -------------------------------------------------
  const needs: NeedItem[] = [];
  for (const [id, held] of Object.entries(gathered) as [Lane, Held[]][])
    for (const item of held)
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
            draft: `${item.check.label} is failing. Look into why and tell me what you find.`,
          },
          secondary: { label: chrome[id].label, destination: chrome[id].destination },
        });
  for (const execution of executions)
    if (execution.status === "awaiting-approval")
      needs.push({
        id: `approval:${execution.id}`,
        tone: "waiting",
        title: "A decision is waiting",
        detail: execution.input.split("\n")[0].slice(0, 200),
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
  const application: Ref = { kind: "application", id: applicationId };
  const vitals: Vital[] = (Object.keys(chrome) as Lane[]).map((id) => {
    const held = gathered[id];
    const subjects = subjectsOf(held);
    // An absence someone wrote outranks a lane with nothing in it.
    const declared = subjects
      .map((ref) => presenceOf(live, ref))
      .find((presence) => presence.known && presence.presence === "absent");
    const certainty: Certainty = declared ? "absent" : readLane(held, now);
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
    return {
      id,
      label: chrome[id].label,
      value: word[certainty],
      status: { certainty, text: laneText(held, certainty, now) },
      lines: held.slice(0, 4).map((item) => item.check.label),
      // Needs a recurrence Pi cannot write yet.
      countdownTo: null,
      plain: spoken ?? laneText(held, certainty, now),
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
      title:
        execution.tool === "server_bash"
          ? `Ran on ${execution.target}`
          : execution.tool === "request_approval"
            ? "Asked for a decision"
            : execution.tool.replaceAll("_", " "),
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
  const readings = held.map((item) =>
    checkAsNow(item.value, item.record, now),
  );
  const newest = held
    .map((item) => item.record.establishedAt)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);
  if (readings.includes("failed"))
    return { certainty: "failed", text: "A check on the application did not pass." };
  if (readings.includes("stale"))
    return {
      certainty: "stale",
      text: newest
        ? `It held when it was last checked, ${when(newest, now)}. Enough time has passed that it may have changed.`
        : "It held when it was last checked; enough time has passed that it may have changed.",
    };
  if (readings.includes("verified"))
    return {
      certainty: "verified",
      text: newest
        ? `Every check on the application held, ${when(newest, now)}.`
        : "Every check on the application held when it was last read.",
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
