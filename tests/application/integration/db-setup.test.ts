import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pushTestDatabase } from "../../test-database";
import schemaVersion from "../../../src/server/schema-version.json";

it("initializes a fresh prototype database and can push its current schema again", () => {
  const root = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
  const path = join(root, "test.db");
  try {
    pushTestDatabase(path);
    pushTestDatabase(path);
    const database = new Database(path);
    try {
      expect(database.pragma("user_version", { simple: true })).toBe(
        schemaVersion.version,
      );
      expect(database.pragma("foreign_key_check")).toEqual([]);
    } finally {
      database.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);

it("upgrades a populated v6 database in place, keeping its rows and a backup", () => {
  const root = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
  const path = join(root, "v6.db");
  try {
    pushTestDatabase(path);
    const current = new Database(path);
    current.exec(
      `INSERT INTO applications (id, name, repository_url, repository_owner, repository_name, environment, approval_mode, approval_scope, created_at, updated_at) VALUES ('app', 'app', 'https://github.com/qa/app', 'qa', 'app', 'production', 'pi-decides', 'scope', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
       INSERT INTO phase_workspaces (id, application_id, phase_key, created_at) VALUES ('ws', 'app', 'start', '2026-09-01T00:00:00Z');
       DROP TABLE application_contracts;
       ALTER TABLE phase_workspaces DROP COLUMN completed_at;
       ALTER TABLE phase_workspaces DROP COLUMN deliverable_evidence;
       PRAGMA user_version = 6;`,
    );
    current.close();
    pushTestDatabase(path);
    const upgraded = new Database(path, { readonly: true });
    try {
      expect(upgraded.pragma("user_version", { simple: true })).toBe(
        schemaVersion.version,
      );
      expect(
        upgraded.prepare("SELECT id, completed_at FROM phase_workspaces").all(),
      ).toEqual([{ id: "ws", completed_at: null }]);
      expect(
        upgraded
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'application_contracts'",
          )
          .get(),
      ).toEqual({ name: "application_contracts" });
      expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    } finally {
      upgraded.close();
    }
    expect(
      readdirSync(root).some((name) =>
        new RegExp(`\\.pre-v${schemaVersion.version}-.*\\.backup$`).test(name),
      ),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

it("upgrades a populated v8 database in place by adding the Phase 3 tables", () => {
  const root = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
  const path = join(root, "v8.db");
  try {
    pushTestDatabase(path);
    const current = new Database(path);
    current.exec(
      `INSERT INTO applications (id, name, repository_url, repository_owner, repository_name, environment, approval_mode, approval_scope, created_at, updated_at) VALUES ('app', 'app', 'https://github.com/qa/app', 'qa', 'app', 'production', 'pi-decides', 'scope', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
       DROP TABLE conformance_proposals;
       DROP TABLE conformance_runs;
       DROP TABLE acceptance_checks;
       DROP TABLE publication_grants;
       PRAGMA user_version = 8;`,
    );
    current.close();
    pushTestDatabase(path);
    const upgraded = new Database(path, { readonly: true });
    try {
      expect(upgraded.pragma("user_version", { simple: true })).toBe(
        schemaVersion.version,
      );
      expect(upgraded.prepare("SELECT id FROM applications").all()).toEqual([
        { id: "app" },
      ]);
      expect(
        upgraded
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('conformance_proposals', 'conformance_runs', 'acceptance_checks', 'publication_grants') ORDER BY name",
          )
          .all(),
      ).toEqual([
        { name: "acceptance_checks" },
        { name: "conformance_proposals" },
        { name: "conformance_runs" },
        { name: "publication_grants" },
      ]);
      expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    } finally {
      upgraded.close();
    }
    expect(
      readdirSync(root).some((name) =>
        new RegExp(`\\.pre-v${schemaVersion.version}-.*\\.backup$`).test(name),
      ),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

it.each([0, 4, 5, 7])(
  "rejects an existing v%s database without migrating or deleting its data",
  (version) => {
    const root = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
    const path = join(root, "old.db");
    try {
      const old = new Database(path);
      old.exec(
        `CREATE TABLE example (body TEXT); INSERT INTO example VALUES ('Keep until explicit reset'); PRAGMA user_version = ${version};`,
      );
      old.close();
      expect(() => pushTestDatabase(path)).toThrow();
      const unchanged = new Database(path, { readonly: true });
      try {
        expect(unchanged.pragma("user_version", { simple: true })).toBe(
          version,
        );
        expect(unchanged.prepare("SELECT body FROM example").get()).toEqual({
          body: "Keep until explicit reset",
        });
      } finally {
        unchanged.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  20_000,
);

it("adds preview and preparation tables to v9 without replacing application records", () => {
  const root = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
  const path = join(root, "v9.db");
  try {
    pushTestDatabase(path);
    const previous = new Database(path);
    previous.exec(
      `INSERT INTO applications (id, name, repository_url, repository_owner, repository_name, environment, approval_mode, approval_scope, created_at, updated_at) VALUES ('app', 'app', 'https://github.com/qa/app', 'qa', 'app', 'production', 'pi-decides', 'scope', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'); DROP TABLE application_operations; DROP TABLE application_previews; DROP TABLE preparation_branches; PRAGMA user_version = 9;`,
    );
    previous.close();
    pushTestDatabase(path);
    const upgraded = new Database(path, { readonly: true });
    try {
      expect(upgraded.prepare("SELECT id FROM applications").all()).toEqual([
        { id: "app" },
      ]);
      expect(
        upgraded
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('application_previews', 'preparation_branches', 'application_operations')",
          )
          .all(),
      ).toHaveLength(3);
      expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    } finally {
      upgraded.close();
    }
    expect(
      readdirSync(root).some((name) =>
        name.includes(`.pre-v${schemaVersion.version}-`),
      ),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);
