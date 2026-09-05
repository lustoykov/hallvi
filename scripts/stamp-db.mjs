import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(
  readFileSync(
    new URL("../src/server/schema-version.json", import.meta.url),
    "utf8",
  ),
);
const databasePath =
  process.env.SERVER_GUY_DB_PATH ??
  join(process.cwd(), ".server-guy", "server-guy.db");
const database = new Database(databasePath);
database.pragma(`user_version = ${version}`);
database.close();
