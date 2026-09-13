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
| `domain` | Domains | a name resolves and is delegated; a `certificate` only proves it |
| `cdn` | CDN | caching is a claim about somebody else's edge, not about the host |
| `firewall` | Security | one policy governs many `door`s and can itself be absent |
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
| `host` (added) | — | `cpu` `memory` `disk` |
| `process` (added) | — | `restarts` `cpu` `memory` |

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

## Prerequisite B · giving Pi a secret without Pi seeing it

Grafana needs an admin password. Pi is correctly forbidden from asking for one
in chat and from saving it, so today the journey stops.

The flow, and the boundary at each step:

1. **Pi asks for a handle, not a value.** `request_secret({name, why, process?})`
   records that the application needs `GF_SECURITY_ADMIN_PASSWORD` and returns
   the handle `{{secret:GF_SECURITY_ADMIN_PASSWORD}}`. Pi never receives a value
   and has no tool that returns one.
2. **The owner types it into a masked field** rendered by the product in the
   conversation — not into the message box. It never becomes a message, so it
   is never in the transcript, never in Pi's context, and never in an evaluation
   artifact.
3. **The controller stores it** under `piConfigDir()/secrets/`, encrypted with
   AES-256-GCM under a key file at mode 0600. This is *not* a claim of
   protection against someone who already has the controller's filesystem — it
   is protection against the ways a value leaks by accident: a backup, a grep, a
   screen share, a copied directory. The UI says exactly that and no more.
4. **Only the execution layer resolves it.** `server_bash` substitutes handles
   at spawn time. The command as recorded, as displayed and as logged keeps the
   handle. Output is scanned for every held value before it is stored.
5. **Pi records the variable, not the value.** A `variable` subject with
   `source` and `established` facts. Save-time validation rejects a `value` key
   on a `variable`, and rejects any fact whose value matches a held secret or
   looks like a credential.

Environment Variables shows name, source and whether a value is established. It
has no reveal control, because there is nothing behind it to reveal: the page is
built from records, and the value was never in one.

---

# 1 · Processes

The Line design: on the left what runs and how sure we are, on the right the
path a visit takes from the network to the web process, with everything
private behind a wall.

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
| the ghosts | a fixed list of what Server Guy cannot do yet | — | — | derived, and never presented as a reading |

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
| disk used / total | `host` facts `disk` | observed | `contents` | recorded |
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

The Timeline design: one lane each for health, copies and restores, so "when
was it last known good" is a glance rather than an inference.

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
