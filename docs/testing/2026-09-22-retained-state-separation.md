# Four retained applications, one owner each — 22 September 2026

What was done on the owner's MacBook, in the order it was done, with what
each step showed. Branch `claude/hallvi-retained-state-d7f4e6`; the four
applications and their host are the ones the
[development environment](../development-environment.md) describes.

## Before

One state directory, `~/.local/share/hallvi-dev/state`, held all four
applications: one SQLite database at schema 18 (4 applications, 4
conversations, 86 saved records, 16 legacy message rows), `config/` with
each application's executions, activity, SSH key, sealed secrets and
connection request, Pi's histories under `pi-sessions/<application>/` and six
captured workspaces. The designated checkout opened it through four lines in
its `.env.local`, and its `npm run dev` had been up since 13:49 that day with
no write to the database since the previous afternoon.

Pi's session repository lists every subdirectory under a conversation's
root regardless of the `cwd` its header records, and the two conversations
imported on 20 September already carried the path of a worktree that no
longer exists; so moving a state directory does not break history lookup.
The only absolute paths that had to change were the SSH key and known-hosts
paths in `applications.host`.

## Stopping the writers

The four-application launcher (`scripts/dev.mjs`, pid 54034, from
`/Users/aiwithlyubomir/biz/code/hallvi`) was stopped with SIGTERM — sooner
than intended: a `pgrep -f scripts/dev.mjs | head -1` meant for a scratch
launcher matched it first. The worker had nothing in hand, the database
checked out afterwards (`integrity_check` ok, schema 18, 4/4/86), and
stopping it was the first step of the separation in any case; it is
recorded here because it was not the planned order. `lsof` then showed
nothing holding the database or the socket, and the worker lock was free.

## The separation

A throwaway script (not committed; its output is in the pull request) did,
in one run:

```
Backed up 357 files; database schema 18, counts { applications: 4, conversations: 4, savedInformation: 86 }
whoami:      db {"conversations":1,"saved":16,"messages":0},  25 files (2 workspaces) verified
uptime-kuma: db {"conversations":1,"saved":28,"messages":13}, 239 files (1 workspaces) verified
miniflux:    db {"conversations":1,"saved":18,"messages":3},  29 files (1 workspaces) verified
paperless:   db {"conversations":1,"saved":24,"messages":0},  59 files (2 workspaces) verified
Recovery copy: ~/.local/share/hallvi-dev/recovery/2026-09-22T13-08-36-195Z-four-application-state (read-only)
```

- **A verified copy first**, `backups/2026-09-22T13-08-36-195Z-before-separation`:
  the database through SQLite's backup API, reopened, schema and counts
  compared; every other file compared by SHA-256; a manifest listing them.
- **Each application's database** is the whole database copied, every other
  application deleted with foreign keys on (its conversation, saved records
  and legacy messages go with it), the key paths rewritten to the new
  directory, then vacuumed. Each was checked against the counts read from the
  source beforehand, for orphans, for `integrity_check`, and for the two key
  paths existing where the row now says they are.
- **Everything else** copied by hash: `config/operator/<id>` whole,
  `secrets/<id>.json` and the shared `secrets/key`, the connection request,
  `pi-sessions/<id>` without its lock, and the workspaces whose events name
  the application. Diagnostics and `hallvi.env` stayed with the original.
- **The original** was moved to `recovery/`, made read-only (0500/0400) and
  marked with a `retained.json` of its own carrying `recovery: true`. The
  read-only bits alone were not enough: a worker started on it got as far as
  "Pi worker ready" (SQLite opens a read-only file read-only rather than
  failing, and the lock needs no write). With the mark, `db()`, the worker,
  `npm run dev`, `db:push` and `migrate-state` all refuse it by name.
- `instance.json` now records each application's directory, port and state
  path; the designated checkout's `.env.local` no longer points anywhere.

Application ids, conversation ids, session ids and every record kept their
values; nothing was renamed inside the databases or the histories.

## Ownership, on the real applications

Two checkouts at once: this worktree attached **whoami** (5147) and the
designated checkout, detached at the branch commit, attached
**uptime-kuma** (5148). `status` showed both with their worktree, branch, pid
and address. Each attach took and verified its copy first (whoami: 1/1/16
and 27 files; uptime-kuma: 1/1/28 and 241 files).

- A second `attach whoami` from the designated checkout: refused, exit 2,
  naming the worktree, branch, pid, time and address that hold it.
- `db()` from the designated checkout with `HALLVI_DB_PATH` at whoami's
  database: refused before the file was opened. `npm run dev` pointed at it:
  refused before any child started. `migrate-state --restore` against an
  attached directory: refused. The same three against an unmarked copy and
  against a synthetic retained directory behaved the same way earlier
  ([unit/retained-state.test.ts](../../tests/application/unit/retained-state.test.ts)
  holds the rule).
- A crash was simulated on a synthetic application: the attaching process
  killed with SIGKILL while its launcher lived. The next attach refused
  because a worker still served the database; once that launcher was
  stopped, the next attach said the last runtime had not detached, found no
  command still recorded as running, and went on. On the real whoami, the
  designated checkout's first attach failed after starting because Next
  refuses a second `next dev` from the same directory (it still held
  uptime-kuma); `runtime.json` recorded `outcome: crashed`, and the next
  attach there — after uptime-kuma was detached — reported it and went on.
  Attach now refuses a second application from a checkout that holds one,
  before taking a copy.

## The change on whoami, and the hand-off

With whoami attached from this worktree, one message was sent through the
real interface — confirm that the site still answers, change nothing — and
real Pi answered it: one `curl` from its workspace, HTTP 200, one execution
record written (16 now, 15 before), nothing on the host touched. Its
conversation went from 7 messages to 9.

`detach whoami` from another shell: the interface stopped, the worker was
asked to hold, reported nothing in hand and stopped, `runtime.json` was
removed, port 5147 freed. The designated checkout then attached whoami and
served the same conversation: 9 messages, the first from 20 September, the
last Pi's answer from minutes before, 16 saved records and 16 executions,
the new turn visible on the page.

Every detach in this record, across the four applications and the
synthetic one, reported nothing in hand and released cleanly. A detach
with Pi still working (the five-minute wait, the forced stop, the `forced`
outcome) was not exercised live; its path is the same code as the update's
hold and was read, not run.

## All four, afterwards

Each application attached from a checkout, its conversation and records read
through its own controller, then detached:

| Application | Conversation | Saved records (database / in view) | Executions | Secrets |
| --- | --- | --- | --- | --- |
| whoami | 9 messages (was 7) | 16 / 16 | 16 (was 15) | 0 |
| uptime-kuma | 17 messages | 28 / 28 | 83 | 2 |
| v2 (miniflux) | 9 messages | 18 / 18 | 15 | 2 |
| paperless-ngx | 11 messages | 24 / 23 | 48 | 3 |

(A record retired earlier is counted in the database and not in the view.)

On the host, unchanged by any of this: all seven containers up two days, the
four addresses answering (whoami 200; Uptime Kuma and Paperless 302 to their
sign-in; Miniflux 200); Uptime Kuma's three monitors in `kuma.db`; Miniflux's
two feeds, 182 entries and one starred entry; Paperless's two documents and
their two originals.

## Not done, and limitations

- **One host, four root keys.** State ownership isolates Hallvi's records
  and nothing on the server; the documentation says so and asks for
  host-wide changes to be announced. No separate servers were provisioned.
- **One application per checkout**, because `next dev` refuses a second
  server from one directory. Four applications at once means four checkouts.
- **JSON record formats have no version**; attach compares the schema and
  the Pi version only, and a change to the records under `config/` is tested
  on a copy by hand.
- **The forced-stop path** and the host process listing after a crash were
  exercised only on synthetic state and by reading, not against real work in
  flight.
- **Attach copies grow**: paperless's state is 170 MB because of two captured
  workspaces, and every attach copies it. The five newest attach copies are
  kept per application; older ones the tool made are removed.
- The pre-separation `diagnostics/` (replies and spans, mixed across the
  four) stayed with the recovery copy; each application starts its own.
- The designated checkout was put back on `codex/clickable-application-card`
  afterwards, with the newer locked dependencies it needed to run this branch.
