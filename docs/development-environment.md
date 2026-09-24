# The development environment

Development is `npm ci` and `npm run dev`, like any other project. A
development environment keeps, beside that, a few applications that are really
deployed, with the conversations, records, credentials and connections they
were deployed with, kept between tasks — one Hallvi state directory each,
outside every checkout, that any checkout can take for a while. It is optional:
without one, every checkout runs its own empty Hallvi.

Fixtures made and thrown away inside a single task can only ever show that a
new database works. This keeps the other half — an application whose identity,
conversation and data are older than the code now running, so an upgrade that
quietly drops one of them is visible rather than theoretical.

|  |  |
| --- | --- |
| Take one | `node scripts/retained-application.mjs attach <name>` (or `npm run retained -- attach <name>`) in any checkout |
| See what exists and who has what | `node scripts/retained-application.mjs status` |
| The register | `~/.local/share/hallvi-dev/instance.json`: each application, what it exercises, its port and address, and the data to check after a change |
| Their records | `~/.local/share/hallvi-dev/applications/<name>/state`, one directory per application |
| Copies | `~/.local/share/hallvi-dev/applications/<name>/backups`, taken by every attach |

`HALLVI_DEV_ROOT` moves the whole environment from `~/.local/share/hallvi-dev`.

[Where the records live, and who may open them](architecture/development-environment.md).

## One application, one owner

Each application's state directory holds everything Hallvi knows about it:
its database (one application, its conversation, its saved records), Pi's
history for that conversation, the execution and activity records, its sealed
secrets, its connection request and its managed SSH key. A `retained.json`
beside the database marks the directory as retained and names the directory it
protects, and that mark is what every program checks.

**A marked directory is opened by the runtime that attached it, and by nothing
else.** `attach` holds a lock on the directory for as long as it runs, writes
down who is attaching in `runtime.json`, and starts `npm run dev` on that
state with its runtime id in the environment. The app, the worker,
`db:push`, the migration and the launcher all ask the same rule
([`scripts/retained-state.mjs`](../scripts/retained-state.mjs)) before opening
the database: a process that is not inside the runtime holding the lock is
refused, whether it was started by hand with `HALLVI_DB_PATH` pointing there
or by a second `npm run dev`. Each process that is let in then keeps the
directory marked open for as long as it lives, so an app or worker that
outlived its runtime blocks the next attach instead of writing under it; a
studio or a shell that opened the database is found through `lsof` where the
system has it. The worker's own lock still stops a second worker; this stops
a second interface, a second studio and a stray script as well, because the
interface writes records too.

The state stays where it is whoever attaches it. Nothing is copied out to a
worktree or copied back; the worktree runs against the directory, and the
next worktree runs against the same directory after it lets go.

What every checkout shares is the account level and nothing below it: the
ChatGPT login and the GitHub, Hetzner and Cloudflare connections in
`~/.config/hallvi/pi`. They are shared rather than copied because a copy
cannot work: renewing the GitHub login rotates its refresh token and kills
every other copy.

### Attaching

```sh
node scripts/retained-application.mjs attach <name>
```

In order, and each one a refusal on its own:

1. **Somebody else has it.** The lock is held: the command says which checkout,
   which branch, since when and at which address, and stops. It never takes an
   application from a runtime that is still running, however long ago it
   attached.
2. **Something from an earlier runtime still has it open** — an app or worker
   that survived a crashed attach, a studio, a shell on the database. Stop it
   first; the command names the process where it can.
3. **The last runtime did not detach.** Its `runtime.json` is still there. The
   command says so, lists every command still recorded as running, and asks
   the host what has been running since the earliest of them began — a command
   sent over SSH can outlive the controller that sent it. Attach again with
   `--after-crash` once you have looked; the worker then records those commands
   as interrupted.
4. **This program does not read what is on disk.** The database's schema is
   compared with `src/server/schema-version.json`, and the Pi version the
   histories were last written with (in `retained.json`) with the one this
   checkout bundles. A schema behind the program is migrated deliberately
   first — `node scripts/migrate-state.mjs --plan --data <state>`, then
   `--apply`, which keeps its own verified copy; a schema ahead of it is left
   for a checkout that reads it. A different Pi is tried on a snapshot first,
   then accepted with `--accept-format`, which records the new version.
5. **A verified copy is taken** into `applications/<name>/backups/`: the
   database through SQLite's own backup and reopened with its counts compared,
   every other file compared by hash. The five newest attach copies are kept.
6. **The owner is registered** — worktree, branch, revision, pid, port — and
   the pair starts on the application's own port. The command stays in the
   foreground; that process is the ownership.

### Detaching

Ctrl-C in that terminal, or from anywhere:

```sh
node scripts/retained-application.mjs detach <name>
```

The interface stops first, so nothing new is accepted. The worker is asked to
hold — the same hold an update uses — and says how many conversations still
have work in hand; the launcher waits for that to be nothing, up to five
minutes, saying so every ten seconds. Then the worker stops, Pi keeping
whatever it had, the lock is released and `runtime.json` is removed. A second
Ctrl-C stops the worker without waiting; so does the five-minute limit; and a
worker whose status cannot be read — it answers badly, or not at all — is
stopped without being called idle. Each of those leaves `runtime.json`
behind with `outcome: forced`, and the next attach reads it as an unclean
stop and accounts for it as above. Only the terminal's own second Ctrl-C
counts as a second request: the attach command passes a `detach` on as one
signal, never two.

Ownership never lapses on its own. A stale-looking attachment is a runtime
that is still holding the lock, and the way to take its application is to
detach it there.

### Working on it with other people

Assignments are coordinated in a sentence — say which application you are
taking and when you are done — and enforced by the lock. Each application
can have one checkout working on it at a time. Two things are
enforced rather than agreed, and they stay that way:

- **One runtime owns an application's records**, the interface and the worker
  together, as above.
- **The applications are registered as retained.** Their server, firewall,
  keys and addresses carry `sg-lifecycle=persistent` and
  `sg-cleanup=retain` with no expiry, so no cleanup removes them.
  See [development resources](development-resources.md).

State ownership isolates Hallvi's records, not the host. When applications
share one server and every application's SSH key is root on it, an attached
application can reach its neighbours' containers. Keep work to the application
you hold — its Compose project, its data, its records — and treat anything
host-wide (Caddy, Docker, the firewall, packages) as a change to say out loud
before making, whoever holds what. This does not provision separate servers
and does not claim host isolation.

## What to deploy

A useful set climbs in difficulty, each application with its own Compose
project, data and port:

| Tier | Exercises | For example |
| --- | --- | --- |
| Stateless | Nothing to preserve, so a redeployment has nothing to lose — which is the point of having one | whoami |
| Own database file | A stateful application keeping its own SQLite database on the host | Uptime Kuma |
| Database beside it | An application with a separate PostgreSQL database | Miniflux |
| Everything | PostgreSQL _and_ Redis _and_ background workers _and_ documents on disk | Paperless-ngx |

Record in the register, for each one, the specific data to look at after an
upgrade, a redeployment or a restore — a named monitor, a starred entry, a
tagged document. A record that survived and data that survived are different
claims, and this environment exists to keep them apart. A monitoring
application that watches the others turns its monitor list into a statement
about whether the environment is up.

## Working from a worktree

A task worktree runs its own Hallvi by default: an empty database beside the
source, its own worker, its own fixtures, sharing only the account level. That
is still the right thing for most work, and for anything meant to break. When
a change needs a real application with real history, attach one; the worktree
then runs *that* application, on that application's port, and nothing else
retained.

Its Pi can create its own labelled resources in the provider project. Fixtures
of its own go either on a disposable server (hard isolation, for anything meant
to break) or, for ordinary work, as separate Compose projects on the
environment's host, kept private and named after the application.

### Looking at real records without taking an application

```sh
node scripts/retained-application.mjs snapshot /tmp/hv-look <name> [<name> …]
```

A snapshot is a copy for looking at: the chosen applications' databases merged
into one, their execution, activity and workspace records and Pi's histories —
and none of their SSH keys, secrets or connection requests. The recorded key
paths point inside the snapshot, where no key is, and the command prints the
one line that runs the pair against it with an empty account directory. The
worker is what reads a conversation's history, so it runs; with no ChatGPT
login it cannot start a turn (a send is refused before any tool exists), and
with no connections it cannot reach a provider or the host. That is what
makes a snapshot safe to point any branch at. It is also **the way to see one
controller holding several real applications** when a change is about the
list, the homepage or anything cross-application: the shipping code keeps
working with many applications in one database, and the synthetic
multi-application fixtures (`npm run scenarios`, the browser journeys) remain
the coverage for that behaviour.

A snapshot is not attached and not marked. Delete it when done.

## When a disposable fixture is still the right thing

Keep using a fresh fixture, or a local stand-in, for:

- deleting an application, destroying a host, or any recovery that has to
  start from real loss;
- migrations meant to fail, and any incompatible-schema experiment;
- fault injection, firewall lockouts, filling a disk;
- the automated suites. `npm test` and the browser tests stay deterministic
  and offline, and `.env.local` is loaded only by `npm run dev` and
  `npm run worker`, so no test ever sees these databases.

The rule is short: if what you are proving is that something breaks, break a
copy.

## Seeding

**A fresh checkout** starts empty and stays explicit: `npm run db:push`
creates the tables and stamps the schema. It refuses a database that already
holds tables at another schema rather than rewriting it, and it refuses a
retained directory it does not own, so running it twice is safe and running it
over somebody's records is not possible.

**This environment has no seed command**, deliberately. The retained data is
the starting point, and a command that wrote sample rows into live
applications would be manufacturing history.

`npm run scenarios` remains what it was: it builds its **own** database from
scratch under `tests/results/scenarios`, never reads `HALLVI_DB_PATH` and
never opens retained state. Use it for screenshots and UI work that wants
invented records.

Attaching provisions nothing. It rents no server, redeploys nothing, and will
not recreate an application somebody deleted on purpose — if one is missing,
it is missing, and the register says what used to be there.

## Upgrading the records

The database schema, the JSON records under `config/` and Pi's history format
are compatibility boundaries: a change to any of them is tested on a copy
first — a snapshot for looking, a copy of a state directory for running — and
only then attached. Attach refuses a program that does not read what is on
disk, so state is never handed to code that cannot open it; the one thing it
cannot see is a change to the JSON records, which have no version of their
own, and that is what the copy is for.

When a change alters the schema, the retained applications are the acceptance
test. Each runs the same migration an installation would — the same list, the
same code, the same verified copy taken first — while detached:

```sh
node scripts/migrate-state.mjs --plan  --data ~/.local/share/hallvi-dev/applications/<name>/state
node scripts/migrate-state.mjs --apply --data ~/.local/share/hallvi-dev/applications/<name>/state
```

`--plan` changes nothing and says which stores the transition rewrites.
`--apply` prints where it put the copy, and that copy is how you go back:

```sh
node scripts/migrate-state.mjs --restore <that directory>
```

A transition that is not in [the list](../scripts/migrations.mjs) is refused,
and the records are left exactly as they were. Add the transition to that
list, run it here, and check that the application still opens, still shows
its history and still holds its data. The migration refuses an attached
directory: detach first.

An older program will not open a newer database: `src/server/db.ts` compares
the schema it was built with against the one in the file and refuses, and
attach refuses before that, which is why reverting code is not by itself a
rollback. A branch that migrated an application is a commitment: the next
checkout to attach it reads the new schema or restores the copy.

## Backups, and getting back

Every attach takes a verified copy of the whole state directory before
starting, so the copy to go back to after a bad change is the newest one
under `applications/<name>/backups/`; `manifest.json` in it lists every file
with its hash and the database's schema and counts. Putting one back is
copying it over the state directory while nothing is attached. A copy taken
around a migration is made by `migrate-state.mjs --apply` and restored by
`--restore`, and that is the one to prefer when there is one.

What a copy covers, and what it deliberately does not: it holds Hallvi's own
records — the database, the conversation, the credentials and the connection
configuration. **It does not hold the application's own data.** A monitor list
or a feed's articles live on the host; restoring this copy would
bring back a controller describing data that is still, or no longer, there.

## Retention

Label the environment's server, firewall, keys and addresses
`sg-lifecycle=persistent` and `sg-cleanup=retain` with no expiry, as
[development resources](development-resources.md) describes, so no cleanup
removes them. Retiring the environment is a deliberate act, not something an
expiry does.

"Persistent" means retained until somebody retires it deliberately — not
monitored, and not guaranteed to be up. If it matters that everything is
answering, open each application's address from the register.
