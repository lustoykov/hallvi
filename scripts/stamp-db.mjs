import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(
  readFileSync(
    new URL("../src/server/schema-version.json", import.meta.url),
    "utf8",
  ),
);
const STAMPABLE_VERSIONS = [0, version];
const databasePath =
  process.env.SERVER_GUY_DB_PATH ??
  join(process.cwd(), ".server-guy", "server-guy.db");
const database = new Database(databasePath);
try {
  const current = database.pragma("user_version", { simple: true });
  if (!STAMPABLE_VERSIONS.includes(current))
    throw new Error(
      `Refusing to stamp schema ${current} as ${version}. Existing data is unchanged.`,
    );
  database.pragma(`user_version = ${version}`);
} finally {
  database.close();
}
