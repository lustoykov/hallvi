import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { pushTestDatabase } from "../../test-database";

// An existing installation's database is upgraded in place with the original
// kept beside it. `schema-15.sql` is the schema main had before conversations
// moved onto Pi's AgentHarness, taken from a real database, without its data.

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-upgrade-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const shape = (path: string) => {
  const database = new Database(path, { readonly: true });
  try {
    return database
      .prepare(
        "SELECT m.name AS t, p.name AS c, p.type, p.\"notnull\" AS n, p.dflt_value AS d FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY 1, 2",
      )
      .all()
      .concat(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY 1",
          )
          .all(),
      );
  } finally {
    database.close();
  }
};

it("upgrades a schema-15 database without rewriting anything in it, and leaves the original for rollback", () => {
  const path = join(root, "hallvi.db");
  const old = new Database(path);
  old.exec(readFileSync("tests/fixtures/schema-15.sql", "utf8"));
  old.exec(`
    INSERT INTO applications (id, name, repository_url, repository_owner, repository_name, permission_mode, created_at, updated_at)
      VALUES ('app', 'shop', 'https://github.com/qa/shop', 'qa', 'shop', 'pi-decides', 't', 't');
    INSERT INTO conversations (id, application_id, title, kind, status, current_response_id, native_session_id, created_at, updated_at)
      VALUES ('chat', 'app', 'Main', 'main', 'working', 'a2', 'native-1', 't', 't');
    INSERT INTO messages (id, conversation_id, role, body, source, status, response_to, request_key, created_at, updated_at) VALUES
      ('u1', 'chat', 'user', 'Deploy it', 'user', 'completed', NULL, NULL, 't1', 't1'),
      ('a1', 'chat', 'assistant', 'Deployed.', 'pi', 'completed', 'u1', 'k1', 't2', 't2'),
      ('u2', 'chat', 'user', 'Check it', 'user', 'completed', NULL, NULL, 't3', 't3'),
      ('a2', 'chat', 'assistant', 'Checking', 'pi', 'running', 'u2', 'k2', 't4', 't4'),
      ('u3', 'chat', 'user', 'Then publish it', 'user', 'completed', NULL, NULL, 't5', 't5'),
      ('a3', 'chat', 'assistant', '', 'pi', 'queued', 'u3', 'k3', 't6', 't6');
  `);
  old.pragma("user_version = 15");
  old.close();

  const run = () =>
    execFileSync(process.execPath, ["scripts/upgrade-db.mjs"], {
      env: { ...process.env, HALLVI_DB_PATH: path },
      encoding: "utf8",
    });
  expect(run()).toContain("from schema 15 to 18");
  expect(run()).toContain("Nothing to do");

  // Everything a new installation has is there. What conversations used to
  // keep in the database stays too, unread: Pi holds them now.
  const fresh = join(root, "fresh.db");
  pushTestDatabase(fresh);
  const have = shape(path).map((each) => JSON.stringify(each));
  for (const needed of shape(fresh))
    expect(have).toContain(JSON.stringify(needed));

  const upgraded = new Database(path, { readonly: true });
  expect(
    upgraded
      .prepare("SELECT id, status, body FROM messages ORDER BY created_at")
      .all(),
  ).toEqual([
    { id: "u1", status: "completed", body: "Deploy it" },
    { id: "a1", status: "completed", body: "Deployed." },
    { id: "u2", status: "completed", body: "Check it" },
    { id: "a2", status: "running", body: "Checking" },
    { id: "u3", status: "completed", body: "Then publish it" },
    { id: "a3", status: "queued", body: "" },
  ]);
  expect(
    upgraded.prepare("SELECT native_session_id FROM conversations").get(),
  ).toEqual({ native_session_id: "native-1" });
  upgraded.close();

  // Rollback is putting this file back: it is the database as it was.
  const original = new Database(`${path}.before-v18`, { readonly: true });
  expect(original.pragma("user_version", { simple: true })).toBe(15);
  expect(original.prepare("SELECT count(*) AS n FROM messages").get()).toEqual({
    n: 6,
  });
  original.close();
  // And a second upgrade never overwrites it.
  const again = new Database(path);
  again.pragma("user_version = 15");
  again.close();
  expect(run).toThrow(/rollback copy and is never overwritten/);
});
