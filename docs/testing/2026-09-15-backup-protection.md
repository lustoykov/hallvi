# Why the Backups lane was green, and what it says now

The owner asked what made that lane green, because a green lane under the word
Backups is the most reassuring thing this page can say. The answer is that the
lane threw away the one part of the record that told the truth.

## What was on record

Shop's two backup records, read back from the rig on 15 September:

**`backup-plan · shop-local-backup` — "Daily same-host backups are configured"**

- `status: "warning"` ← **Pi's own judgement**
- body: "The plan writes a PostgreSQL dump and receipts archive to protected
  storage on the application host and retains seven daily copies. This reduces
  risk from accidental data changes but **does not protect against loss of the
  entire server**."
- one check: `configured` · passed · claim `configuration` · "Daily backup
  timer is active"
- facts: destination `/var/backups/shop` **on the application host**, keep 7
  daily copies, covers `shop-db` and `shop-receipts`

**`backup-copy · shop-backup-20260914T134425Z` — "The first Shop backup was written and checked"**

- body: "Archive parsing checks this copy's structure; **a full restore into a
  separate environment has not yet been performed**."
- checks: `written` passed, `verified` passed — both claim `contents`
- facts: 2,795 bytes, same on-host destination

Pi did this exactly right. It marked the plan a warning, said in plain words
that it does not survive losing the machine, and declined to call an unrestored
copy proof of recovery.

## What made the lane green

Two things, both in the reading layer:

1. **`readLane` consulted only checks, never the record's own `status`.** The
   plan's single check — the timer is active — passed, and its claim is
   `configuration`, which stays fresh for seven days. So the lane read
   `verified` and printed "Checked 5 min ago". Pi's `warning` was discarded on
   the way to the screen. `tagFor`, which draws record cards, has always
   honoured `warning`; the lane did not, so the same record read two different
   ways on one page and the lane was the reassuring one.

2. **`backup-copy` has no lane.** `laneOf` maps `backup-plan` to `backups` and
   nothing else, so the copy record — the only one that says anything about a
   copy actually existing — contributed nothing either way. The lane was
   answering "is a backup configured", under a heading the reader reads as "is
   my data safe".

## The four things that are not the same

The owner asked for these kept apart. On record they are distinguishable; the
lane was not distinguishing them.

| | What it is | Where it lives | What it proves | Seen in these runs |
| --- | --- | --- | --- | --- |
| **Provider backups** | The host's whole disk, snapshotted by Hetzner | Off the machine, in the provider's account | The machine can be rebuilt. Not that the application's data is consistent, and not that anyone has tried | Ghost only — `backup-plan · hetzner-server-backups`, a **paid add-on Pi enabled itself**; see the [resource scope audit](2026-09-14-resource-scope-audit.md) |
| **Local copies** | A dump written beside the application | **Same host** | Recovery from a mistake *inside* the application. Nothing at all if the host is lost | Shop — the record above |
| **Off-server copies** | A copy in storage the host does not own | Elsewhere | That the data exists somewhere the machine's failure cannot reach | **neither run had one** |
| **Verified restores** | The copy booted somewhere else and checked | — | That the copy is usable, which is the only thing a backup is for | **neither run had one** |

So in both runs the lane was green while no off-server copy existed and no
restore had ever been proven. For Shop the strongest true statement was "a
readable copy exists, on the same disk as the thing it protects".

Ghost's four backup-shaped records were `job · ghost-backup-job`, `backup-plan
· ghost-logical-backups`, `backup-plan · hetzner-server-backups` and
`backup-copy · ghost-sql-20260914T145039Z` — titles observed during that run.
Their statuses and checks cannot be re-read: that controller's state was
disposable and is gone with the server. The Shop records above are the evidence
this document rests on.

## What changed

`readLane` now reads a record's `status` alongside its checks. A `failed`
status outranks everything; a `warning` outranks a passing check on the same
record and, like a failure, does not age. The lane's caption stops reporting a
time — "Checked 5 min ago" was the number that invited the reader past the
colour — and says **"Set up, with a limit"**, with Pi's own sentence carried in
the lane's `plain` text where the reader learns what the limit is.

A plan Pi is content with still reads verified, so this does not paint every
backup amber. A covering test asserts that.

**What this does not do.** It does not teach the lane the difference between
the four rows above — that needs `backup-copy` and `restore-test` in the lane
mapping, which the [presentation contract](../presentation-contract.md) still
lists as deferred, and a rule for how a copy and a restore combine into one
reading. Until then the lane reports Pi's judgement faithfully instead of
overriding it, which is the honest floor rather than the finished feature. A
plan carrying no warning and no off-site copy would still read verified; today
nothing in the contract lets the lane know the difference, and Pi supplying the
warning is what makes the current reading right.

## A second thing this found

The same "which time do you cite" mistake sat in the stale readings. Five
checks minutes old beside one twenty-one hours old produced a headline saying
*"It held when it was last checked, 4 min ago. Enough time has passed that it
may have changed."* — a sentence arguing with itself, whose number belonged to
the wrong observation. Both the headline and the lane captions now cite the
lapsed claim's own time: **"21 h ago"**, beside an amber dot, agreeing.
