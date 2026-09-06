// Development databases must match the current prototype schema. The only
// supported in-place change is the additive v6 → v8 upgrade below; every other
// prototype version, including the abandoned v7 history-table branch, needs an
// explicit fresh database.
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
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
const UPGRADABLE_VERSIONS = [6];
mkdirSync(dirname(path), { recursive: true });
const database = new Database(path);
try {
  const current = database.pragma("user_version", { simple: true });
  const populated = database
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    )
    .get();
  if (populated && current !== version) {
    if (!UPGRADABLE_VERSIONS.includes(current))
      throw new Error(
        `Prototype schema ${current} is incompatible with ${version}. Stop the app and worker, move aside the disposable database and its -wal/-shm files, then run npm run db:push. Keep credentials and tests/results. No migration was attempted.`,
      );
    // Additive v6 → v8 upgrade: back up first, add the workspace completion
    // columns in place, and let Drizzle create the new contracts table. A
    // Drizzle table rebuild could fire ON DELETE cascades into domain records.
    const backup = `${path}.pre-v${version}-${randomUUID()}.backup`;
    await database.backup(backup);
    chmodSync(backup, 0o600);
    console.log(`Preserved pre-upgrade database: ${backup}`);
    database
      .transaction(() => {
        const columns = database
          .prepare("PRAGMA table_info(phase_workspaces)")
          .all()
          .map((column) => column.name);
        if (!columns.includes("completed_at"))
          database.exec(
            "ALTER TABLE phase_workspaces ADD COLUMN completed_at text",
          );
        if (!columns.includes("deliverable_evidence"))
          database.exec(
            "ALTER TABLE phase_workspaces ADD COLUMN deliverable_evidence text",
          );
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
