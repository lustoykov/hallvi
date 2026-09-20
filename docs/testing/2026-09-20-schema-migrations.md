# One migration, two ways of upgrading — 20 September 2026

`npm run db:upgrade` and the installed updater each had their own idea of what
a schema number meant. This is what the single implementation does, proved on
a real installation rather than a fixture, and what it still refuses.

The host was a disposable Hetzner cx33, `166631873`, Ubuntu 24.04, created for
this and retired afterwards. Both releases were built on it, because a Linux
release must be built on Ubuntu 24.04 x64.

| | Revision | Schema | sha256 |
| --- | --- | --- | --- |
| **A** | `db009f61` — the first archive to carry its own Node.js | 15 | `c81b2fd91da8f528…` |
| **B** | this branch, after the review fixes | 18 | `b0608c12281acc55…` |

The first run of these checks used archives built before the review; every
result quoted here was taken again on the fixed build, on a second disposable
host, `166636611`.

`db009f61` was chosen because it is the oldest revision whose installation
layout release B recognizes. An earlier schema-15 build exists, but it predates
the bundled runtime, so B's installer would have refused it for reasons that
have nothing to do with schemas.

## What was in it before

Release A was installed as an ordinary user, started, and given records with
names worth recognizing afterwards — including a history in the format the
earlier version wrote, beside the database:

```
schema           15
application      ledger-before-the-upgrade  a1b2c3d4-…-000000000001
conversation     Main operator   native 01a0c000-1111-7000-8000-000000000003
messages         2
saved facts      1 — The ledger keeps its data outside the container
history original 88cc8549e4839c24   (pi-sessions/<app>/<chat>.jsonl)
```

## The upgrade

`install.sh` from release B, over that running installation:

```
/home/hallvi/.local/share/hallvi/hallvi.db holds schema 15; this Hallvi needs
18 and can migrate it during the upgrade.
Hallvi can open this controller database.
Hallvi is stopped, and stays stopped until: hallvi start
Checking the schema of the records
Schema 15 to 18, in 1 step:
Changes: the controller database.
Everything else is left alone.
Backed up to …/migrations/2026-09-20T15-45-09-368Z-15-to-18
Migrated … from schema 15 to 18.
Hallvi is starting, and will start with this machine.
  interface  http://127.0.0.1:4747
  Pi worker  running
The records before this upgrade are kept at …/2026-09-20T15-45-09-368Z-15-to-18
```

The order is the point. The schema question is asked while the old program is
still serving; the service stops before anything is copied; the copy is taken
and verified before anything is migrated; the program is replaced only after
that; and the copy is kept rather than deleted, because it is the only way
back.

Afterwards, everything named above was still there, at schema 18, with the
history file byte-identical — `88cc8549e4839c24`, the same hash — and the
interface and worker both answering. The kept copy held exactly what its
manifest listed: `hallvi.db` and `manifest.json`.

```json
{ "from": 15, "to": 18, "changes": ["the controller database"],
  "copied": ["hallvi.db"], "restore": "node scripts/migrate-state.mjs --restore …" }
```

## When the new version will not start

The same upgrade again, with something taking port 4747 the moment the service
let go of it — an ordinary reason for a new program to fail to start, and the
dangerous one, because by then the database has already moved forward.

```
Backed up to …/migrations/2026-09-20T15-42-36-424Z-15-to-18
Migrated … from schema 15 to 18.
Hallvi is starting, and will start with this machine.
  interface  not answering, or answering with errors
  Pi worker  not running yet
install: Hallvi did not become ready; check hallvi logs.
The records were put back as they were, from …/2026-09-20T15-42-36-424Z-15-to-18
The previous Hallvi program was restored.
```

Both halves, in that order. With the port freed, release A started again and
its records were exactly as they had been:

```
schema           15          program schema { "version": 15 }
application      ledger-before-the-upgrade
messages         2           saved facts 1
history original 88cc8549e4839c24
interface: http 307
```

The recovery is a file copy the installer does itself. It deliberately does not
call either program: a recovery that needs the thing that just failed is not
one.

## Why the program alone is not a rollback

Installing release A over the migrated records, which is what "just put the old
version back" means:

```
Checking the controller database
/home/hallvi/.local/share/hallvi/hallvi.db holds schema 18 and this Hallvi
needs schema 15. Nothing was changed. Install the version that wrote it, or
move the file aside to start fresh.
```

Refused before anything was replaced, and release B kept serving. This is the
correct refusal, and it is why the upgrade keeps the copy.

## What the list refuses

`plan()` was asked for every neighbouring pair:

```
15 -> 18  supported   one step
18 -> 18  supported   nothing to do
18 -> 19  refused     no supported migration from schema 18 to 19
15 -> 19  refused     …from schema 15 to 19; it gets as far as 18
14 -> 18  refused     no supported migration from schema 14 to 18
18 -> 15  refused     Restoring a backup is how you go back, not a migration
```

The fourth line is the one this list exists for. The script it replaces took
its destination from `src/server/schema-version.json`, so raising that file to
19 would have silently promoted the 15-to-18 step into a 15-to-19 nobody wrote.
Both ends of every transition are now literal numbers, and a test holds them
to it.

## Found by doing this

- **The migration modules were not in the release archive.** Packaging exercises
  the shipped command, and it failed on an import of a `migrations.mjs` that was
  never copied in. Fixed in `scripts/package.mjs`.
- **A failure between the copy and the end of the migration lost the copy's
  location.** The installer read the exit status before the output. It now reads
  the output first, so cleanup always knows where to go back to.
- **A stale `dist/` answered for the schema.** This worktree held a `dist/`
  from an older build claiming schema 15 while the source said 18, and the new
  code believed it. A checkout's source now wins; an installed archive has no
  source and answers from `dist/`, which is the same file.
- **Verifying a copy left a write-ahead log beside it.** A backup directory now
  holds exactly what its manifest lists.

## What the review found, and how each was checked

Four faults, all real, all fixed on this branch.

**Eligibility was asked of the wrong program.** `update-start.mjs` and
`update-helper.mjs` consulted *this* installation's migration list. That list
belongs to the version being installed: a migration to schema 19 is written in
the release that introduces 19, so an installation at 18 has never heard of it
and would refuse the only kind of update that needs one. The claim now travels
in the signed manifest as `migratesFrom`, filled in by the build being signed,
validated by `release-trust.mjs`, and checked again by `install.sh` from the
unpacked archive's own list.

Asked of a *real installed* Hallvi at schema 18, whose own list holds only
15 to 18 — the old registry the review named — with three signed manifests it
could not have known about:

```
installed schema       18
its own migration list 15->18

a release at schema 19 that declares it migrates from 18:
  not blocked — the upgrade would proceed
a release at schema 19 that declares only 15:
  …keeps its records in schema 19 and this one uses schema 18, and does not
  say it can migrate them.
a release at schema 19 that declares nothing at all:
  …and does not say it can migrate them.
```

Before the fix, the first of those three was refused too, by the only program
in a position to want it.

A manifest claiming to migrate from a schema newer than its own is refused by
verification, so the field cannot be used to smuggle a downgrade.

**Records were restored while something might still be writing them.** A start
that reports failure can leave a service loaded and being retried; both service
managers restart what they own. The installer now stops the service and waits
for the service manager to agree it is gone before it replaces anything, and
only then puts the records back and then the program. A failure *before*
anything was touched still leaves a running service alone, which is why the
stop is conditional on there being something to undo.

Run again on a real installation, with something taking port 4747 the moment
the service let go — systemd holding the unit and retrying it while the
database had already moved to 18:

```
install: Hallvi did not become ready; check hallvi logs.
The records were put back as they were, from …/2026-09-20T16-36-31-114Z-15-to-18
The previous Hallvi program was restored.
```

Then, with the port freed: schema 15, program schema 15, the application, its
conversation and native session id, both messages, the saved fact and the
history hash all as they were, and the interface answering. That message only
appears once the service manager has agreed the service is gone; when it will
not stop, the installer says so and leaves the records alone.

**Restoring rebuilt the database path instead of remembering it.** A controller
whose database is not called `hallvi.db` was restored to `<directory>/hallvi.db`
— the wrong file, and possibly a different controller's. Reproduced, then
fixed: the manifest records the exact file.

```
before   custom.sqlite  schema 18    hallvi.db  schema 18  (an unrelated database)
restore
after    custom.sqlite  schema 15    hallvi.db  schema 18  — untouched
```

**Restoring deleted the live records before reading the copy.** A backup whose
database was missing left nothing at all. The copy is now opened, checked
against the schema it claims, and staged beside its target before anything is
removed; the target is replaced by a rename of something already verified.
Three damaged backups, each leaving the live records where they were:

```
missing      …is missing hallvi.db. Nothing was changed.        live: schema 18
not a database  …could not be opened (file is not a database).  live: schema 18
wrong schema …is schema 18, not the schema 15 it claims.        live: schema 18
then the real copy                                              live: schema 15
```

**And one the review did not name, found while checking the fourth.**
Restoring resolved the worker lock through the database file itself, so a
restore refused with `ENOENT` when the database was missing — which is exactly
the situation a restore is for. The lock is now named from the directory.

```
live database deleted; now restoring:
  Restored …/hallvi.db to schema 15 from …
  live database back at schema 15 | integrity ok
```

## A second review, and two more refusals that were not refusals

**A restore the migrator rejected was carried out anyway.** `install.sh` fell
through to copying the same file over the database by hand. That path was
meant for "no program left to run the migrator with"; it was also taken when
the migrator ran and said no, which installed exactly what had just been
rejected.

Reproduced with a backup whose manifest claims schema 15 and whose file is
4 KB of sevens, over live records at schema 18:

```
The copy in …/migrations/bad could not be opened (file is not a database).
Nothing was changed; the records are as they are.
The copy of your records was refused, so it was not put back. Your records
are as the upgrade left them, and the copy is at …/migrations/bad

live records after the installer: schema 18 | THE-LIVE-RECORDS
the copy is still there: 4096 bytes
```

A refusal is now a hard stop, and **the hand copy is gone entirely**. With the
refusal handled, the only case left for it was "no Hallvi on this machine can
check the copy" — and the one thing it could do there is put a file nobody
checked over the records. Recovery now says where the copy is and stops. The
installer is shorter for it.

**Rollback continued when Hallvi could not be confirmed stopped.** Cleanup
warned and then replaced the program directory anyway, which turns one failed
upgrade into two broken installations. It now keeps both versions and says
where each is, and does not touch the records either.

## What this does not establish

- **The updater's own discovery path was not exercised across a schema change.**
  No two signed releases with different schemas exist yet; every revision
  carrying the updater is at schema 18. What was proved is `install.sh`, which
  is the program the update helper runs, and the helper's decision — proceed
  when a transition exists, refuse when none does — is covered by tests rather
  than by a live download.
- **The history import was not exercised here.** The host has no model account,
  so no conversation was opened. What is shown is that the original history is
  untouched and still where the new version looks for it. The import itself ran
  on the [persistent development environment](2026-09-20-persistent-development-environment.md)
  earlier the same day, on its real 15-to-18 upgrade.
- **One transition exists.** Nothing here says anything about a schema nobody
  has written a migration for, which is the point of it refusing them.
