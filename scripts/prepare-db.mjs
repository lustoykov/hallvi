import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { retainedRefusal } from "./retained-state.mjs";
import { stateLocation } from "./state-location.mjs";
const path =
  process.env.HALLVI_DB_PATH ??
  stateLocation(process.cwd(), { hidden: true }).database;
const { version } = JSON.parse(
  readFileSync(
    new URL("../src/server/schema-version.json", import.meta.url),
    "utf8",
  ),
);
const refusal = retainedRefusal(path);
if (refusal) throw new Error(refusal);
mkdirSync(dirname(path), { recursive: true });
const database = new Database(path);
try {
  const current = database.pragma("user_version", { simple: true });
  const populated = database
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    )
    .get();
  if (populated && current !== version)
    throw new Error(
      `Schema ${current} is not ${version}. db:push never alters existing data. Stop the app and worker; a supported schema is migrated in place, with a verified copy kept first, by npm run db:upgrade.`,
    );
} finally {
  database.close();
}
