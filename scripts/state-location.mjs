// Where Haldur keeps its state, and a refusal to start over state it no
// longer reads.
//
// Haldur was called Server Guy until 17 September 2026. State left under that
// name is not read, and it is never silently replaced either: starting would
// create an empty database beside the one holding the owner's applications,
// credentials and conversations. So finding it stops the process and says
// what to move (docs/installation.md, "Moving from Server Guy").
import { existsSync } from "node:fs";
import { join } from "node:path";

const unmoved = (found, target) =>
  new Error(
    `${found} is Server Guy state, which Haldur no longer reads. Move it to ${target} as described in docs/installation.md ("Moving from Server Guy"); nothing was opened.`,
  );

/** The database and settings file in a state directory. */
export function stateFiles(directory) {
  const database = join(directory, "haldur.db");
  const settings = join(directory, "haldur.env");
  for (const [old, target] of [
    [join(directory, "server-guy.db"), database],
    [join(directory, "server-guy.env"), settings],
  ])
    if (existsSync(/* turbopackIgnore: true */ old)) throw unmoved(old, target);
  return { directory, database, settings };
}

/**
 * The state directory in `parent`: hidden in a checkout (`.haldur`), plain for
 * an installation (`~/.local/share/haldur`).
 */
export function stateLocation(parent, { hidden = false } = {}) {
  const dot = hidden ? "." : "";
  const directory = join(parent, `${dot}haldur`);
  const old = join(parent, `${dot}server-guy`);
  if (existsSync(/* turbopackIgnore: true */ old))
    throw unmoved(old, directory);
  return stateFiles(directory);
}

/** The model account shared across checkouts and the installation. */
export function piAccountLocation(home) {
  return join(home, ".config", "haldur", "pi");
}
