// Haldur was called Server Guy until 17 September 2026. A checkout or an
// installation from before then keeps working with its state where it is.
//
// Nothing is moved or renamed. A running service, another worktree's server
// or a worker holding the database open would otherwise be left pointing at a
// path that no longer exists, and the next process to start would create an
// empty database in its place. Finding the old names costs a few `stat`s.
import { existsSync } from "node:fs";
import { join } from "node:path";

/** SERVER_GUY_* settings still apply; a HALDUR_* one of the same name wins. */
export function adoptLegacyEnvironment(env = process.env) {
  for (const [key, value] of Object.entries(env))
    if (key.startsWith("SERVER_GUY_")) env[`HALDUR_${key.slice(11)}`] ??= value;
  return env;
}

const twoDatabases = (current, legacy) =>
  new Error(
    `Both ${current} and ${legacy} exist. Move aside the one that is not in use; nothing was opened.`,
  );

/** The database and settings file in a state directory, by either name. */
export function stateFiles(directory) {
  const current = join(directory, "haldur.db");
  const legacy = join(directory, "server-guy.db");
  const legacyDatabase = existsSync(legacy);
  if (legacyDatabase && existsSync(current))
    throw twoDatabases(current, legacy);
  const name = legacyDatabase ? "server-guy" : "haldur";
  return {
    directory,
    database: join(directory, `${name}.db`),
    settings: join(directory, `${name}.env`),
  };
}

/**
 * The state directory in `parent`: `haldur` for new state, `server-guy` where
 * that is the one that exists. Development keeps it hidden in the checkout
 * (`.haldur`), an installation does not (`~/.local/share/haldur`).
 *
 * Two directories that both hold a database is a decision for the owner, so
 * this refuses rather than picking one and hiding the other's records.
 */
export function stateLocation(parent, { hidden = false } = {}) {
  const dot = hidden ? "." : "";
  const current = stateFiles(join(parent, `${dot}haldur`));
  const legacy = stateFiles(join(parent, `${dot}server-guy`));
  if (!existsSync(legacy.directory)) return current;
  if (!existsSync(current.directory)) return legacy;
  const legacyDatabase = existsSync(legacy.database);
  if (legacyDatabase && existsSync(current.database))
    throw twoDatabases(current.database, legacy.database);
  return legacyDatabase ? legacy : current;
}

/** The model account shared across checkouts and the installation. */
export function piAccountLocation(home) {
  const current = join(home, ".config", "haldur", "pi");
  const legacy = join(home, ".config", "server-guy", "pi");
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}
