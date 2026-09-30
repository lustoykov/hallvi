// Named Traffic operations run on a dedicated database thread. A lock on
// traffic.db must not occupy the thread serving Hallvi's main records.
import { dirname, join } from "node:path";
import { DatabaseClient } from "../database-client";
import { databasePath } from "../database-path";
import type { operations } from "./database-store";

declare global {
  var __hallviTraffic:
    { path: string; client: DatabaseClient<typeof operations> } | undefined;
}

export function trafficDatabasePath() {
  return join(dirname(databasePath()), "traffic.db");
}

async function client() {
  const path = databasePath();
  const current = globalThis.__hallviTraffic;
  if (current?.path === path) return current.client;
  if (current) await current.client.close();
  const opened = new DatabaseClient<typeof operations>(
    path,
    () => {
      console.error(
        "The Traffic database worker stopped unexpectedly. Restart Hallvi; pending database outcomes are unknown.",
      );
      process.exit(1);
    },
    "traffic-worker",
  );
  globalThis.__hallviTraffic = { path, client: opened };
  return opened;
}

export async function closeTrafficDatabase() {
  const current = globalThis.__hallviTraffic;
  if (current) {
    await current.client.close();
    if (globalThis.__hallviTraffic === current)
      delete globalThis.__hallviTraffic;
  }
}

function operation<K extends keyof typeof operations>(name: K) {
  return async (
    ...args: Parameters<(typeof operations)[K]>
  ): Promise<Awaited<ReturnType<(typeof operations)[K]>>> =>
    (await client()).call(name, args);
}

export const readDays = operation("readDays");
export const writeDay = operation("writeDay");
export const collectionOf = operation("collectionOf");
export const setCollection = operation("setCollection");
export const keepByDefault = operation("keepByDefault");
export const recordCollector = operation("recordCollector");
export const forget = operation("forget");
export const backupTrafficDatabase = operation("backupTrafficDatabase");
