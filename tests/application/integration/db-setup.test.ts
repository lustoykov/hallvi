import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { pushTestDatabase } from "../../test-database";
import schemaVersion from "../../../src/server/schema-version.json";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function temporary(name: string) {
  const root = mkdtempSync(join(tmpdir(), "haldur-schema-"));
  roots.push(root);
  return { root, path: join(root, name) };
}
function tables(db: Database.Database) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => (row as { name: string }).name);
}
const CURRENT_TABLES = [
  "applications",
  "conversations",
  "messages",
  "saved_information",
];

it("initializes a fresh database and can push its current schema again", () => {
  const { path } = temporary("test.db");
  pushTestDatabase(path);
  pushTestDatabase(path);
  const database = new Database(path);
  try {
    expect(database.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
    expect(tables(database)).toEqual(CURRENT_TABLES);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  } finally {
    database.close();
  }
}, 20_000);
