// PROTOTYPE · opus-ui-improvements · throwaway.
// What the Logs and Monitoring pages say, from the deployment record and the
// recorded operations: the output Server Guy read from each process (the
// last 100 lines of each, and only when asked), the checks that looked at the
// application and when, and what nothing watches. Nothing is read live:
// these pages never collect logs or contact the server.

import type {
  ApplicationFacts,
  MonitoringFacts,
} from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";

import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { settledAt } from "../history-prototype/history-model";
import {
  buildStackStory,
  type StackStory,
} from "../stack-prototype/stack-model";

/** Lines Server Guy reads from each process (`docker compose logs --tail`). */
export const CAP = 100;
const MARKER = "--- Application logs ---\n";

export type Level = "info" | "warn" | "error" | "debug";
export interface LogLine {
  id: string;
  service: string;
  speaker: string;
  /** The time the process wrote into the line, when it wrote one. */
  at: string | null;
  level: Level;
  text: string;
  /** The line's other fields. */
  rest: string;
  /** The line as collected, without the service prefix. */
  raw: string;
  /** The process saying it is ready or listening, in its own words. */
  milestone: boolean;
}
export interface Speaker {
  service: string;
  name: string;
  lines: number;
  warns: number;
  errors: number;
  /** Its output reached the cap, so earlier lines weren't read. */
  cut: boolean;
}
export interface Collection {
  id: string;
  /** When Server Guy read it. */
  at: string;
  lines: LogLine[];
  speakers: Speaker[];
}
export interface Look {
  id: string;
  /** What it looked at: a process's product name, or "Backups". */
  part: string;
  name: string;
  /** The name without its product, for tight places: "Login page". */
  short: string;
  how: string;
  kind: "check" | "output" | "backup";
  at: string | null;
  state: "passing" | "failing" | "unknown" | "seen";
  detail: string | null;
  /** Every time the record shows it, oldest first. */
  evidence: { at: string; text: string }[];
  invented: boolean;
}
export interface Unwatched {
  id: string;
  /** Where it belongs; null for the application as a whole. */
  part: string | null;
  title: string;
  short: string;
  detail: string;
}
export interface SignalStory extends StackStory {
  /** Reads of the output, newest first. */
  collections: Collection[];
  looks: Look[];
  /** The newest check of a process. */
  lastCheckAt: string | null;
  /** What watches between deployments; null when nothing does. */
  watcher: MonitoringFacts["collector"] | null;
  unwatched: Unwatched[];
  /** Everything looks and gaps belong to, in reading order. */
  parts: string[];
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A line as Compose prints it: "app-1  | the process's words". */
const prefixed = /^(\S+?)\s*\|\s?(.*)$/;
const ready =
  /\b(ready to (receive|serve|accept)|is ready|application ready|server listen|listening (on|for)|start listening|all modules healthy)\b/i;
const keyed = (key: string) =>
  new RegExp(`(?:^|\\s)${key}=(?:"((?:[^"\\\\]|\\\\.)*)"|(\\S+))`);
const TIME = keyed("(?:t|time|ts)");
const LEVEL = keyed("level");
const MSG = keyed("msg");
const STRIP =
  /(?:^|\s)(?:t|time|ts|level|msg|logger|component|caller|source)=(?:"(?:[^"\\]|\\.)*"|\S+)/g;
const LEADING = /^(\d{4}-\d\d-\d\d[T ][\d:.]+(?:Z|[+-]\d\d:?\d\d)?)\s*/;

const valueOf = (match: RegExpMatchArray | null) =>
  match ? (match[1] ?? match[2] ?? null) : null;

/** An ISO time from a line; anything finer than milliseconds is dropped. */
function isoOf(text: string | null) {
  if (!text) return null;
  const date = new Date(text.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function levelOf(word: string | null, raw: string): Level {
  if (word) {
    if (/^(err|crit|fatal|panic|alert|emerg)/.test(word)) return "error";
    if (/^warn/.test(word)) return "warn";
    if (/^(debug|trace)/.test(word)) return "debug";
    return "info";
  }
  if (/\b(ERROR|CRITICAL|FATAL|Traceback)\b/.test(raw)) return "error";
  if (/\b(WARN|WARNING)\b/.test(raw)) return "warn";
  return "info";
}

function parseLine(
  id: string,
  line: string,
  fallback: string,
  names: Map<string, string>,
): LogLine {
  const match = line.match(prefixed);
  const service = match ? match[1].replace(/-\d+$/, "") : fallback;
  const raw = match ? match[2] : line;
  const msg = valueOf(raw.match(MSG));
  const leading = raw.match(LEADING);
  const stripped = raw.replace(STRIP, " ").replace(LEADING, "");
  const text = (msg ?? stripped).replace(/\\"/g, '"').replace(/\s+/g, " ");
  return {
    id,
    service,
    speaker: names.get(service) ?? cap(service),
    at: isoOf(valueOf(raw.match(TIME)) ?? leading?.[1] ?? null),
    level: levelOf(valueOf(raw.match(LEVEL))?.toLowerCase() ?? null, raw),
    text: text.trim() || raw,
    rest: msg ? stripped.replace(/\s+/g, " ").trim() : "",
    raw,
    milestone: ready.test(msg ?? raw),
  };
}

function collectionOf(
  id: string,
  at: string,
  rows: string[],
  fallback: string,
  names: Map<string, string>,
  order: string[],
  capped: boolean,
): Collection {
  const lines = rows.map((row, index) =>
    parseLine(`${id}:${index}`, row, fallback, names),
  );
  const speakers = new Map<string, Speaker>();
  for (const line of lines) {
    const speaker = speakers.get(line.service) ?? {
      service: line.service,
      name: line.speaker,
      lines: 0,
      warns: 0,
      errors: 0,
      cut: false,
    };
    speaker.lines += 1;
    if (line.level === "warn") speaker.warns += 1;
    if (line.level === "error") speaker.errors += 1;
    speaker.cut = capped && speaker.lines >= CAP;
    speakers.set(line.service, speaker);
  }
  const rank = (service: string) =>
    order.includes(service) ? order.indexOf(service) : order.length;
  return {
    id,
    at,
    lines,
    speakers: [...speakers.values()].sort(
      (a, b) => rank(a.service) - rank(b.service),
    ),
  };
}

/**
 * Each read of the output on record, newest first. The record keeps every
 * read after a marker, followed by whatever the deployment printed next;
 * a read ends at the first line Compose didn't print for a process.
 */
function readCollections(
  record: DeploymentRecord | null,
  facts: ApplicationFacts,
  operations: ApplicationOperation[],
  names: Map<string, string>,
  order: string[],
): Collection[] {
  const snapshot = facts.logs?.snapshot;
  if (snapshot)
    return [
      collectionOf(
        "read-0",
        snapshot.at,
        snapshot.lines.filter((line) => line.trim()),
        snapshot.service,
        names,
        order,
        false,
      ),
    ];
  const parts = (record?.logs ?? "").split(MARKER).slice(1);
  const times = operations
    .filter((op) => op.source.type === "logs")
    .map(settledAt)
    .sort();
  const reads: Collection[] = [];
  parts.forEach((part, index) => {
    const fromEnd = parts.length - 1 - index;
    const at =
      fromEnd === 0
        ? (record?.logsCollectedAt ?? times.at(-1) ?? null)
        : (times.at(-1 - fromEnd) ?? null);
    if (!at) return;
    const rows: string[] = [];
    for (const row of part.split("\n")) {
      if (!row.trim()) continue;
      if (!prefixed.test(row)) break;
      rows.push(row);
    }
    reads.push(
      collectionOf(`read-${index}`, at, rows, "output", names, order, true),
    );
  });
  return reads.reverse();
}

/** The "Prometheus failing" scenario's watcher: invented, and labelled so. */
function inventedWatch(story: StackStory, now: number): MonitoringFacts {
  const at = new Date(now - 4 * 60_000).toISOString();
  const web =
    story.processes.find((item) => item.role === "web") ?? story.processes[0];
  const other = story.processes.find((item) => item !== web);
  return {
    collector: {
      state: "running",
      lastObservationAt: at,
      hostReachable: true,
      detail: "A collector on the host checks every minute (invented)",
    },
    checks: [
      ...(web
        ? [
            {
              id: "web",
              name: `${web.product} responds`,
              kind: "http" as const,
              target: web.health?.replace(/^GET /, "") ?? "/",
              state: "passing" as const,
              lastAt: at,
              detail: "Answered 200 in 41 ms",
            },
          ]
        : []),
      ...(other
        ? [
            {
              id: "service",
              name: `${other.product} readiness`,
              kind: "process" as const,
              target: other.name,
              state: "failing" as const,
              lastAt: at,
              detail: `${other.health?.replace(/^GET /, "") ?? "Its health check"} timed out after 5 s, three times in a row`,
            },
          ]
        : []),
    ],
    resources: null,
    issues: [],
    providers: [],
  };
}

/** Verified green needs evidence under a day old. */
export const toneOf = (at: string | null, now: number): Tone =>
  !at ? "planned" : now - Date.parse(at) < FRESH_MS ? "verified" : "stale";

export function buildSignalStory(input: {
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  /** The bar's invented scenario: a watcher that finds a failing check. */
  invent: boolean;
}): SignalStory {
  const base = buildStackStory(input);
  const { record, operations, now, invent } = input;
  const facts: ApplicationFacts = invent
    ? { ...input.facts, monitoring: inventedWatch(base, now) }
    : input.facts;
  const names = new Map(
    base.processes.map((item) => [item.name, item.product]),
  );
  const order = base.processes.map((item) => item.name);
  const collections = readCollections(record, facts, operations, names, order);
  const events = record?.events ?? [];
  const said = (message: string) =>
    events
      .filter((event) => event.message === message)
      .map((event) => ({ at: event.at, text: event.message }));
  const shortOf = (name: string, product: string) =>
    cap(name.replace(new RegExp(`^${escape(product)}\\s+(is\\s+)?`, "i"), ""));

  // ---- What a watcher on the host checks, when one exists.
  const monitoring = facts.monitoring;
  const web = base.processes.find((item) => item.role === "web");
  const watched: Look[] = (monitoring?.checks ?? []).map((check) => {
    const process =
      base.processes.find((item) => item.name === check.target) ??
      (check.kind === "http" ? web : undefined);
    const part = process?.product ?? cap(check.kind);
    return {
      id: `watch:${check.id}`,
      part,
      name: check.name,
      short: shortOf(check.name, part),
      how:
        check.kind === "http"
          ? `GET ${check.target}`
          : `${cap(check.kind)} check on ${check.target}`,
      kind: "check",
      at: check.lastAt ?? null,
      state: check.state,
      detail: check.detail,
      evidence: check.lastAt ? [{ at: check.lastAt, text: check.detail }] : [],
      invented: invent,
    };
  });

  // ---- The checks each process passed, as the deployment recorded them.
  const checks: Look[] = base.processes.flatMap((process) =>
    process.probes.map((probe): Look => {
      const path = probe.probe.replace(/^GET /, "").split(" ")[0];
      return {
        id: `check:${process.name}:${probe.name}`,
        part: process.product,
        name: probe.name,
        short: shortOf(probe.name, process.product),
        how: probe.probe,
        kind: "check",
        at: probe.at,
        state: probe.at ? "passing" : "unknown",
        detail: null,
        evidence: said(
          probe.inside
            ? `Verified private ${process.name}: ${path}`
            : `Passed: ${probe.name}`,
        ),
        invented: false,
      };
    }),
  );

  // ---- The newest read of each process's output.
  const newest = collections[0];
  const outputs: Look[] = (newest?.speakers ?? []).map((speaker) => ({
    id: `output:${speaker.service}`,
    part: speaker.name,
    name: `${speaker.name}'s output`,
    short: "Output read",
    how: speaker.cut
      ? `Its last ${CAP} lines`
      : `All ${speaker.lines} ${speaker.lines === 1 ? "line" : "lines"} it had written`,
    kind: "output",
    at: newest.at,
    state: "seen",
    detail:
      [
        speaker.warns
          ? `${speaker.warns} ${speaker.warns === 1 ? "warning" : "warnings"}`
          : "No warnings",
        speaker.errors
          ? `${speaker.errors} ${speaker.errors === 1 ? "error" : "errors"}`
          : "no errors",
      ].join(" and ") + " in what was read.",
    evidence: collections.toReversed().map((read) => ({
      at: read.at,
      text: `Read ${read.speakers.find((item) => item.service === speaker.service)?.lines ?? 0} lines`,
    })),
    invented: false,
  }));

  // ---- The copies off the server and the restore test, which look at the
  // data rather than the running application.
  const guard = base.protection;
  const backups: Look[] = [
    ...(guard.backup
      ? [
          {
            id: "backup",
            part: "Backups",
            name: "Newest copy off the server",
            short: "Copy verified",
            how: "A copy off the server, verified when it was made",
            kind: "backup" as const,
            at: guard.backup.at,
            state: "passing" as const,
            detail: guard.backup.detail,
            evidence: [{ at: guard.backup.at, text: guard.backup.detail }],
            invented: false,
          },
        ]
      : []),
    ...(guard.restore
      ? [
          {
            id: "restore",
            part: "Backups",
            name: "Restore test",
            short: "Restore tested",
            how: "A copy restored into an isolated place",
            kind: "backup" as const,
            at: guard.restore.at,
            state: "passing" as const,
            detail: guard.restore.detail,
            evidence: [{ at: guard.restore.at, text: guard.restore.detail }],
            invented: false,
          },
        ]
      : []),
  ];
  const looks = [...watched, ...checks, ...outputs, ...backups];

  // ---- What nothing watches.
  const watching = monitoring?.collector.state === "running";
  const unwatched: Unwatched[] = [
    ...(watching
      ? []
      : [
          {
            id: "watch",
            part: null,
            title: "Health watch and restarts",
            short: "Health watch",
            detail:
              base.processGaps.find((gap) => gap.id === "watch")?.detail ??
              "Not set up.",
          },
        ]),
    ...base.processes
      .filter(
        (process) =>
          !looks.some(
            (look) => look.part === process.product && look.kind === "check",
          ),
      )
      .map((process) => ({
        id: `unchecked:${process.name}`,
        part: process.product,
        title: `No check for ${process.product}`,
        short: "No checks",
        detail: "The deployment recorded no check for it.",
      })),
    ...(monitoring?.resources || facts.storage?.hostDisk
      ? []
      : [
          {
            id: "resources",
            part: "Server",
            title: "CPU and memory",
            short: "CPU & memory",
            detail: "Not measured. Nothing samples the server's CPU or memory.",
          },
          {
            id: "disk",
            part: "Server",
            title: "Disk space",
            short: "Disk",
            detail:
              "Not measured. Nothing checks how full the server's disk is.",
          },
        ]),
    ...(monitoring?.providers.length
      ? []
      : [
          {
            id: "notify",
            part: "You",
            title: "Alerts outside the app",
            short: "Outside the app",
            detail:
              "No provider is connected, so nothing can reach you outside the app.",
          },
        ]),
  ];

  const products = [
    ...(web ? [web.product] : []),
    ...base.processes
      .filter((item) => item !== web)
      .map((item) => item.product),
  ];
  const parts = [
    ...new Set([
      ...products,
      ...looks.map((look) => look.part),
      ...unwatched.flatMap((gap) => (gap.part ? [gap.part] : [])),
    ]),
  ];
  const lastCheckAt =
    looks
      .filter((look) => look.kind === "check" && look.at)
      .map((look) => look.at!)
      .sort()
      .at(-1) ?? null;

  return {
    ...base,
    collections,
    looks,
    lastCheckAt,
    watcher: monitoring?.collector ?? null,
    unwatched,
    parts,
  };
}
