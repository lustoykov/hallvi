import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

let databaseDirectory: string | null = null;

afterEach(() => {
  globalThis.__serverGuyDb?.close();
  delete globalThis.__serverGuyDb;
  delete process.env.SERVER_GUY_DB_PATH;
  if (databaseDirectory) rmSync(databaseDirectory, { recursive: true, force: true });
  databaseDirectory = null;
});

describe("operator record schema", () => {
  it("refuses to open a record written by an older schema", async () => {
    databaseDirectory = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
    const databasePath = join(databaseDirectory, "old.db");
    const older = new Database(databasePath);
    older.exec("CREATE TABLE applications (id TEXT PRIMARY KEY)");
    older.close();

    process.env.SERVER_GUY_DB_PATH = databasePath;
    vi.resetModules();
    const database = await import("../src/server/db");

    expect(() => database.db()).toThrow("older Server Guy schema");
  });
});
