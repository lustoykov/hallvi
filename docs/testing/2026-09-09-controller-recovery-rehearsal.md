# Fresh Linux controller recovery rehearsal — 2026-09-09

## Result and claim boundary

A fresh Linux controller environment restored the encrypted checkpoint, served
the application UI, reopened all native sessions, and authenticated read-only to
the existing provider accounts and three application hosts. No restored worker,
model call, deployment action, backup action, or approval was executed. The
original controller was paused during UI activation and restarted afterward.

This was a Linux container in Docker Desktop on the same Mac, **not an independent
replacement machine**. The private recovery kit supplied all decryption/storage
inputs, but its custody outside the Mac remains pending. This proves recovery
mechanics, not survival of losing the Mac and every local key copy.

## Exact candidate

- Application source: `faac6f295aa103fb36072787867e41b14fe3e2b6` (PR #29), exported
  from Git; no Mac dependencies, runtime state or `.env` files entered the build.
- Snapshot: `d145daab6c91bcd70f2e9d33d1d762ca12020957a97a58d51dc544bf1c14ff56`.
  The manifest records that same source revision and `sourceDirty: false`.
- Linux/arm64, Node 24.18.0, Python 3.11.2, restic 0.14.0. The repository created
  with restic 0.19.1 restored successfully with the Linux package.
- Image: `sha256:ff3d34e549e017fe3ddd20d076f8798c4fab76a7e57bd804544dd31acb47481a`.
- `npm ci`, Chromium installation, and the production Next.js build completed
  before any recovery secret was made available to a container.

A clean Linux install exposed a real prerequisite: `better-sqlite3` needed
`make`/the C++ toolchain. The rehearsal Dockerfile includes `build-essential`.
Production build fetched the fonts in advance; offline `next dev` was not used.

## Containment and state preservation

The UI container used `--network none`, dropped all capabilities, prohibited
new privileges and had no bind mounts, Docker socket or `DOCKER_HOST`. Recovered
state and screenshots lived in private container-local tmpfs. Every recovered
file/directory was checked as 0600/0700 inside Linux. State was extracted through
`docker exec` so it reached the running tmpfs mount namespace.

The original web/worker identities were verified, then stopped gracefully with
no active runs or operations. The original port refused connections and both
worker SQLite locks were held until the replacement UI stopped. The final full
successful UI/session run paused the original for 4.89 seconds; failed harness
attempts also restarted the original automatically. No application host was
stopped or changed.

The original quarantine stayed intact. A separate working copy retained every
record and the disabled environment files. Native session header cwd values still
name an old Mac worktree; the pinned SDK correctly uses Server Guy's Linux cwd
override. No transcript rewrite or model request was needed.

## Verified outcomes

| Check | Result |
| --- | --- |
| Applications / deployments | All 3 restored |
| SQLite messages | All 36 matched the restored API and appeared in conversation DOM |
| Uptime Kuma conversation | 12 messages; 20 native context messages |
| Grafana/Prometheus conversation | 15 messages; 26 native context messages |
| Todo/PostgreSQL conversation | 9 messages; 5 native context messages |
| Native IDs / JSONL bytes | All 3 matched; files unchanged after reopening |
| Desktop views | 6 per app: Overview, Architecture, History, Database, Backups, Security |
| Phone layout | Backups at 390×844 for all 3 apps; no horizontal overflow |
| Browser | No mutation requests, page errors or unexpected HTTP failures |
| Database values | Every row in all 19 tables matches the preserved checkpoint after boot and UI inspection |
| Source quarantine | Full verification passed again after UI/session checks |
| Execution engine | `not-found`, not ready, no engine or prior verification |
| ChatGPT connection | `needs-auth`, not ready, matching the missing captured credential |
| Backup storage / schedules | Configured and preserved; observations correctly stale |
| Offline firewall | Expected 502 and visible connection error; no live facts claimed |

The three UI pages showed "Current backup status is unavailable" while preserving
last-copy and restore evidence. One pre-existing ambiguity remains: coverage rows
say "Behind policy" when observation freshness is lost, even for a recent copy.
This does not invalidate restored data or the containment proof; a follow-up UI
change should distinguish unknown current status from a missed backup deadline.

A separate network-enabled read-only probe used recovered credentials:

- GitHub `GET /user`: HTTP 200 and the saved account matched; no OAuth refresh.
- Hetzner `GET /servers/{id}`: HTTP 200 for all three; recorded public IPs matched.
- Strict SSH with recovered keys and `known_hosts`: succeeded on all three;
  existing Compose services were listed and a wrong host key was rejected.
- All three public application URLs returned HTTP 200.

The operator helpers include tests for preserving quarantine, exact clean source,
explicit runtime paths, missing/present model credentials, original-stop
assertion, refusal of queued work, and refusal to overwrite an existing target.
Actual Claude Opus 5 at maximum effort independently reviewed the rehearsal design
and path/permission/network hazards. His recommendations informed the production
build, native filesystem, socket exclusion, credential handling, and startup
identity/lock checks. A second review covered the code, receipts and screenshots
and found no recovery blocker. It prompted an explicit Git-archive build helper
with the actual UID/GID, a provenance-marker caveat, and the stronger database
comparison against the preserved checkpoint. The rebuilt image and strengthened
browser proof passed. All 23 backup/rehearsal operator tests passed.

## What remains

1. Store the recovery kit independently of this Mac.
2. Reconnect ChatGPT, and review/enable only the environment settings required on
   a real replacement. Credential renewal was deliberately not exercised.
3. Rehearse an explicit worker takeover with a bounded request and a rollback
   plan, keeping the original controller stopped throughout.
4. Test independent-machine loss recovery. A same-Mac Linux container cannot
   prove that boundary.

See [`REHEARSAL.md`](../../scripts/controller-backups/REHEARSAL.md) for the operator
procedure. Screenshots and private receipts are retained locally under
`/tmp/server-guy-controller-rehearsal`; they contain application information and
are not committed to Git.
