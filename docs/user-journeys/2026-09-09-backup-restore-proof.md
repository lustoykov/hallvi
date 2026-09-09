# First off-host backup and restore proof

On 9 September 2026, Todo's PostgreSQL database completed a real R2 upload,
download, and isolated restore. This is a bounded operator proof. It does not
configure scheduled backups or mark every application protected in the UI.

## Verified evidence

- Application: `ee2ae826-542b-45e0-834b-a23f95fcbf6f` (Todo).
- Source revision: `7f281ad255fcd9255dcc1f2d3d1d8359a3aea259`.
- Proof: `0e03e4f8-b777-48ca-a511-62cd114bfced`.
- Recovery point started: `2026-09-09T14:47:57.766Z`.
- Private R2 bucket: `server-guy-backups`, Standard storage, Eastern Europe.
- Object: `applications/ee2ae826-542b-45e0-834b-a23f95fcbf6f/0e03e4f8-b777-48ca-a511-62cd114bfced/postgres.dump`.
- Custom-format PostgreSQL archive: 2,341 bytes.
- Original and downloaded SHA-256:
  `4c01e9aa41c1b19fbb68c91ab672e1ca614234adfa7320498fc0eaea400ff9da`.
- Restore verified at `2026-09-09T14:48:04.847Z`.
- One complete row matched the source, including its ID, title, notes, completion
  state, and timestamps. The source was empty before the test, so this was a
  uniquely named temporary todo created through the actual application API.
- Restoration used a fresh local PostgreSQL 16 container with no network,
  published ports, or production volumes. Its immutable image ID was recorded.
- The temporary source todo and disposable restore container were removed.
  The application API returned an empty todo list afterward, and Server Guy's
  applications page returned HTTP 200.

The private receipt and dumps are under
`.server-guy/backup-proofs/0e03e4f8-b777-48ca-a511-62cd114bfced/`. Receipts record
creation, upload, download verification, restoration, and cleanup separately.
Raw dumps and credentials are never checked into Git or printed to chat.

## Repeat the proof

Wrangler must already be authenticated to the intended Cloudflare account, the
private bucket must exist, and the local Docker engine must be running. The
operator must authorize creating and removing a temporary todo. Existing
application data is included in the dump and compared without being modified.

```sh
node --import tsx scripts/prove-todo-postgres-backup.ts \
  <application-uuid> <cloudflare-account-id> <private-bucket>
```

`--local-only` as the fourth argument checks local dump/restore mechanics without
uploading. Its receipt explicitly says off-host protection is unverified.

The runner is intentionally restricted to the reference Todo schema and a
PostgreSQL-only deployment. It rejects empty evidence, changed source rows,
corrupted or truncated downloads, failed restores, and failed cleanup. It uses
existing pinned SSH host keys and Wrangler's saved login. Credentials never
appear in command arguments. Dumps are limited to 64 MiB and individual commands
to three minutes; this is not a large-database backup engine.

An initial local trial stalled while pulling a PostgreSQL image. Its failed
receipt was retained and its temporary todo removed. The final runner reuses an
installed matching PostgreSQL major version, pins its image ID, and force-stops
commands that exceed their deadline. The successful proof used the downloaded
R2 object, not the original local dump.

## What follows

1. Add the product's R2/S3 connection using credentials scoped to its bucket.
   The operator proof currently uses Wrangler OAuth. Cloudflare documents
   [bucket-scoped S3 credentials](https://developers.cloudflare.com/r2/get-started/s3/).
2. Implement scheduled PostgreSQL backups independently of the controller, with
   retention, durable operation records, failed-upload handling, and stale-backup
   issues. Show recovery point and restore-test evidence in the Backups view.
3. Cover Uptime Kuma and Grafana with consistent SQLite backups, plus their
   configuration and required files. Treat Prometheus data separately.
4. Exercise replacement-host application recovery and cutover. This proof tested
   a fresh database instance, not an entire replacement VPS or production cutover.

See [the complete protection journey](06-database-backups.md) for the larger
acceptance boundary, including AWS S3, expired credentials, partial transfers,
controller restarts, and restoration authority.
