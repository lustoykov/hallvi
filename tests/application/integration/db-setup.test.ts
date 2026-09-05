import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
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

it.each([0, 4, 5])(
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
