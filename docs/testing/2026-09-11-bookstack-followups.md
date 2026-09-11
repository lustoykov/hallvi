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

- **Rig B, first BookStack deployment (actual Pi, local Docker, Linux host container).** Intake produced the new records unprompted:
  - MariaDB as the owner of its data, with `mariadb-dump`, restore and a `CHECKSUM TABLE` fingerprint;
  - a command check that the owner's administrator authenticates and the published defaults do not;
  - a generated `APP_KEY` and database passwords, so the card asked only for the admin email and password;
  - a one-shot initializer before the web service;
  - `${SERVER_GUY_PUBLIC_URL}`;
  - `lscr.io` images, which the old pinning refused.

  Execution failed three times. LinuxServer's MariaDB 11.8.8 spun at full CPU at "Installing MariaDB/MySQL system tables" under the rig's nested amd64 emulation, beyond the host script's fixed 120-second health wait. Pi inspected the runtime, cleared a corrupt `ibdata1` it found safe to remove, retried, and stopped with that explanation, saying a different database image needs the owner's approval. Under the same nesting, the official `mariadb:11.4.13` initializes in about 10 seconds, and the official 11.8 image Pi chose next in about 6. The stall is therefore specific to LinuxServer's MariaDB packaging on this emulated host, not to MariaDB 11.8.
- **Product gap:** a failed first deployment can only be retried within its approved effects. Once a server exists, cancelling is refused and `prepare_release` needs a verified or observed runtime, so the owner has no way to approve a different database image. The rig continued with a second application on the same host. First, the failed deployment's containers were stopped (a rig intervention) to free port 80. The new request told Pi that the LinuxServer MariaDB image stalled on this host.
- The host script's `--wait-timeout 120` is fixed. A legitimately slow first start, such as a large database initialization on a small host, cannot declare a longer one.
- **Rig intervention (my error):** the Rig B app copy predated `b69454e` and the UI commit. The second application's first recommendation was therefore prepared by old code: its override left `bookstack`, which owns only a files volume, unlabeled. I refreshed the rig, cancelled that recommendation through the product (no server existed) and asked Pi to prepare it again. The stale recommendation is kept as ignored evidence.
- **Generated sign-in password (fixed in `56d7cc7`).** The next recommendation generated `BOOKSTACK_ADMIN_PASSWORD`. Generated values are never shown, so the owner could never sign in, yet the command check would still pass because it receives the value. The approval card listed it under "Generated privately at approval, never shown", so the owner declined and asked again. The planner rule now says never to generate a value a person must know or type. The third recommendation asked the owner for both administrator values and generated only the application key and database passwords.
- **Rig B deployment (actual Pi, local Docker, Linux host container).** The third recommendation deployed. Its first attempt failed its HTTP check, which expected "Sign In" on BookStack's login page, where this release says "Log In". Pi then:
  - read the deployed configuration and fresh logs;
  - tried BookStack's upstream templates, but the rig's unauthenticated GitHub quota was exhausted;
  - read LinuxServer's init scripts;
  - corrected the check, under the same name, to the login form's `name="email"` field.

  The second attempt verified, within the approved effects: the HTTP check passed, and so did the command check proving the owner's login works and the defaults fail (exit 0, about 1 s). Nothing mechanical stops a correction from weakening a check's expected text; this one still identifies the login form. Owner-side corroboration through BookStack's own forms: the defaults do not authenticate, and the owner's login does. The owner then added a book, a page with a marker, an attachment and an image.
- **Rig B backups.** Asked in plain words to protect the data and prove a restore, Pi proposed a daily schedule keeping seven copies. The approval text came from the recorded capture plan: "Capture stops bookstack. mariadb keeps running to dump its data." After approval, the host received its timer, service, runner and the rig's CA drop-in. Pi does not continue a multi-step request after an approved change completes. The completion is recorded in Backups and history, and Pi reads it with its tools only when the owner writes again.
- **Rig B backup and restores.** The first backup stopped `bookstack` while `mariadb` ran Pi's dump; the source paused 4.4 s. The runner uploaded 83,927 bytes and verified the downloaded archive by size and SHA-256.
  - **Product restore test.** Pi proposed it after the backup. It verified the archive, all 153 files and the backup identity. It loaded the dump into a fresh instance with no network and required Pi's fingerprint to match the source's.
  - **Receipt bug.** The receipt the controller reads dropped `database-content`, because the runner's sanitized view did not list it. The runner, the receipt schema and the Backups fact now carry it. A dump restore is credited only when that check is recorded.
  - **Independent full-application restore (harness, `tests/rig/host/restore-check.py`).** It used only the downloaded archive: the inventory matched, and the dump loaded with the same fingerprint. The whole stack came up in 12 s as a separate project with no ports and internal networks. On that network, BookStack rejected the defaults and accepted the owner. It served the marker page and image, and the attachment and image bytes matched their original SHA-256.
- **P1 replay (actual Pi, local Docker, stand-in GitHub/Hetzner/SSH).** The replay rig copied the audit's final records and used its still-running containers. In a new conversation, given only the symptom, Pi called `inspect_runtime`, read the deployed bootstrap under `.server-guy/current/`, read LinuxServer's upstream `init-custom-files` runner with `read_repository` to confirm custom init files run under Bash, identified the PHP-under-Bash failure, and proposed a correction with `prepare_release` at the deployed revision, with instructions that require proving the owner's login works and the defaults fail. It did not propose recreation. One intervention recreated the symptom: `tests/rig/bookstack/bookstack.mjs reset-default` returned the administrator to BookStack's published defaults through its own forms (the rollback had already restored the broken bootstrap).
- Compose 2.40.3 `up --wait` succeeds when a `service_completed_successfully` dependency exits 0 and fails when it exits non-zero, so the host script already distinguishes a completed one-shot from a crash; only verification wrongly required every container to keep running.
- `docker compose exec -e NAME` takes the value from the calling environment, so check inputs travel on SSH standard input, never on a command line.
- Rig B is required for backups: the installer uses systemd and the runner copies volume data from host paths, neither of which the macOS-shell transport provides.
- The existing S3 hostname rule accepts `s3.<name>.amazonaws.com`; Rig B serves MinIO under such a name inside the host container only, so no destination exception is needed.

## Next actions

1. Rig B: deploy BookStack through the product, add content, back up through Pi, restore into an isolated target, and verify page content and attachment hashes.
2. One small generalization stack.
3. Final account in the PR description.
