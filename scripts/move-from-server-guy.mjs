// Moves state left under Haldur's former name, Server Guy, to where Haldur
// reads it. Run it once, with nothing using that state:
//
//   node scripts/move-from-server-guy.mjs checkout [dir]
//   node scripts/move-from-server-guy.mjs installation
//   node scripts/move-from-server-guy.mjs account
//
// checkout moves [dir]/.server-guy to .haldur, installation moves
// ~/.local/share/server-guy to haldur, and account ~/.config/server-guy.
//
// Each directory is renamed in place (the same filesystem, so nothing is
// copied), its files named server-guy.* become haldur.*, and the absolute paths
// Haldur itself stored are rewritten: SSH key paths in the database and the
// model credential path in pi-settings.json. Records of what already ran keep
// the paths they ran with. Add --dry-run to see what would change.
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const [kind, place] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const home = homedir();

/** Every directory a stored path may name, old prefix first. */
function moves() {
  if (kind === "checkout") {
    const root = resolve(place ?? ".");
    return [[join(root, ".server-guy"), join(root, ".haldur")]];
  }
  if (kind === "installation")
    return [
      [
        join(home, ".local", "share", "server-guy"),
        join(home, ".local", "share", "haldur"),
      ],
    ];
  if (kind === "account")
    return [
      [join(home, ".config", "server-guy"), join(home, ".config", "haldur")],
    ];
  console.log(
    "Usage: move-from-server-guy.mjs checkout [dir] | installation | account [--dry-run]",
  );
  process.exit(1);
}

/**
 * The same file under its new directory. A checkout's stored paths may name
 * the checkout by a folder it has since left, so a checkout matches on its
 * `.server-guy/` segment rather than on the whole prefix.
 */
function rewrite(value, from, to) {
  if (typeof value !== "string") return value;
  // Any state may name the shared model account; move all three together.
  const accountAt = value.indexOf("/.config/server-guy/");
  if (accountAt !== -1)
    return (
      join(home, ".config", "haldur") +
      value.slice(accountAt + "/.config/server-guy".length)
    );
  if (kind === "checkout") {
    const at = value.indexOf("/.server-guy/");
    return at === -1 ? value : to + value.slice(at + "/.server-guy".length);
  }
  return value.startsWith(`${from}/`) ? to + value.slice(from.length) : value;
}

/** Any process with a file open under `path`. Without lsof, nothing is certain. */
function inUse(path) {
  const found = spawnSync("lsof", ["-t", "+D", path], { encoding: "utf8" });
  if (found.error)
    throw new Error("lsof is needed to check that nothing uses this state.");
  return found.stdout.trim() !== "";
}

const changes = [];
for (const [from, to] of moves()) {
  if (!existsSync(from)) {
    console.log(`${from} does not exist; nothing to move.`);
    continue;
  }
  if (existsSync(to))
    throw new Error(
      `${to} already exists. Nothing was moved; decide which to keep.`,
    );
  if (inUse(from))
    throw new Error(
      `A process has files open in ${from}. Stop Haldur, development servers and workers first; nothing was moved.`,
    );
  changes.push(`${from} -> ${to}`);

  // Stored paths are rewritten before anything is renamed. They then name the
  // destination, so a failure at any point leaves a move that can be run
  // again: the rewrite finds nothing more to change and the rename follows.
  const database = join(from, "server-guy.db");
  if (existsSync(database)) {
    const db = new Database(database, { readonly: dryRun });
    try {
      const update = db.transaction(() => {
        for (const { id, host } of db
          .prepare("SELECT id, host FROM applications WHERE host IS NOT NULL")
          .all()) {
          const parsed = JSON.parse(host);
          const next = Object.fromEntries(
            Object.entries(parsed).map(([k, v]) => [k, rewrite(v, from, to)]),
          );
          if (JSON.stringify(next) === JSON.stringify(parsed)) continue;
          for (const [k, v] of Object.entries(next))
            if (v !== parsed[k])
              changes.push(`  applications ${id} ${k}: ${v}`);
          if (!dryRun)
            db.prepare("UPDATE applications SET host = ? WHERE id = ?").run(
              JSON.stringify(next),
              id,
            );
        }
        const count = db
          .prepare(
            "SELECT count(*) AS n FROM messages WHERE source = 'server-guy'",
          )
          .get().n;
        if (count) changes.push(`  messages: ${count} recorded events`);
        if (count && !dryRun)
          db.prepare(
            "UPDATE messages SET source = 'haldur' WHERE source = 'server-guy'",
          ).run();
      });
      update();
    } finally {
      db.close();
    }
  }

  for (const settings of [
    join(from, "pi-settings.json"),
    join(from, "config", "pi-settings.json"),
    join(from, "pi", "pi-settings.json"),
  ]) {
    if (!existsSync(settings)) continue;
    const saved = JSON.parse(readFileSync(settings, "utf8"));
    const authPath = rewrite(saved.authPath, from, to);
    if (authPath === saved.authPath) continue;
    changes.push(`  ${settings.slice(from.length + 1)} authPath: ${authPath}`);
    if (dryRun) continue;
    const temporary = `${settings}.moving`;
    writeFileSync(
      temporary,
      `${JSON.stringify({ ...saved, authPath }, null, 2)}\n`,
      { mode: statSync(settings).mode & 0o777 },
    );
    renameSync(temporary, settings);
  }

  const renames = readdirSync(from)
    .filter((name) => name.startsWith("server-guy."))
    .map((name) => [name, `haldur.${name.slice("server-guy.".length)}`]);
  for (const [a, b] of renames) changes.push(`  ${a} -> ${b}`);
  if (dryRun) continue;
  for (const [a, b] of renames) renameSync(join(from, a), join(from, b));
  renameSync(from, to);
}
console.log(
  changes.length
    ? `${dryRun ? "Would move" : "Moved"}:\n${changes.join("\n")}`
    : "Nothing to move.",
);
