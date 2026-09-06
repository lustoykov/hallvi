// Only the explicit v6 -> v7 reply-history move is supported in place.
// Stop the app and worker before db:push; stamp-db completes the data move.
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
  if (populated && current !== version && !(current === 6 && version === 7))
    throw new Error(
      `Prototype schema ${current} is incompatible with ${version}. Stop the app and worker, move aside the disposable database and its -wal/-shm files, then run npm run db:push. Keep credentials and tests/results. No migration was attempted.`,
    );
} finally {
  database.close();
}
