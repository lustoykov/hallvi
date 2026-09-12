# BookStack and MariaDB audit — 11 September 2026

A real-Pi lifecycle trial of main `0dba3ec` (PR #48) used as an architecture probe: BookStack (LinuxServer image) with a separate MariaDB, a database outside the agreed product scope. Nothing in the product was changed for the trial. The full report with the capability matrix is a private artifact: <https://claude.ai/code/artifact/55f50156-9fff-49eb-ba7a-4d9271960108>. Raw records, journals and logs are preserved under the ignored `tests/results/bookstack-audit-2026-09-11/`; the reproducible rig is [`tests/rig/`](../../tests/rig/README.md).

## Environment

- Real: Server Guy web app and worker, SQLite records, native Pi sessions with `openai-codex/gpt-5.6-sol` (high), the Pi workspace, the pinned Compose 2.40.3 resolver, registry pinning, the executor host script, Docker, and HTTP verification.
- Stand-ins: GitHub API (exact mirror of `linuxserver/docker-bookstack`), Hetzner API (fixed cx23 offer, server at 127.0.0.1), SSH (host commands run by the local macOS shell; cloud-init wait and metadata guard skipped), host HTTP bound to loopback. Docker Desktop on arm64 ran the pinned amd64 images under emulation.

## Identities

| Item | Identity |
| --- | --- |
| Packaging repository | `linuxserver/docker-bookstack` `5d9c1a8` (v26.03.5-ls263) → `b36da9c` (v26.05.4-ls283) |
| BookStack source | v26.03.5 `cfeb0355`, v26.05.4 `cec78b1b`; migrations added: `2026_04_19_141616_add_revision_view_all_permission`, `2026_07_27_201402_update_users_external_auth_id_collation` |
| Images (amd64) | BookStack `sha256:11800165…` (index `b0be95de…`) → `sha256:8d58dbce…` (index `ec33b8ad…`); MariaDB 11.4.13 `sha256:ebf0b3e4…` (index `80494b98…`) |
| Releases | `01b26dfe…` (v26.03.5) and `75adb31e…` (v26.05.4) |

## Timeline (UTC)

| Time | Step | Result |
| --- | --- | --- |
| 12:18–12:24 | Intake planning | Pi read the upstream docs and corrected four controller rejections (volume names, a missing `v` in the tag, `lscr.io`, the tag convention from the Jenkinsfile). It authored a PHP admin bootstrap mounted into LinuxServer's `custom-cont-init.d`. |
| 12:27–12:29 | First release | Verified by `/status` and "`GET /login` contains BookStack". The bootstrap had failed (LinuxServer runs custom init files with bash) and the published default admin still worked. |
| 12:32–12:36 | Owner reports the login symptom | Conversation Pi could not read collected logs or deployed files; it proposed a blind recreation, then misdiagnosed the cause and advised a manual fix. |
| 12:38 | Workflow | Default admin replaced through BookStack's forms; book, page, image and attachment created and retrieved with matching SHA-256. |
| 12:39 | Recreation | Verified; content survived. |
| 12:41–12:49 | Update to v26.05.4 | First release session stopped with no recorded reason; the owner's Retry succeeded after `inspect_release` exposed the bootstrap failure and Pi removed it. Migrations ran; content intact. MariaDB was recreated although its image did not change. |
| 12:50 | Health | Records only; Pi listed its unknowns. |
| 12:51 | Backups | Refused: `Volume mariadb-data needs a recorded SQLite path or a supported database capture method.` |
| 12:53–12:57 | Rollback | Pi declined without migration evidence, then proposed with an attributed assessment after the owner supplied it. Verified; the old configuration, broken bootstrap included, returned. |

## Findings that drive the follow-ups

1. Host evidence reached Pi only inside release sessions; the conversation agent could not read logs, deployed files or planner history.
2. Verification could only prove unauthenticated HTTP and required every service to keep running.
3. Database semantics, backups, release continuity and rollback protection existed only for the managed PostgreSQL; the backup runner required a service named `app`.
4. Owners minted `APP_KEY` and guessed `APP_URL` before a host existed; only Docker Hub and GHCR images resolved.
5. The default Deployment view rebuilt history from event prose, and production views shipped simulated checks and invented scenarios.

Implementation status: [follow-up plan](2026-09-11-bookstack-followups.md).
