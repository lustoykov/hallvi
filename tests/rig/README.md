# Local real-Pi rig

Runs Server Guy's own web app, worker, records, Pi runtime and executor against local Docker with stand-ins at external boundaries only, so a real model can deploy, update, protect and investigate an application end to end without buying infrastructure. It is an evidence tool, not a test suite: runs use model credits and produce private records under the ignored `tests/results/rig/`.

## What is real and what stands in

| Part | In the rig |
| --- | --- |
| Web app, worker, SQLite records, native Pi sessions and workspace, Compose resolver, registry pinning, operation queue, executor host script, verification | Real, from a copy of this checkout. |
| Model | The configured Pi model. Only `pi-settings.json` is copied; the credential it names is read in place. |
| GitHub API | [`stand-ins/github-api.ts`](stand-ins/github-api.ts.txt): exact mirrors made by [`mirror.mjs`](mirror.mjs); other public repositories pass through to GitHub unauthenticated and read-only. |
| Hetzner API | [`stand-ins/hetzner.ts`](stand-ins/hetzner.ts.txt): a fixed small x86 offer; the "server" is 127.0.0.1. |
| SSH | [`bin/ssh`](bin/ssh) runs each host command with the local shell and Docker engine, mapping `/opt/server-guy` and `/run/lock` into the rig directory. Cloud-init waiting and the metadata guard are skipped, so the event "Metadata access restricted" is not true in this rig. [`bin/flock`](bin/flock) emulates util-linux `flock`. |
| Published HTTP | [`stand-ins/native-compose.ts`](stand-ins/native-compose.ts.txt) binds executed listeners to loopback; retained snapshots and facts keep what Pi authored. |

On macOS with Docker Desktop, the shell transport cannot run the scheduled-backup installer (systemd) or the runner (it reads volume data from host paths). Backup proofs use Rig B.

## Rig B: a Linux host container

[`host/start.mjs`](host/start.mjs) runs [`host/Dockerfile`](host/Dockerfile): Ubuntu with systemd as PID 1, its own dockerd with Compose, and Python for the backup runner, publishing HTTP on 127.0.0.1:80. With `--host-container <name>`, `rig.mjs` sends every host command, unchanged, to `docker exec` in that container, where the product's real paths, systemd units and host-path volume reads apply. The native-compose stand-in is not used. Storage is MinIO inside the host as `https://s3.rig.amazonaws.com`, which satisfies the product's S3 endpoint rule. A rig CA is trusted only by the host's `server-guy-*` units, through a systemd drop-in that stands in for a public certificate authority. The bucket is created inside MinIO's own network namespace, because that name also resolves publicly.

- The host masks `systemd-binfmt` and runs systemd in a private cgroup namespace. `binfmt_misc` is one table for the whole Docker Desktop VM: an unmasked systemd erased the engine's Rosetta handler for amd64, which broke every other amd64 container until it was restored (see the [follow-up plan](../../docs/testing/2026-09-11-bookstack-followups.md)).
- Rig B and Rig A both need 127.0.0.1:80, so run one at a time.
- The product's restore test now boots the restored copy as an isolated Compose project on the host and runs the recorded command checks inside it (`scripts/scheduled-backups/runner.py`, `--test-restore <run> --keep`). The earlier harness-only `host/restore-check.py`, which did this outside the product, is retired; owner-side corroboration of a restored copy is a command check Pi records for the restore.
- Rerun `start.mjs` after the host container restarts: Docker rewrites `/etc/hosts`.

```bash
node tests/rig/host/start.mjs
SG_RIG_PI_SETTINGS=/path/to/pi-settings.json node tests/rig/rig.mjs rigb 3397 --host-container sg-rig-host
# A second host beside the first, publishing its HTTP on another local port.
# The provider stand-in records 127.0.0.1 for every rig, so public checks reach
# whichever host owns port 80: stop the first host's container, then forward.
node tests/rig/host/start.mjs sg-rig-host-hc 8082
docker stop sg-rig-host && node tests/rig/host/forward.mjs 80 8082 &
SG_RIG_WORKFLOW=tests/results/rig/workflow-hc SG_RIG_PI_SETTINGS=/path/to/pi-settings.json node tests/rig/rig.mjs rigb-hc 3399 --host-container sg-rig-host-hc
```

## Running

```bash
node tests/rig/mirror.mjs linuxserver/docker-bookstack v26.03.5-ls263 v26.05.4-ls283
SG_RIG_PI_SETTINGS=/path/to/.server-guy/pi-settings.json node tests/rig/rig.mjs bookstack 3396
```

`--state-from <rig root>` starts a new rig from another rig's records and host files, to replay an earlier state with changed code. Change a mirror's default branch by editing its `head.json`.

Helpers: [`tools/watch.mjs`](tools/watch.mjs) streams record changes; [`tools/journal.mjs`](tools/journal.mjs) prints Pi workspace journals; [`tools/releases.mjs`](tools/releases.mjs) diffs recorded releases; [`tools/wait-op.mjs`](tools/wait-op.mjs) waits for an operation. The [Healthchecks script](healthchecks/healthchecks.mjs) signs in through Healthchecks' own login form, adds a check with a marker name and pings it. The [BookStack scripts](bookstack/) are the owner's side of a trial: the card approval with generated private values, operation decisions, a credential probe, and a workflow that logs in through BookStack's forms and verifies content and upload hashes. Their per-run state, including the disposable instance's test credentials, stays in `tests/results/rig/workflow/` (override with `SG_RIG_WORKFLOW`).

Evidence from the first trial: [BookStack audit](../../docs/testing/2026-09-11-bookstack-audit.md).
