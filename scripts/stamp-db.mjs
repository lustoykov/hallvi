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
  database.pragma("foreign_keys = ON");
  database
    .transaction(() => {
      const current = database.pragma("user_version", { simple: true });
      if (
        current !== 0 &&
        current !== version &&
        !(current === 6 && version === 7)
      )
        throw new Error(
          `Cannot stamp prototype schema ${current} as ${version}.`,
        );
      if (current === 6 && version === 7) {
        // Drizzle added the table. Copy payloads byte-for-byte, including
        // timings, saved Decision links and trace references. Do not skip or
        // overwrite conflicting/orphaned rows: failures retain the source
        // data and version so this command can be retried after repair.
        database.exec(`
        INSERT INTO reply_execution_history (run_id, detail)
          SELECT id, detail FROM activity_events WHERE kind = 'chat-execution';
        DELETE FROM activity_events WHERE kind = 'chat-execution';
      `);
      }
      database.pragma(`user_version = ${version}`);
    })
    .immediate();
} finally {
  database.close();
}
