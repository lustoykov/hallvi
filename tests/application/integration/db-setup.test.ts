import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  const root = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
  roots.push(root);
  return { root, path: join(root, name) };
}
const APPLICATION =
  "INSERT INTO applications (id, name, repository_url, repository_owner, repository_name, environment, approval_mode, approval_scope, created_at, updated_at) VALUES ('app', 'app', 'https://github.com/qa/app', 'qa', 'app', 'production', 'pi-decides', 'scope', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');";

/** An older release's schema: the v13 fixture with its later tables undone. */
function older(path: string, change: string) {
  const db = new Database(path);
  db.exec(readFileSync("tests/application/fixtures/schema-v13.sql", "utf8"));
  db.exec(APPLICATION);
  db.exec(change);
  db.close();
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
  "activity_events",
  "application_operations",
  "applications",
  "chat_summaries",
  "chats",
  "decisions",
  "deployments",
  "messages",
  "observations",
  "pi_runs",
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

it.each([
  [
    6,
    "INSERT INTO phase_workspaces (id, application_id, phase_key, created_at) VALUES ('ws', 'app', 'start', '2026-09-01T00:00:00Z'); DROP TABLE application_contracts; ALTER TABLE phase_workspaces DROP COLUMN completed_at; ALTER TABLE phase_workspaces DROP COLUMN deliverable_evidence;",
  ],
  [
    8,
    "DROP TABLE conformance_proposals; DROP TABLE conformance_runs; DROP TABLE acceptance_checks; DROP TABLE publication_grants;",
  ],
  [
    9,
    "DROP TABLE application_operations; DROP TABLE application_previews; DROP TABLE preparation_branches;",
  ],
])(
  "upgrades a populated v%s database in place to the current records, with a backup",
  (version, change) => {
    const { root, path } = temporary(`v${version}.db`);
    older(path, `${change} PRAGMA user_version = ${version};`);
    pushTestDatabase(path);
    const upgraded = new Database(path, { readonly: true });
    try {
      expect(upgraded.pragma("user_version", { simple: true })).toBe(
        schemaVersion.version,
      );
      expect(tables(upgraded)).toEqual(CURRENT_TABLES);
      expect(
        upgraded.prepare("SELECT id, name FROM applications").all(),
      ).toEqual([{ id: "app", name: "app" }]);
      expect(
        upgraded
          .prepare(
            "SELECT count(*) AS n FROM observations WHERE kind = 'retired-record'",
          )
          .get(),
      ).toEqual({ n: version === 6 ? 2 : 1 });
      expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    } finally {
      upgraded.close();
    }
    expect(
      readdirSync(root).some((name) =>
        new RegExp(`\\.pre-v${schemaVersion.version}-.*\\.backup$`).test(name),
      ),
    ).toBe(true);
  },
  30_000,
);

it.each([0, 4, 5, 7])(
  "rejects an existing v%s database without migrating or deleting its data",
  (version) => {
    const { path } = temporary("old.db");
    const old = new Database(path);
    old.exec(
      `CREATE TABLE example (body TEXT); INSERT INTO example VALUES ('Keep until explicit reset'); PRAGMA user_version = ${version};`,
    );
    old.close();
    expect(() => pushTestDatabase(path)).toThrow();
    const unchanged = new Database(path, { readonly: true });
    try {
      expect(unchanged.pragma("user_version", { simple: true })).toBe(version);
      expect(unchanged.prepare("SELECT body FROM example").get()).toEqual({
        body: "Keep until explicit reset",
      });
    } finally {
      unchanged.close();
    }
  },
  20_000,
);
