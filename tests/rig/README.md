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

On macOS with Docker Desktop, the shell transport cannot run the scheduled-backup installer (systemd) or the runner (it reads volume data from host paths). Backup proofs need a Linux host.

## Running

```bash
node tests/rig/mirror.mjs linuxserver/docker-bookstack v26.03.5-ls263 v26.05.4-ls283
SG_RIG_PI_SETTINGS=/path/to/.server-guy/pi-settings.json node tests/rig/rig.mjs bookstack 3396
```

`--state-from <rig root>` starts a new rig from another rig's records and host files, to replay an earlier state with changed code. Change a mirror's default branch by editing its `head.json`.

Helpers: [`tools/watch.mjs`](tools/watch.mjs) streams record changes; [`tools/journal.mjs`](tools/journal.mjs) prints Pi workspace journals; [`tools/releases.mjs`](tools/releases.mjs) diffs recorded releases; [`tools/wait-op.mjs`](tools/wait-op.mjs) waits for an operation. The [BookStack scripts](bookstack/) are the owner's side of a trial: the card approval with generated private values, operation decisions, a credential probe, and a workflow that logs in through BookStack's forms and verifies content and upload hashes. Their per-run state, including the disposable instance's test credentials, stays in `tests/results/rig/workflow/` (override with `SG_RIG_WORKFLOW`).

Evidence from the first trial: [BookStack audit](../../docs/testing/2026-09-11-bookstack-audit.md).
