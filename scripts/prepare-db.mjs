// Explicit additive v4/v5 -> v6 upgrade. Drizzle's SQLite table rebuild can
// fire ON DELETE cascades into domain records. Add columns in place first;
// Drizzle still owns the schema and creates any missing tables.
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const path =
  process.env.SERVER_GUY_DB_PATH ??
  join(process.cwd(), ".server-guy", "server-guy.db");
mkdirSync(dirname(path), { recursive: true });
const database = new Database(path);
try {
  const version = database.pragma("user_version", { simple: true });
  if (version === 4 || version === 5) {
    const backup = `${path}.pre-v6-${randomUUID()}.backup`;
    await database.backup(backup);
    chmodSync(backup, 0o600);
    console.log(`Preserved pre-upgrade database: ${backup}`);
    database
      .transaction(() => {
        const columns = database
          .prepare("PRAGMA table_info(messages)")
          .all()
          .map((column) => column.name);
        if (!columns.includes("status"))
          database.exec(
            "ALTER TABLE messages ADD COLUMN status text NOT NULL DEFAULT 'completed'",
          );
        if (!columns.includes("revision"))
          database.exec(
            "ALTER TABLE messages ADD COLUMN revision integer NOT NULL DEFAULT 0",
          );
        const chatColumns = database
          .prepare("PRAGMA table_info(chats)")
          .all()
          .map((column) => column.name);
        if (!chatColumns.includes("native_session_id"))
          database.exec("ALTER TABLE chats ADD COLUMN native_session_id text");
      })
      .immediate();
    if (database.pragma("foreign_key_check").length)
      throw new Error(
        "Database has invalid references. Stop and inspect the backup before continuing.",
      );
  }
} finally {
  database.close();
}
