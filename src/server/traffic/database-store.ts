// traffic.db: the day totals and the collection record, beside hallvi.db.
//
// A file of its own, so hallvi.db and its schema stay exactly as they are and
// counting can write every few seconds without touching the records the rest
// of Hallvi reads. Nothing in it identifies a visitor: a day is counts and
// the keys of its lists. The tables are made on open; there is nothing to
// migrate, and a day that no longer reads is recounted from the log.

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  keepRuntimeOpen,
  readMark,
  retainedRefusal,
} from "../../../scripts/retained-state.mjs";
import type { Collection, TrafficDay } from "./contract";
import { coveredMs, dayBounds } from "./days";

let controllerPath: string;
let client: Database.Database | undefined;
let runtimeHold: { release(): void } | undefined;

export function openTrafficDatabase(path: string) {
  const refusal = retainedRefusal(path);
  if (refusal) throw new Error(refusal);
  controllerPath = path;
  if (readMark(dirname(path))) runtimeHold = keepRuntimeOpen(dirname(path));
}

export function closeTrafficDatabase() {
  client?.close();
  runtimeHold?.release();
}

function trafficDatabasePath() {
  return join(dirname(controllerPath), "traffic.db");
}

function store() {
  const path = trafficDatabasePath();
  if (client) return client;
  mkdirSync(dirname(path), { recursive: true });
  const opened = new Database(path);
  try {
    opened.pragma("journal_mode = WAL");
    opened.pragma("busy_timeout = 5000");
    opened.exec(`
    CREATE TABLE IF NOT EXISTS days (
      application_id TEXT NOT NULL,
      day TEXT NOT NULL,
      final INTEGER NOT NULL,
      covered_ms INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (application_id, day)
    );
    CREATE TABLE IF NOT EXISTS collections (
      application_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);
    client = opened;
    return client;
  } catch (error) {
    opened.close();
    throw error;
  }
}

function coveredOf(day: TrafficDay) {
  const { start, end } = dayBounds(day.day, day.timeZone);
  return coveredMs(day.coverage, start, end);
}

/** Stored days from `fromDay` to `toDay`, both included, oldest first. */
function readDays(
  applicationId: string,
  fromDay: string,
  toDay: string,
): TrafficDay[] {
  if (!existsSync(trafficDatabasePath())) return [];
  return (
    store()
      .prepare(
        "SELECT data FROM days WHERE application_id = ? AND day >= ? AND day <= ? ORDER BY day",
      )
      .all(applicationId, fromDay, toDay) as { data: string }[]
  ).map((row) => JSON.parse(row.data) as TrafficDay);
}

/**
 * Stores a day in place of the one kept for its date, when it should be
 * kept instead: nothing is stored yet, the stored one is provisional, or
 * this one is final and covers at least as much of the day. A provisional
 * count never replaces a final one, and nothing is ever added to a stored
 * number. Nothing is written while collection is off — a count still
 * running when the owner stopped it, or after they deleted the totals,
 * must not bring any back. Answers whether it stored the day.
 */
function writeDay(applicationId: string, day: TrafficDay) {
  if (!existsSync(trafficDatabasePath())) return false;
  const covered = coveredOf(day);
  const client = store();
  return client
    .transaction(() => {
      // The web process can stop or forget while the worker is counting.
      // Acquire the write lock before reading its choice, not after it.
      if (!recorded(applicationId).enabledAt) return false;
      const kept = client
        .prepare(
          "SELECT final, covered_ms FROM days WHERE application_id = ? AND day = ?",
        )
        .get(applicationId, day.day) as
        { final: number; covered_ms: number } | undefined;
      if (kept?.final && !(day.final && covered >= kept.covered_ms))
        return false;
      client
        .prepare(
          "INSERT OR REPLACE INTO days (application_id, day, final, covered_ms, data) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          applicationId,
          day.day,
          day.final ? 1 : 0,
          Math.round(covered),
          JSON.stringify(day),
        );
      return true;
    })
    .immediate();
}

type Recorded = Omit<Collection, "storedFrom" | "logMisses">;

const NEVER: Recorded = {
  enabledAt: null,
  disabledAt: null,
  state: "off",
  detail: null,
  lastLineAt: null,
  oldestRetainedAt: null,
  scriptSince: null,
  scriptSilentSince: null,
  source: null,
};

function recorded(applicationId: string): Recorded {
  if (!existsSync(trafficDatabasePath())) return NEVER;
  const row = store()
    .prepare("SELECT data FROM collections WHERE application_id = ?")
    .get(applicationId) as { data: string } | undefined;
  return row
    ? { ...NEVER, ...(JSON.parse(row.data) as Partial<Recorded>) }
    : NEVER;
}

function save(applicationId: string, collection: Recorded) {
  store()
    .prepare(
      "INSERT OR REPLACE INTO collections (application_id, data) VALUES (?, ?)",
    )
    .run(applicationId, JSON.stringify(collection));
}

/**
 * The owner's choice and what the collector last saw, with the first day
 * that has totals. What the log misses is not the store's to know: it takes
 * a CDN record as well, and `currentCollection` adds it.
 */
function collectionOf(applicationId: string): Collection {
  const stored = existsSync(trafficDatabasePath())
    ? (
        store()
          .prepare("SELECT min(day) AS day FROM days WHERE application_id = ?")
          .get(applicationId) as { day: string | null }
      ).day
    : null;
  return { ...recorded(applicationId), storedFrom: stored, logMisses: [] };
}

/**
 * Keep traffic history, or stop. Stopping keeps the totals and the facts;
 * the collector reads the choice and follows it.
 */
function setCollection(applicationId: string, choice: "keep" | "stop") {
  store()
    .transaction(() => {
      const current = recorded(applicationId);
      const at = new Date().toISOString();
      save(
        applicationId,
        choice === "keep"
          ? {
              ...current,
              enabledAt: current.enabledAt ?? at,
              disabledAt: null,
              // Until the collector says otherwise, it is starting to read.
              state: current.state === "off" ? "catching-up" : current.state,
            }
          : { ...current, enabledAt: null, disabledAt: at, state: "off" },
      );
    })
    .immediate();
  return collectionOf(applicationId);
}

/**
 * History is kept by default: the first time an application has a log to
 * read and nobody has chosen either way, it starts. Stop and Forget are
 * choices, and a choice is never overridden.
 */
function keepByDefault(applicationId: string) {
  let started = false;
  store()
    .transaction(() => {
      const current = recorded(applicationId);
      if (current.enabledAt || current.disabledAt) return;
      const at = new Date().toISOString();
      save(applicationId, { ...current, enabledAt: at, state: "catching-up" });
      started = true;
    })
    .immediate();
  return started;
}

/**
 * What the collector saw, merged into the record. Nothing is recorded while
 * collection is off: a collector that has not stopped yet cannot say it is
 * live, nor bring back the record of an application that was removed.
 */
function recordCollector(
  applicationId: string,
  seen: Partial<
    Pick<
      Collection,
      | "state"
      | "detail"
      | "lastLineAt"
      | "oldestRetainedAt"
      | "scriptSince"
      | "scriptSilentSince"
      | "source"
    >
  >,
) {
  if (!existsSync(trafficDatabasePath())) return collectionOf(applicationId);
  store()
    .transaction(() => {
      const current = recorded(applicationId);
      if (current.enabledAt) save(applicationId, { ...current, ...seen });
    })
    .immediate();
  return collectionOf(applicationId);
}

/**
 * Deletes an application's totals and its collection record. Collection
 * ends with them: a collector left running would count the retained log
 * straight back. What stays is that the owner stopped it, so the default
 * does not start it again.
 */
function forget(applicationId: string) {
  if (!existsSync(trafficDatabasePath())) return;
  const client = store();
  client.transaction(() => {
    client
      .prepare("DELETE FROM days WHERE application_id = ?")
      .run(applicationId);
    client
      .prepare("DELETE FROM collections WHERE application_id = ?")
      .run(applicationId);
    save(applicationId, { ...NEVER, disabledAt: new Date().toISOString() });
  })();
}

async function backupTrafficDatabase(target: string) {
  if (!existsSync(trafficDatabasePath())) return;
  await store().backup(target);
  const copy = new Database(target);
  try {
    copy.pragma("journal_mode = DELETE");
  } finally {
    copy.close();
  }
}

export const operations = {
  readDays,
  writeDay,
  collectionOf,
  setCollection,
  keepByDefault,
  recordCollector,
  forget,
  backupTrafficDatabase,
};
