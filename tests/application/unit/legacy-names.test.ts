// Server Guy became Haldur. What must not happen to someone who already had it:
// a new, empty database created beside the one holding their applications,
// credentials and conversations, or a choice between two databases made for
// them without a word.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  adoptLegacyEnvironment,
  piAccountLocation,
  stateFiles,
  stateLocation,
} from "../../../scripts/legacy-names.mjs";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "haldur-legacy-names-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function file(...path: string[]) {
  mkdirSync(join(root, ...path.slice(0, -1)), { recursive: true });
  writeFileSync(join(root, ...path), "");
}

it("gives new state Haldur's names and leaves the disk alone", () => {
  expect(stateLocation(root, { hidden: true })).toEqual({
    directory: join(root, ".haldur"),
    database: join(root, ".haldur", "haldur.db"),
    settings: join(root, ".haldur", "haldur.env"),
  });
  expect(stateLocation(root).database).toBe(join(root, "haldur", "haldur.db"));
  expect(piAccountLocation(root)).toBe(join(root, ".config", "haldur", "pi"));
  expect(readdirSync(root)).toEqual([]);
});

it("finds a Server Guy checkout, installation and model account where they are", () => {
  file(".server-guy", "server-guy.db");
  expect(stateLocation(root, { hidden: true }).database).toBe(
    join(root, ".server-guy", "server-guy.db"),
  );

  file("share", "server-guy", "server-guy.db");
  file("share", "server-guy", "server-guy.env");
  const installed = stateLocation(join(root, "share"));
  expect(installed.database).toBe(
    join(root, "share", "server-guy", "server-guy.db"),
  );
  expect(installed.settings).toBe(
    join(root, "share", "server-guy", "server-guy.env"),
  );
  // The service is told its directory; the files in it keep their names.
  expect(stateFiles(installed.directory)).toEqual(installed);
  // Settings count even before the service has ever written a database.
  file("unstarted", "server-guy.env");
  expect(stateFiles(join(root, "unstarted")).settings).toBe(
    join(root, "unstarted", "server-guy.env"),
  );

  file(".config", "server-guy", "pi", "auth.json");
  expect(piAccountLocation(root)).toBe(
    join(root, ".config", "server-guy", "pi"),
  );
  expect(existsSync(join(root, ".haldur"))).toBe(false);
});

it("does not trade an existing database for an empty Haldur directory", () => {
  file(".server-guy", "server-guy.db");
  mkdirSync(join(root, ".haldur"));
  expect(stateLocation(root, { hidden: true }).database).toBe(
    join(root, ".server-guy", "server-guy.db"),
  );
});

it("refuses to choose between two databases", () => {
  file(".server-guy", "server-guy.db");
  file(".haldur", "haldur.db");
  expect(() => stateLocation(root, { hidden: true })).toThrow(
    /Move aside the one that is not in use/,
  );
  file("state", "server-guy.db");
  file("state", "haldur.db");
  expect(() => stateFiles(join(root, "state"))).toThrow(/nothing was opened/);
});

it("reads SERVER_GUY_* settings as HALDUR_* ones, never over them", () => {
  const env: Record<string, string | undefined> = {
    SERVER_GUY_DB_PATH: "/old.db",
    SERVER_GUY_GITHUB_APP_SLUG: "old",
    HALDUR_GITHUB_APP_SLUG: "new",
  };
  adoptLegacyEnvironment(env);
  expect(env.HALDUR_DB_PATH).toBe("/old.db");
  expect(env.HALDUR_GITHUB_APP_SLUG).toBe("new");
});
