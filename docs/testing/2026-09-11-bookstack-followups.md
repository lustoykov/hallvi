# BookStack follow-ups: plan and status

Working plan for implementing the [BookStack audit](2026-09-11-bookstack-audit.md) findings on branch `claude/pi-evidence-and-state`, based on main `0dba3ec` (PR #48). Updated as work lands; the PR description carries the final account.

Principle: support applications through declared requirements with the smallest set of reusable capabilities; Pi plans, investigates and recovers with native tools; the core executes, constrains and records.

## Status

| Area | State | Notes |
| --- | --- | --- |
| Preserve audit rig and evidence | in progress | Reproducible rig in `tests/rig/`; raw evidence under ignored `tests/results/bookstack-audit-2026-09-11/`. |
| P1 Pi investigates from any conversation | next | Fresh `inspect_runtime`, deployed files in the chat workspace, repository/upstream reads, operation history, retained planner tool history. |
| P2 Verification expresses behavior | planned | Command checks in the application environment with private-input env, recorded results; one-shot services. |
| P3 State protection beyond managed PostgreSQL | planned | Declared state owners and procedures; runner without service-name assumptions; isolated full-stack restore; destination connection. |
| Enabling: generated secrets, public URL, registries | planned | |
| UI correctness | planned | Recorded attempts for Deployment history; no simulated or invented states in production views. |
| Proofs | planned | Rig A: audit replay for the P1 conversation. Rig B: Linux host container (systemd, dockerd, sshd) and MinIO for P2/P3. One generalization stack. |

## Current findings

- Rig B is required for backups: the installer uses systemd and the runner copies volume data from host paths, neither of which the macOS-shell transport provides.
- The existing S3 hostname rule accepts `s3.<name>.amazonaws.com`; Rig B serves MinIO under such a name inside the host container only, so no destination exception is needed.

## Next actions

1. Commit the rig and audit evidence.
2. Implement P1 and run the audit replay.
