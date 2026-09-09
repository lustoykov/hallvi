# Scheduled backups and retention — 9 September 2026

This slice turns the earlier manual proofs into host-owned scheduled backups for
the three deployed test stacks. The controller observes receipts; a systemd timer
executes independently of the controller worker or an open conversation.

## Installed policy

- Daily at 03:00 Europe/Sofia, with up to 30 seconds of randomized delay.
- Keep the latest seven successful scheduled archives in the private R2 bucket
  `server-guy-backups`. Manual proof archives are outside the managed prefix.
- Each application/deployment owns its own
  `scheduled/<application-id>/<deployment-id>/` prefix.
- PostgreSQL uses an online custom-format `pg_dump`. SQLite and persistent files
  use the existing quiesced capture helper and restart recorded source containers
  before upload. Short interruptions can still affect in-flight application work.
- A successful backup means the uploaded archive was downloaded again and matched
  in size and SHA-256. A restore test is a separate result.

The actual Claude CLI used `claude-opus-5` at maximum effort for the runner,
interruption/retention review, integration review, and Backups UI pass.

## Live evidence

| Stack | Deployed revision | Verified scheduled archive | Isolated restore |
| --- | --- | --- | --- |
| Grafana + Prometheus | `5ecac80b7df3f6480fffe0b4c83de15609ae81c1` | `d150ce60-7cf1-4a09-a6cc-5b29a257cfcf`, 70,129,746 bytes; 2.422-second pause | 695 files, 92 SQLite tables, 1,798 rows checked against the capture manifest |
| Uptime Kuma | `6fe82505d60eeb581e93d5a30ba9f6188abac66f` | `25294e4b-66e3-42d1-9ab5-a888d0dab343`, 63,236 bytes; 4.774-second pause | Five files, 29 SQLite tables, 1,535 rows checked against the capture manifest |
| Todo / PostgreSQL | `7f281ad255fcd9255dcc1f2d3d1d8359a3aea259` | `732d70be-50d7-4313-97cd-f0cac860532b`, 2,459 bytes; no source pause | One table and three rows restored; an additional isolated query compared every selected field of three known fixture records, including Unicode text and completed state |

Three deliberately labelled Todo test records remain in the test application.
The first PostgreSQL restore also exercised an empty application table; it was
followed by the populated-data proof above. No production data was overwritten.

The scheduled SQLite checks validate the database and captured files offline.
They do **not** start Grafana, Prometheus, or Kuma from the restored archive.
Earlier manual app/browser/plugin proofs stay visible as separate dated evidence.
PostgreSQL uses a disposable container with its own volume and no network.
All recorded test resources were cleaned up; the restore verdict and cleanup
verdict are independent.

## Failure and independence checks

- **Real R2 retention:** ten tiny disposable successful archives, keep seven:
  three older copies deleted, seven retained. An unmanaged object under the same
  prefix and a manual sentinel outside it survived. Only fixture objects were
  deleted when the experiment finished.
- **Real multipart cleanup:** created and uploaded a part, then aborted that exact
  upload. The provider reported no remaining upload for that key.
- **Storage access failure:** temporarily replaced only Todo's scoped credential
  with an invalid value. The upload failed; the last successful archive and
  restore remained recorded. Cleanup honestly stayed pending while storage was
  unavailable. Restoring the original credential and running recovery cleared
  cleanup without changing the failed backup outcome.
- **SIGKILL during SQLite pause:** killed the Kuma service while its source was
  stopped. systemd recorded signal 9; `ExecStopPost` restarted the recorded source
  container, closed run `788beade-d34b-496a-b718-fbf7a99eff02` as interrupted,
  and cleared temporary staging. Kuma returned healthy. The UI displayed the
  failed attempt alongside the previous good recovery point and restore proof.
- **Shared deployment lock:** with the host lock held, both a backup and recovery
  exited 75, creating no new receipts or source mutations.
- **Controller worker stopped:** a temporary host systemd timer triggered the
  installed backup service after the worker had stopped. Kuma run
  `a0fa1472-8a4d-4ab5-b088-2e9798b4d0ae` completed successfully. After two minutes,
  the page reported current status unavailable while retaining older evidence.
  The observer restarted and caught up. This tests a stopped worker, not a
  physical laptop shutdown or loss of the application host.
- Unit tests cover truncated listings, long failure streaks, old-copy provenance,
  hostile archives, mismatched source revision, transfer mismatch, pending
  cleanup retry, and missing/expired/stale UI facts.

## Integration and operations

The Backups page can enable the default policy for a supported stack with
connected storage, start a backup, test an isolated restore, and refresh observed
status. The agent can propose the same durable operations and choose daily or
six-hourly cadence with 2–90 retained successful copies. Operations use the
existing per-application queue. Host backup/recovery and deploy/recreate mutations
share one lock.

The installer checks the recorded Compose hash. Older deployments without a
bundle receipt pin the observed hash and recheck it under the lock. The runner
also requires matching live deployment/revision labels before capture. A changed
revision requires reconfiguration; the old policy cannot silently certify it.
Failed installation restores previous runner/config/unit files and timer state.
A lost SSH response is reconciled against the committed host policy.

Private controller setup lives under `.server-guy/backup-destinations/`:
`default.json` contains provider, endpoint, bucket, region and a credential
filename; that separate file contains the access key pair. Both must be mode
0600. No credential is returned by the UI or written into public receipts.
The current Cloudflare token grants object read/write only for the backup bucket.
The credential is installed privately on each protected host.

See [runner contract](../../scripts/scheduled-backups/CONTRACT.md) for the installed
layout, receipt fields, invocation, cleanup and recovery behavior.
Provider reference: [R2 S3 credentials](https://developers.cloudflare.com/r2/api/tokens/).
Timer reference: [systemd.timer](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml).

## Validation and remaining scope

Local application suite: 927 passed, 15 skipped. Python: 42 scheduled-runner tests
plus nine existing backup-proof tests passed. TypeScript and targeted lint passed.
Desktop and 390px mobile setup/configured states were inspected; failure,
staleness, and the actual restore action were exercised in the browser.
CI is not a merge gate, per the owner's instruction.

Still outside this evidence: AWS S3 against an actual AWS account, replacement-host
cutover, controller records/native-session backup, automatic app boot/plugin
checks for every scheduled restore, credential rotation/revocation onboarding,
and notification delivery while the controller is offline. Retention is a count
of successful copies, not a promise to retain seven calendar days after arbitrary
manual runs. The first overnight calendar occurrence is scheduled; the live
independence test used a short temporary timer against the same installed service.

The final Opus integration review found one blocker in combined backup/restore
cleanup ownership. It was fixed and regression-tested: clearing restore resources
cannot forget pending backup staging. Dead cleanup callbacks were removed, bounded
restore failure reasons now reach the UI, and long-running action polling backs
off. Revision reconfiguration and a single-lock release transaction remain
requirements for the future release executor.
