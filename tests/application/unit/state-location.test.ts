// Haldur was called Server Guy. What must not happen to someone who still has
// state under that name: a new, empty database created beside the one holding
// their applications, credentials and conversations, or a move that leaves the
// stored SSH key and model credential paths pointing at directories that are
// gone.
import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  piAccountLocation,
  stateFiles,
  stateLocation,
} from "../../../scripts/state-location.mjs";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "haldur-state-location-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("names state for Haldur and creates nothing", () => {
  expect(stateLocation(root, { hidden: true })).toEqual({
    directory: join(root, ".haldur"),
    database: join(root, ".haldur", "haldur.db"),
    settings: join(root, ".haldur", "haldur.env"),
  });
  expect(stateLocation(root).database).toBe(join(root, "haldur", "haldur.db"));
  expect(piAccountLocation(root)).toBe(join(root, ".config", "haldur", "pi"));
  expect(readdirSync(root)).toEqual([]);
});

it("refuses Server Guy state instead of starting empty beside it", () => {
  mkdirSync(join(root, ".server-guy"));
  expect(() => stateLocation(root, { hidden: true })).toThrow(
    /Moving from Server Guy/,
  );
  mkdirSync(join(root, "data"));
  writeFileSync(join(root, "data", "server-guy.db"), "");
  expect(() => stateFiles(join(root, "data"))).toThrow(/nothing was opened/);
  expect(existsSync(join(root, ".haldur"))).toBe(false);
});

it("moves a checkout's state and rewrites the paths Haldur stored", () => {
  // Stored while the checkout lived in a folder it has since left.
  const before = "/elsewhere/server-guy/.server-guy";
  const old = join(root, ".server-guy");
  mkdirSync(old);
  const db = new Database(join(old, "server-guy.db"));
  db.exec(
    "CREATE TABLE applications (id TEXT, host TEXT); CREATE TABLE messages (id TEXT, source TEXT);",
  );
  db.prepare("INSERT INTO applications VALUES ('a', ?)").run(
    JSON.stringify({
      address: "192.0.2.1",
      privateKeyPath: `${before}/operator/a/ssh/id_ed25519`,
      knownHostsPath: `${before}/operator/a/ssh/known_hosts`,
    }),
  );
  db.exec("INSERT INTO messages VALUES ('m', 'server-guy')");
  db.close();
  writeFileSync(join(old, "server-guy.env"), "HALDUR_PORT=4747\n");
  writeFileSync(
    join(old, "pi-settings.json"),
    JSON.stringify({
      modelId: "m",
      authPath: "/Users/someone/.config/server-guy/pi/pi-auth.json",
    }),
  );

  execFileSync(process.execPath, [
    "scripts/move-from-server-guy.mjs",
    "checkout",
    root,
  ]);

  const moved = join(root, ".haldur");
  expect(existsSync(old)).toBe(false);
  expect(readdirSync(moved).sort()).toEqual([
    "haldur.db",
    "haldur.env",
    "pi-settings.json",
  ]);
  const after = new Database(join(moved, "haldur.db"), { readonly: true });
  const host = JSON.parse(
    (after.prepare("SELECT host FROM applications").get() as { host: string })
      .host,
  );
  expect(host.privateKeyPath).toBe(`${moved}/operator/a/ssh/id_ed25519`);
  expect(host.knownHostsPath).toBe(`${moved}/operator/a/ssh/known_hosts`);
  expect(after.prepare("SELECT source FROM messages").get()).toEqual({
    source: "haldur",
  });
  after.close();
  expect(
    JSON.parse(readFileSync(join(moved, "pi-settings.json"), "utf8")).authPath,
  ).toMatch(/\/\.config\/haldur\/pi\/pi-auth\.json$/);
  expect(stateLocation(root, { hidden: true }).database).toBe(
    join(moved, "haldur.db"),
  );
});

it("does not move over existing Haldur state", () => {
  mkdirSync(join(root, ".server-guy"));
  mkdirSync(join(root, ".haldur"));
  expect(() =>
    execFileSync(
      process.execPath,
      ["scripts/move-from-server-guy.mjs", "checkout", root],
      { stdio: "pipe" },
    ),
  ).toThrow(/already exists/);
  expect(existsSync(join(root, ".server-guy"))).toBe(true);
});
