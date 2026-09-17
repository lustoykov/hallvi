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

function inUse(path) {
  const found = spawnSync("lsof", ["-t", "--", path], { encoding: "utf8" });
  return found.status === 0 && found.stdout.trim() !== "";
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

  const renames = readdirSync(from)
    .filter((name) => name.startsWith("server-guy."))
    .map((name) => [name, `haldur.${name.slice("server-guy.".length)}`]);
  const database = join(from, "server-guy.db");
  if (existsSync(database) && inUse(database))
    throw new Error(
      `${database} is open in another process. Stop Haldur first.`,
    );

  changes.push(`${from} -> ${to}`);
  for (const [a, b] of renames) changes.push(`  ${a} -> ${b}`);
  if (dryRun) continue;

  renameSync(from, to);
  for (const [a, b] of renames) renameSync(join(to, a), join(to, b));

  const moved = join(to, "haldur.db");
  if (existsSync(moved)) {
    const db = new Database(moved);
    try {
      db.transaction(() => {
        for (const { id, host } of db
          .prepare("SELECT id, host FROM applications WHERE host IS NOT NULL")
          .all()) {
          const parsed = JSON.parse(host);
          const next = Object.fromEntries(
            Object.entries(parsed).map(([k, v]) => [k, rewrite(v, from, to)]),
          );
          if (JSON.stringify(next) !== JSON.stringify(parsed)) {
            db.prepare("UPDATE applications SET host = ? WHERE id = ?").run(
              JSON.stringify(next),
              id,
            );
            changes.push(`  applications ${id}: SSH key paths`);
          }
        }
        const sources = db
          .prepare(
            "UPDATE messages SET source = 'haldur' WHERE source = 'server-guy'",
          )
          .run().changes;
        if (sources) changes.push(`  messages: ${sources} recorded events`);
      })();
    } finally {
      db.close();
    }
  }

  for (const settings of [
    join(to, "pi-settings.json"),
    join(to, "config", "pi-settings.json"),
    join(to, "pi", "pi-settings.json"),
  ]) {
    if (!existsSync(settings)) continue;
    const saved = JSON.parse(readFileSync(settings, "utf8"));
    const authPath = rewrite(saved.authPath, from, to);
    if (authPath === saved.authPath) continue;
    const mode = statSync(settings).mode & 0o777;
    writeFileSync(
      settings,
      `${JSON.stringify({ ...saved, authPath }, null, 2)}\n`,
      {
        mode,
      },
    );
    changes.push(`  ${settings}: model credential path`);
  }
}
console.log(
  changes.length
    ? `${dryRun ? "Would move" : "Moved"}:\n${changes.join("\n")}`
    : "Nothing to move.",
);
