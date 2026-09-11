# BookStack follow-ups: plan and status

Working plan for implementing the [BookStack audit](2026-09-11-bookstack-audit.md) findings on branch `claude/pi-evidence-and-state`, based on main `0dba3ec` (PR #48). Updated as work lands; the PR description carries the final account.

Principle: support applications through declared requirements with the smallest set of reusable capabilities; Pi plans, investigates and recovers with native tools; the core executes, constrains and records.

## Status

| Area | State | Notes |
| --- | --- | --- |
| Preserve audit rig and evidence | done | `425e4e7`. Reproducible rig in `tests/rig/`; raw evidence under ignored `tests/results/bookstack-audit-2026-09-11/`. |
| P1 Pi investigates from any conversation | done | `a7f5bee`. Accepted in the Rig A replay with real Pi (below). |
| P2 Verification expresses behavior | in progress | Criterion commands run in the application's containers with private inputs on SSH stdin; results recorded per attempt; one-shot services through Compose's `service_completed_successfully`. |
| P3 State protection beyond managed PostgreSQL | planned | Declared state owners and procedures; runner without service-name assumptions; isolated full-stack restore; destination connection. |
| Enabling: generated secrets, public URL, registries | planned | |
| UI correctness | planned | Recorded attempts for Deployment history; no simulated or invented states in production views. |
| Proofs | in progress | Rig A replay for P1 done. P2 acceptance continues from Pi's proposed correction release. Rig B (Linux host container, MinIO) for P3. One generalization stack. |

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
