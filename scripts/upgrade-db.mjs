// Upgrade an existing Hallvi database in place to the current schema, keeping
// the original beside it. The only supported starting point is schema 15, the
// last one on main before conversations moved onto Pi's AgentHarness.
//
//   npm run db:upgrade            upgrades the configured database
//   HALLVI_DB_PATH=... npm run db:upgrade
//
// Nothing in the database is rewritten. Conversations are Pi's now, so the
// earlier `messages` table is simply no longer read; it stays where it is, as
// do the two conversation columns that tracked a reply.
//
// Rollback: stop the app and worker, put `<database>.before-v18` back in place
// of the database, and run the earlier version. Conversation histories need
// nothing: the originals are never modified (see docs/operator-design.md).
import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { stateLocation } from "./state-location.mjs";

const FROM = 15;
const { version: TO } = JSON.parse(
  readFileSync(
    new URL("../src/server/schema-version.json", import.meta.url),
    "utf8",
  ),
);
const path =
  process.env.HALLVI_DB_PATH ??
  stateLocation(process.cwd(), { hidden: true }).database;
if (!existsSync(path)) throw new Error(`No database at ${path}.`);

// A running worker answers on its socket; upgrading under it would race it.
const running = await new Promise((resolve) => {
  const probe = connect(join(dirname(path), "worker.sock"));
  probe.once("connect", () => resolve(true) ?? probe.destroy());
  probe.once("error", () => resolve(false));
});
if (running)
  throw new Error("A Pi worker is running on this database. Stop it first.");

const database = new Database(path);
try {
  const current = database.pragma("user_version", { simple: true });
  if (current === TO) {
    console.log(`Already at schema ${TO}. Nothing to do.`);
  } else if (current !== FROM) {
    throw new Error(
      `Schema ${current} cannot be upgraded by this script (it upgrades ${FROM} to ${TO}). The database is unchanged.`,
    );
  } else {
    const backup = `${path}.before-v${TO}`;
    if (existsSync(backup))
      throw new Error(
        `${backup} already exists. Move it away first; it is a rollback copy and is never overwritten.`,
      );
    await database.backup(backup);
    const check = new Database(backup, { readonly: true });
    const intact =
      check.pragma("integrity_check", { simple: true }) === "ok" &&
      check.pragma("user_version", { simple: true }) === FROM;
    check.close();
    if (!intact)
      throw new Error("The rollback copy did not verify. Unchanged.");

    database.pragma(`user_version = ${TO}`);
    console.log(
      `Upgraded ${path} from schema ${FROM} to ${TO}. The original is ${backup}.`,
    );
  }
} finally {
  database.close();
}
