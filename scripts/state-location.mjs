// Where Hallvi keeps its state: a database and a settings file in one
// directory, and the model account shared across checkouts.
import { join } from "node:path";

/** The database and settings file in a state directory. */
export function stateFiles(directory) {
  return {
    directory,
    database: join(directory, "hallvi.db"),
    settings: join(directory, "hallvi.env"),
  };
}

/**
 * The state directory in `parent`: hidden in a checkout (`.hallvi`), plain for
 * an installation (`~/.local/share/hallvi`).
 */
export function stateLocation(parent, { hidden = false } = {}) {
  return stateFiles(join(parent, `${hidden ? "." : ""}hallvi`));
}

/** The model account shared across checkouts and the installation. */
export function piAccountLocation(home) {
  return join(home, ".config", "hallvi", "pi");
}
