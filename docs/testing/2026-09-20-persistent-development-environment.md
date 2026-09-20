# A development environment that keeps what it has — 20 September 2026

One Hallvi on the owner's MacBook, four applications really deployed on one
Hetzner host, and the state carried across a schema change rather than started
again. What was checked, and what it does not establish.

The controller runs `e121188c`, the current `main`, from a checkout pinned at
`~/.local/share/hallvi-dev/program`. Nothing in this account's `com.hallvi`
service, on port 4747, was touched.

## What was adopted, rather than made

Server `166459264` already existed. It was created by real Pi on 18 September
in the live onboarding proof for
[PR #135](https://github.com/lustoykov/hallvi/pull/135), which deployed Uptime
Kuma to it and then retained it "so the owner can look at the result" — under
`sg-cleanup=allowed` and an expiry of **2026-09-21T13:31:42Z**. It had about a
day left.

That deployment, its conversation and its twenty-two recorded facts are exactly
what a persistent environment is for, so ownership was transferred instead of
letting it expire and building the same thing again. Ownership was verified
first: the inventory record `17716884-…json`, the provider labels, and the
worktree it names, which is the worktree this work ran in.

The controller state came with it. `.hallvi` in that worktree held the
applications, the conversations, the sealed credentials and the Hetzner
connection; a worktree is not a place for any of those to live, so they were
copied into `~/.local/share/hallvi-dev/state`, in the layout an installed
Hallvi uses.

```
before  schema 15, 2 applications, 2 conversations, 22 saved facts, 16 messages
after   schema 15, 2 applications, 2 conversations, 22 saved facts, 16 messages
        integrity_check ok
```

The database was copied through SQLite's own backup, so the 2.4 MB
write-ahead log went with it rather than being left behind.

One thing does not survive a copy by itself. The managed SSH key and
known-hosts file are recorded in the database as absolute paths, so the moved
state still named the worktree it came from — a directory due to be removed.
`dev-instance bootstrap` repoints them at the environment's own copies, and the
key was then used to reach the host before anything else was done with it.

## The schema change, on the state that mattered

The retained state was at schema 15; `main` is at 18. This is the upgrade the
environment exists to make visible, so it was run on the real thing rather than
on a fixture.

```
dev-instance backup before-schema-18
  schema 15, 2 applications, plus config, pi-sessions, pi-workspaces,
  diagnostics, hallvi.env        — the copy was reopened and verified
npm run db:upgrade
  Upgraded … from schema 15 to 18. The original is ….before-v18
```

Both conversations were written before Pi owned conversations. Opening one
imported its earlier history into Pi's session repository without touching the
original:

```
pi-sessions/<application>/<chat>.jsonl            the untouched original
pi-sessions/<application>/<chat>/imported/0.jsonl  the copy Pi now reads
```

The 18 September Uptime Kuma conversation then rendered in full — the sizing
recommendation, the Hetzner provisioning, the administrator setup, the
publishing at a custom hostname — and its twenty-two facts were still attached
to the application.

## An older program will not open a newer database

Demonstrated against a copy, so nothing live was at risk. The copy was stamped
schema 19 and offered to the schema-18 program:

```
$ HALLVI_DATA_DIR=<copy> node scripts/serve.mjs --check-installed
…/hallvi.db holds schema 19 and this Hallvi needs schema 18. Nothing was
changed. Install the version that wrote it, or move the file aside to start
fresh.
exit 1
```

This matters for the documented way of trying a candidate revision: going back
to the baseline is safe for the code, and is *not* by itself a database
rollback. `dev-instance start` makes the same comparison before starting
anything, so the usual answer is a sentence rather than a failed boot.

## The four applications

All four on one host, each its own Compose project, its own data and its own
loopback port, behind the Caddy that was already there. Every one was deployed
through a real Pi conversation in this environment; no record was written by
hand.

| Application | What it exercises | Recorded facts |
| --- | --- | --- |
| whoami | stateless | 16 |
| uptime-kuma | its own SQLite | 26, twenty-two of them from 18 September |
| v2 (Miniflux) | a separate PostgreSQL | 18 |
| paperless-ngx | PostgreSQL, Redis, workers, documents | 23 |

Pi's own verification during the Miniflux deployment is worth quoting, because
it is the persistence question asked by the product rather than by this
document — the containers were recreated and PostgreSQL found its data:

```
db-1  | PostgreSQL Database directory appears to contain a database;
        Skipping initialization
miniflux-1 | Running database migrations current_version=132 latest_version=132
miniflux-1 | [API] User authenticated successfully … username=admin
```

### The sample data, and why it is this data

Recognizable, synthetic, and each piece is something an upgrade can be caught
losing.

- **Uptime Kuma** holds three monitors — `hallvi-dev whoami`,
  `hallvi-dev miniflux`, `hallvi-dev uptime-kuma` — so the environment watches
  itself, and the monitor list is a statement about whether it is up.
- **Miniflux** holds two feeds, forty entries, and exactly one starred entry,
  `#26 The Millennium Problems for Biology`. One row, easy to name, easy to
  miss if a migration goes wrong.
- **Paperless** holds two consumed PDFs, *Hallvi dev environment note* and
  *Hallvi dev shared host inventory*, both tagged `hallvi-dev`, with their
  originals at `/opt/paperless/media/documents/originals/000000{1,2}.pdf` and
  two rows in `documents_document_tags`.
- **whoami** holds nothing, deliberately, and answers `Name: hallvi-dev`.

Both were created by Pi using credentials it already held. Neither password
was read by anyone: they were generated rather than typed, which is the origin
Hallvi allows to be read back later, and they stay in its sealed store.

## What was checked

**A restart keeps everything.** The application ids, the conversation ids,
Pi's native session ids, the fact counts and the history directories were
recorded, the controller was stopped and started, and the recording was taken
again. Byte-identical, twice.

That first restart found a real fault, fixed here: `stop` signalled the
launcher alone, so the interface and the worker kept the port and the worker
lock until it gave up and killed them. Killing a worker mid-write is the one
thing this environment should not do casually. It now signals the process
group.

A second, smaller finding came out of testing the fix. With no Hallvi tab open
the pair stops in about **0.6 seconds**; with one open on an application it
takes the full **30-second** grace period, because Next.js waits for requests
in flight and the page holds a live event stream. The worker is not the one
holding on — it exits immediately either way — so `stop` now names what is
left and says which it is:

```
no tab open     Stopped.                                    (0.6s)
tab open        Still there after 30 seconds: the interface.
                The Pi worker already stopped cleanly; an open Hallvi tab
                keeps the interface waiting on its event stream. Killed.
                Stopped.                                    (32.9s)
```

Both were checked, and the state recording was identical after each.

**Redeploying a stateful application keeps its data.** Pi was asked to pull
Uptime Kuma's image again and recreate the container from the same Compose
project, counting the monitors on each side of it.

```
container started   2026-09-18T13:34:32Z   before
container started   2026-09-20T13:38:26Z   after — a different container
monitor rows        3 → 3
                    hallvi-dev whoami · hallvi-dev miniflux · hallvi-dev uptime-kuma
```

**Running bootstrap again changes nothing.** Three times in a row: four
applications each time, the state recording identical to the pre-restart one,
and `hallvi.env` still holding one `HALLVI_PORT=5147` rather than a growing
stack of them.

**A missing fixture is reported, not recreated.** Shown against a scratch copy
whose register named applications its database did not have, including one
called `deleted-on-purpose`:

```
Registered fixtures that are not in the database:
  whoami (9e518df0-…) — a stateless site …
  paperless-ngx (a6cf50b5-…) — the complicated tier …
  deleted-on-purpose (00000000-…) — a fixture that is no longer in the database

Nothing was recreated. Deploy one again through a conversation in this
environment, restore a backup, or drop it from the register:
  dev-instance forget <id>
```

`forget` then dropped the one that was meant to be gone, and said that nothing
on the host or in the database had been touched. The same run reported that the
scratch copy's recorded SSH key paths had no copy under its own configuration
directory — which is what a state directory assembled by hand, rather than by
`backup`, looks like.

**The smoke check passes.** Nine checks: the controller, and each of the four
applications present by id and answering at its address.

```
ok    controller answers http://127.0.0.1:5147  (307)
ok    uptime-kuma  … answers https://46-62-253-6.sslip.io/  (302)
ok    whoami       … answers https://whoami.46-62-253-6.sslip.io/  (200)
ok    v2           … answers https://miniflux.46-62-253-6.sslip.io/  (200)
ok    paperless-ngx… answers https://paperless.46-62-253-6.sslip.io/  (302)
```

**The coordination rules hold.** With `task-a` holding `paperless-ngx`:
`task-b` was refused that application, and refused `environment` as well
because an environment claim conflicts with everything; `task-b` claimed
`whoami` without trouble; and `task-b` could not release `task-a`'s claim
without saying `--force`.

**Every documented command was run as written**, from a checkout that is not
the program directory, under the machine's default Node 26 as well as Node 22:
`status`, `start`, `stop`, `smoke`, `bootstrap`, `backup`, `claim`, `release`
and `forget`.

## Costs

`cx23` (2 vCPU, 4 GB, 40 GB, Helsinki) at **EUR 5.49/month** plus **EUR
0.50/month** for the IPv4 address: **EUR 5.99/month**, already being billed
before this work. No new recurring cost, and no paid add-on — no provider
backups, no extra storage, no larger plan.

With all four running, including Paperless's PostgreSQL, Redis and worker,
the host sits at about 1.5 GB of 3.8 GB used and 27 GB of 38 GB disk free.
Paperless was deliberately deployed without Tika or Gotenberg, and with one
task worker and one thread, to fit this host; Pi recorded both absences as
facts rather than leaving them implied. A larger plan would be a separate
billing decision for the owner, not one to take on their behalf.

## Retention

The server, its firewall, its SSH key and both primary IPs now carry
`sg-lifecycle=persistent`, `sg-cleanup=retain`, this task's owner and branch,
and **no** `sg-expires-at` — a persistent resource does not inherit the
72-hour disposable lease. The product's own `hallvi-application` and
`hallvi-managed` labels were preserved. A full provider snapshot of every
collection was taken before the labels were changed.

None of these can be deleted by the daily audit: it requires
`sg-cleanup=allowed` and a valid expired timestamp, and these have neither.

## What this does not establish

- **It is not monitored.** "Persistent" means retained until somebody retires
  it deliberately. `dev-instance status` is a reading taken when you run it.
- **A backup here is the controller's four stores, not the applications' data.**
  Uptime Kuma's monitors and Miniflux's articles live on the host; restoring a
  controller backup would describe data that may no longer be there.
- **One upgrade path was exercised**, 15 to 18, the one the repository
  supports. Nothing here says anything about schemas nobody registered.
- **No deletion, failure or recovery was tested against it**, on purpose. That
  work belongs in a disposable fixture, and the documentation says so.
- **The arm64 repository-workspace failure** recorded in the 18 September
  conversation is history, not current behavior: the whoami and Paperless
  deployments read their repositories on this computer without trouble.
