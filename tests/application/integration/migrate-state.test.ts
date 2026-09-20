import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { pushTestDatabase } from "../../test-database";

// An existing controller's records are migrated in place, with a verified copy
// of exactly what the migration rewrites kept first. This is the one
// implementation: `npm run db:upgrade` runs it in development and `install.sh`
// runs it during an upgrade, which is the path the in-app updater takes.
// `schema-15.sql` is the schema main had before conversations moved onto Pi's
// AgentHarness, taken from a real database, without its data.

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

  const run = (...args: string[]) =>
    execFileSync(
      process.execPath,
      ["scripts/migrate-state.mjs", ...args, "--data", root],
      { encoding: "utf8" },
    );
  expect(run("--plan")).toContain("Schema 15 to 18");
  // A plan changes nothing, however often it is asked.
  expect(
    new Database(path, { readonly: true }).pragma("user_version", {
      simple: true,
    }),
  ).toBe(15);
  expect(run("--apply")).toContain("from schema 15 to 18");
  expect(run("--apply")).toContain("Nothing to do");

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

  // The copy taken first is the way back, and it holds only what the
  // migration said it would rewrite.
  const backups = readdirSync(join(root, "migrations"));
  expect(backups).toHaveLength(1);
  const kept = join(root, "migrations", backups[0]);
  expect(backups[0]).toContain("15-to-18");
  const manifest = JSON.parse(
    readFileSync(join(kept, "manifest.json"), "utf8"),
  );
  expect(manifest).toMatchObject({
    from: 15,
    to: 18,
    changes: ["the controller database"],
    copied: ["hallvi.db"],
  });
  expect(readdirSync(kept).sort()).toEqual(["hallvi.db", "manifest.json"]);

  const original = new Database(join(kept, "hallvi.db"), { readonly: true });
  expect(original.pragma("user_version", { simple: true })).toBe(15);
  expect(original.pragma("integrity_check", { simple: true })).toBe("ok");
  expect(original.prepare("SELECT count(*) AS n FROM messages").get()).toEqual({
    n: 6,
  });
  original.close();

  // Restoring is how you go back, because putting the old program back is not
  // a rollback once its database has been migrated under it.
  expect(run("--restore", kept)).toContain("to schema 15");
  const back = new Database(path, { readonly: true });
  expect(back.pragma("user_version", { simple: true })).toBe(15);
  expect(back.prepare("SELECT count(*) AS n FROM messages").get()).toEqual({
    n: 6,
  });
  back.close();
});

it("refuses a schema it has no migration for, and leaves it alone", () => {
  const data = mkdtempSync(join(tmpdir(), "hv-unknown-"));
  const made = new Database(join(data, "hallvi.db"));
  made.exec(readFileSync("tests/fixtures/schema-15.sql", "utf8"));
  made.pragma("user_version = 14");
  made.close();

  expect(() =>
    execFileSync(
      process.execPath,
      ["scripts/migrate-state.mjs", "--apply", "--data", data],
      { encoding: "utf8", stdio: "pipe" },
    ),
  ).toThrow(/no supported migration from schema 14/);

  // Untouched, and no half-made backup left looking like somewhere to go back
  // to.
  const after = new Database(join(data, "hallvi.db"), { readonly: true });
  expect(after.pragma("user_version", { simple: true })).toBe(14);
  after.close();
  expect(readdirSync(data).sort()).toEqual(["hallvi.db"]);
  rmSync(data, { recursive: true, force: true });
});
