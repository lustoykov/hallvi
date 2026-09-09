# Controller backup and isolated recovery proof — 2026-09-09

Server Guy now has a manual recovery checkpoint for its own state. This is
separate from the scheduled application-data backups shipped in PR #28. No new
server agent, macOS launch job or continuously running daemon was installed.
Restic 0.19.1 was installed through Homebrew on the controller Mac.

## Storage boundary

A new private R2 bucket, `server-guy-controller-backups`, uses the EEUR location
hint and Standard storage. Its account token grants Object Read & Write only to
that bucket. The credential and restic password exist only in private controller
files; they were not installed on application hosts. Public r2.dev access is
disabled.

Actual S3 requests proved both boundaries:

- The existing application-backup token receives AccessDenied when listing the
  controller bucket.
- The new controller token receives AccessDenied when listing the application
  bucket.

An empty initialization briefly created two restic metadata objects under a new
controller prefix in the application bucket. Both were removed after validating
that no snapshots/data existed. No application backup objects were changed.

## Real capture and restore

The web application and worker were idle and stopped gracefully. The capture
held both worker process locks and a database write lock, then used SQLite's
backup API and copied the associated session/access files. Restart was requested
0.35 seconds after stopping began. The local applications route returned HTTP 200
and the worker reported ready afterward. Remote application services were not
stopped or changed.

The corrected checkpoint was 860 KiB on disk, containing 40 payload files:

| Preserved record | Count |
| --- | ---: |
| Applications / deployments | 3 / 3 |
| Chats / matching native JSONL sessions | 3 / 3 |
| Messages | 36 |
| Application operations | 30 |
| Pi runs | 6 |
| Decisions | 4 |
| Activity events | 11 |

Schema version: 13. The manifest records all 19 table counts, every payload file
hash, original paths, source revision, dirty checkout status and missing recovery
dependencies. Disposable 2.8 GiB proof archives were excluded.

The encrypted snapshot
`eb5a64a6134d9d681a3cb31c44e09a5bf58507773174bd173b32c3f7a9c79af6`
was uploaded to R2, downloaded into a new isolated directory, decrypted, and
verified. Restic's restore verification, all file hashes/inventory, SQLite
integrity/foreign keys, table counts, and all three chat/session associations
passed. Its source checkout was dirty during development; a final checkpoint is
refreshed after merge, with the merged source revision recorded in its manifest.

Two live negative checks also passed: capture refused the actual running worker
without creating output; the actual Server Guy `db()` entrypoint refused the
restored database/configuration because their quarantine markers were present.
No restored worker or application was started, and no historical operation was
replayed. Existing local database/environment file permissions were tightened to
0600; captured/restored secret files are 0600 inside 0700 directories.

## Automated verification and independent review

The application suite passed 929 tests, with 15 skipped. Sixteen controller backup tests
cover a real encrypted restic roundtrip, wrong password, committed WAL data,
worker lock contention, queued operations, in-progress deployment, missing
stopped-runtime assertion, session mismatch and torn JSON, extra/tampered files,
credential symlinks, selected-provider credential export, and split database and
configuration roots. TypeScript, targeted ESLint and formatting checks pass.

Actual Claude Opus 5 at maximum effort independently audited the design through
Claude CLI. His separate-bucket recommendation was implemented and verified.
His audit also confirmed the existing dangling model-auth reference and the need
to capture database and configuration roots separately. His implementation review found SQLite WAL
sidecars in the checkpoint and migration entry points that bypassed quarantine.
Both were fixed, covered by regression tests, and the real R2 capture/restore was
repeated with a single database file. Waiting proposals can now be preserved
without approving them. Upload refuses controller recovery secrets accidentally
included in the payload. Runtime state is excluded from ESLint so downloaded
Grafana plugin bundles are not treated as project source.

## Explicit limits and next actions

- **Recovery-key custody remains pending:** a private recovery kit is prepared on
  the Mac. It must be stored independently, preferably in the user's password
  manager, before loss of the Mac is recoverable. It is not committed or printed.
- The configured model credential file was already absent before capture.
  Recovery correctly reports that ChatGPT must be reconnected.
- This is a manual, stopped-controller checkpoint. Unattended controller
  scheduling and retention/deletion policy are not yet enabled.
- Restoring records is proven; activating a replacement controller with renewed
  credentials and reviewed absolute paths is not yet rehearsed.
- A controller-only token prevents application hosts accessing these backups.
  It does not provide immutability against deletion by the controller itself.
- Fresh application-server replacement/cutover remains a separate next step.

Operator commands and activation safeguards are in
[`scripts/controller-backups/README.md`](../../scripts/controller-backups/README.md).
