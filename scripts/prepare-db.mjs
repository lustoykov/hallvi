// Prototype schema v6 remains current; never drop v7 branch diagnostics.
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
  if (current === 7)
    throw new Error(
      "Schema 7 is runtime-compatible with this version. Its legacy reply_execution_history table is preserved. db:push is refused because Drizzle would drop that historical data. No schema or data was changed.",
    );
  if (populated && current !== version)
    throw new Error(
      `Prototype schema ${current} is incompatible with ${version}. Stop the app and worker, move aside the disposable database and its -wal/-shm files, then run npm run db:push. Keep credentials and tests/results. No migration was attempted.`,
    );
} finally {
  database.close();
}
