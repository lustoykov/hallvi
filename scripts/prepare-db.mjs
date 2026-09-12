import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
const path =
  process.env.SERVER_GUY_DB_PATH ??
  join(process.cwd(), ".server-guy", "server-guy.db");
const { version } = JSON.parse(
  readFileSync(
    new URL("../src/server/schema-version.json", import.meta.url),
    "utf8",
  ),
);
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
      `Schema ${current} is retired. Stop the app and worker and initialize a fresh development database. No compatibility migration is provided.`,
    );
} finally {
  database.close();
}
