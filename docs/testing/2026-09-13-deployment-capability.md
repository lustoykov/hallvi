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
| permission mode | Pi decides, except the update, which ran under Always ask |
| GitHub | **no login** — every target is a public repository |

Each application was added through the Add screen, given one sentence of
intent, and left to it. No deployment plan was supplied. Commands were run on
the servers by hand only to break two of them on purpose, which this document
says where it happens.

## Result

| Target | Version | Result |
|---|---|---|
| [Docker Getting Started](https://github.com/docker/getting-started-app) | `6b025fc5` · Node 22 → 26 | **pass** |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | 3.1.3 · PostgreSQL 18 · Valkey 9.1.2 | **pass** |
| [Ghost](https://github.com/TryGhost/ghost-docker) | 6.63.0 · MySQL 8.0.44 | **pass** |
| [Plausible CE](https://github.com/plausible/community-edition) | v3.2.1 · PostgreSQL 16 · ClickHouse 24.12 | **pass** |

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

Pi also installed a daily local SQLite backup with seven-day retention and ran
a restore test, unasked, and said plainly that a local copy does not survive
losing the server. 21 records.

### The controlled update, under Always ask

Switched to **Always ask** and asked for a current Node base image.

- The first two decisions were made with the **Approve** and **Decline**
  buttons. The declined command rendered as `Not run` / "Command was not run",
  Pi stopped, changed nothing, and said so: *"The follow-up read-only
  verification was declined, so I stopped. No files, images, containers, or
  data were changed."*
- Told to carry on, it took **12 further approvals**, each waiting on a
  decision. Those went through the same endpoint the button calls.
- Result: **Node 22.23.2 → 26.8.2**, `node:current-trixie-slim` pinned by
  digest, container healthy with zero restarts, a pre-update backup taken and
  verified, and the todo still present with the same id — confirmed in the
  browser afterwards.

## Target 2 · Paperless-ngx

Three services, four volumes, a real task queue. Asked for: *"I want to run
this to keep my scanned documents… give me a link so I can log in and upload
something."*

| Step | Result |
|---|---|
| Server | **pass** — CX23 Nuremberg |
| Source | **partial** — the archive exceeded the workspace budget, so Pi cloned the repository on the host and carried on. Fixed since; see below |
| Built and started | **pass** — built the image from the recorded revision, then `compose up --wait` with broker and database gated healthy before the web service |
| First boot | **pass** — migrations applied, search index built, 53 s |
| **Account created in the browser** | **pass** — Paperless's own first-user signup, so no password ever touched the chat |
| **Document uploaded** | **pass** — a one-page PDF, `PAPERLESS-ACCEPTANCE-7Q4X` |
| **Background processing** | **pass** — Celery consumed it, text extracted, search index updated |
| **Found by full-text search** | **pass** — in the Paperless UI, thumbnail and all |
| **All three containers recreated** | **pass** — every container id changed; the document, its OCR text and the `owner` account survived |
| **Downloaded after the restart** | **pass** — HTTP 200, 712 bytes, `e4400917247b18b875a10870d5f8effe12ceb53c67ae3c1a7e60495823553b48` |
| **Backup taken and restored in isolation** | **pass** — into a separate Compose project on fresh volumes, an internal-only network and no published ports; the restored copy held exactly one matching invoice, its OCR text and the owner account, and production container ids never changed |
| Signups closed afterwards | **pass** — `/accounts/signup/` reads "Sign Up Closed" |

28 records: three processes, a database, a cache, a queue, four volumes, two
variables, a door, a firewall, two backup plans, a job, the access, the
topology and the release. The release used `services` with three digest-pinned
images, not one.

The checksum and the "Sign Up Closed" page were read by this session directly
through the tunnel, not taken from Pi's report.

### The unavailable dependency

`docker stop paperless-db-1`, by hand over SSH, to make a failure the product
had to diagnose. Reported to Server Guy the way a user would: *"Paperless is
giving me a Server Error (500)."*

> **Cause.** PostgreSQL received an explicit administrative stop at 18:52:57
> UTC during a brief root SSH session. Docker confirmed it was manually
> stopped with exit code 0 — not an OOM, crash, disk issue, corruption, or
> backup job. Because its restart policy is `unless-stopped`, Docker correctly
> left it stopped. Paperless then returned 500 because hostname `db` no longer
> existed. Docker cannot identify the exact command issuer.

Restarted, verified, and the invoice confirmed still present — checked again
here afterwards: `count 1 | Quokka Stationery Invoice`. It named the
mechanism, declined to name a culprit it could not establish, and repaired it.

## Target 3 · Ghost

MySQL, an initial-setup flow, application URL configuration and uploaded
content. Asked for: *"I want to run my blog on this… I don't own a domain yet,
so keep it to my own machine for now."*

Pi read `compose.yml`, saw that Caddy demands a `DOMAIN` and publishes 80/443,
and **dropped the Caddy edge**, binding Ghost's own port to server loopback
with `url` set to match the tunnel — the correct answer to "private, no
domain", reached by reading the repository.

| Step | Result |
|---|---|
| Deployed | **pass** — Ghost 6.63.0 and MySQL 8.0.44, digests pinned, credentials generated on the server into a root-only env file |
| **Setup completed in the browser** | **pass** — "Quokka Notes", owner account created through Ghost's own form |
| **Post published with an image** | **pass** — a PNG uploaded through Ghost's own `images/upload` endpoint and a post created through its admin API, both from the browser's own session |
| **Both containers recreated** | **pass** — new container ids; post, image bytes, owner hash and all three sessions unchanged |
| **Backup and isolated restore** | **pass** — all 97 tables restored into separate storage on an internal-only network; account, sessions, post and image all matched; the temporary environment was removed |
| The email question | **pass** — asked whether the missing SMTP would lock the owner out, Pi read Ghost's running code, found that new-device verification is separate from the MFA switch it had disabled, and answered **yes, it could**, with what to avoid until SMTP exists |

20 records.

### The incorrect configuration

`DATABASE_PASSWORD` changed in `/opt/blog/.env` to a wrong value and Ghost
recreated, by hand over SSH. Ghost crash-looped; the site returned nothing at
all. Reported as *"My blog has gone completely dead… I was poking around in
the config files earlier, so it might be my fault."*

Root cause named correctly — the password in `.env` no longer matched MySQL —
the validated configuration restored, the failed file kept at
`.env.failed-20260913T190032Z`, an emergency backup taken **before** the
repair, and the post, image, owner account and sessions all verified intact.
Checked here afterwards: homepage, post and image all 200.

## Target 4 · Plausible CE

PostgreSQL and ClickHouse together. Asked for: *"I'd like my own analytics for
my blog… Ask me for anything you need from me rather than making it up."*

Pi **stopped and asked a question worth asking**: fully private means real
visitors cannot send analytics, so did I want private collection or a public
tracker endpoint on a domain I control? Told "fully private", it proceeded.

| Step | Result |
|---|---|
| Deployed | **pass** — v3.2.1 with PostgreSQL 16 and ClickHouse 24.12, `depends_on: service_healthy` on both, loopback only |
| **Account and site created in the browser** | **pass** — `quokka-notes.test` |
| **A pageview generated and recorded** | **pass** — HTTP 202, ClickHouse pageviews 0 → 1 |
| **Seen in the dashboard** | **pass** — 1 unique visitor, 1 visit, 1 pageview |
| **Survived a full restart** | **pass** — all three services restarted, count still 1, confirmed in the dashboard afterwards |

17 records.

## What broke, and what was changed

Every fix is on this branch. Each states the general requirement it serves
rather than the application that exposed it.

### Public software should not need a login to read

*Requirement: reading a public repository is not a privileged operation.*

All four targets belong to somebody else, and all four were refused at the
first screen: the Add button was disabled without a GitHub login, and the
repository check demanded one before reading a repository GitHub hands to
anyone. A read now uses a login when there is a usable one and reads
anonymously when there is not, recording which it used. Verified on four
public repositories.

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

The first three servers created in this session each failed their first
`connect_server` with `write (…): Broken pipe` from `ssh-keyscan`, and the
readiness message beneath that scan was unreachable because a failing keyscan
throws. The scan now waits up to two minutes and says what it was waiting for.

**Proved on the fourth server.** With the fix live, `connect_server` on
`89.167.84.129` started at 18:25:05 and succeeded at 18:25:16 — one call, no
failed execution, no turn spent inventing a sleep-and-retry.

### A quiet command looked identical to a dead one

*Requirement: a long command must show it is still alive.*

Building Paperless installs 201 Python packages and prints nothing for
minutes. An execution now records when its output last changed, and the block
reads "running 6m 12s · quiet for 3m 40s".

### A provider accepting a request is not the provider doing the thing

*Requirement: read a consequential provider setting back before recording it.*

Pi asked for `backups: true` in Hetzner's create body. That is not a field the
create endpoint defines, so it was ignored, the call returned 201, and a
record went on to say "Hetzner server backups are enabled" — with €1.10/month
priced into the total. The provider reports **no backup window and holds no
backup image**, and Pi had read `backup_window: null` five times. The guidance
now says that an accepted request is not a done thing, that an undefined field
is dropped silently, and that server backups have their own endpoint.

### The map drew two of Paperless's five parts

*Requirement: a map must draw everything the records say is there.*

Architecture placed the first private service and at most two volumes.
Paperless's Valkey and its **document media volume** — the one holding the
owner's scans — had slots but no rectangle, so they were skipped in silence. A
reader would have concluded their documents live in "Application data". Every
service and volume is now placed; one service and two volumes keep the
design's exact coordinates, and the private zone grows to fit two full-height
cards when there are two.

### PostgreSQL and Valkey were named as the queue's workers

*Requirement: a page derives a claim from what the records say, not from a
proxy for it.*

Cache & queue read "Two workers · paperless-cache-process and
paperless-db-process takes from Celery". The page took "private in the
topology" to mean "worker", which is a statement about reachability. A worker
is now a process whose recorded role says it works in the background, named by
the product a reader recognises.

### Storage counted four volumes as seven

*Requirement: only a record that states a subject is evidence it exists.*

Later records named Paperless's volumes by their Docker names where the
stating records had used the subject ids, so Storage listed all seven and led
with "7 volumes hold the application's data". Each phantom then carried
"Nobody has tested whether this survives… · kept Sep 13, 20:29" — a sentence
contradicting itself in one line, because the stamp was the application's and
the doubt was the volume's. The count is now of stated volumes, the rest are
listed and say plainly that nothing states they are there, and each card's
replacement result is its own.

### A tunnel that worked read as a broken one

*Requirement: say which machine a local URL belongs to.*

`open_server_port` opens the forward on the controller PC and checks it from
there. Pi tried the URL from its workspace shell, whose loopback is a
different machine's, got "Couldn't connect", and reopened a tunnel that was
already fine. The result now names the machine that answered.

### "GitHub could not renew this login" pointed at the wrong thing

*Requirement: an error message must name the cause, not the symptom it shares
with another cause.*

GitHub answers `incorrect_client_credentials` — "The client_id and/or
client_secret passed are incorrect" — when a refresh is refused, and the
product passed that straight through as "GitHub could not renew this login."
Both readings point at the App registration, and both are wrong. GitHub
documents `client_secret` as **required unless the user access token was
generated using the device flow**, and the device flow is the only flow this
product uses.

Established with three requests carrying no real credential, using only the
public client id:

| asked with | answer |
|---|---|
| our real client id + a refresh token GitHub never issued | 200 `incorrect_client_credentials` |
| no client id at all | 404 |
| a client id that is not ours | 404 |

So the client id is recognised, and `incorrect_client_credentials` means *this
refresh token is not one I will honour for you* — nothing about a secret. The
usual way to arrive there is that **renewing replaces the refresh token**: the
moment one copy of `github-connection.json` renews, every other copy holds a
dead one. This machine has several, copied between checkouts, and the owner's
own connection was already latched invalid on 12 September, before this
session touched it.

The message now says that. The refresh request itself was correct and is
unchanged, and the existing test already pins its shape: `client_id`,
`grant_type`, `refresh_token`, and nothing else.

The three things worth checking, checked:

| | |
|---|---|
| provenance | only `pollGithubLogin` writes an `app` connection, and it writes one only from the device-code grant. There is no other way for this token to exist. |
| client id | `.env.local` and the stored connection both say `Iv23likHtcclbuys1lVG`, and GitHub answers 200 for it and 404 for anything else, so it is the real one. |
| persistence and rotation | the cause. Renewal replaces the refresh token and the replacement is written to one file; every other copy of that file is dead from that moment, and a crash between GitHub's answer and the write loses the only live one. |

**Not yet proved end to end:** a live device-flow connection renewing itself.
That needs a fresh sign-in, which is the owner's to authorise. The proof is
written and waiting — sign in at Settings → GitHub, then run
`node tests/results/caps/prove-refresh.mjs`, which moves this controller's own
saved expiry into the past and asks the product to read a repository, so the
renewal runs through `connectedGithubCredential` exactly as an eight-hour-old
login would. It prints digests and timestamps, never a credential. Nothing
about the authentication architecture should change before that run.

### The facts cap refused the vocabulary the guidance asks for

A host is told to carry eleven keys and then has a cost to state; the limit
was ten, so the first host record was rejected and rewritten with less in it.

### "Last checked 7 min ag"

The earlier audit found this cut mid-word and added `text-overflow: ellipsis`
to the element holding it. Neither of the two it added could apply: the
element is an `inline-flex`, so its words are an anonymous flex item no
selector can reach. The words now sit in a box of their own.

### The source manifest was never named

The guidance describes the file that says what the workspace holds without
naming it, so Pi reached for `source-manifest.json` and got ENOENT every run.

## Which actions were the browser's, and which were an API's

Worth separating, because "used it in the browser" and "called its API" are
different claims.

| | |
|---|---|
| **Browser** | every Server Guy action — adding the four applications, sending each message, Approve and Decline, switching to Always ask; the todo created and re-read in the Todo app; Paperless's signup, its search, its document thumbnail; Ghost's setup form; Plausible's registration, its site form and its dashboard reading 1/1/1 |
| **Ghost's own admin API, from the browser's own session** | uploading the PNG and creating the post. The Browser pane cannot open a native file dialog, so the image went to `/ghost/api/admin/images/upload/` and the post to `/ghost/api/admin/posts/` with `credentials: same-origin` — the same endpoints the editor calls, with the session the setup form created. |
| **HTTP from this session, through the product's tunnel** | uploading the invoice to Paperless (`/api/documents/post_document/`), reading its search results back, downloading it and taking its SHA-256, and the status checks quoted throughout. These verify the product's claims from outside; none of them is a Server Guy action. |
| **SSH by hand** | exactly two commands, both to break something on purpose: `docker stop paperless-db-1`, and editing `DATABASE_PASSWORD` in Ghost's `.env` before recreating it. Both are named where they happen. |

## Which applications had which tests

| | restore test | update test |
|---|---|---|
| Todo baseline | Pi's own, on its local SQLite copy, unasked | **yes** — Node 22 → 26 under Always ask, data verified after |
| Paperless-ngx | **yes** — asked for, into an isolated stack on fresh volumes | no |
| Ghost | **yes** — asked for, 97 tables into separate storage | no |
| Plausible CE | no — and no backup of any kind exists | no |

Container recreation, which is not the same as either, was exercised on all
four: Todo baseline, Paperless (all three), Ghost (both), Plausible (all
three, as a restart).

## The combined product

The UI craft pass on `claude/product-ui-craft-pass` had already merged this
work up to `181c80a` and built on it. Checked at `acf8722`, reading this
session's real records: Paperless's five parts all drawn, the handover link
rendering as one link, compact record cards with working "see it in full
above" anchors.

Two things for that branch to pick up when it merges again: the **private-zone
sizing** (without it the two service cards overlap below about 1200px wide)
and the **Storage count** (it still reads "Six volumes hold the application's
data" for Paperless, which has four).

## Checks

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | 758 passed, 1 skipped |
| `npm run build` | clean |
| `npm run lint` | only the two `pi-activity.tsx` ref-during-render errors that are already on `main` |
| `npm run test:e2e:smoke` | 3 passed, 3 failed — **the same three fail on `origin/main`** in the same environment: `applications-home`, `operator-information`, `typed-information` |

New coverage: the handover sentence and nested links; the snapshot budget;
waiting for SSH; the running-command clock; a map with two services and three
volumes; volumes that only another record names.

## For the UI craft pass, not fixed here

- `connect_server` is grouped as a **Record** in the activity summary, so a
  server that would not answer reads as "Records on Server Guy · 1 failed"
  when no record failed.
- The architecture canvas overflows its column below about 1180px: "Nothing is
  watching this" and "Where the code came from" are clipped.

### The false backup claim, corrected by the operator

Pi asked Hetzner to create Paper's server with `backups: true`. That is not a
field the create endpoint defines, so it was dropped, the call returned 201,
and three records went on to say backups were on — the host ("Paper has a
dedicated backed-up host", check "Provider backups enabled · passed"), a
`backup-plan` subject ("Hetzner server backups are enabled", cost €1.10/month
"reported"), and a borrowed check on the nightly-export plan. The monthly
total the owner was given, €7.09, included €1.10 for something that did not
exist.

Reported to Server Guy as a user would — *"I can't see any backup charge on my
bill… correct the records to match, and do not turn paid backups on"* — and
corrected by Pi from the provider's own answer, with nothing enabled and
nothing bought:

| before | after |
|---|---|
| host: "Paper has a dedicated backed-up host" · Provider backups enabled **passed** | host: "Paper runs on a dedicated Hetzner host" · that check gone |
| host: Estimated total €7.09/month | host: Estimated total **€5.99/month** |
| backup-plan `hetzner-server-backups` **present**: "enabled" | the same subject **absent**: "Hetzner server backups are not enabled", with *Provider backup service is disabled* and *No provider backup images exist* both passed |
| export plan carried "Provider server backups are enabled · passed" | gone; the export plan speaks only for the export |

The absence is now *established* rather than merely unclaimed, which is the
contract's own distinction. The other three applications needed nothing: Todo
baseline already recorded a local plan present and an off-server plan absent,
Counter recorded its backup plan absent, and Blog claimed no provider backup
at all.

The guidance change above only affects what Pi does next time. This is what
happened to the records already written.

## Still open

- **Provider backups are off on all four servers**, and were never on. Nothing
  here enabled them — the owner asked explicitly not to buy backups to make a
  claim true — and the records that said otherwise were corrected by Pi from
  the provider's own answer; see "The false backup claim" below.
- **No off-server backup exists for any of the four.** Todo baseline,
  Paperless and Ghost each take a **local** copy: a file on the same disk as
  the thing it protects. That survives a container replacement or a bad
  configuration and does not survive losing the server. All three said so
  unprompted. Both restore tests — Paperless's and Ghost's — read their copy
  from that same local path, so what they prove is that the copy is
  restorable, not that it is anywhere else. Plausible has no backup of any
  kind, and no record claims one.
- **Ghost cannot take a fresh sign-in** while it has no SMTP. Staff-device
  verification emails a six-digit code and Ghost aborts the login when
  delivery fails; the existing browser session keeps working. Pi found this in
  the running image when asked, and said plainly that a second browser, a
  cleared cookie or a sign-out would lock the owner out until SMTP exists or
  device verification is turned off.

## Resources

| Server | Application | Address | Fate |
|---|---|---|---|
| `todo-baseline-ca4e43b0` (165694537) | Todo baseline | 204.168.248.155 | disposable |
| `paper-26820a4b` (165697333) | Paper | 2.28.78.41 | disposable |
| `blog-2080decc` (165702693) | Blog | 2.29.46.226 | disposable |
| `counter-bd2e9028` (165706272) | Counter | 89.167.84.129 | disposable |

Also created: four SSH keys (118733588, 118734392, 118735847, 118736918) and
two firewalls (11617636, 11617752), all labelled with their application id.
`getting-started-b2184a72` (165619823) is the owner's, from 12 September, and
was not touched.

**They were left running** so the four applications can be opened and used,
because a screenshot of a working Ghost is not the same as a working Ghost.
Cost while they run: four × CX23 at €0.0088/hour plus €0.0008/hour for each
IPv4 — about **€0.04 an hour for all four**, €0.96 a day, and nothing after
they are deleted.

To delete them, either ask Server Guy in each application's conversation to
delete its server and the key and firewall it made, or remove the four servers
named above in the Hetzner console along with the keys and firewalls listed
beside them. Everything this session created carries a
`server-guy-application` label naming one of the four applications; nothing
else does.

## Opening them again

The four application links are SSH forwards this controller holds, so they
work only while it is running on this Mac. If one stops answering, ask in that
application's conversation to reopen private access; `open_server_port` makes
a new forward and gives back the same kind of URL.

| | |
|---|---|
| the controller, with every record and transcript | `http://127.0.0.1:3460` |
| Todo baseline | `http://127.0.0.1:3000` |
| Paperless — sign in as `owner` | `http://127.0.0.1:18000` |
| Ghost — admin at `/ghost/`, owner `owner@quokka-notes.test` | `http://127.0.0.1:2368` |
| Plausible — sign in as `owner@quokka-notes.test` | `http://127.0.0.1:8080` |

The three application passwords are throwaway values this session generated
for disposable fixtures; they are in the session transcript and nowhere in the
product, which is exactly where the product intends them not to be. Ghost will
not accept a fresh sign-in from a new browser while it has no SMTP, which is
the limitation it reported itself.
