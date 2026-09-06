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
try {
  const current = database.pragma("user_version", { simple: true });
  if (current !== 0 && current !== version)
    throw new Error(
      `Refusing to stamp schema ${current} as ${version}. Existing data is unchanged.`,
    );
  database.pragma(`user_version = ${version}`);
} finally {
  database.close();
}
