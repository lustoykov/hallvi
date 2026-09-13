# Four real applications, through the product — 13 September 2026

What happened when Server Guy was pointed at software it had never seen, on
real Hetzner hardware, and asked for it the way its user would ask.

Nothing here is a fixture. Every deployment is a real server, a real image, a
real database and a real document or post, reached through the product's own
private tunnel and checked from outside the product's own report.

## What was driven, and how

| | |
|---|---|
| controller | this branch, `tests/results/caps`, port 3460 |
| provider | **real Hetzner Cloud**, no stand-in |
| model | the configured Pi model, ordinary goal-level requests |
| permission mode | Pi decides, the default |
| GitHub | **no login** — every target is a public repository |

Each application was added through the Add screen, given one sentence of
intent, and left to it. No deployment plan was supplied and no command was run
on the servers by hand except where this document says otherwise.

## Result

| Target | Version | Result |
|---|---|---|
| [Docker Getting Started](https://github.com/docker/getting-started-app) | `6b025fc5` | **pass** |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | 3.1.3 · PostgreSQL 18 · Valkey 9.1.2 | **pass** |
| [Ghost](https://github.com/TryGhost/ghost-docker) | — | in progress |
| [Plausible CE](https://github.com/plausible/community-edition) | — | not started |

## Target 1 · Docker Getting Started

One web service, SQLite on a host path. Asked for: *"Please get this running
on a server for me so I can start using it. Keep it cheap."*

| Step | Result |
|---|---|
| Repository read with no GitHub login | **pass** — `docker/getting-started-app is readable at main · 6b025fc5` |
| Server chosen and bought | **pass** — CX23 Helsinki, €5.49 + €0.50 IPv4 = €5.99/month |
| Deployed, hardened, verified | **pass** — non-root container, loopback-only port, ufw allowing only SSH |
| Private link | **pass** — `http://127.0.0.1:3000` |
| **A todo created in the browser** | **pass** — "Buy milk through the product link" |
| **Container destroyed and recreated on request** | **pass** — `35afb61c9514` → `a382b207e155`, same todo id `efc1b473-1129-4774-a97c-d5462d9865c2` |
| Seen again in the browser afterwards | **pass** |

Pi also installed a daily local SQLite backup with a seven-day retention and
ran a restore test, unasked, and said plainly that a local copy does not
survive losing the server.

17 records, covering the host, the release, the process, the volume, the
database, the door, the firewall, two variables, the access and the backups.

## Target 2 · Paperless-ngx

Three services, four volumes, a real task queue. Asked for: *"I want to run
this to keep my scanned documents. Please work out what it needs, get it
running on a server of its own, and give me a link so I can log in and upload
something."*

| Step | Result |
|---|---|
| Server | **pass** — CX23 Nuremberg, provider backups on, ≈€7.09/month |
| Source | **partial** — the archive exceeded the workspace budget, so Pi cloned the repository on the host instead and carried on. Fixed since; see below |
| Built and started | **pass** — built the image from the recorded revision, then `compose up --wait` with the broker and database gated healthy before the web service |
| First boot | **pass** — migrations applied, search index built, 53 s |
| **Account created in the browser** | **pass** — Paperless's own first-user signup, so no password ever touched the chat |
| **Document uploaded** | **pass** — a one-page PDF, `PAPERLESS-ACCEPTANCE-7Q4X` |
| **Background processing** | **pass** — Celery consumed it, OCR text extracted, search index updated |
| **Found by full-text search** | **pass** — in the Paperless UI, thumbnail and all |
| **All three containers recreated** | **pass** — every container id changed; the document, its OCR text and the `owner` account survived |
| **Downloaded after the restart** | **pass** — HTTP 200, 712 bytes, `e4400917247b18b875a10870d5f8effe12ceb53c67ae3c1a7e60495823553b48` |
| **Backup taken and restored in isolation** | **pass** — restored into a separate Compose project on fresh volumes, an internal-only network and no published ports; the restored copy held exactly one matching invoice, its OCR text and the owner account, and production container ids never changed |
| Signups closed afterwards | **pass** — `/accounts/signup/` reads "Sign Up Closed" |

22 records: three processes, a database, a cache, a queue, four volumes, two
variables, a door, a firewall, two backup plans, a job, the access, the
topology and the release.

The checksum and the "Sign Up Closed" page above were read by this session
directly through the tunnel, not taken from Pi's report.

## What broke, and what was changed

Every fix below is in this branch. Each states the general requirement it
serves rather than the application that exposed it.

### Public software should not need a login to read

*Requirement: reading a public repository is not a privileged operation.*

All four targets belong to somebody else, and all four were refused at the
first screen: the Add button was disabled without a GitHub login, and the
repository check demanded one before reading a repository GitHub hands to
anyone. A read now uses a login when there is a usable one and reads
anonymously when there is not, recording which it used.

Verified on three different public repositories in this session.

### Two instructions told the operator to stop halfway

*Requirement: guidance must not outlive its checkpoint.*

"Stop after server preparation for this review checkpoint" was still in the
operator's instructions and in the error it gets when no server is connected.
On the first run of this session Pi obeyed it, bought a server and stopped
before deploying.

### A link inside a link broke the handover message

*Requirement: the sentence that hands over the application must render.*

Pi ends a deployment with `**[http://127.0.0.1:3000](http://127.0.0.1:3000)**`.
The renderer parsed the link text, found a URL, and wrapped it in a second
anchor; nested anchors are invalid HTML, so React's hydration failed and threw
away the whole message. Covered by a test on that exact sentence.

### A repository too big to carry became no repository at all

*Requirement: a partial, honest snapshot beats an empty one.*

Paperless-ngx unpacks to 92 MB against a 64 MB budget, and 71 MB of that is
screenshots and scanned test samples. The snapshot now drops the largest files
until it fits and writes down what it dropped — for Paperless, 81 files go and
1,770 stay, including every compose file and Dockerfile.

### A machine the provider calls running is still booting

*Requirement: waiting for a dependency belongs in the thing that needs it.*

Every server created in this session failed its first `connect_server` with
`write (…): Broken pipe` from `ssh-keyscan`, and the readiness message beneath
that scan was unreachable because a failing keyscan throws. The scan now waits
up to two minutes and says what it was waiting for.

### A quiet command looked identical to a dead one

*Requirement: a long command must show it is still alive.*

Building Paperless installs 201 Python packages and prints nothing for minutes.
An execution now records when its output last changed, and the block reads
"running 6m 12s · quiet for 3m 40s".

### The map drew two of Paperless's five parts

*Requirement: a map must draw everything the records say is there.*

Architecture placed the first private service and at most two volumes.
Paperless's Valkey and its **document media volume** — the one holding the
owner's scans — had slots but no rectangle, so they were skipped in silence. A
reader would have concluded their documents live in "Application data". The
layout now places every service and every volume; one service and two volumes
keep the design's exact coordinates.

### PostgreSQL and Valkey were named as the queue's workers

*Requirement: a page derives a claim from what the records say, not from a
proxy for it.*

Cache & queue read "Two workers · paperless-cache-process and
paperless-db-process takes from Celery". The page took "private in the
topology" to mean "worker", which is a statement about reachability. A worker
is now a process whose recorded role says it works in the background.

### A tunnel that worked read as a broken one

*Requirement: say which machine a local URL belongs to.*

`open_server_port` opens the forward on the controller PC and checks it from
there. Pi tried the URL from its workspace shell, whose loopback is a
different machine's, got "Couldn't connect", and reopened a tunnel that was
already fine. The result now names the machine that answered.

### The facts cap refused the vocabulary the guidance asks for

*Requirement: a schema must accept what its own instructions ask for.*

A host is told to carry eleven keys and then has a cost to state; the limit
was ten, so the first host record was rejected and rewritten with less in it.

## Still open

- **GitHub login cannot renew itself.** See the question at the end of the
  pull request: the refresh grant needs a client secret the product
  deliberately does not hold, so every connection dies eight hours after
  sign-in and the product says "GitHub could not renew this login. Sign in
  again." This session ran without a login at all, which the change above made
  possible, but a private repository would have been stuck.

## Resources

| | |
|---|---|
| Hetzner servers created | listed at the end of this document, all disposable |
| Existing resources touched | none — the owner's `getting-started-b2184a72` was left alone |
| Cost | ≈€0.008/hour per CX23 |
