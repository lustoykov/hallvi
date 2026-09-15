// Losing the computer, and getting the credentials back.
//
// The property under test is the one that makes the archive worth having: a
// credential the controller generated is still usable after the controller is
// gone, recovered on a different machine, by a person holding only the
// passphrase. And the property that makes it safe: the passphrase is not in
// the archive, and the archive is not readable without it.
//
// The decryption side deliberately uses plain `gpg` and `tar` rather than any
// code from this repository, because the case this exists for is "Server Guy
// is gone" and an archive only Server Guy can open would not survive it.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const APP = "11111111-1111-4111-8111-111111111111";

let controller: string;
let secrets: typeof import("@/server/application-secrets");
let recovery: typeof import("@/server/recovery-export");
let generated: string;
/** Left open on purpose, so the log is uncheckpointed as the export runs. */
let openDatabase: import("better-sqlite3").Database | null = null;

/** Whether this machine can make the archive at all. */
let gpgAvailable = true;
try {
  execFileSync("gpg", ["--version"], { stdio: "ignore" });
} catch {
  gpgAvailable = false;
}

beforeEach(async () => {
  controller = mkdtempSync(join(tmpdir(), "sg-controller-"));
  process.env.SERVER_GUY_CONFIG_DIR = controller;
  process.env.SERVER_GUY_DB_PATH = join(controller, "server-guy.db");
  secrets = await import("@/server/application-secrets");
  recovery = await import("@/server/recovery-export");

  // A controller with something worth recovering: a records database, a
  // generated credential, an SSH key for the server, and a provider token.
  // A real SQLite database in WAL mode with rows still only in the log. The
  // previous version wrote the bytes "SQLite format 3" as the database, which
  // is exactly why this suite could not see that the export shipped a main
  // file hours behind its own write-ahead log. (It also put a NUL byte in this
  // source file, which made git treat it as binary.)
  const { default: Database } = await import("better-sqlite3");
  const live = new Database(join(controller, "server-guy.db"));
  live.pragma("journal_mode = WAL");
  live.exec(
    "create table if not exists rows (id integer primary key, note text)",
  );
  const insert = live.prepare("insert into rows (note) values (?)");
  for (let index = 0; index < 40; index++) insert.run(`row ${index}`);
  // Deliberately not checkpointed and left open: the state a running
  // controller is in when the owner asks for a recovery copy.
  openDatabase = live;
  mkdirSync(join(controller, "operator", APP, "ssh"), { recursive: true });
  writeFileSync(
    join(controller, "operator", APP, "ssh", "id_ed25519"),
    "PRIVATE-KEY-STANDING-IN-FOR-THE-REAL-ONE",
    { mode: 0o600 },
  );
  writeFileSync(
    join(controller, "hetzner-connection.json"),
    JSON.stringify({ token: "synthetic-token-for-this-test" }),
    { mode: 0o600 },
  );
  secrets.generateSecret(APP, {
    name: "POSTGRES_PASSWORD",
    why: "PostgreSQL needs a password for the application's role.",
    process: "db",
  });
  generated = secrets.revealSecret(APP, "POSTGRES_PASSWORD").value;
});

afterEach(() => {
  openDatabase?.close();
  openDatabase = null;
  delete process.env.SERVER_GUY_CONFIG_DIR;
  delete process.env.SERVER_GUY_DB_PATH;
});

/** What a person with the passphrase and no Server Guy would do. */
function openWithoutServerGuy(file: string, passphrase: string) {
  const into = mkdtempSync(join(tmpdir(), "sg-recovered-"));
  const plain = join(into, "archive.tar");
  execFileSync(
    "gpg",
    [
      "--batch",
      "--yes",
      "--decrypt",
      "--passphrase",
      passphrase,
      "--output",
      plain,
      file,
    ],
    { stdio: "pipe" },
  );
  execFileSync("tar", ["-xf", plain, "-C", into], { stdio: "pipe" });
  return into;
}

describe.skipIf(!gpgAvailable)("the recovery archive", () => {
  it("says what it holds before it is made, and what it does not", () => {
    const { entries } = recovery.exportContents();
    const paths = entries.map((entry) => entry.path);
    expect(paths).toContain("server-guy.db");
    expect(paths).toContain("secrets");
    expect(paths).toContain("operator");
    // The sensitive ones are marked, because the owner is about to be told
    // where to keep this file.
    expect(entries.find((entry) => entry.path === "secrets")?.sensitive).toBe(
      true,
    );
    // And it is explicit that the applications' own data is not in here.
    expect(recovery.EXCLUDED.join(" ")).toMatch(/applications' own data/);
  });

  it("recovers a generated credential on a different controller", async () => {
    const passphrase = recovery.suggestPassphrase();
    const written = await recovery.writeRecoveryExport({
      passphrase,
      directory: join(controller, "out"),
    });
    expect(written.bytes).toBeGreaterThan(0);

    // Somewhere else entirely, with only gpg, tar and the passphrase.
    const recovered = openWithoutServerGuy(written.file, passphrase);
    expect(existsSync(join(recovered, "server-guy.db"))).toBe(true);
    expect(
      existsSync(join(recovered, "operator", APP, "ssh", "id_ed25519")),
    ).toBe(true);

    // A fresh controller pointed at the recovered directory.
    process.env.SERVER_GUY_CONFIG_DIR = recovered;
    const standing = await import(
      "@/server/application-secrets?recovered=" + Date.now()
    );
    expect(standing.revealSecret(APP, "POSTGRES_PASSWORD").value).toBe(
      generated,
    );
  });

  it("carries a manifest a stranger could read in a year", async () => {
    const passphrase = recovery.suggestPassphrase();
    const written = await recovery.writeRecoveryExport({
      passphrase,
      directory: join(controller, "out"),
    });
    const recovered = openWithoutServerGuy(written.file, passphrase);
    const manifest = JSON.parse(
      readFileSync(join(recovered, "manifest.json"), "utf8"),
    );
    expect(manifest.schema).toBe(recovery.EXPORT_SCHEMA);
    expect(manifest.encryption).toMatch(/OpenPGP/);
    expect(manifest.open).toMatch(/gpg --decrypt/);
    expect(manifest.what).toMatch(/Not the applications' own data/);
  });

  it("does not contain the passphrase that opens it", async () => {
    const passphrase = recovery.suggestPassphrase();
    const written = await recovery.writeRecoveryExport({
      passphrase,
      directory: join(controller, "out"),
    });
    // Not in the ciphertext, and not in the plaintext it decrypts to.
    expect(readFileSync(written.file).toString("binary")).not.toContain(
      passphrase,
    );
    const recovered = openWithoutServerGuy(written.file, passphrase);
    const manifest = readFileSync(join(recovered, "manifest.json"), "utf8");
    expect(manifest).not.toContain(passphrase);
    expect(manifest).toMatch(/not recoverable from it/i);
  });

  it("is useless to somebody without the passphrase", async () => {
    const passphrase = recovery.suggestPassphrase();
    const written = await recovery.writeRecoveryExport({
      passphrase,
      directory: join(controller, "out"),
    });
    // The generated credential must not be sitting in the file in the clear.
    expect(readFileSync(written.file).toString("binary")).not.toContain(
      generated,
    );
    expect(() =>
      openWithoutServerGuy(written.file, "the-wrong-passphrase"),
    ).toThrow();
  });

  it("refuses a passphrase too weak to be the only protection", async () => {
    await expect(
      recovery.writeRecoveryExport({
        passphrase: "short",
        directory: join(controller, "out"),
      }),
    ).rejects.toThrow(/at least 16 characters/);
  });

  it("leaves no unencrypted archive behind", async () => {
    const passphrase = recovery.suggestPassphrase();
    await recovery.writeRecoveryExport({
      passphrase,
      directory: join(controller, "out"),
    });
    // The manifest is staged in a temporary directory that is removed, and
    // the tar itself only ever exists as a pipe.
    expect(existsSync(join(controller, "recovery-tmp"))).toBe(false);
  });

  it("suggests a passphrase worth writing down", () => {
    const suggested = recovery.suggestPassphrase();
    expect(suggested).toMatch(/^([A-Z2-9]{5}-){5}[A-Z2-9]{5}$/);
    // No characters that are read back wrongly: no O/0, no I/1.
    expect(suggested).not.toMatch(/[O01I]/);
    const many = new Set(
      Array.from({ length: 50 }, () => recovery.suggestPassphrase()),
    );
    expect(many.size).toBe(50);
  });
});

describe.skipIf(!gpgAvailable)("the database inside the archive", () => {
  it("carries rows that were still only in the write-ahead log", async () => {
    // The defect this covers: the controller runs in WAL mode, so recent
    // writes live in `server-guy.db-wal` rather than the main file. An export
    // that copied `server-guy.db` as it lay on disk shipped a database behind
    // itself — on the live rig the log was several times the size of the main
    // file, so a copy written that day would have been missing most of the
    // week. The archive carries one consistent snapshot now.
    const wal = join(controller, "server-guy.db-wal");
    expect(existsSync(wal)).toBe(true);
    expect(statSync(wal).size).toBeGreaterThan(0);

    const passphrase = recovery.suggestPassphrase();
    const written = await recovery.writeRecoveryExport({
      passphrase,
      directory: join(controller, "out"),
    });
    const recovered = openWithoutServerGuy(written.file, passphrase);

    const { default: Database } = await import("better-sqlite3");
    const restored = new Database(join(recovered, "server-guy.db"), {
      readonly: true,
    });
    try {
      const counted = restored
        .prepare("select count(*) as count from rows")
        .get() as { count: number };
      expect(counted.count).toBe(40);
    } finally {
      restored.close();
    }
  });

  it("does not ship the log and shared-memory files as they lie on disk", async () => {
    // Three files captured at three different instants while the worker is
    // writing is not a database. The snapshot replaces them.
    const passphrase = recovery.suggestPassphrase();
    const written = await recovery.writeRecoveryExport({
      passphrase,
      directory: join(controller, "out"),
    });
    const recovered = openWithoutServerGuy(written.file, passphrase);
    expect(existsSync(join(recovered, "server-guy.db-wal"))).toBe(false);
    expect(existsSync(join(recovered, "server-guy.db-shm"))).toBe(false);
  });

  it("describes the database it will actually capture, wherever it lives", async () => {
    // The database is the one entry that can sit outside the config
    // directory. A reviewer pointed a script at a config directory whose
    // SERVER_GUY_DB_PATH led elsewhere and the listing described one file
    // while the archive would have carried another — a page disagreeing with
    // the thing it describes, which is the failure mode this milestone is
    // about. The defaults, scripts/dev.mjs and the rig all keep the two
    // together, so nothing but a test like this one holds them together.
    const elsewhere = mkdtempSync(join(tmpdir(), "sg-db-"));
    const away = join(elsewhere, "server-guy.db");
    process.env.SERVER_GUY_DB_PATH = away;
    const { default: Database } = await import("better-sqlite3");
    const live = new Database(away);
    live.pragma("journal_mode = WAL");
    live.exec("create table rows (id integer primary key, note text)");
    const insert = live.prepare("insert into rows (note) values (?)");
    for (let index = 0; index < 7; index++) insert.run(`away ${index}`);

    const listed = recovery
      .exportContents()
      .entries.find((entry) => entry.path === "server-guy.db");
    expect(listed).toBeTruthy();
    // The size has to be the *away* database's, log included. A config
    // directory holding its own `server-guy.db` — this one does, with 40
    // rows in it — makes "is it listed at all?" pass either way, so the
    // byte count is what actually distinguishes the two files.
    const expected =
      statSync(away).size +
      (existsSync(`${away}-wal`) ? statSync(`${away}-wal`).size : 0);
    expect(listed!.bytes).toBe(expected);
    expect(listed!.bytes).not.toBe(
      statSync(join(controller, "server-guy.db")).size +
        statSync(join(controller, "server-guy.db-wal")).size,
    );

    const passphrase = recovery.suggestPassphrase();
    const written = await recovery.writeRecoveryExport({
      passphrase,
      directory: join(controller, "out-away"),
    });
    const recovered = openWithoutServerGuy(written.file, passphrase);
    const restored = new Database(join(recovered, "server-guy.db"), {
      readonly: true,
    });
    try {
      // The rows from the database the listing described, not the one beside
      // the config directory.
      expect(
        (
          restored.prepare("select count(*) as n from rows").get() as {
            n: number;
          }
        ).n,
      ).toBe(7);
    } finally {
      restored.close();
      live.close();
    }
  });
});
