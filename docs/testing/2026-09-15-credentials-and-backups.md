# Credentials the controller owns, and a backup you could come back from — 15 September 2026

Candidate: `claude/generated-credentials-and-backups`, stacked on
[PR #72](https://github.com/lustoykov/server-guy/pull/72) and not merged.
Neither PR is merged and owner acceptance of both is pending.

Run on the local rig against Shop — a web process, a queue worker, PostgreSQL,
Redis and receipt files on a volume — with the real model, real `sshd`, real
host-key pinning and a real Docker engine. The Hetzner API is the only
stand-in, and no provider resource was created or changed for any of this.

## Result

| | |
| --- | --- |
| 1 · Controller-generated credentials, reveal and copy | **pass** |
| 2 · Changing a credential as an operational change | **pass** |
| 3 · Encrypted recovery export, recovered on a fresh controller | **built, verified, then withdrawn** — see below |
| 4 · Backup journey to a destination off the application host | **pass** — copy taken, transferred, restored in isolation and verified; see [limits](#what-is-not-proved) |
| 5 · Backups UI states on real records | **pass** |

## 1 · The controller makes the password, and the owner can read it

`generate_secret` takes 24 bytes from `crypto.randomBytes`, encodes base64url
— 32 characters, all of them safe in a connection string, a shell word, a YAML
scalar and a URL without escaping — and seals it through the store that
already held supplied secrets. It returns a name and a length. There is no
shape of it that returns a value.

**Asking twice does not make a second password.** A retried turn, a restarted
worker or a second deployment attempt all call it again; an established value
comes back as it stands with `reused: true`, so a retry cannot leave a running
service authenticating with a value the controller has already replaced.

Which leaves the opposite problem, and it is the one that matters: a generated
password the owner cannot see is a password they do not have — it is inside
their database and nowhere they can reach. Withholding it is not protection.
So Environment Variables opens a generated value to **Reveal** and **Copy**:

- Generated values only. The route refuses anything the owner typed, with a
  reason: they already know it, and reading it back would make the store an
  oracle for secrets given in confidence.
- `POST`, not a URL. `GET` on the route is 405.
- Same-origin. A cross-origin attempt is refused.
- `no-store`, `no-cache`, `force-dynamic`, `nosniff`, `no-referrer`.
- Masked until asked for, fetched on the click, dropped on hide, on copy and
  on unmount, and hidden again after 30 seconds.
- **Copy never renders it.** The common case is wanting it in a password
  manager, not on a screen.

Verified with a synthetic credential, in the browser: masked by default,
`Reveal` produced a 32-character base64url value, `Hide` was then offered, and
the owner-supplied `SHOP_ADMIN_PASSWORD` was refused with
*"…so Server Guy will not read it back."* Per the brief, no screenshot in this
report shows a revealed value.

The page groups by the store's own `origin` rather than by prose in a record,
so the two cannot disagree. Its subheading used to say generated values were
"never shown", which stopped being true the moment they could be; it now says
*"Nobody typed these. Open one to read it back when you need it."*

![The Environment Variables page. Two groups: "Only you could give these"
and "Made by Server Guy". POSTGRES_PASSWORD is open, its value shown as a row
of dots with Reveal and Copy buttons beside
it](2026-09-15-credentials-and-backups/generated-credential-masked.png)

*Revision `047c50f` on the local rig — real sshd in a Linux container, a real
ssh client with a pinned host key, real Docker and a real model; the GitHub
and Hetzner APIs are stand-ins. 1440×980. The rig reports the commit it
serves in its `manifest.json`, and it reported this one with a clean tree.*

*What it shows: the two groups are separated by origin, and only the generated
one opens to a `Reveal`. The panel says what the credential is for, which
services hold it, and that changing it is an operational change. **Nothing was
revealed for this capture** — the script asserts the field still matches the
mask and refuses to shoot otherwise, which is also why there is no "revealed"
screenshot anywhere in this report.*

## 2 · Changing one is an operational change

`begin_credential_change` makes both values live and tells them apart:
`$NAME` is what the credential is becoming, `$NAME_PREVIOUS` is the one the
service still accepts and that a script must authenticate with in order to
change it. Nothing is current until `settle_credential_change`, and the tool
description says in as many words that a command exiting zero is not proof.
A change that cannot be established restores the working value exactly.

**On Shop's PostgreSQL, through the product:**

```
generate_secret POSTGRES_PASSWORD        → a 32-character credential, sealed
ALTER USER shop …                        → authenticated with the outgoing value
compose + containers recreated           → web, worker and db
an order placed, priced, receipted       → the application actually works
settle_credential_change established     → revision 2, nothing in flight
```

Checked independently rather than taken from the report, **over TCP from the
web container**, which is the path the application uses:

```
the controller's held value          ACCEPTED   orders = 4
the repository's dev password        REJECTED   password authentication failed
a wrong value                        REJECTED   password authentication failed
```

The first attempt at this check was wrong and worth recording: run through
`docker exec` into the database container it accepted *every* password,
because that path is a local socket and `pg_hba` trusts it. A password test
that cannot fail proves nothing. Over TCP it discriminates.

The four existing orders, their prices and their receipt files were intact
afterwards, and the application went on placing and pricing new ones.

**A bug this found in my own earlier commit.** `values()` deliberately
flattens the incoming and outgoing values so redaction covers both, and
`secretEnvironment` built a `Map` from that list — so whichever came last won.
`$NAME` would have been the **old** password for the duration of every change,
and every script that "sets the new password" would have quietly set the old
one again. They are looked up separately now and a test asserts which is
which.

![The conversation showing the rotation: the outgoing credential rejected and
the replacement accepted, an order priced and a receipt read back, then "The
change is settled: POSTGRES_PASSWORD is now controller revision 2 with no
in-progress rotation"](2026-09-15-credentials-and-backups/credential-change-settled.png)

*Revision `047c50f` on the local rig — real sshd in a Linux container, a real
ssh client with a pinned host key, real Docker and a real model; the GitHub
and Hetzner APIs are stand-ins. 1440×980. The rig reports the commit it
serves in its `manifest.json`, and it reported this one with a clean tree.*

*What it shows: the change end to end in Pi's own words — authenticating with
`$POSTGRES_PASSWORD_PREVIOUS`, altering the role, installing the replacement,
recreating PostgreSQL, web and worker, confirming the outgoing credential is
rejected, then proving it through the application with a real order priced at
3500 and a receipt the web process read back, and only then settling as
established. Note what is absent: every mention is a variable name. The values
are not in the conversation, and there is no shape of this flow that puts them
there.*

## 3 · A recovery copy — built, verified, and withdrawn

This milestone built a second way to recover the controller: Settings →
Recovery, writing an OpenPGP symmetric AES-256 archive through `gpg` that
`gpg --decrypt | tar -x` opens on any machine with no code from this
repository involved. It was verified by losing the controller — an archive
written, decrypted with plain `gpg` and `tar`, and a fresh controller stood on
the result with the generated database password byte-identical.

**It is not in this branch.** While it was being built, [PR
#74](https://github.com/lustoykov/server-guy/pull/74) landed on `main` and
already copies the controller's own state to the connected object-storage
destination automatically, encrypted under a generated passphrase, with a
recovery kit of its own. Two recovery stories, two passphrases and two
archive formats is precisely what the product's simplification principle
forbids, and the owner chose #74's: it runs without being asked, which is the
property that matters for something you need only after losing the machine.

So the page, its API route, `recovery-export.ts`, the screen and its tests
were removed from this branch rather than carried as a second mechanism. What
this milestone still owns is the sealed store the credential lives in and the
controller's ownership of generating it; recovering the controller belongs to
#74.

The one finding worth keeping from that work is recorded below: the export
missed rows still in SQLite's write-ahead log, which is a trap any
controller-state copy can fall into. #74's own capture takes an online
backup, so the lesson is carried where the code now lives.

## 4 · The backup journey, end to end

Asked for in the conversation, carried out by the operator with the general
tools, on Shop — PostgreSQL, Redis, a worker and receipt files.

| Step | Result |
| --- | --- |
| A consistent snapshot of the database and the receipt files | **pass** — a `pg_dump`, a receipts archive, per-file SHA-256s and a payload digest, refused if the database changed mid-capture |
| Pulled off the application host | **pass** — 2,648 bytes on the computer running Server Guy, digest matched on arrival |
| Recorded as a copy with its class | **pass** — `backup-copy`, `destination-kind: controller`, size and digest, body saying it is not object storage |
| Plan updated with the destination and retention | **pass** — `backup-plan`, `destination-kind: controller`, keeps 7 |
| Restored into an isolated application | **pass** — a throwaway Compose project on an internal-only network, no published ports, no workers or scheduled jobs, fresh volumes |
| Exact data verified in the restored copy | **pass** — four baseline orders and prices matched exactly, a fifth order preserved, all five receipt files matched their recorded sizes and SHA-256 hashes |
| The isolated copy torn down | **pass** — every throwaway container, network and volume removed; production container identities and start times unchanged |
| Retention applied | **pass** — `prune_backup_copies` ran where the files are |

Checked independently: the copy on this computer opens, and inside it
`orders.json` holds all five orders with their exact items and prices, beside
a receipt manifest with a SHA-256 per file.

**A failure worth recording, because of how it failed.** The first attempt at
the transfer timed out and Pi **did the right thing**: no partial file kept,
`list_backup_copies` confirming nothing had landed, no `destination-kind:
controller` record written, and the plan marked failed until transfer worked.
It declined to record a copy that did not exist. The cause was mine —
`fetchBackupCopy` used `scp`, which in this rig reaches the server differently
from `ssh` — and the fix removed the second transport rather than shimming it:
one `ssh … cat` over the connection the controller already owns, so there is
one set of options and one pinned host key to get right instead of two that
can disagree.

**A gap in my own verdict, found by the records this produced.** The restore
test was of the *same-server* archive; the copy on this computer was newer and
had never been restored. The page would have said "Recovery proved" over an
untested file. A restore now proves the copy it restored and nothing newer:
when the newest copy postdates the newest restore, the page says so, credits
the earlier proof, and offers *Test a restore of the newest copy*. Which is
exactly what it says on the real records:

> **Limited** — Copies are reaching a destination off the application's
> server, and the newest one has not been restored. An earlier copy was
> restored and checked, so recovery has worked at least once. The newest copy,
> taken 4 min ago, has not been.

with all three destination classes listed separately, and the calendar below
reading *"Three copies are on record; the schedule keeps 7"* and *"A restore
test passed Sep 15, 14:50"*, while PostgreSQL's and Redis's own volumes show
**Not in the backup plan** — incomplete coverage surfaced rather than hidden.

## 5 · What the Backups page is allowed to say

Nine states, each with its own sentence and its own next action, ordered so a
failure is never hidden by a later success:

`not-assessed` · `none-configured` · `scheduled-no-copy` · `local-only` ·
`offsite-untested` · `restore-verified` · `backup-failed` · `backup-overdue` ·
`restore-failed` · `evidence-stale`

**"Recovery proved" is reachable only by a restore that actually ran.** A
failed copy stops counting as a copy. An overdue schedule outranks stale
restore evidence, because nothing being copied matters more than the age of
the last test. A restore of a same-host copy reads verified *and* says it does
not survive losing the machine — both are true and the page says both.

Where a copy goes is **declared**, not inferred: `destination-kind` is one of
`same-server`, `controller`, `off-site` or `provider`, because
`/var/backups/shop` and `s3://bucket/shop` are both destinations and one of
them dies with the server. A plan declaring none reads **unclassified**, which
the page treats as unproven rather than safe. Each class carries what it does
and does not protect against, and a provider snapshot is never allowed to
answer the application-aware question.

Overview's lane now reads `backup-copy` and `restore-test` as well as
`backup-plan`; reading one subject was what let a passing timer check speak
for all three.

Two self-contradictions found by looking at the page with real records on it:
the calendar called every copy one "off the server" while the banner above
said they were all on it, and retention recorded as "7 daily copies" printed
as "Not recorded" because it would not parse as a number.

![The Backups page. An amber banner reading LIMITED — copies are reaching a
destination off the application's server and the newest one has not been
restored — above three destination classes and a row of facts](2026-09-15-credentials-and-backups/backups-verdict.png)

*Revision `047c50f` on the local rig — real sshd in a Linux container, a real
ssh client with a pinned host key, real Docker and a real model; the GitHub
and Hetzner APIs are stand-ins. 1440×980. The rig reports the commit it
serves in its `manifest.json`, and it reported this one with a clean tree.*

*What it shows: the verdict credits the earlier restore that passed and still
refuses to call the newest copy protected. Below it the three destination
classes say what each does and does not protect against. The band for Server
Guy's own protection, from [PR
#74](https://github.com/lustoykov/server-guy/pull/74), sits beside it rather
than inside it — the application's data and the controller's own recovery are
different questions and the page keeps them apart.*

![Overview, with the Backups lane reading "Copied, restore untested" and its
detail carrying the same sentence as the Backups page](2026-09-15-credentials-and-backups/overview-lane-agrees.png)

*Revision `047c50f` on the local rig — real sshd in a Linux container, a real
ssh client with a pinned host key, real Docker and a real model; the GitHub
and Hetzner APIs are stand-ins. 1440×980. The rig reports the commit it
serves in its `manifest.json`, and it reported this one with a clean tree.*

*What it shows: the lane and the page now say the same thing in the same
words, including the limit. This is the defect review found — the lane used to
form its own opinion, and a plan with a passing timer could read "Verified"
three clicks from "Limited". The header also shows the earlier journey's fix:
"The tunnel is closed", with no way in offered.*

## What review found, and what it changed

A second session reviewed this branch at `0e6fbf4` and raised five points.
All five were checked against the code rather than taken on trust; two were
real defects of the kind this milestone exists to prevent.

- **The recovery export missed recent writes** (in the code since withdrawn, and the reason the lesson is recorded above). The controller runs SQLite in
  WAL mode, so its newest rows live in `server-guy.db-wal` rather than the
  database file. The export copied files, which meant an export taken shortly
  after a credential was generated could recover a database that did not
  contain it — precisely the case a recovery export is for. It now takes a
  consistent snapshot through `better-sqlite3`'s own `backup()` and the raw
  `server-guy.db` is excluded from the file list, so the archive cannot carry
  both a real snapshot and a stale copy. Covered by a test that writes rows
  into a genuine WAL database, exports, imports, and counts them.
- **A second change could throw away the working password.** `beginChange`
  stored the outgoing value in `previous`; calling it again while a change
  was unsettled overwrote `previous` with the not-yet-proved value, losing
  the only credential that still worked. It now refuses while a change is in
  flight, which is also what the tool description tells the model. One test.
- **The tool's optional `value` parameter is gone.** A replacement chosen by
  the owner and typed into chat would be in the model's context, its
  transcript, and anything built from either. Replacements are generated by
  the controller in this milestone; a masked owner-supplied field is a real
  path, but it wants its own journey and evidence rather than being added
  beside the first one. I built that field and then removed it: it was
  machinery this journey does not need, and shipping owner-facing UI I had
  not exercised would have been worse than not shipping it.
- **A `warning` Pi wrote no longer disappears.** Overview's Backups lane now
  reads the same verdict as the Backups page, which is the right fix for two
  surfaces disagreeing — but the verdict only consulted record status for
  *failed* copies, so Pi's own judgement on a plan stopped outranking a
  passing timer check. The verdict now carries `judged`, and `temper()` can
  only make an answer less reassuring: it downgrades `verified` to `warning`
  and never overrides a failure.
- **The export listed one database and captured another** (same withdrawn
  code). `exportContents()` resolved `server-guy.db` inside the config
  directory while the snapshot read `databasePath()`, so with the two pointed
  apart the page described a file the archive would not contain. Fixed before
  the feature was withdrawn. The transferable part is the test lesson: my
  first regression test asserted the entry was *listed*, which passes either
  way when both directories hold a file of that name — the assertion has to
  be the file's identity, and the byte count was what distinguished them
  (4,096 listed for a database that was 41,208).

- **The lane was dropping the half of the sentence that mattered.** With the
  verdict wired in, `plain` took the verdict's `says` and discarded its
  `limit` — so a lane could read "with a limit" and never say what the limit
  was. It now carries both, which is what makes Overview and the Backups page
  say the same thing in the same words.

## A stale rig was making browser evidence untrustworthy

Worth recording, because it invalidated evidence rather than code.

The local rig copies the application's `src` into its own directory, and did
so **only when that directory did not already exist**. Restarts reused the
copy. This rig's copy was taken on 14 September at 16:27, so every page I
checked in a browser today was rendering yesterday's code: a lane still read
`Set up, with a limit` after the change that replaces that caption, and I
spent a while looking for a defect in a projection that was already correct.
Running the real module over the rig's real 31 records is what settled it.

`tests/rig/rig.mjs` now refreshes the source on **every** start — `src` is
removed and re-copied, the stand-ins are re-applied, and `manifest.json`
records `sourceCopiedAt` and the commit actually being served. Recorded state
and the host container are still preserved, which is what makes a restart
cheap. After the change the rig was stopped and restarted through the new
path: it came back on the refreshed source, the lane read `Copied, restore
untested`, and the records and container survived.

**Anything verified in a browser before this fix should be treated as
verified against the 14 September snapshot.** The two owner-facing claims in
this document were re-checked afterwards, on a rig serving the current tree:

| Re-checked after the fix | What it showed |
| --- | --- |
| Overview's Backups lane | `Copied, restore untested`, amber |
| its detail | the verdict's sentence **and** its limit, word for word what the Backups page says |
| a generated value's panel | masked by default, `Reveal` and `Copy`, no other control |
| revealing one | 32 characters of base64url on screen, then masked again |
| the values in anything durable | absent from every message, record, execution, Pi activity entry, controller state file and log |

## One credential was exposed, and is no longer valid

My own process failure, recorded because the milestone is about not leaking
credentials.

While verifying the reveal control I clicked `Hide`, but the note that appears
under a revealed value had shifted the button, so the click missed and the
value was still on screen when I read the panel back and took a screenshot.
The value — the rig's synthetic `SHOP_METRICS_TOKEN` — went into this
session's transcript.

It was a synthetic credential for a local test rig and never a real one. It
was nonetheless retired immediately: the entry was withdrawn and regenerated,
so the exposed string is not current anywhere. The re-verification above was
then done reading only derived properties — whether the value was masked, its
length, its character class — and never its text.

The lesson is the specific one: **a masked value's controls move when
revealing it adds a line to the panel**, so coordinates computed before the
reveal cannot be trusted to hide it again.

## What is not proved

- **R2 and S3 are not proved.** The destination implemented and exercised is
  the computer running Server Guy: genuinely off the application host,
  dependent on this machine, and not object storage. The tool says so and the
  page says so. The rig's MinIO was available but reaching it needs its
  private CA and an S3 client on the host, which is a detour rather than
  evidence; one destination that genuinely works was judged worth more than a
  shallow attempt at four. **No claim here bears on R2 or S3 integration.**
- **Schedules independent of an open chat are not implemented here.** Copies
  are taken when asked for. Retention runs in the controller where the files
  are. A plan record may carry a schedule Pi arranged on the host; nothing in
  this change makes the controller run one, and the page reports what records
  say rather than implying a timer this milestone added.
- **The provider is the rig's stand-in**, as in every run on this rig.
  Everything above the provider API is the product's own.
- **A live rollback was not exercised.** `settle_credential_change(false)`
  restoring the working value is covered by unit tests, not by a deliberately
  broken live rotation.
- **Coverage is reported, not reconciled.** The page says which volumes a plan
  covers and shows the ones it does not, from the plan's own `covers` fact.
  Nothing checks that fact against what is actually on disk, so a plan that
  claims to cover a volume it does not would be believed.
- **`generate_secret` was ignored twice before it was used.** Pi asserted the
  tool was "unavailable in this session" without calling it, in two separate
  turns, and only used it when told to re-read its tool list. The tool was
  registered throughout — the same session used it successfully minutes later.
  That is a model-behaviour limitation of this run, not a wiring defect, and
  it means a fresh conversation is the more reliable way to reach a newly
  added tool.
- **The Backups verdict is proved on one record set.** The ten states have
  unit coverage, and the live rig exercises `offsite-untested` and the states
  before it. `restore-verified` on a live rig, and the overdue states with a
  real elapsed schedule, are covered by tests rather than by a run.
- **A restore of the *newest* copy has not been run.** The rig's newest copy
  is deliberately untested, which is why the lane says so; an earlier copy was
  restored and checked. The verdict's distinction between those two is
  therefore reported honestly, but the "newest copy restored" path is proved
  by tests only.
- **Owner acceptance is not claimed** for anything here.

## Checks

| | |
| --- | --- |
| `npm test` | **877 passed**, 1 skipped, 0 failed |
| the same on `be8c199` before this branch | 807 passed — no regressions |
| `npx tsc --noEmit` | clean for every changed file |
| `npm run lint` | 2 errors, both in `pi-activity.tsx`, byte-identical to `main` |
| `npm run format` | applied |

New focused tests: generation, reuse on retry, restart survival, reveal and
its refusals, the change flow and its rollback, the incoming/outgoing
environment, a value carrying `'; rm -rf /` put through a real shell, the ten
protection states and destination classes. The recovery archive's round-trip
and leak tests went with the feature.
