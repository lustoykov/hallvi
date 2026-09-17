# Scheduled backup runner contract

This is the contract of the existing runner and its installed consumers. It is not a prescribed backup workflow for the [operator redesign](../../docs/operator-design.md); broader backup-view design is deferred. Change or retire this contract with its actual consumers, preserving required records and data.

The host-side engine that protects one deployment on a schedule. The controller
installs it, a systemd timer runs it, and the controller reads its receipts.
This file documents the current integration surface; other runner internals
are implementation details.

## Invocation

```
python3 runner.py <config-path>                     one scheduled run
python3 runner.py <config-path> --recover           ExecStopPost recovery
python3 runner.py <config-path> --status            sanitized snapshot
python3 runner.py <config-path> --test-restore <run-id> [--keep]
```

Every command prints exactly one JSON object on stdout and nothing else.
Diagnostics go to stderr as a single sanitized JSON object.

| Exit | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| 0    | The command succeeded (a run reached `succeeded`).             |
| 1    | The command failed. `errorCode` says which bounded failure.    |
| 75   | The deployment lock is held. Nothing happened, no run recorded. |

### Install layout

The installer copies both files into one private directory owned by root:

- `runner.py` — this engine.
- `capture_sqlite_stack.py` — a byte copy of `scripts/backup-proof/capture-sqlite-stack.py`.

The runner resolves the helper next to itself and executes it with the
interpreter running the runner, so the venv holding `boto3` must be the
interpreter systemd invokes.

## Configuration

Root-owned, mode 0600, no symlink in the path.

```json
{
  "version": 1,
  "applicationId": "UUID",
  "deploymentId": "UUID",
  "revision": "string",
  "kind": "sqlite-stack | postgres | stack",
  "endpoint": "https://ACCOUNT.r2.cloudflarestorage.com",
  "region": "auto",
  "bucket": "string",
  "prefix": "scheduled/APPLICATION_UUID/DEPLOYMENT_UUID/",
  "credentialsFile": "/absolute/path.json",
  "keep": 7,
  "schedule": "*-*-* 03:00:00 Europe/Sofia",
  "timezone": "Europe/Sofia"
}
```

`prefix` must be exactly `scheduled/<applicationId>/<deploymentId>/`. A prefix
naming another application or deployment is rejected as `identity-mismatch`
before anything is read, written or deleted. `keep` must be an integer between
1 and 90. `schedule` and `timezone` are recorded for the installer's timer; the
runner does not schedule itself.

`credentialsFile` is root-owned, mode 0600, no symlink in the path, and holds
`{"accessKeyId": "...", "secretAccessKey": "..."}`. It is read once per run and
never appears in stdout, receipts or errors.

## Receipt

One file per run under `/var/lib/haldur/backups/<deploymentId>/runs/`,
written atomically. This is the exact shape the controller receives:

```json
{
  "version": 1,
  "id": "run UUID",
  "applicationId": "UUID",
  "deploymentId": "UUID",
  "revision": "string",
  "kind": "sqlite-stack | postgres | stack",
  "startedAt": "2026-09-09T03:00:00Z",
  "capturedAt": "2026-09-09T03:00:07Z | null",
  "finishedAt": "2026-09-09T03:00:31Z | null",
  "outcome": "running | succeeded | failed",
  "phase": "config | lock | credentials | capture | upload | verify | retention | complete",
  "bytes": 1234567,
  "sha256": "hex | null",
  "objectKey": "scheduled/<app>/<deployment>/<run>.tar.gz | null",
  "sourcePauseSeconds": 6.4,
  "errorCode": "string | null",
  "detail": null,
  "expiredAt": "2026-09-16T03:00:12Z | null",
  "retention": { "deleted": 0, "failed": false },
  "restoreInProgress": false,
  "restore": null
}
```

`outcome` becomes `succeeded` only after the archive was uploaded, downloaded
again and matched byte length and SHA-256. A local capture that never reached
storage is a failed protection outcome.

`capturedAt` is the recovery point: the moment the source data stopped
changing, which is when the stack was quiesced for `sqlite-stack` and when
`pg_dump` opened its snapshot for `postgres`. It is deliberately not the moment
compression or upload finished, and it always equals the `recoveryPointAt` a
later `--test-restore` reports for the same run.

`expiredAt` is set when retention deleted this run's archive; until then the
object is assumed to exist and the receipt is kept for that reason alone.
`restoreInProgress` is true between the start of a `--test-restore` and its
end, so an interrupted one is visible before `--recover` closes it. Both are
additions to the first contract and safe to ignore.

`retention.failed` is independent of `outcome`: a verified backup whose expiry
sweep failed is still a successful backup, and the controller should surface the
retention failure separately.

`detail` stays `null` unless an owner's declared procedure caused the failure.
Then it names the step (`dump` or `verify` during capture; `start`, `restore`
or `verify` during a restore test), the owner service, the command's exit code
(`null` for a timeout) and the last 1500 characters it printed, with every
value of the owner's environment replaced by `$NAME`. It is the evidence a
corrected declaration needs; `errorCode` stays a bounded code. The same field
appears inside `restore`.

`restore` is `null` until `--test-restore` runs, then:

```json
{
  "at": "2026-09-09T09:12:00Z",
  "recoveryPointAt": "2026-09-09T03:00:02Z",
  "outcome": "verified | failed",
  "scope": "offline-database-and-files | offline-database",
  "checks": ["archive-hash", "..."],
  "measurements": { "files": 128, "tables": 14, "rows": 20551 },
  "cleanupComplete": true,
  "errorCode": "string | null",
  "detail": null
}
```

`scope` is the honest limit of the exercise. `offline-database-and-files`
compares a restored SQLite database and every captured file against the capture
manifest; `offline-database` restores the dump into a disposable PostgreSQL
container and measures it. `isolated-application` (a `stack` archive) goes
further: the archived Compose configuration comes up as its own project on
this host, `sg-restore-<first 8 of run id>`, with no published ports, internal
networks, fresh volumes filled from `state/`, no controller labels and no
restart policy. Each owner is started alone and loads its dump through the
recorded `restore` command; the restore passes only when the owner's `verify`
command prints exactly what it printed from the source at capture
(`database-content`). Then the whole application starts (`application-boot`)
and `boot` records the project and each service's state:

```json
"boot": { "project": "sg-restore-403c1bf6", "seconds": 12.4,
          "services": { "bookstack": { "state": "running", "exitCode": 0 } } }
```

Nothing here serves traffic or touches the live deployment. With `--keep` the
booted copy stays up after the command returns, `cleanupComplete` is false and
the restore journal stays open: the controller runs its checks inside that
project, then `--recover` removes it. Without `--keep` the copy is removed
before the receipt is written. A `stack` archive from the earlier runner, whose
managed PostgreSQL dump lives in `database/dump.pgc`, is restored offline as
before and its application is not booted.

`cleanupComplete` reports whether the restored project, its labeled containers
and volumes, its networks and its directory were removed. It is deliberately
separate from `outcome`: a verified restore with leftover resources reports
`outcome: "verified"` and `cleanupComplete: false`, and the leftovers keep
`cleanupPending` set.

`checks` are product labels, never messages:

`archive-hash`, `archive-structure`, `backup-identity`, `file-inventory`,
`database-integrity`, `database-schema`, `database-rows`, `database-restored`,
`database-tables`, `database-empty`, `database-content`, `application-boot`.

## Status

`--status` prints, with runs newest first and capped at 30:

```json
{
  "version": 1,
  "applicationId": "UUID",
  "deploymentId": "UUID",
  "runs": [{ "…receipt…": true }],
  "cleanupPending": false
}
```

Runs are newest first and capped at 30, except that the newest run whose
archive still exists and the newest run carrying a verified restore are always
included. A long failure streak therefore cannot push "when were we last
protected" and "has a restore ever been proven" off the page.

`cleanupPending` is true while any staged archive, unfinished run, unfinished
recovery journal, leftover capture snapshot or abandoned multipart upload is
still outstanding.

## Recovery

`--recover` prints:

```json
{
  "version": 1,
  "applicationId": "UUID",
  "deploymentId": "UUID",
  "journals": [{ "runId": "UUID", "stopped": 2, "restarted": 1, "complete": true }],
  "restores": [{ "runId": "UUID", "removed": 2, "complete": true }],
  "interrupted": [{ "runId": "UUID", "cleanupComplete": true }],
  "cleanupPending": false
}
```

**It takes the deployment lock like everything else.** It waits up to 15
seconds, because systemd starts it as the run that held the lock is exiting,
and then exits **75** without touching anything if the lock is still held: the
holder may be a live deploy or a live backup, and restarting its containers or
closing its receipt would corrupt it. Recovery after a SIGKILL works because
the kernel drops that process's lock.

It is idempotent, and covers three kinds of leftover:

- `journals` — restarts only the containers a run recorded as running before it
  stopped them, so a container an operator had already stopped stays stopped,
  and removes the snapshot that capture staged outside the state directory. The
  staged path is regenerated from the run id, never read back from the record.
- `restores` — brings down the restored project of an interrupted or kept
  `--test-restore` (`docker compose down` on its own compose file), then
  removes every container and volume carrying this run's
  `sg-scheduled-restore` label, the project's networks, the names an older
  restore used, and the restore's directory. A resource with another run's
  label, or the application's own, is never touched.
- `interrupted` — every run still marked `running`, including a `postgres`
  capture or a killed upload that never stopped a container. Each is closed as
  `failed` with `errorCode: "interrupted"`, its staging is removed, and any
  multipart upload for its own object key is abandoned. If storage is
  unreachable the run stays `pendingCleanup` for the next attempt.

## Error codes

Bounded and stable. No SDK text, no exception messages, no paths, no addresses.

| Phase       | Codes                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- |
| config      | `config-unreadable`, `config-invalid`, `config-insecure`, `identity-mismatch`               |
| lock        | `lock-unavailable`                                                                          |
| credentials | `credentials-unreadable`, `credentials-insecure`, `credentials-invalid`, `credentials-rejected`, `storage-unavailable` (the interpreter has no `boto3`) |
| capture     | `source-missing`, `source-unsupported`, `source-not-running`, `source-identity-mismatch`, `helper-missing`, `capture-failed`, `capture-timeout`, `source-restart-failed`, `unsafe-path` |
| upload      | `upload-failed`, `upload-timeout`, `storage-denied`, `storage-missing-bucket`, `storage-missing-object`, `storage-unavailable`, `storage-error` |
| verify      | `download-failed`, `download-timeout`, `verify-mismatch`                                    |
| retention   | reported as `retention.failed`, never as the run's `errorCode`                              |
| restore     | `run-not-found`, `run-not-restorable`, `archive-unsafe`, `manifest-mismatch`, `database-check-failed`, `restore-image-unavailable`, `restore-failed`, `restore-timeout`, `boot-failed` |
| any         | `interrupted`, `unexpected-error`                                                           |

## What a run does

1. Take `/run/lock/haldur-<deploymentId>.lock` with a non-blocking
   exclusive `flock`, the same lock the controller takes for deploy and
   recreate. Held, and the run exits 75 without recording anything.
2. Write the `running` receipt durably before touching the source.
3. Check that every running container the controller labeled still carries
   this deployment id and revision in its `haldur.deployment` and
   `haldur.revision` labels, whatever its service is called. State
   owners run unlabeled so a release never recreates them; the configuration
   hash binds them instead. A redeploy since the config was written stops the
   run as `source-identity-mismatch` before the source is touched, rather than
   filing a newer deployment's data under an older revision.
4. Capture consistently.
   - `stack` (capture plan version 2): stop the services in `pauseServices`,
     dependents first: those are the services that write captured files, as
     the controller derived them from the recorded mounts; nothing else is
     touched, and an empty list is valid. Read each recorded volume where
     Docker keeps it, copy its files with ownership and take SQLite files
     through SQLite's backup API; copy every file the definition binds into a
     container. Run each owner's `dump` command inside its still-running
     container, keeping the dump under `database/<volume>.dump`, then its
     `verify` command for the content fingerprint only when the dump entry
     says `quiescent: true` (every writer the controller knows of is
     paused); an entry with `quiescent: false` is dumped online by the
     tool's own snapshot, its manifest records `fingerprint: null`, and the
     restore test proves it by loading it (`database-restored`) without the
     `database-content` comparison. Restart what was stopped. Before
     touching anything, refuse a captured volume that any running container
     outside the plan holds writable, a planned container whose volume mounts
     the plan does not record, or an owner whose image differs from the
     definition.
   - `sqlite-stack` (legacy): the proven quiesced helper — stop the source,
     copy every volume file with ownership, take the database through SQLite's
     backup API, verify the copy against the quiesced source, restart the
     source. Nothing is written to the application.
   - `postgres` (legacy): `pg_dump --format=custom --no-owner --no-acl` inside
     the running database container, with no pause and no canary write.
   Both archives carry `manifest.json`, the Compose definition and every
   file-bound configuration file needed to rebuild the stack.
5. Confirm the source is running again before any byte leaves the host.
6. Upload to `<prefix><runId>.tar.gz` — immutable, unique, inside the managed
   prefix and nowhere else.
7. Download it back and require an exact SHA-256 and byte-length match.
8. Expire, inside this prefix only, objects this deployment recorded, keeping
   the newest `keep` archives that still exist. Retention never runs after a
   failed upload, never deletes an object it cannot account for locally, never
   deletes the last good copy, and never touches another prefix or the earlier
   backup-proof objects. Each deletion stamps `expiredAt` on that archive's own
   receipt, and any recorded archive that is no longer listed at all — expired
   by a lifecycle rule, removed by an operator — is stamped too, so status
   never offers a copy that does not exist. A truncated listing is never read
   as evidence of absence.
9. Remove the staged archive and the snapshot the helper staged.

Local metadata is bounded at 100 receipts, but a receipt is never dropped while
it is the only record of an object that may still exist: pruning waits for
`expiredAt`, for a run that never reached storage, or for an open journal to
close. Retention and pruning are therefore one loop — expire the archive, then
forget the paperwork.

### Scope limits

- `postgres` (legacy) protects the database plus recovery material. A
  deployment whose application service also owns a volume is rejected as
  `source-unsupported` rather than silently backed up without those files.
  New schedules record the managed PostgreSQL as an owner with a dump
  procedure in the `stack` plan instead.
- `sqlite-stack` supports the two inspected reference stacks only, enforced by
  the capture helper.
- The runner never fails over, never promotes a restore and makes no
  zero-data-loss claim. A schedule bounds the recovery point; it does not
  remove one.

## Test overrides

`HALDUR_BACKUP_ROOT`, `HALDUR_LOCK_DIR`, `HALDUR_SOURCE_ROOT` and
`HALDUR_HELPER_STAGE_ROOT` relocate the state directory, the lock, the
deployment root and the capture helper's staging directory. They exist for the
unit tests. Production uses `/var/lib/haldur/backups`, `/run/lock`,
`/opt/haldur` and `/var/tmp` — the last is fixed inside the capture helper,
so it must not be moved on a real host.
