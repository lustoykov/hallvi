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
