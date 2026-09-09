# Replacement-controller rehearsal

This is an **offline UI and read-only access rehearsal**, not production failover.
The replacement runs in a fresh Linux container on the same Mac. It proves a new
userland, architecture-specific dependency installation, path relocation, restored
records/session loading, and recovered credential access. It does not prove loss
of the Mac, credential renewal, worker execution or model calls.

## Build before introducing secrets

Use the exact clean `sourceRevision` from the snapshot manifest. The build helper
exports that Git commit into a new private directory, writes its revision marker,
and passes the current user's UID/GID to the non-root image build. It does not
copy the Mac's dependencies, build output or runtime state.

```sh
python3 scripts/controller-backups/build_rehearsal.py \
  --revision THE_FULL_MANIFEST_COMMIT \
  --context /private/new-rehearsal-build \
  --tag server-guy-controller-recovery:rehearsal
```

The marker records build provenance; it is not cryptographic image attestation.
The Dockerfile comes from the current reviewed operator helpers, while application
source comes from the selected commit. Do not introduce secrets during the build.

The Dockerfile includes Python and the C++ build toolchain required by
`better-sqlite3`, installs with `npm ci`, installs Chromium, and builds Next.js
while networking is available. Fonts are fetched during this build. Use
`npm start` offline; `next dev` would need to fetch fonts again. The root
`.dockerignore` also excludes private runtime data when building from a checkout;
using a committed archive remains the preferred boundary.

## Restore and prepare

1. Retrieve the recovery kit. Create private password/storage-credential/settings
   files for the Linux environment. Do not reuse absolute Mac paths in settings.
   Run the existing `controller_backup.py restore` with the exact snapshot ID in
   a short-lived, network-enabled container. Mount bootstrap files read-only;
   write only into a new recovery directory. Remove the temporary bootstrap
   copies after the restore. The kit itself must remain independently recoverable.
2. Keep that verified quarantine copy unchanged. For the UI, create a container
   using `--network none`, `--cap-drop ALL`, `--security-opt no-new-privileges`,
   and container-local state. No socket mounts, `DOCKER_HOST`, original state
   mounts, or auto-loaded environment files. In the dated proof, `/recovery` and
   `/evidence` were private tmpfs mounts owned by the container user.
3. Transfer the quarantine directory into the running container using a tar
   stream piped to `docker exec -i CONTAINER tar -xpf - -C /recovery`.
   Execute extraction inside the container's mount namespace: `docker cp` did
   not populate the running tmpfs during this rehearsal. Preserve private modes
   (0700 directories, 0600 files), and check them inside Linux.
4. Stop the original web application and worker gracefully. Immediately before
   replacement activation, verify that the original controller port is closed
   and acquire `BEGIN EXCLUSIVE` on both original worker SQLite lock files with
   `timeout=0`. Hold those locks until the rehearsal UI has stopped. Do not kill
   active work to make this check pass. The preparation flag below is an operator
   assertion, not independent proof that the original stopped.
5. Use the reviewed preparation helper inside the container:

```sh
python3 scripts/controller-backups/prepare_rehearsal.py \
  --payload /recovery/quarantine/payload \
  --target /recovery/active \
  --runtime-target /recovery/active \
  --source-revision THE_MANIFEST_REVISION \
  --original-stopped
```

The helper verifies hashes/records, refuses unsettled work, checks clean source
provenance, creates a new working copy and removes quarantine markers only there.
It relocates the selected model credential if one was preserved. Missing model
credentials remain missing and are reported explicitly; no unrelated account
credential is borrowed. Disabled `.env` files remain disabled. A partial failure
can leave a private incomplete working directory; retry into a new target.

The generated `rehearsal.json` contains the two runtime path variables. Set them
on the container along with `NODE_ENV=production` and run the web process from
`/opt/server-guy`. **Do not run `db:push`, start a worker, or make model calls.**
The preparation helper is for this contained operator workflow; it is not an
automated safe-failover service and cannot prevent an operator later starting a
networked worker against the working copy.

## Verify the UI and sessions

Run the current reviewed helper from the source checkout inside the container:

```sh
node --import tsx scripts/controller-backups/rehearsal-ui.mjs
```

It requires loopback-only networking and checks the image's recorded source
revision against the restored manifest. It checks all current applications and
chats, compares every rendered API message against SQLite, reopens native SDK
sessions with the Linux cwd, and proves the JSONL files unchanged. It visits
Overview, Architecture, History, Database, Backups and Security at desktop size,
then Backups at phone size. Screenshots and a JSON report go to `/evidence`.

The browser rejects mutation requests, never follows external destinations, and
expects no page errors or unexpected HTTP failures. Firewall reads must fail in
the offline container and show their connection error. The engine must be absent
(no Docker socket). Backup storage configuration and scheduled evidence must
survive; current observations must be stale. Disposable manual proof directories
were excluded from the checkpoint and must not be portrayed as preserved.

This helper is tailored to the dated three-application checkpoint: it expects the
known missing ChatGPT credential (`needs-auth`) and successful scheduled-backup
configuration for every application. Adapt those assertions deliberately when
rehearsing a different state; do not bypass failures blindly.

The helper compares all database row values against the preserved checkpoint
after server boot, then again after UI inspection. It avoids runtime file hashes:
SQLite legitimately recreates WAL sidecars. Independently rerun `verify` against
the untouched quarantine copy. Export tmpfs evidence with a tar stream from
`docker exec` before stopping the container. Stop the replacement first, release
the original worker locks, and restart the original even when a test fails.

## Read-only access probe

Use a **separate short-lived network-enabled container**, not the UI container.
Mount only the recovered quarantine payload read-only at `/recovered`. Run
`rehearsal-access.py`; it performs fixed GitHub/Hetzner GETs, compares saved host
identities, lists existing Compose containers through strict SSH, checks public
HTTP, and proves a deliberately wrong host key is rejected. It does not refresh
OAuth, create servers, restart services, query models, or execute queued work.
Keep the script's exact fixed commands; it is not a general remote shell runner.

Delete the temporary containers after exporting evidence. The dated proof is in
`docs/testing/2026-09-09-controller-recovery-rehearsal.md`. Independent recovery-kit
custody, credential renewal and a separately authorized worker takeover remain
required before claiming complete controller-loss recovery.
