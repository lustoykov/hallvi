// Every database change Hallvi supports, written down once.
//
// Both ways of upgrading read this list: `npm run db:upgrade` in development
// and `install.sh` on an installation, which is also what the in-app updater
// runs. There is one implementation because there is one question — can this
// program open that database, and if not, what exactly turns one into the
// other — and two answers to it would eventually disagree.
//
// Each transition names its own `from` and `to` as literal numbers. That is
// the point of the list rather than a convenience: the version this program
// was built as lives in `src/server/schema-version.json`, and deriving `to`
// from it, as the first upgrade script did, means bumping that file silently
// promotes every transition to claim it reaches the new version. A migration
// to 19 exists when someone writes it here, and not before.
//
// `changes` is what a transition actually rewrites, and the reason the upgrade
// flow knows what to back up. Everything not named there is not touched by it:
// Pi's conversation histories, recorded evidence, sealed credentials and the
// deployed applications' own data are separate stores, and no transition so
// far has any business in them.

/** A database this program cannot reach from where it is. */
export class UnsupportedMigration extends Error {}

/**
 * What each store is called, so a plan can say what it will touch in the same
 * words the documentation and the backup directory use.
 */
export const STORES = {
  database: "the controller database",
  sessions: "Pi's conversation histories",
  configuration: "credentials and connection configuration",
};

export const MIGRATIONS = [
  {
    from: 15,
    to: 18,
    changes: [STORES.database],
    summary:
      "Conversations moved onto Pi's AgentHarness. Nothing in the database is rewritten: the earlier `messages` table is simply no longer read, and the two conversation columns that tracked a reply stay where they are. The histories beside it are left untouched — the worker copies one into Pi's session repository the first time it opens it, and the original stays where the earlier version reads it.",
    apply() {
      // Deliberately nothing. The stamp is the migration; see the summary.
    },
  },
];

/**
 * The transitions that take `from` to `to`, in order.
 *
 * Refuses anything it cannot name: an unknown starting point, a version no
 * step reaches, a downgrade, or a chain that does not move forward. A refusal
 * here is the correct answer — it leaves the database alone and says which two
 * versions it could not join.
 */
export function plan(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to))
    throw new UnsupportedMigration(
      `Schema versions must be whole numbers; got ${from} and ${to}.`,
    );
  if (from === to) return [];
  if (to < from)
    throw new UnsupportedMigration(
      `Schema ${from} cannot be taken back to ${to}. Restoring a backup is how you go back, not a migration.`,
    );
  const steps = [];
  let at = from;
  while (at !== to) {
    const leaving = MIGRATIONS.filter((each) => each.from === at);
    if (leaving.length > 1)
      throw new UnsupportedMigration(
        `Two migrations both start at schema ${at}. One of them is wrong; the list has to say which single thing happens next.`,
      );
    const step = leaving[0];
    if (!step || step.to <= at || step.to > to)
      throw new UnsupportedMigration(
        `There is no supported migration from schema ${from} to ${to}${
          at === from ? "" : `; it gets as far as ${at}`
        }. Nothing was changed.`,
      );
    steps.push(step);
    at = step.to;
  }
  return steps;
}

/** Whether `from` can be taken to `to`, without throwing to find out. */
export function supported(from, to) {
  try {
    plan(from, to);
    return true;
  } catch {
    return false;
  }
}

/** The stores a plan rewrites, each named once. */
export function changedStores(steps) {
  return [...new Set(steps.flatMap((step) => step.changes))];
}
