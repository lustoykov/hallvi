# Replacement-controller rehearsal

A description of the procedure and what it has established. The helper scripts
that drove the September 2026 rehearsal were written against the retired
controller schema and have been deleted with it; what is worth keeping is what
the rehearsal taught, not code that no longer runs.

This is an **offline UI and read-only access rehearsal**, not production
failover. A replacement runs in a fresh Linux container on the same machine. It
proves a new userland, architecture-specific dependency installation, path
relocation, restored records and session loading, and recovered credential
access. It does not prove loss of the machine, credential renewal, worker
execution or model calls.

## What the procedure requires

1. **Build before introducing secrets.** Build the replacement image from the
   exact source revision in the copy's manifest, not from the working checkout,
   and pass the current user's UID/GID to a non-root image build. The image
   needs Python and the C++ toolchain `better-sqlite3` builds against, `npm ci`,
   and a Next.js build while networking is still available — fonts are fetched
   during that build, so `npm start` works offline afterwards while `next dev`
   would not. Introduce no secret during the build.
2. **Restore into quarantine.** Open the copy with `decrypt-copy.mjs` into a new
   private directory, in a short-lived container if the download needs network.
   Keep that verified quarantine copy unchanged and work from a separate
   writable copy.
3. **Run the replacement with nothing attached.** `--network none`,
   `--cap-drop ALL`, `--security-opt no-new-privileges`, container-local state.
   No socket mounts, no `DOCKER_HOST`, no mounts of the original state, no
   auto-loaded environment files. Transfer the quarantine directory with a tar
   stream piped to `docker exec -i CONTAINER tar -xpf - -C /recovery`:
   extraction has to happen inside the container's mount namespace, because
   `docker cp` did not populate a running tmpfs. Preserve 0700 directories and
   0600 files, and check the modes inside Linux.
4. **Establish that the original is stopped.** Stop the original web
   application and worker gracefully; do not kill active work to make a check
   pass. Immediately before activation, verify the original controller port is
   closed and take `BEGIN EXCLUSIVE` on both original worker SQLite lock files
   with `timeout=0`, holding them until the replacement stops. An operator
   assertion that the original is stopped is not independent proof.
5. **Prepare a working copy deliberately.** Verify the manifest hashes again,
   refuse to proceed with unsettled work, create a new working copy, and remove
   `RECOVERY_QUARANTINE` markers only there. Relocate the selected model
   credential if one was preserved; report a missing one rather than borrowing
   another account's. Leave the disabled `.env` files disabled. A partial
   failure leaves a private incomplete directory: retry into a new target.
6. **Do not run `db:push`, start a worker, or make model calls** during a
   rehearsal. Nothing here prevents an operator later starting a networked
   worker against the working copy; that is a separate, deliberate decision.

## What to check, and what it proves

Check every application and conversation the copy holds, compare what the UI
renders against SQLite directly, reopen the native sessions with the Linux
working directory and prove the JSONL files unchanged. Visit the destinations
at desktop size and at least one at phone size. Expect mutation requests to be
refused, no page errors, firewall reads to fail with a visible connection error
in an offline container, and the container engine to be absent. Backup storage
configuration and schedule evidence must survive; current observations must
read as stale, not as health.

Probe recovered access from a **separate short-lived network-enabled
container**, mounting only the recovered payload read-only: fixed provider GETs,
saved host identities compared, existing containers listed over strict SSH, a
deliberately wrong host key rejected. No OAuth refresh, no server creation, no
restarts, no model calls, no queued work.

Delete the temporary containers after exporting evidence, stop the replacement
first, release the original worker locks, and restart the original even when a
check fails.

A rehearsal of this shape passed in September 2026 against the retired schema,
before the controller's own copies were automatic. Independent recovery-kit
custody, credential renewal and a separately authorised worker takeover remain
required before anyone can claim complete controller-loss recovery, and no
rehearsal has been run against the current copies.
