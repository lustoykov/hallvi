// PROTOTYPE · prototype/overview-directions · throwaway.
// What Overview knows, worked out once so that five layouts can disagree
// about everything except the facts. Nothing here draws anything.

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import type {
  Collection,
  Ranked,
  TrafficHistory,
} from "@/server/traffic/contract";

import type { ApplicationSection } from "../application-sections";
import type { Reachability } from "../deployment-prototype/page-head";
import { executionTitle } from "../execution-text";
import type { Usage } from "../monitoring-records";
import type { Traffic } from "../overview-live/use-traffic";
import type { NeedItem, Overview } from "../overview-prototype/overview-model";
import type { Tone } from "../presentation";
import type { Pulse } from "../pulse";
import { laneOf } from "@/server/record-projection";
import { releasesFromRecords, type ReleaseView } from "../release-records";
import { OTHER, UNKNOWN } from "@/server/traffic/contract";
import {
  errorsAcrossMidnight,
  hasTotals,
  todayPoints,
  usualDay,
} from "../traffic/model";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const count = (value: number) =>
  Math.round(value).toLocaleString("en-US");
export const plural = (value: number, word: string, many = `${word}s`) =>
  `${count(value)} ${Math.round(value) === 1 ? word : many}`;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const average = (values: number[]) =>
  values.length ? sum(values) / values.length : 0;

/** "26 hours", "4 days": a length of time, for a sentence. */
export function span(ms: number) {
  if (!Number.isFinite(ms) || ms < MINUTE) return "a moment";
  if (ms < HOUR) return plural(ms / MINUTE, "minute");
  if (ms < 2 * DAY) return plural(ms / HOUR, "hour");
  return plural(ms / DAY, "day");
}
/** "26 h ago": the same, for a table. */
export function ago(at: number, now: number) {
  const ms = Math.max(0, now - at);
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min ago`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} h ago`;
  return `${Math.round(ms / DAY)} d ago`;
}
export const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export const dayName = (at: number) =>
  new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

/** How the address reads right now, in plain words. */
export interface Address {
  url: string | null;
  /** The host a visitor types, or null with no address on record. */
  host: string | null;
  /** The address ends at this computer: a private connection Hallvi holds. */
  tunnelled: boolean;
  secure: boolean;
  restricted: boolean;
  reachable: Reachability;
  /**
   * `answering` and `private-open` are readings. `private-closed` is a
   * connection this computer dropped, never the application failing.
   * `silent` is the one that is about the application itself.
   */
  state:
    | "answering"
    | "private-open"
    | "private-closed"
    | "silent"
    | "checking"
    | "unchecked"
    | "no-controller"
    | "none";
  word: string;
  /** Who can open it, when the record says. */
  reach: string | null;
}

export interface Happening {
  id: string;
  at: number;
  title: string;
  kind: "release" | "record" | "work";
  /** `waiting` is a decision awaiting approval; `failed` did not work. */
  state: "done" | "failed" | "waiting" | "running" | "noted";
  open: (() => void) | null;
}

export interface Lane {
  id: "checks" | "backups" | "server" | "access";
  label: string;
  tone: Tone;
  word: string;
  /** The short phrase: "Checked 20 min ago". */
  text: string;
  /** The sentence Pi or the verdict wrote, where there is one. */
  plain: string;
  /** When the newest record in the lane was established. */
  at: number | null;
  destination: ApplicationSection;
  ask: string;
}

export interface Facts {
  applicationId: string;
  name: string;
  title: string;
  now: number;
  address: Address;
  /** The live stream: who is here, what just arrived. */
  traffic: Traffic;
  collection: Collection | null;
  /** The stored thirty days as they were read, for the tile that draws them. */
  month: TrafficHistory | null;
  visitors: {
    /** Traffic history is kept, so there are stored days to draw. */
    kept: boolean;
    /** The stored totals have been read and cover something. */
    counted: boolean;
    /** Today's estimate; null when nobody has counted today. */
    today: number | null;
    usual: number | null;
    busier: boolean;
    viewsToday: number | null;
    /** Thirty local days, oldest first; the last one is today. */
    days: {
      at: number;
      visitors: number;
      errors: number;
      covered: boolean;
    }[];
    /** Twenty-four hours, oldest first; the last one is this hour. */
    hours: {
      at: number;
      visitors: number;
      views: number;
      errors: number;
      p95Ms: number | null;
      covered: boolean;
    }[];
    pages: Ranked[];
    sources: Ranked[];
    countries: Ranked[];
    /** Server errors today, and whether any reached a visitor. */
    errors: { today: number; visitorsHit: number } | null;
  };
  speed: {
    /** The slowest 1 in 20, in a typical hour. Null when unread. */
    typicalMs: number | null;
  };
  server: {
    name: string | null;
    source: string;
    /** When the first bucket starts, and how long each one is. */
    start: number;
    stepMinutes: number;
    cpu: number[];
    memory: number[];
    cpuAverage: number;
    cpuPeak: number;
    memoryAverage: number;
    memoryTotal: string | null;
    disk: string | null;
    readAt: number | null;
  } | null;
  releases: ReleaseView;
  /** Open things: decisions awaiting approval and failures. */
  open: NeedItem[];
  /** The application's condition, in one sentence. */
  condition: { tone: Tone; text: string };
  lanes: Lane[];
  /** Everything recorded with a time, newest first. */
  happened: Happening[];
  built: Overview;
  mapped: boolean;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onReopen?: () => void;
}

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|\[?::1\]?|localhost)(:|\/|$)/;

function addressOf(
  url: string | null,
  restricted: boolean,
  reachable: Reachability,
): Address {
  const tunnelled = Boolean(url && LOOPBACK.test(url));
  let host: string | null = null;
  try {
    host = url ? new URL(url).host : null;
  } catch {}
  const state: Address["state"] = !url
    ? "none"
    : reachable === "open"
      ? tunnelled
        ? "private-open"
        : "answering"
      : reachable === "closed"
        ? tunnelled
          ? "private-closed"
          : "silent"
        : reachable === "checking"
          ? "checking"
          : reachable === "unavailable"
            ? "no-controller"
            : "unchecked";
  const word = {
    answering: "Answering",
    "private-open": "Private connection open",
    "private-closed": "Private connection closed",
    silent: "The address did not answer",
    checking: "Checking the address",
    unchecked: "Address not checked",
    "no-controller": "Cannot reach Hallvi",
    none: "No address on record",
  }[state];
  return {
    url,
    host,
    tunnelled,
    secure: Boolean(url?.startsWith("https://")),
    restricted,
    reachable,
    state,
    word,
    reach: !url
      ? null
      : tunnelled
        ? "Only this computer can open it"
        : restricted
          ? "Only your network can open it"
          : "Anyone can open it",
  };
}

const ordered = <T extends { at: string }>(series: T[]) =>
  [...series].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

/** A list without the rows that name nothing. */
const named = (rows: Ranked[]) =>
  rows.filter(
    (row) => row.count > 0 && row.key !== OTHER && row.key !== UNKNOWN,
  );

export function overviewFacts(input: {
  applicationId: string;
  name: string;
  title: string;
  now: number;
  openUrl: string | null;
  restricted: boolean;
  reachable: Reachability;
  pulse: Pulse;
  traffic: Traffic;
  collection: Collection | null;
  kept: boolean;
  month: TrafficHistory | null;
  hourly: TrafficHistory | null;
  usage: Usage | null;
  built: Overview;
  condition: { tone: Tone; text: string };
  lanes: Omit<Lane, "at">[];
  mapped: boolean;
  records: SavedInformation[];
  executions: ExecutionRecord[];
  onOpenConversation?: (chatId: string, messageId: string | null) => void;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onReopen?: () => void;
}): Facts {
  const { month, hourly, usage, now } = input;
  const counted = hasTotals(month);
  const usual = month && counted ? usualDay(month.series) : null;
  const days = month ? ordered(month.series) : [];
  const hours = hourly ? ordered(hourly.series) : [];
  const p95 = (
    hourly
      ? hours.map((point) => point.p95Ms ?? 0)
      : (usage?.traffic?.p95Ms ?? [])
  ).filter((value) => value > 0);
  const errors = hourly ? errorsAcrossMidnight(hourly) : null;

  const releases = releasesFromRecords(input.records, input.applicationId);
  const host = usage?.host;
  const address = addressOf(input.openUrl, input.restricted, input.reachable);

  const lanes = input.lanes.map((lane): Lane => {
    const at = Math.max(
      0,
      ...input.records
        .filter(
          (record) =>
            !record.retiredAt &&
            record.establishedAt &&
            laneOf(record.presentation?.states?.ref) === lane.id,
        )
        .map((record) => Date.parse(record.establishedAt!)),
    );
    const read = { ...lane, at: at || null };
    if (lane.id !== "access") return read;
    // A connection this computer dropped is not a failure of the
    // application, and a missing observation is neutral. An address that
    // was asked and said nothing is the one thing here worth amber.
    if (address.state === "private-closed")
      return {
        ...read,
        tone: "unknown",
        word: "Connection closed",
        text: "This computer's private connection is closed",
        plain: "This computer's private connection to it is closed.",
      };
    if (address.state === "silent")
      return {
        ...read,
        tone: "stale",
        word: "No answer",
        text: "The address did not answer just now",
        plain: "The address did not answer when Hallvi asked just now.",
      };
    return read;
  });

  const happened: Happening[] = [
    ...input.records
      .filter((record) => !record.retiredAt && record.establishedAt)
      .map((record): Happening => {
        const release = releases.all.find((one) => one.id === record.id);
        const status = record.presentation?.status;
        return {
          id: record.id,
          at: Date.parse(record.establishedAt!),
          title: release ? `Released ${release.short}` : record.title,
          kind: release ? "release" : "record",
          state: release
            ? release.outcome === "failed"
              ? "failed"
              : release.outcome === "deployed"
                ? "done"
                : "noted"
            : status === "failed"
              ? "failed"
              : status === "verified"
                ? "done"
                : "noted",
          open: null,
        };
      }),
    ...input.executions.map((execution): Happening => ({
      id: execution.id,
      at: Date.parse(execution.finishedAt ?? execution.createdAt),
      title: executionTitle(execution, 80),
      kind: "work",
      state:
        execution.status === "succeeded"
          ? "done"
          : execution.status === "failed"
            ? "failed"
            : execution.status === "awaiting-approval"
              ? "waiting"
              : execution.status === "running"
                ? "running"
                : "noted",
      open: input.onOpenConversation
        ? () => input.onOpenConversation!(execution.chatId, null)
        : null,
    })),
  ]
    .filter((one) => Number.isFinite(one.at))
    .sort((a, b) => b.at - a.at);

  return {
    applicationId: input.applicationId,
    name: input.name,
    title: input.title,
    now,
    address,
    traffic: input.traffic,
    collection: input.collection,
    month,
    visitors: {
      kept: input.kept,
      counted,
      today: usual?.covered ? usual.today : null,
      usual: usual?.usual ?? null,
      busier: Boolean(usual?.busier),
      viewsToday: hourly
        ? sum(todayPoints(hourly).map((point) => point.views))
        : null,
      days: days.map((point) => ({
        at: Date.parse(point.at),
        visitors: point.visitors,
        errors: point.errors,
        covered: point.covered > 0,
      })),
      hours: hours.map((point) => ({
        at: Date.parse(point.at),
        visitors: point.visitors,
        views: point.views,
        errors: point.errors,
        p95Ms: point.p95Ms,
        covered: point.covered > 0,
      })),
      pages: hourly ? named(hourly.pages) : [],
      sources: hourly ? named(hourly.sources) : [],
      countries: hourly ? named(hourly.countries) : [],
      errors:
        hourly && errors
          ? {
              today: errors.today,
              visitorsHit: errors.todayHit
                ? Math.max(1, Math.round(hourly.totals.errorVisitors))
                : 0,
            }
          : null,
    },
    speed: {
      typicalMs: p95.length
        ? [...p95].sort((a, b) => a - b)[Math.floor(p95.length / 2)]
        : null,
    },
    server: host
      ? {
          name: releases.running?.server ?? releases.latest?.server ?? null,
          source: host.source,
          start: Date.parse(usage!.start),
          stepMinutes: usage!.stepMinutes,
          cpu: host.cpu,
          memory: host.memory,
          cpuAverage: average(host.cpu),
          cpuPeak: Math.max(0, ...host.cpu),
          memoryAverage: average(host.memory),
          memoryTotal: host.memoryTotal ?? null,
          disk: usage!.disk,
          readAt: usage!.at ? Date.parse(usage!.at) : null,
        }
      : null,
    releases,
    open: input.built.needs,
    condition: input.condition,
    lanes,
    happened,
    built: input.built,
    mapped: input.mapped,
    onAsk: input.onAsk,
    onOpenDestination: input.onOpenDestination,
    onReopen: input.onReopen,
  };
}
