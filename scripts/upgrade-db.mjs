// Upgrade an existing Hallvi database in place to the current schema, keeping
// the original beside it. The only supported starting point is schema 15, the
// last one on main before conversations moved onto Pi's AgentHarness.
//
//   npm run db:upgrade            upgrades the configured database
//   HALLVI_DB_PATH=... npm run db:upgrade
//
// Rollback: stop the app and worker, put `<database>.before-v17` back in place
// of the database, and run the earlier version. Conversation histories need
// nothing: the originals are never modified (see docs/operator-design.md).
import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
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

// A running worker holds this lock; upgrading under it would race its writes.
const lock = new Database(`${path}.worker-lock`, { timeout: 0 });
try {
  lock.exec("BEGIN EXCLUSIVE");
} catch {
  lock.close();
  throw new Error("A Pi worker is running on this database. Stop it first.");
}

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

    database.pragma("foreign_keys = OFF");
    database.transaction(() => {
      database.exec(`
        ALTER TABLE messages ADD COLUMN delivery text;
        ALTER TABLE messages ADD COLUMN admitted_at text;
        ALTER TABLE messages ADD COLUMN native_entry_id text;
        DROP INDEX IF EXISTS messages_retry_of_id_unique;
        ALTER TABLE messages DROP COLUMN retry_of_id;
        ALTER TABLE messages DROP COLUMN pi_calls;
        ALTER TABLE conversations DROP COLUMN current_response_id;

        -- A reply that was only a placeholder for work not yet started is
        -- gone; the owner's message it stood for waits to be handed to Pi.
        UPDATE messages SET status = 'waiting', delivery = 'next'
          WHERE id IN (SELECT response_to FROM messages WHERE status = 'queued');
        DELETE FROM messages WHERE status = 'queued';
        -- Nothing can be running while the worker is stopped.
        UPDATE messages SET status = 'interrupted',
          error = coalesce(error, 'The worker stopped before this finished.')
          WHERE status = 'running';
        UPDATE messages SET status = 'failed' WHERE status = 'timed-out';
        -- The sender's key now belongs to the owner's message.
        UPDATE messages SET request_key = NULL WHERE role = 'assistant';
        UPDATE conversations SET status = 'idle'
          WHERE status NOT IN ('idle', 'interrupted')
            AND id NOT IN (SELECT conversation_id FROM messages WHERE status = 'waiting');
      `);
      database.pragma(`user_version = ${TO}`);
    })();
    if (database.pragma("foreign_key_check").length)
      throw new Error("Foreign keys no longer hold after the upgrade.");
    console.log(
      `Upgraded ${path} from schema ${FROM} to ${TO}. The original is ${backup}.`,
    );
  }
} finally {
  database.close();
  lock.close();
}
