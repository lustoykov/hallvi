# BookStack follow-ups: plan and status

Working plan for implementing the [BookStack audit](2026-09-11-bookstack-audit.md) findings on branch `claude/pi-evidence-and-state`, based on main `0dba3ec` (PR #48). Updated as work lands; the PR description carries the final account.

Principle: support applications through declared requirements with the smallest set of reusable capabilities; Pi plans, investigates and recovers with native tools; the core executes, constrains and records.

## Status

| Area | State | Notes |
| --- | --- | --- |
| Preserve audit rig and evidence | done | `425e4e7`. Reproducible rig in `tests/rig/`; raw evidence under ignored `tests/results/bookstack-audit-2026-09-11/`. |
| P1 Pi investigates from any conversation | done | `a7f5bee`. Accepted in the Rig A replay with real Pi (below). |
| P2 Verification expresses behavior | done | `66e30a6`. Accepted in Rig A: Pi's correction release proved the owner's login and rejected the defaults with a recorded command check. |
| P3 State protection beyond managed PostgreSQL | code done, acceptance running | `8a912e4`: declared owners and dump procedures, unlabeled owners, owner-image scope and rollback, runner without `app`, isolated dump restore with content fingerprints. BookStack acceptance runs on Rig B. |
| Enabling: generated secrets, public URL, registries, storage connection | done | `8381572`. |
| UI correctness | done | `1db37f3`: Deployment history from recorded attempts; no exploration bar, invented scenarios or simulated Check now in production views; stale claims removed. |
| Proofs | in progress | Rig A replay for P1 and P2 done. Rig B (Linux host container, TLS MinIO) runs the BookStack deployment, backup and isolated restore. One generalization stack to follow. |

## Incident: Rig B erased the machine's amd64 emulation (15:45–16:02 UTC)

The first Rig B host container ran systemd as PID 1, privileged, with the engine's cgroup namespace. At boot, `systemd-binfmt` cleared `binfmt_misc`, a single table for the whole Docker Desktop VM. This removed Docker Desktop's Rosetta handler for amd64 binaries. Every amd64 container on the machine could no longer start new processes. For about 17 minutes, other agents' `sg-fe64777e-*` containers failed their health checks with `exec /usr/bin/curl: exec format error`; their running processes were not restarted or touched. Rig B's own first intake also failed because Pi's amd64 workspace could not start.

Remediation, nothing restarted: I stopped the rig host, then re-registered the VM's own Rosetta handler (`/run/rosetta/rosetta`, flags `OCF`) and the one other entry the VM declares in `/etc/binfmt.d`, from the VM's mount namespace. An amd64 container then ran `uname -m` as `x86_64`. The rig image now masks `systemd-binfmt` and the `binfmt_misc` mounts, and runs systemd in a private cgroup namespace. Rig B's first intake failure stays in its records as an environment failure.

## Current findings

- **P1 replay (actual Pi, local Docker, stand-in GitHub/Hetzner/SSH).** The replay rig copied the audit's final records and used its still-running containers. In a new conversation, given only the symptom, Pi called `inspect_runtime`, read the deployed bootstrap under `.server-guy/current/`, read LinuxServer's upstream `init-custom-files` runner with `read_repository` to confirm custom init files run under Bash, identified the PHP-under-Bash failure, and proposed a correction with `prepare_release` at the deployed revision, with instructions that require proving the owner's login works and the defaults fail. It did not propose recreation. One intervention recreated the symptom: `tests/rig/bookstack/bookstack.mjs reset-default` returned the administrator to BookStack's published defaults through its own forms (the rollback had already restored the broken bootstrap).
- Compose 2.40.3 `up --wait` succeeds when a `service_completed_successfully` dependency exits 0 and fails when it exits non-zero, so the host script already distinguishes a completed one-shot from a crash; only verification wrongly required every container to keep running.
- `docker compose exec -e NAME` takes the value from the calling environment, so check inputs travel on SSH standard input, never on a command line.
- Rig B is required for backups: the installer uses systemd and the runner copies volume data from host paths, neither of which the macOS-shell transport provides.
- The existing S3 hostname rule accepts `s3.<name>.amazonaws.com`; Rig B serves MinIO under such a name inside the host container only, so no destination exception is needed.

## Next actions

1. Finish P2 tests and commit.
2. Refresh the replay rig with P2 code, approve Pi's correction release, and confirm its checks prove the owner's login works and the defaults fail.
3. P3 design and Rig B.
