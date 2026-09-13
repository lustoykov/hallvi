# The remaining eleven destinations: what was proved

Companion to [`docs/remaining-views-contract.md`](../remaining-views-contract.md),
which says what each page promises. This says what was actually run and what
it found.

## Rig

| | |
|---|---|
| host | `sg-rig-views`, Linux container with systemd and its own dockerd |
| SSH | real `sshd` inside it, published on `127.0.0.1:2224` |
| controller | `tests/results/rig/views`, port 3420 |
| stand-ins | GitHub API, Hetzner API. Everything else is the product. |

The product does its own host-key scan, its own key authentication and its own
`ssh -M -f -N -T -L` forward. Only the address is the rig's fiction.

## What real records found

Each of these was a page saying more than its records supported. None would
have been caught by a fixture, because a fixture is written by the same person
as the reader.

| what the page said | what the records said |
|---|---|
| "Port 80 → its port" | `127.0.0.1:3000 → 3000/tcp`, written the way Docker writes it |
| "Your network · No address filter" | a door recording `127.0.0.1 only` |
| "Port 80 on the server, opened by the firewall" | an SSH tunnel to loopback, with neither |
| five sources: Server, loopback, via, SSH, tunnel | one source, in prose |
| memory `4 GB` as a **measurement** | `4 GB` is the spec sheet; usage was never recorded |
| a volume row wider than the server box it sits in | a volume named `grafana-prometheus_metrics` |

The last two are the interesting ones. Capacity and usage under one key would
have made Monitoring show what a machine was sold with and call it a reading;
they are now `memory` and `memory-used`, two claims with two bases. And the
layout only broke because a real volume name is longer than `uploads`.

## Journey 1 · Docker Getting Started, from nothing

A fresh application, three ordinary turns, no corrective "please populate the
UI" prompt. Records Pi wrote of its own accord:

| subject | what it carries |
|---|---|
| `host:hetzner-4201` | server-id, address, region, size, cpu, memory, disk, three costs · `ssh` passed |
| `application:37c5d864…` | revision · `http` passed · the topology |
| `process:getting-started-web` | product, role, command, image, digest, port, revision, health, restarts · `container`, `http`, `hardening` passed, `dependency-audit` **failed** |
| `volume:getting-started-sqlite-data` | path, mount, size, owner · `persistence` passed |
| `database:getting-started-sqlite` | size, owner, rows · `answering` passed |
| `access:getting-started-private-access` | the `application-access` content |
| `backup-plan:getting-started-sqlite-backups` | **stated absent** — "No backup plan protects the SQLite data" |
| — | the release, with its image digest |

That last one is the contract working as designed. Pi did not stay silent
about backups and leave the page reading "not assessed"; it established that
there are none, so Backups can say "no copy off the server is on record"
rather than "nobody looked". Those are different sentences and only a record
can choose between them.

**Reached** through the product's own tunnel: `127.0.0.1:38123` → 200.

**Pages, on those records**: Processes draws one process, 5 of 6 checks, the
failing one red. Storage draws the volume, its owner taken from the map's disk
edge, "kept through a replacement". Database draws three lanes with only the
health lane populated. Monitoring leads with the failing check and says
"nothing listens between deployments", with the silence quantified. Backups
draws an empty calendar over a stated absence.

## Journey 2 · Shop, and the secret it needs

`tests/fixtures/shop-app`: web, PostgreSQL, Redis, a worker on a real queue, a
nightly job, a volume that must survive replacement, one ordinary variable and
one secret. Its README states every port, path and variable.

Asked to deploy it, Pi read the repository and **stopped to ask**, unprompted,
for two values it must not invent:

```
SHOP_ADMIN_PASSWORD  · for shop-web
  "Required by the Shop admin endpoint and compared with the
   X-Admin-Password header. It will be stored only in the server
   deployment environment, not the repository or logs."

POSTGRES_PASSWORD    · for shop-db
  "Required to protect the Shop PostgreSQL account used by the web and
   worker processes."
```

Both were supplied the way the masked field supplies them — a POST to the
controller, never a message.

### Where the value went, and where it did not

| | |
|---|---|
| in the sealed store, encrypted | yes |
| the plaintext, anywhere under the rig tree | **0 occurrences** |
| in an execution record, an activity record, a log, a workspace file | none |
| `{{secret:…}}` handles in the activity records | 2 |

The sweep is `grep -rl` over the whole rig root. Zero is the number that
matters: the value exists on this machine only inside AES-256-GCM, and reaches
a command only as it is spawned.

### The whole loop, exercised

The point of a secret flow is that the value arrives where it is needed. It
did:

```
POST /orders {"item": "a blue widget"}      → {"id": 2}
GET  /orders                                 → cents: 1300
```

Thirteen characters at 100 cents each: the **worker** took the id off the
Redis list, priced it and wrote a receipt. So web, PostgreSQL, Redis and the
worker are all real and all talking.

```
GET /receipts/2                              → "a blue widget — 13.00 EUR"
GET /admin/summary  (wrong password)         → 401
GET /admin/summary  (the supplied value)     → 200 {"orders": 2, "cents": 4100}
```

The receipt came from the volume. The 401 and the 200 are the same endpoint
with two different passwords, which means the sealed value reached the running
process — while appearing nowhere in any record, log or artifact.

That is the flow end to end: the owner types it, the controller seals it, the
execution layer puts it in as the command is spawned, and the process gates on
it.

### What Shop populated, from ordinary work

No corrective prompt. Three turns: prepare a host, deploy, carry on after the
secrets arrived.

| subject | destination it lights |
|---|---|
| `host:shop-host-4204` | Overview, Architecture, Monitoring |
| `process:shop-web`, `process:shop-worker` | Processes |
| `database:shop-postgres` | Database |
| `cache:shop-redis` | Cache & queue |
| `queue:shop-orders-queue` | Cache & queue |
| `job:shop-nightly-job` | Jobs |
| `volume:` ×3 (redis, postgres, receipts) | Storage |
| `firewall:shop-firewall-4203` | Security |
| `door:shop-public-http-8000` **absent** | Security |
| `access:shop-private-access` | Domains, Security |
| the release, the topology, the application | Deployment, Architecture, Overview |

Nine of the eleven destinations, from one application, with nobody asking for
any of it. The two that stayed empty are honest: Shop has no domain and no
CDN, and nothing pretended otherwise.

Pi also ran the nightly job rather than only reading its schedule, and
recorded the result — so Jobs shows "Succeeded 5 min ago" beside a next run it
was **told**, not one computed from a cron string.

## What the second journey found

| what the page said | what the records said |
|---|---|
| Redis's volume: **534 GB** | `534 bytes` — a missing unit prefix read as gigabytes |
| PostgreSQL's volume: 48 GB | `48,217,962 bytes` |
| "Shop queues nothing, so nothing is waiting" | a Redis whose recorded role is "Queue and cache" |
| "Asked for, never read back" | a firewall Pi read back and found **absent** |
| "Nothing stands between the internet and this server" | a Hetzner policy read back: TCP 22 and ICMP, deny unless listed |
| "port not recorded" | a tunnel with two known ends, in the access content |
| "Checked, with no detail recorded" | a check with a perfectly good label |

The size one is the worst of the set: a volume drawn a thousand times the size
of the disk under it, from a number Pi got exactly right.

## Accessible while these servers stay up

| | |
|---|---|
| Getting Started | `http://127.0.0.1:38123` |
| Shop | `http://127.0.0.1:8000` |
| the controller that drew these pages | `http://127.0.0.1:3410` |
| the rig's own controller | `http://127.0.0.1:3420` |

Both application URLs are the product's own SSH tunnels into the rig host
container, opened by `open_server_port` and verified by it.

## Resources, and what they cost

| | |
|---|---|
| created in the cloud | **none** |
| Hetzner servers | none — the rig's provider stand-in "creates" them at a TEST-NET-1 address |
| running cost | **€0.00** |
| left running locally | `sg-rig-views` (host container, port 8092), its sshd on 2224, the rig controller on 3420, a dev server on 3410 |

`docker stop sg-rig-views` and killing the two node processes ends all of it.
Nothing outside this machine is affected, and the two applications and their
records disappear with the containers.

## Honest gaps

- **Domains and CDN have no acceptance application.** Both read records and
  both have tests, but neither has been driven by a real name, because that
  needs a DNS mutation on a domain the owner owns. The boundary and what
  crossing it needs are in the contract document.
- **A restore test has never run** in these journeys, so the Backups page's
  populated state is proved by fixtures rather than by a real copy.
- **`pi-activity.tsx` reads a ref during render** (2 lint errors, pre-existing
  on main). It works, and the fix risks reintroducing the flashing-card bug
  that reading during render was added to solve. Left alone deliberately.
- ~~Pi recorded Shop as one image.~~ Proved on a third journey; see below.

## Journey 3 · Metrics, and a release with two images

`examples/grafana-prometheus`: two published images, neither built, both
first-class. Pi asked for `GF_SECURITY_ADMIN_PASSWORD` through the new
structured flow, reused the existing server rather than buying one, and
recorded the release as:

```json
"services": [
  { "process": "grafana",    "image": "grafana/grafana:13.2.1",
    "digest": "sha256:f772d434e8fa…" },
  { "process": "prometheus", "image": "prom/prometheus:v3.14.0",
    "digest": "sha256:5ce7540c3c00…" }
]
```

No `image` field at all, both digests pinned. Deployment draws "2 services"
and opens to the two rows above. That is prerequisite A proved by a journey
rather than by a fixture.

Eleven subjects from the one turn: `application`, `host`, `process` ×2,
`database`, `volume` ×2, `firewall`, `access`, `variable`, `backup-plan`.

Shop's earlier single-image record was not wrong to keep — it is a real record
in the older shape, and it still reads. What changed is Pi's guidance:
everything a release puts on the server is part of it, including the database
and cache images it did not build.

---

# The browser audit

Everything above was proved before a browser was pointed at it. This is what
happened when one was.

## Where it ran

| | |
|---|---|
| the branch, on real records | `http://127.0.0.1:3410` — Getting Started, Shop, Metrics |
| isolated scenarios | `http://127.0.0.1:3411` — six applications, one per shape of doubt |
| the rig's own controller | `http://127.0.0.1:3430` |

The scenario database is built by `node --import tsx scripts/load-scenarios.mjs
<dir>` and holds states a real journey never produces: a failure forty days
old, claims just past every horizon, four established absences beside things
nobody looked at, a recovery, a withdrawal, and one application with every
destination populated using awkward values — Unicode names, a registry with a
port, thousands separators, sub-megabyte sizes.

**Scenario records never touch a real application.** They live in their own
database and their own server.

Its readings age, which is the point and also a chore: rebuild it before
looking, or a fifteen-minute liveness claim will have gone stale and the page
will be right about something you did not mean to test.

## What the browser found

Every one of these is a page saying more than its records supported. None
would have surfaced against a fixture written by the same person as the
reader.

| where | what it said | what was true |
|---|---|---|
| Monitoring | crashed outright | a record established that nothing is watching, and nothing had been observed |
| Monitoring | "Nothing is listening" | a watcher had gone quiet, which is not the same thing |
| Monitoring | "No result" | the check ran, passed, and went out of its window |
| Monitoring | "Good" signal | every reading out of date |
| Monitoring | green tag beside "has gone quiet" | the tone came from the clock, not the sentence |
| Monitoring | `http` / `http` on two lines | a check with no detail printed its own label twice |
| Monitoring, Domains | "(invented)" | the reference scenario's word, on a page drawn from records |
| Processes | "One process is running" over a red tag | its only check had failed |
| Processes | two processes both called "Shop" | they run one built image; a name that does not distinguish is not a name |
| Storage | "Not replaced yet" | the persistence check had **failed** |
| Storage | "Kept: volumes stay when containers are replaced" | nobody had tested |
| Storage | a volume of 534 GB | Pi measured 534 **bytes** |
| Cache & queue | "NaN tasks waiting" | `Number("1,204")` |
| Cache & queue | "Shop queues nothing" | a Redis whose recorded role is "Queue and cache" |
| Security | "Nothing stands between the internet and this server" | a Hetzner policy read back: deny unless listed |
| Security | "Asked for, never read back" | Pi read it back and found it absent |
| Security | "read just now" | it was read two hours ago |
| Security | two sentences with no stop between them | Pi's prose rarely ends in one |
| Domains | "while X is being set up" | nothing records a setup phase |
| Variables | "They live in the repository" | said of values whose own row names another source |
| Architecture | one part drawn on top of another | two web processes share the "app" slot |
| every page | a dead "Open application" link | the tunnel died with a restart |
| the sidebar | "after deployment" | the application had deployed |
| the whole product | every ask button dead | no conversation to draft into |
| the tuner | a name cut mid-word | a sixty-character container name |
| Overview | "Access · Not set up" | a working tunnel, outranked by a deliberately absent public port |
| Overview | "Last checked 11 min ag" | a truncation with no ellipsis, which reads as a typo |
| Logs | a blank page below the filter | a search that found nothing, saying nothing |
| Logs | 200px of white under every capture | a 300px floor under four-line commands |
| History | "57 operations. 49 verified; 3 failed" | five neither |
| the whole app | 1.4 requests a second at idle, forever | nothing was happening |
| History | "Cancelled" | one word for work you declined and work stopped mid-run |

## What passed first time

Worth saying, because a list of defects reads as if nothing worked.

- **Keyboard**: forty controls tabbed through, every one with an accessible
  name and a visible focus ring. No fixes needed.
- **Sidebar state**: `aria-current="page"` correct on every destination, and
  it follows browser back and forward.
- **Parsers**: eighteen adversarial cases over sizes, ports, images, sources
  and durations — all correct after the earlier size fix.
- **Restart**: records, subjects, secrets, executions and conversations came
  back byte for byte across three applications.
- **Reload during a live turn**: three reloads while Pi was working left 26
  executions at 26, added no messages, reran nothing, and left no spinner
  behind.
- **Declining a real command** through the approval flow: the execution reads
  `declined`, the turn settles, and the page says so.
- **The terminal** opens, minimises, closes and reopens, and is never confused
  with Pi activity.
- **Layout**: no horizontal overflow and no clipped text at 1440 or 1180, on
  96 page visits.

## The sixteen views, and the states each was inspected in

Real means a real Pi record on Getting Started, Shop or Metrics. Scenario
means the isolated database. Unit means a projection test with the clock in
hand.

| view | unassessed | absent | partial | fresh | stale | failed |
|---|---|---|---|---|---|---|
| Overview | real | scenario | real | real | scenario | scenario |
| Architecture | real | scenario | real | real | unit | scenario |
| Deployment | real | — | real | real | unit | unit |
| History | real | — | real | real | — | scenario |
| Processes | real | unit | real | real | scenario | scenario |
| Database | real | unit | real | real | unit | unit |
| Cache & queue | real | unit | real | real | unit | — |
| Jobs | real | unit | real | real | unit | unit |
| Storage | real | unit | real | real | unit | scenario |
| Backups | real | real | scenario | scenario | unit | — |
| Logs | real | — | real | real | — | — |
| Monitoring | real | scenario | real | real | scenario | scenario |
| Domains | real | unit | scenario | scenario | unit | unit |
| Environment Variables | real | unit | real | real | — | — |
| CDN | real | scenario | — | scenario | unit | unit |
| Security | real | real | real | real | unit | unit |

Where a cell is empty, that state is not one the view meaningfully has: a
release either happened or did not, so Deployment has no absence; Logs
collects nothing itself, so it has no failure of its own.

## Still unproved

- **Domains and CDN against a real name.** Both read records, both have unit
  and scenario coverage, and neither has been driven by DNS that exists. That
  needs a mutation on a domain the owner owns.
- **A restore test that actually restored.** Backups' populated state is
  scenario data; no journey has taken a copy and put it back.
- **`pi-activity.tsx` reads a ref during render** (two lint errors, pre-existing
  on main). It works, and the fix risks reintroducing the flashing-card bug
  that reading during render was added to solve.
- **Exact-value redaction is exact.** Output containing a secret verbatim is
  replaced. A command that base64s it, or prints its first eight characters,
  is not something the product can promise to catch, and it does not claim to.

## What is running, and what it costs

| | |
|---|---|
| `http://127.0.0.1:3410` | the branch, on the three real applications |
| `http://127.0.0.1:3411` | the six isolated scenarios |
| `http://127.0.0.1:3430` | the rig's own controller and worker |
| `http://127.0.0.1:38123` | Getting Started, through the product's tunnel |
| `http://127.0.0.1:8000` | Shop |
| `http://127.0.0.1:3100` | Metrics (Grafana) |
| containers | `sg-rig-views` (Linux host with systemd and its own dockerd), `sg-rig-ssh-2224` |
| **cloud resources created** | **none** |
| **cost** | **€0.00** |

The rig's Hetzner stand-in fakes servers at TEST-NET-1 addresses, so no
provider resource exists for any of this. `docker stop sg-rig-views` and
killing the three node processes ends all of it.

One Hetzner server does exist and is not mine: `165619823
getting-started-b2184a72`, from the owner's own "Test 2 eqw" application on
12 September, with a live tunnel held by another session's worktree. It has
been left alone throughout.

## Rebuilding the scenarios

```bash
node --import tsx scripts/load-scenarios.mjs /private/tmp/sg-scenarios
```

Their readings age from the moment they are written, which is the point — a
fifteen-minute liveness claim is meant to go stale — and also means the
database has to be rebuilt before a visual pass, or the page will be right
about something nobody meant to test.

## Performance, measured rather than assumed

An open tab with nothing happening made **33 requests in 25 seconds** and kept
doing so for as long as it stayed open: the workspace re-read every record,
execution, activity entry and message every 2.5 seconds, and the operator
console re-read every execution off disk every second.

Both now poll fast while something is running or waiting on the owner and
slowly otherwise:

| | requests |
|---|---|
| idle, before | 33 in 25 s |
| idle, after | 6 in 30 s |
| a turn in flight, after | 5 view fetches in 20 s, against 1 when idle |

No cache and no abstraction were added, because the measurement did not ask
for either. The polls were simply always fast.

---

# Backups, proved rather than staged

The gap in the first handoff was that Backups' populated state came from
scenario data — no journey had taken a copy and put it back. This closes it,
inside the rig, on the Shop application's real PostgreSQL.

## What ran

A marker order was placed first, so the proof could not be ambiguous:

```
POST /orders {"item": "restore-proof-widget-a3f9"}   → id 3, priced 2500
```

Then Pi was asked to back the database up to the rig's S3-compatible store and
to prove the copy was worth having. It asked for the two credentials it needed
through `request_secret` — `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` —
and stopped until they arrived through the masked field. It then installed a
systemd timer, took a copy, and wrote a restore test that failed twice before
it debugged it with `bash -x` and got it right.

What the last command printed:

```
download_size_bytes=2798
isolation=network:none,ports:none,tmpfs
restored_order_count=2
restore_proof=3|restore-proof-widget-a3f9|2500
restore_seconds=2
restore_test_container_remaining=0
production_health={"ok": true}
production_proof_order=3|restore-proof-widget-a3f9|2500
```

The marker order came back **out of S3**, into a container with no network and
no ports, and production was untouched. The restore container and its files
were removed.

## What Pi recorded, unasked

| subject | what it carries |
|---|---|
| `backup-plan:shop-postgres-backup-plan` | schedule, destination, keep 14, covers · `configured` and `tls` passed |
| `backup-copy:shop-postgres-backup-20260913T122527Z` | size 2,798 bytes, destination, sha256 · `written` and `verified` passed |
| `restore-test:shop-postgres-restore-test-20260913T122654Z` | covers, took 2 s, order-count 2, proof-order · `restored` and `isolated` passed |

## The contradiction it exposed

With that in place, Backups said "One copy off the server is on record" while
Storage said "PostgreSQL's data · Not in the backup plan" — about the same
bytes. The plan named what it covered in prose ("Shop PostgreSQL orders
database"), and no page can match prose to a volume.

Two things changed. Pi is told that `covers` is a list of subject ids, because
that is what a reader matches. And the reader joins a covered **database** to
the volume its files live in, through the map's own `disk` edge — a nightly
`pg_dump` protects the bytes in that volume as surely as copying the volume
would.

Asked which volumes the plan actually protects, Pi did better than the fix
required: it restated the plan with `covers: shop-postgres-volume`, and
established two more backup plans as **absent** — "Receipts volume has no
backup plan", "Redis volume has no backup plan". Three volumes, and now each
one says which of the three states it is in.

## The five views, afterwards

| view | what it says |
|---|---|
| Overview | Backups lane: "Checked 6 min ago" — it read "Nobody has looked yet" before |
| Backups | "One copy off the server is on record." A restore test passed Sep 13, 15:26 |
| Database | "Shop web's database was last copied off the server on Sep 13" |
| Storage | "The daily backup copies PostgreSQL's data; it leaves out Shop web's data and Redis's data" |
| History | the plan, the copy and the restore test, each at its own time |

No scenario data is involved in any of it.
