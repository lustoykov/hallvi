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

import { retainedRefusal } from "../../../scripts/retained-state.mjs";
import { databasePath } from "../db";
import type { Collection, TrafficDay } from "./contract";
import { coveredMs, dayBounds } from "./days";

declare global {
  var __hallviTraffic: { path: string; client: Database.Database } | undefined;
}

export function trafficDatabasePath() {
  return join(dirname(databasePath()), "traffic.db");
}

function store() {
  const path = trafficDatabasePath();
  const open = globalThis.__hallviTraffic;
  if (open?.path === path) return open.client;
  // The same rule as hallvi.db: a retained application's state is opened by
  // the runtime attached to it, and by nothing else.
  const refusal = retainedRefusal(databasePath());
  if (refusal) throw new Error(refusal);
  mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma("journal_mode = WAL");
  client.pragma("busy_timeout = 5000");
  client.exec(`
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
  open?.client.close();
  globalThis.__hallviTraffic = { path, client };
  return client;
}

function coveredOf(day: TrafficDay) {
  const { start, end } = dayBounds(day.day, day.timeZone);
  return coveredMs(day.coverage, start, end);
}

/** Stored days from `fromDay` to `toDay`, both included, oldest first. */
export function readDays(
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
export function writeDay(applicationId: string, day: TrafficDay) {
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
export function collectionOf(applicationId: string): Collection {
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
export function setCollection(applicationId: string, choice: "keep" | "stop") {
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
 * What the collector saw, merged into the record. Nothing is recorded while
 * collection is off: a collector that has not stopped yet cannot say it is
 * live, nor bring back the record of an application that was removed.
 */
export function recordCollector(
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
 * straight back.
 */
export function forget(applicationId: string) {
  if (!existsSync(trafficDatabasePath())) return;
  const client = store();
  client.transaction(() => {
    client
      .prepare("DELETE FROM days WHERE application_id = ?")
      .run(applicationId);
    client
      .prepare("DELETE FROM collections WHERE application_id = ?")
      .run(applicationId);
  })();
}
