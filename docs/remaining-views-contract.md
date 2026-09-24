# The remaining eleven destinations, field by field

Overview, Architecture, Deployment, History and Logs already read records.
This is the contract for the eleven that do not yet: what each designed page
puts on the screen, where every value comes from, and what the page says when
the value is not there.

It is written before the code on purpose. The failure mode this milestone
exists to avoid is a page that looks complete because the component invented
the missing half, so each field is settled here — *observed, planned or
reported; refreshed by what; derived or recorded* — before anything renders
it.

## How to read the tables

**Supplies it** names the subject (`kind:id`) and the declared `key` on that
subject's fact or check. `topology` means the part list on the application's
map. `execution` means the controller's own record of a command, which Pi
never re-types.

**Basis** is what Pi must write: `observed` when it watched it, `reported`
when a provider or a manifest said so, `planned` when it is only intended.

**Refreshed by** is the `claim`, which is the only thing that decides how fast
a reading stops being worth trusting. The horizons live in one table in the
reading layer and nowhere else:

| claim | horizon | for |
|---|---|---|
| `identity` | never | a digest, a volume name, a revision — a change makes it a different thing |
| `configuration` | 7 days | a region, a size, a schedule, a firewall rule |
| `contents` | 3 days | a size, a row count, a backlog depth |
| `reachability` | 12 hours | something answered |
| `liveness` | 15 minutes | it is running *now* |

**Derived** means the component computes it and Pi must not write it: a
duration, a count, an ordering, a freshness word. **Recorded** means only Pi
can know it and the component must never guess.

## The six states every field has

Every table below is a promise about these six, so they are defined once:

| state | what it means | how it draws |
|---|---|---|
| **present** | a record states the subject `present`, and the key is there | the value |
| **absent** | a record states the subject `absent` | "None" — and *only* here |
| **unassessed** | no record names the subject at all | "Not assessed" in the page's ghost treatment, never "None" and never healthy |
| **partial** | the subject is stated but this key is missing | the row is a ghost; the rest of the card is normal |
| **stale** | the newest reading is past its claim's horizon | the value, amber, with when it was read |
| **failed** / **warning** | a check reported `failed`, or the record is `warning` | red / amber, unaged — a failure does not become doubt with time |

A failed *connection* is not an absence. If Pi could not reach a host, the
honest record is a `failed` check about reachability on the host, and every
subject behind it stays at its last reading with its own age. Nothing
disappears because a check could not run.

---

# What the vocabulary gains

Ten subject kinds and one content change. Each is here because a table below
reads it; nothing is added in advance.

| new subject | earned by | why an existing kind would not do |
|---|---|---|
| `database` | Database | a `volume` is where bytes survive a restart, not an engine that answers queries |
| `cache` | Cache & queue | same: a broker holds state that is *allowed* to be lost |
| `queue` | Cache & queue, Jobs | a queue has a depth and an age; the broker holding it does not |
| `job` | Jobs | a schedule is a thing that succeeds or fails on its own clock |
| `variable` | Environment Variables | the only subject whose *value* must never be recorded |
| `domain` | Access | a name resolves and is delegated; a `certificate` only proves it |
| `cdn` | CDN | caching is a claim about somebody else's edge, not about the host |
| `firewall` | Access | one policy governs many `door`s and can itself be absent |
| `backup-copy` | Backups | one dated copy, which either exists or does not |
| `restore-test` | Backups | the only evidence that a copy is worth anything |

`monitor`, `door`, `access`, `certificate`, `backup-plan`, `process`, `volume`,
`host` and `application` already exist and are unchanged.

**No new content kinds.** Schedules are a `configuration` fact on the plan or
job that owns them. Measurements are `contents` facts and dated checks on the
subject measured. A "job run" is a check on the `job`, dated by its record —
the series is what History and the Jobs page read, and a series needs no new
shape.

## Declared keys

Architecture already reads particular keys on `host`, `web`, `private`,
`volume`, `gate`, `certificate` and `monitor`. These extend the same list. A
key outside it is still saved and still readable as detail; it just does not
decide what a designed page says.

| subject | checks | facts |
|---|---|---|
| `database` | `answering` | `engine` `version` `path` `size` `owner` |
| `cache` | `answering` | `engine` `version` `persistence` `port` |
| `queue` | `draining` | `library` `backend` `depth` `oldest` `failed` `workers` |
| `job` | `ran` | `schedule` `command` `timezone` `last-run` `next-run` |
| `variable` | — | `source` `scope` `established` — **never** `value` |
| `backup-plan` | `configured` | `schedule` `destination` `keep` `covers` |
| `backup-copy` | `written` `verified` | `size` `destination` `covers` |
| `restore-test` | `restored` | `covers` `took` |
| `domain` | `resolves` `serves` | `name` `registrar` `nameservers` `records` |
| `cdn` | `caching` | `provider` `zone` `covers` |
| `firewall` | `configured` | `provider` `default` `rules` |
| `monitor` | `answering` | `target` `interval` `notifies` |
| `certificate` | `valid` | `expires` `issuer` `covers` |
| `host` (added) | — | `cpu` `memory` `disk` (capacity) · `cpu-used` `memory-used` `disk-used` (readings) |
| `process` (added) | — | `restarts` `cpu-used` `memory-used` |

**Capacity is not a reading.** "4 GB" is what the machine has and never
changes; "1.2 of 4 GB used" is what it is doing right now. The first is
`configuration`, `reported`, and belongs under `memory`; the second is
`contents`, `observed`, and belongs under `memory-used`. One key for both
would make a Monitoring page show a spec sheet and call it a measurement —
which the first real run did, before this split.

## Prerequisite A · a release with more than one image

`content:{kind:"deployment"}` names one `image`. A Grafana-and-Prometheus
release has two, and Pi could only record one — it stored Prometheus's digest
on a Grafana deployment, which is not a rounding error but a false statement
about what is running.

```
content: {
  kind: "deployment",
  repositoryUrl, revision, server, changes: [],
  image?: string,                       // still read; a one-service release
  services?: [{                         // preferred when there is more than one
    process: string,                    // the id of the `process` subject
    image: string,                      // what was asked for
    digest?: "sha256:…"                 // the immutable identity, when known
  }]
}
```

`image` becomes optional and `services` is added. Save-time validation
requires *one of them*, so no release can be recorded without saying what it
deployed, and every record already written stays readable: a reader with no
`services` reads `[{process: <the web process>, image}]`.

Digest is separate from image on purpose. `grafana/grafana:11.2.0` is what
somebody asked for and can change under them; `sha256:…` is what actually ran.
The first is `configuration`, the second is `identity` and never expires.

## Prerequisite B · keeping a secret out of Pi's conversation

Grafana needs an admin password. Pi is correctly forbidden from asking for one
in chat and from saving it, so today the journey stops.

The flow, and the boundary at each step:

1. **Pi asks for a handle, not a value.** `request_secret({name, why, process?})`
   records that the application needs `GF_SECURITY_ADMIN_PASSWORD` and returns
   the handle `{{secret:GF_SECURITY_ADMIN_PASSWORD}}`. No tool returns the value
   directly to Pi.
2. **The owner types it into a masked field** rendered by the product in the
   conversation — not into the message box. It never becomes a message, so it
   is never in the transcript, never in Pi's context, and never in an evaluation
   artifact.
3. **The controller stores it** under `piConfigDir()/secrets/`, encrypted with
   AES-256-GCM under a key file at mode 0600. This keeps plaintext out of casual
   file inspection, grep output and screenshots. The key sits beside the
   ciphertext, so copying or backing up the full configuration copies both and
   is outside this protection.
4. **Only the execution layer resolves it.** `server_bash` supplies named values
   as environment variables at spawn time. The recorded and displayed command
   keeps the names, and exact held values are removed from captured output. A
   Pi-authored command can still read, transform or transmit its environment;
   this boundary prevents accidental disclosure, not deliberate exfiltration.
5. **Pi records the variable, not the value.** A `variable` subject with
   `source` and `established` facts. Save-time validation rejects a `value` key
   on a `variable`, and rejects any fact whose value matches a held secret or
   looks like a credential.

Environment Variables shows name, source and whether a value is established. It
has no reveal control, because there is nothing behind it to reveal: the page is
built from records, and the value was never in one.

---

# 1 · Processes

The register (chosen 21 September 2026, replacing the Line design): one row
per process with its role, what it runs, the readings a record carries and a
pip per check. A row opens in place onto its command and onto what proves it:
each check, what it looked at, when, and whether the pass still counts. The
fields below are unchanged; `restarts`, `cpu-used` and `memory-used` now have
columns, and a reading nobody recorded is drawn grey as "not recorded", never
as zero.

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| "Three processes are running" | count of `process` subjects stated `present` | — | — | derived |
| the certainty tag | newest `liveness` or `reachability` check across those processes | observed | `liveness` | derived |
| process name (`code`) | `process:<id>` | — | — | recorded (the id itself) |
| product name ("Grafana") | `process` fact `product`, else the image's own name | reported | `identity` | derived from the image when absent |
| role words | `topology` part kind: `web` → "The web app you open", `private` → "Private: only processes on the server reach it" | — | — | derived |
| reach ("Port 80 → 3000 · from your network only") | `process` fact `port` + the newest `application-access` record's `mode` | observed | `configuration` | derived |
| image | `deployment.services[].image`, else `process` fact `image` | reported | `identity` | recorded |
| command | `process` fact `command` | reported | `configuration` | recorded |
| health path | `process` fact `health` | reported | `configuration` | recorded |
| each probe row | `process` checks, one row per check | observed | the check's own claim | recorded |
| "2 of 3 checks" | count over those checks | — | — | derived |
| probe time | the record's `establishedAt` | — | — | derived |
| "Recent changes" | records `about` this process, newest five | — | — | derived |
| the ghosts | a fixed list of what Hallvi cannot do yet | — | — | derived, and never presented as a reading |

**Empty and partial.** No `process` subject at all → the page says nobody has
looked, and offers the one question that would change that. A process stated
`present` with no checks → it is drawn, with "No checks" where the count goes;
that is the honest difference between *not watched* and *watched and failing*.
A process stated `absent` → drawn struck through with when it went, because a
process that used to be there is information.

**Not inferred.** Restart counts, resource use and anything continuous. The
design has ghost rows for them and they stay ghosts until something records
them.

# 2 · Storage

The Flow design: what is on disk, which process owns it, and what would happen
to it if the container were replaced.

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| volume name | `volume:<id>` | — | — | recorded |
| owner | `topology` `disk` edge from a process to this volume, else `volume` fact `owner` | — | — | derived |
| mount path | `volume` fact `path` | observed | `configuration` | recorded |
| docker name | `volume` fact `docker` | observed | `identity` | recorded |
| size | `volume` fact `size` | observed | `contents` | recorded |
| "survives replacement" | `volume` check `persistence` | observed | `configuration` | recorded |
| what is in it | `volume` fact `holds` | reported | `contents` | recorded |
| disk used / total | `host` fact `disk-used` | observed | `contents` | recorded |
| copies, schedule, restores | `backup-plan`, `backup-copy`, `restore-test` (§7) | — | — | recorded |

**Empty and partial.** No `volume` subject → "Not assessed", with the note that
a container without a volume loses its data on replacement and that nobody has
checked which this is. That is the case the old page got wrong: it printed a
confident "no volumes" from a model nothing populated.

A `volume` stated `present` with a `persistence` check that has *not* run reads
"Not tested" — distinct from a failed test, which reads red and says the data
did **not** survive.

**Never inferred.** That a volume is backed up. Storage and Backups are
different questions and the answer to one is not evidence for the other.

# 3 · Database

The register (chosen 21 September 2026, replacing the Timeline design): every
`database` subject is a row with where its data lives, its size, who uses it
and its checks; facts under keys this page does not declare read as detail in
the opened row. Under it, the backup situation as four rows read from the
same projection Backups uses: is a copy scheduled, is there one off the
server, has one been restored, and what a copy holds. The three never borrow
from one another.

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| engine ("PostgreSQL 16") | `database` facts `engine` + `version` | reported | `identity` | derived (joined) |
| where it lives | `database` fact `path`, or the `disk` edge to a `volume` | observed | `configuration` | recorded |
| owner | `topology` edge from a process, else fact `owner` | — | — | derived |
| size | `database` fact `size` | observed | `contents` | recorded |
| the health lane | `database` checks keyed `answering`, one mark per record | observed | `liveness` | recorded |
| the copies lane | `backup-copy` subjects (§7) | observed | `identity` | recorded |
| the restores lane | `restore-test` subjects (§7) | observed | `identity` | recorded |
| "last known good" | newest passed `answering` | — | — | derived |

**Empty and partial.** No `database` subject → "Not assessed". This is where
the distinction earns itself: an application may genuinely have no database,
and only a record stating `database` `absent` may say so. A SQLite file inside
a volume is a `database` whose `path` is inside that volume — the two subjects
are both real and the `disk` edge joins them.

# 4 · Cache & queue

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| broker name and product | `cache:<id>` + fact `engine` | reported | `identity` | recorded |
| version | `cache` fact `version` | reported | `identity` | recorded |
| persistence | `cache` fact `persistence` | reported | `configuration` | recorded |
| reach | `cache` fact `port` + the map's part kind | observed | `configuration` | derived |
| queue name and library | `queue:<id>` + fact `library` | reported | `configuration` | recorded |
| what backs it | `queue` fact `backend` | reported | `configuration` | recorded |
| depth, oldest, failed | `queue` facts `depth` `oldest` `failed` | observed | `contents` | recorded |
| which workers take from it | `queue` fact `workers`, matched to `process` subjects | reported | `configuration` | derived (the matching) |

**Empty and partial.** No `cache` and no `queue` → "Not assessed", and the page
offers to ask whether one would help. A `cache` with no `depth` reading → the
broker is drawn and the numbers are ghosts: a broker nobody has measured is not
a broker with an empty queue.

# 5 · Jobs

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| job name | `job:<id>` | — | — | recorded |
| what it runs | `job` fact `command` | reported | `configuration` | recorded |
| schedule and timezone | `job` facts `schedule` `timezone` | reported | `configuration` | recorded |
| next run | `job` fact `next-run` | planned | `configuration` | recorded — **never computed** from the cron string |
| last outcome | newest `job` check `ran` | observed | `liveness` | recorded |
| run history | the series of records stating that `job` | observed | — | derived from the series |
| recurring work elsewhere | `backup-plan` schedules (§7) | planned | `configuration` | derived |

**Never computed.** The next run. Parsing a cron expression against a timezone
the controller is guessing at produces a confident time that is wrong twice a
year, and the page has no way to show that it guessed.

# 6 · Environment Variables

The Manifest design. The only page whose subject must never carry its value.

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| name | `variable:<NAME>` | — | — | recorded |
| which process reads it | `variable` fact `scope`, else the map | reported | `configuration` | recorded |
| where the value came from | `variable` fact `source` | reported | `configuration` | recorded |
| whether a value is established | the secret store for a requested one; fact `established` otherwise | observed | `configuration` | derived |
| **the value** | — | — | — | **never, from anywhere** |
| still waiting | a `request_secret` with no value supplied | — | — | derived |
| applied at | the newest release's `establishedAt` | observed | `identity` | derived |

There is no reveal control, because there is nothing behind it: a requested
value is in the sealed store that has no read path to a page, and an ordinary
variable's value was never recorded at all.

# 7 · Backups

The Calendar design. Three subjects, and the page is wrong if it merges any
two of them: a **plan** says copies are meant to happen, a **copy** is one
dated copy that exists, a **restore test** is the only evidence a copy is
worth anything. A plan with no copies is a promise. Copies with no restore
test are files nobody has opened.

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| the schedule, in words | `backup-plan` fact `schedule` | planned | `configuration` | recorded |
| where copies go | `backup-plan` fact `destination` | reported | `configuration` | recorded |
| how many are kept | `backup-plan` fact `keep` | planned | `configuration` | recorded |
| what the plan covers | `backup-plan` fact `covers` (volume ids) | planned | `configuration` | recorded |
| each dot on the calendar | one `backup-copy` subject, at its `establishedAt` | observed | `identity` | recorded — **counted, never incremented** |
| a copy's size and destination | `backup-copy` facts `size` `destination` | observed | `contents` | recorded |
| the restore ticks | `restore-test` checks | observed | `identity` | recorded |
| "kept through a replacement" | `volume` check `persistence` | observed | `configuration` | recorded |

**Empty and partial.** Nothing at all → "Not assessed", and specifically *not*
"no backups": Hallvi not having looked is not the same as there being
none. A plan and no copies → the plan is drawn with an empty calendar and the
page says the promise has not produced anything yet. Copies and no restore
test → the copies are drawn and the restore tick is explicitly untested, which
is the state most systems are actually in and the one worth naming.

**Never inferred.** That a copy is good. Only a `restore-test` says that, and
its absence is drawn as an absence rather than left out.

# 8 · Monitoring

The Watching map: the server as a frame, one card per part inside it, and the
watcher as a card outside with a wire in (a ghost when there is none). Above
it, a day of traffic and server load.

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| a part card | one part of the map that has a subject | — | — | derived |
| its checks, as sentences | every check on that part's subject, worded by key | observed | the check's own claim | recorded |
| when it was last looked at | that check's record `establishedAt` | — | — | derived |
| worked / too old to count / failed, and how much longer a pass counts | the check's status, aged by its claim's horizon | observed | per claim | derived from both |
| the watcher | `monitor:<id>` presence + check `answering` | observed | `liveness` | recorded |
| what it watches | `monitor` fact `target` | reported | `configuration` | recorded |
| how often | `monitor` fact `interval` | reported | `configuration` | recorded |
| who hears about it | `monitor` fact `notifies` | reported | `configuration` | recorded |
| CPU / memory / disk | `host` facts `cpu-used` `memory-used` `disk-used` | observed | `contents` | recorded |
| traffic over a day | newest `usage` content: requests, 5xx, p95 and top paths per bucket, read from the proxy's access log | observed | when Hallvi reads it | recorded |
| CPU / memory over a day | the same `usage` record's `host` series, read from the host's own samples | observed | when Hallvi reads it | recorded |
| the unwatched gaps | parts with no live check, plus a fixed list of what Hallvi cannot watch | — | — | derived |

**The distinction this page exists to make.** A check that ran once and passed
is not monitoring. Without a `monitor` subject stating something is watching,
the watcher is drawn as a ghost and the lede says nothing is watching, however
green the last results were — because that is the truth, and the page whose job is to say
whether you would hear about a problem must not imply you would.

**Never inferred.** That anything is being watched continuously. A part reads
"Watched" only while a `monitor` is running, and only the web part, because a
web address is all a watcher's record says it watches.

# 9 · Access · what a visitor sees

Domains and Security were one question asked twice, and became one
destination on 24 September 2026. This half is the name and what a visitor
gets; §11 is the ports and the firewall.

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| the name | `domain:<name>` + fact `name` | reported | `identity` | recorded |
| does it resolve | `domain` check `resolves` | observed | `reachability` | recorded |
| does it serve this application | `domain` check `serves` | observed | `reachability` | recorded |
| who it is registered with | `domain` fact `registrar` | reported | `configuration` | recorded |
| nameservers | `domain` fact `nameservers` | observed | `configuration` | recorded |
| the DNS records | `domain` fact `records` | observed | `configuration` | recorded |
| HTTPS state | `certificate` check `valid` | observed | `reachability` | recorded |
| who issued it, when it expires | `certificate` facts `issuer` `expires` | reported | `identity`, and `freshFor` to the expiry | recorded |
| the address in use now | the `application-access` record's URL | observed | `configuration` | derived |
| who can reach it | `application-access` `mode` + `door` `sources` | observed | `configuration` | derived |
| each caller row | one probe: a `door` or `certificate` check, or the access record | observed | `reachability` | derived from checks |

**Empty and partial.** No `domain` → the page shows the address actually in
use and says no name has been recorded, which for a tunnelled private
deployment is the whole truth. A `domain` that resolves but whose `serves`
check has not run → drawn as resolving, with the second row a ghost: DNS
pointing somewhere is not the same as that somewhere answering.

**Never inferred.** That HTTPS works because a name exists. A certificate is
its own subject with its own check.

# 10 · CDN

Contracted with Cache & queue (§4), Jobs (§5) and Environment Variables (§6),
which share one supply projection with it. The one rule worth
repeating: **no CDN recorded reads "nobody has looked"**, and only a `cdn`
subject stated `absent` reads "nothing caches in front". The distinction
matters because the second is a finding and the first is a to-do.

# 11 · Access · ports and the firewall

The second half of the destination §9 opens: what can reach in, over which
ports, and what is guarding.

| field in the design | supplies it | basis | refreshed by | derived / recorded |
|---|---|---|---|---|
| each door | `door:<id>` + facts `port`, `sources` | observed | `configuration` | recorded |
| is it open or refused | `door` checks `open` / `refused` | observed | `reachability` | recorded |
| what it serves | the map's edge from that gate | — | — | derived |
| the firewall | `firewall:<id>` presence + check `configured` | observed | `configuration` | recorded |
| who provides it | `firewall` fact `provider` | reported | `configuration` | recorded |
| its default | `firewall` fact `default` | reported | `configuration` | recorded |
| its rules | `firewall` fact `rules` | observed | `configuration` | recorded |
| SSH | `host` check `ssh` | observed | `reachability` | recorded |
| the audience | `application-access` `mode` | observed | `configuration` | derived |
| the guards | checks that passed *by refusing* — a `refused` door | observed | `reachability` | derived |
| the holes | doors open to everyone, and a firewall nobody has read | — | — | derived |

**The one to get right.** A port that refused a connection is a **pass**, and
a page that colours every failed connection red would report the firewall
working as the firewall broken. `refused` passing is the door doing its job.
Conversely, no `firewall` record at all is a hole — not a green tick — because
an unread policy is an unknown policy.

**Empty and partial.** No `door` and no `firewall` → the page says nothing has
been established about what can reach in, and offers to find out. That is
different from "nothing can reach in", which no record has said.

---

# The external boundary, and where it stops

Access and CDN are built and tested against records. The provider path is
wired as far as reading, and stops there.

## What is connected

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are read from the
controller's environment on the server only — never into a record, a fixture,
or anything a client component receives. `GET /client/v4/user/tokens/verify`
is asked before anything is claimed, so Settings says *connected* because
Cloudflare said so, not because a variable is set.

Verified against the real account: the token is `active`, one zone is visible
(`accountant-agent.com`, active), and 14 R2 buckets are listed.

## The distinction the UI keeps

This token **manages** R2 through Cloudflare's management API: it can list
buckets and create them. It is **not** an S3 object-upload credential. Writing
a backup into a bucket still needs an R2 Access Key ID, a Secret Access Key,
the bucket, and the account's S3 endpoint — four separate things Cloudflare
issues separately. Settings carries them as their own row, unconnected,
because a green tick that implied otherwise would send somebody looking for a
bug in an uploader that was never going to work.

## Access and CDN · the contract

Three checks on a `domain`, because they are three questions and only the
third is about the application:

| check | claim | asks | answered by |
|---|---|---|---|
| `configured` | configuration (7d) | does the provider hold a record for this name? | `check_domain`, server-side |
| `resolves` | reachability (3d) | does public DNS return anything for it? | Pi, from the server |
| `serves` | reachability (3d) | does the **application** answer when someone asks for the name? | Pi, from the server |

**A configured record is never evidence that the application answers.** A
proxied name makes the gap visible: it resolves to the provider's addresses,
serves the provider's certificate, and returns the provider's error page while
the origin behind it is dead. Every one of those is a success signal that says
nothing about the application.

The five states a reader is given, one of which is always true:

| state | means | drawn from |
|---|---|---|
| `pending-dns` | the record is held, and nobody has resolved the name | `configured` alone |
| `failed` | the name does not resolve | `resolves` failed |
| `resolving` | it resolves, and nothing has checked what answers | `resolves` passed, no `serves` |
| `unreachable` | it resolves, and the application does not answer | `serves` failed |
| `serving` | the application answers on the name | `serves` passed and fresh |

A `serves` that passed but has aged past its claim drops to `resolving` with
the date of the reading, rather than keeping a green it can no longer support.
A `serves` that failed keeps failing, because an outcome survives ageing.

`domain` facts: `name`, `type`, `origin`, `proxied`, `registrar`, `records`.
`proxied` is read as a family of words — Pi writes `Enabled`, `Yes`, `on`,
`Proxied` — and **an unrecorded proxy state is unknown, not direct**, because
"this name hands out its origin address" is a claim.

CDN splits the same way: `caching` says a cache is in front, and
`origin-reachable` says whether anything answers behind it. A cache in front
of a dead origin is still a cache in front, and every visitor gets the
provider's error page.

Both pages say when the record's origin is **not this application's server**,
because nothing else on either page would.

An unread certificate is `unknown`, not `not-configured`. A proxied name is
almost always served over a certificate the provider issued and nothing here
has read; `not-configured` needs a written absence.

## What that was proved against

`server-guy-getting-started-b2184a72.accountant-agent.com`, an `A` record to
`46.62.253.6`, proxied — created by the owner, read but never written by
Hallvi. Pi checked it from the application's own server:

```
configured  passed   the provider reports a proxied A record
resolves    passed   two Cloudflare IPv4 and two Cloudflare IPv6 addresses
serves      failed   HTTP redirected to HTTPS; HTTPS returned 522 after ~19s
origin-reachable failed   both request paths ended in a 522 origin timeout
```

The 522 carried `private, no-store, no-cache`, so it is not a cached copy of
anything. **The origin was never exposed**: a private origin behind a proxied
name is exactly this, and it is the distinction the design exists to draw.

## What had still not been done, when this was written

No DNS record had been created, changed or deleted — the record above was
already in place — and nothing had been purchased. Proving `serving` rather
than `unreachable` needed the origin to accept public HTTP, which was a
separate decision:

| what | why it needed you |
|---|---|
| public ingress on the origin | it makes a deployment reachable from the internet, which is the opposite of the private-by-default rule |
| a firewall rule for 80/443 | same |

**DNS writes have since shipped.** [PR #76](https://github.com/lustoykov/hallvi/pull/76)
added `set_domain_record`, which writes one exact name of one exact type per
call, refuses to take a name from whatever already holds it without `replace`,
and refuses to remove a record whose address is not the one it expects. The
publishing path it belongs to is described in
[Architecture](architecture.md#publishing-at-a-domain), and what it was proved
against is in [that evidence](testing/2026-09-15-publish-custom-domain.md).
The read path above still needs no writes.
