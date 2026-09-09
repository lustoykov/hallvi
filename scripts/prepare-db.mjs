// Stop the app and worker before upgrading. Known schemas are backed up before
// migration; unknown schemas require investigation, never an automatic reset.
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { migrateChatOwnership } from "./migrate-chat-ownership.mjs";

const path =
  process.env.SERVER_GUY_DB_PATH ??
  join(process.cwd(), ".server-guy", "server-guy.db");
const { version } = JSON.parse(
  readFileSync(
    new URL("../src/server/schema-version.json", import.meta.url),
    "utf8",
  ),
);
const UPGRADABLE_VERSIONS = [6, 8, 9, 10, 11];
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
        `Schema ${current} has no supported migration to ${version}. Stop the app and worker and preserve the database, WAL and recovery material for inspection. No migration or reset was attempted.`,
      );
    // Preserve an online-consistent SQLite snapshot, including WAL content.
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
    migrateChatOwnership(database);
    // Drizzle v10 used a separate index, so removing source uniqueness needs
    // no application-table rebuild and cannot cascade into dependent records.
    database.exec("DROP INDEX IF EXISTS applications_repository_url_unique");
    if (database.pragma("foreign_key_check").length)
      throw new Error(
        "Database has invalid references. Stop and inspect the backup before continuing.",
      );
  }
} finally {
  database.close();
}
