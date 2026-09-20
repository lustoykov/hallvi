import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { pushTestDatabase } from "../../test-database";
import { discover } from "../../../scripts/release-source.mjs";
import { blockedReason } from "../../../scripts/update-start.mjs";

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

it("discovers a signed schema upgrade and keeps controller data beside the migrated database", async () => {
  const data = mkdtempSync(join(root, "signed-upgrade-"));
  const path = join(data, "hallvi.db");
  const database = new Database(path);
  database.exec(readFileSync("tests/fixtures/schema-15.sql", "utf8"));
  database.exec(`
    INSERT INTO applications (id, name, repository_url, repository_owner, repository_name, permission_mode, created_at, updated_at)
      VALUES ('app', 'Kept app', 'https://github.com/qa/shop', 'qa', 'shop', 'pi-decides', 't', 't');
    INSERT INTO conversations (id, application_id, title, kind, status, native_session_id, created_at, updated_at)
      VALUES ('chat', 'app', 'Main', 'main', 'idle', 'native-1', 't', 't');
  `);
  database.pragma("user_version = 15");
  database.close();

  const history = join(data, "pi-sessions", "app", "chat.jsonl");
  const credentials = join(data, "config", "credentials.json");
  mkdirSync(join(data, "pi-sessions", "app"), { recursive: true });
  mkdirSync(join(data, "config"));
  writeFileSync(history, '{"fixture":"history"}\n');
  writeFileSync(credentials, '{"fixture":"credential"}\n');
  const preserved = [history, credentials].map((file) => readFileSync(file));

  const program = join(data, "old-program");
  mkdirSync(join(program, "dist"), { recursive: true });
  writeFileSync(join(program, "dist", "schema-version.json"), '{"version":15}');
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const key = Buffer.from(publicKey.export({ type: "spki", format: "der" }))
    .subarray(-32)
    .toString("base64");
  const platform = process.platform === "darwin" ? "darwin-arm64" : "linux-x64";
  const manifest = Buffer.from(
    JSON.stringify({
      hallviRelease: 1,
      channel: "alpha",
      version: "0.2.0-alpha.1",
      revision: "a".repeat(40),
      schemaVersion: 18,
      migratesFrom: [15],
      releasedAt: "2026-09-20T09:00:00.000Z",
      notes: "https://github.com/lustoykov/hallvi/releases/tag/v0.2.0-alpha.1",
      packages: {
        [platform]: {
          file: `hallvi-0.2.0-alpha.1-${platform}.tgz`,
          url: `https://github.com/lustoykov/hallvi/releases/download/v0.2.0-alpha.1/hallvi-0.2.0-alpha.1-${platform}.tgz`,
          size: 100_000_000,
          sha256: "b".repeat(64),
        },
      },
    }),
  );
  const signature = sign(null, manifest, privateKey).toString("base64");
  const assets = ["hallvi-release.json", "hallvi-release.json.sig"].map(
    (name) => ({
      name,
      browser_download_url: `https://releases.test/${name}`,
    }),
  );
  const responses = new Map<string, string | Buffer>([
    [
      "https://releases.test/index",
      JSON.stringify([{ tag_name: "v0.2.0-alpha.1", draft: false, assets }]),
    ],
    ["https://releases.test/hallvi-release.json", manifest],
    ["https://releases.test/hallvi-release.json.sig", signature],
  ]);
  const candidate = await discover({
    source: "https://releases.test/index",
    env: { ...process.env, HALLVI_RELEASE_KEY: key },
    fetch: (async (url: string) => {
      const body = responses.get(url);
      return new Response(
        typeof body === "string" ? body : body ? new Uint8Array(body) : null,
      );
    }) as typeof fetch,
  });
  expect(candidate?.manifest).toMatchObject({
    schemaVersion: 18,
    migratesFrom: [15],
  });
  if (!candidate) throw new Error("The signed release was not discovered.");
  expect(blockedReason(program, candidate)).toBeNull();

  execFileSync(process.execPath, [
    "scripts/migrate-state.mjs",
    "--apply",
    "--data",
    data,
  ]);
  const migrated = new Database(path, { readonly: true });
  expect(migrated.pragma("user_version", { simple: true })).toBe(18);
  expect(migrated.prepare("SELECT name FROM applications").get()).toEqual({
    name: "Kept app",
  });
  expect(
    migrated.prepare("SELECT native_session_id FROM conversations").get(),
  ).toEqual({ native_session_id: "native-1" });
  migrated.close();
  expect([history, credentials].map((file) => readFileSync(file))).toEqual(
    preserved,
  );
});

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
    // The exact file it came from, so restoring cannot guess a name back.
    database: path,
    copied: [{ name: "hallvi.db", target: path }],
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

it("restores the exact database it backed up, and never one beside it", () => {
  const data = mkdtempSync(join(tmpdir(), "hv-custom-"));
  const custom = join(data, "custom.sqlite");
  const bystander = join(data, "hallvi.db");
  const make = (path: string, version: number, name: string) => {
    const made = new Database(path);
    made.exec(readFileSync("tests/fixtures/schema-15.sql", "utf8"));
    made
      .prepare(
        `INSERT INTO applications (id,name,repository_url,repository_owner,repository_name,permission_mode,created_at,updated_at)
         VALUES ('a',?,'u','o','r','pi-decides','t','t')`,
      )
      .run(name);
    made.pragma(`user_version = ${version}`);
    made.close();
  };
  make(custom, 15, "the one being migrated");
  make(bystander, 18, "an unrelated database sitting beside it");

  const run = (...args: string[]) =>
    execFileSync(process.execPath, ["scripts/migrate-state.mjs", ...args], {
      encoding: "utf8",
      env: { ...process.env, HALLVI_DB_PATH: custom },
      stdio: "pipe",
    });
  run("--apply");
  const kept = join(
    data,
    "migrations",
    readdirSync(join(data, "migrations"))[0],
  );
  run("--restore", kept);

  const read = (path: string) => {
    const open = new Database(path, { readonly: true });
    const row = {
      version: open.pragma("user_version", { simple: true }),
      name: open.prepare("SELECT name FROM applications").get() as {
        name: string;
      },
    };
    open.close();
    return { version: row.version, name: row.name.name };
  };
  expect(read(custom)).toEqual({ version: 15, name: "the one being migrated" });
  expect(read(bystander)).toEqual({
    version: 18,
    name: "an unrelated database sitting beside it",
  });
  rmSync(data, { recursive: true, force: true });
});

it("keeps the records when the copy it was asked to restore is no good", () => {
  const data = mkdtempSync(join(tmpdir(), "hv-damaged-"));
  const database = join(data, "hallvi.db");
  const made = new Database(database);
  made.exec(readFileSync("tests/fixtures/schema-15.sql", "utf8"));
  made.pragma("user_version = 15");
  made.close();

  const run = (...args: string[]) =>
    execFileSync(
      process.execPath,
      ["scripts/migrate-state.mjs", ...args, "--data", data],
      { encoding: "utf8", stdio: "pipe" },
    );
  run("--apply");
  const kept = join(
    data,
    "migrations",
    readdirSync(join(data, "migrations"))[0],
  );
  const alive = () => {
    const open = new Database(database, { readonly: true });
    const version = open.pragma("user_version", { simple: true });
    open.close();
    return version;
  };

  // Gone. Deleting the live records before reading the copy would turn this
  // into no records at all, which is the one outcome a restore must not have.
  renameSync(join(kept, "hallvi.db"), join(kept, "kept-aside"));
  expect(() => run("--restore", kept)).toThrow(/is missing hallvi\.db/);
  expect(alive()).toBe(18);

  // There, but not a database.
  writeFileSync(join(kept, "hallvi.db"), randomBytes(4096));
  expect(() => run("--restore", kept)).toThrow(/could not be opened/);
  expect(alive()).toBe(18);

  // There, readable, and not the schema it claims.
  rmSync(join(kept, "hallvi.db"));
  const wrong = new Database(join(kept, "hallvi.db"));
  wrong.exec(readFileSync("tests/fixtures/schema-15.sql", "utf8"));
  wrong.pragma("user_version = 18");
  wrong.close();
  expect(() => run("--restore", kept)).toThrow(/not the schema 15 it claims/);
  expect(alive()).toBe(18);

  // And the real one still works.
  rmSync(join(kept, "hallvi.db"));
  renameSync(join(kept, "kept-aside"), join(kept, "hallvi.db"));
  expect(run("--restore", kept)).toContain("to schema 15");
  expect(alive()).toBe(15);
  rmSync(data, { recursive: true, force: true });
});

it("restores when the database it is replacing is not there at all", () => {
  // The case a restore most exists for. Naming the worker lock after a file
  // that is gone refused exactly then.
  const data = mkdtempSync(join(tmpdir(), "hv-gone-"));
  const database = join(data, "hallvi.db");
  const made = new Database(database);
  made.exec(readFileSync("tests/fixtures/schema-15.sql", "utf8"));
  made.pragma("user_version = 15");
  made.close();

  const run = (...args: string[]) =>
    execFileSync(
      process.execPath,
      ["scripts/migrate-state.mjs", ...args, "--data", data],
      { encoding: "utf8", stdio: "pipe" },
    );
  run("--apply");
  const kept = join(
    data,
    "migrations",
    readdirSync(join(data, "migrations"))[0],
  );
  for (const companion of ["", "-wal", "-shm"])
    rmSync(`${database}${companion}`, { force: true });

  expect(run("--restore", kept)).toContain("to schema 15");
  const back = new Database(database, { readonly: true });
  expect(back.pragma("user_version", { simple: true })).toBe(15);
  expect(back.pragma("integrity_check", { simple: true })).toBe("ok");
  back.close();
  rmSync(data, { recursive: true, force: true });
});
