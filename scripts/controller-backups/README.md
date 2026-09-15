# Controller recovery

Server Guy's own records and access configuration — the keys, history and
decisions recovery depends on. Application data backups are separate and
continue on their host timers.

## The copies

When a backup destination is connected, the worker copies the controller after
each piece of work it finishes — at most hourly — and once a day. It does not
stop the controller: the database is read through SQLite's online-backup API,
so committed WAL data is included. A copy that would overlap a running change
is skipped and recorded with that reason, and an attempt that produced no copy
waits an hour before the next one, so a destination that refuses an upload is
not retried every minute.

Each copy is one tar, encrypted with AES-256-GCM under a generated passphrase
and uploaded with a single signed PutObject under the `controller/` prefix of
the same bucket. The last 14 copies are kept; older ones are deleted by this
controller's own record of what it uploaded. The implementation is
[`src/server/controller-protection.ts`](../../src/server/controller-protection.ts)
and there is no daemon, no schedule to configure and no second credential.

Backups states it beside the application's data. The passphrase is shown once
as a recovery kit, and the view says the copies are not yet the owner's until
they confirm they saved it; Settings → Connections shows it again on request.

## What a copy holds

- The SQLite database through the online-backup API, including committed WAL
  data, written as a single file.
- The native conversation JSONL files.
- Controller JSON connection settings, deployment SSH keys, host identity
  files, deployment inputs, backup destinations and schedule evidence.
- The selected external model credential when one is readable, as
  `recovery-provider-auth.json`. Unrelated provider credentials are excluded,
  and a missing one is recorded as a recovery dependency rather than skipped
  silently.
- `.env` and `.env.local`, saved as disabled files for manual review.
- A manifest with the capture time, the source revision and whether that
  checkout was dirty, the absolute paths it read, and a SHA-256 for every file.

The source checkout, dependencies, diagnostics, process locks and this
feature's own `recovery-key.json` are excluded. The passphrase is deliberately
not inside the thing it opens. Host application volumes are protected by their
separate backups.

## Opening a copy

Download the object with any S3 client — the bucket and prefix are in the
recovery kit, which Settings → Connections shows on request — then:

```
node --import tsx scripts/controller-backups/decrypt-copy.mjs \
  --archive /private/controller-copy.tar.enc \
  --passphrase-file /private/recovery-passphrase.txt \
  --target /private/controller-restore
```

The target must not exist. The command decrypts the archive, checks its
manifest inventory and every file's SHA-256 before writing anything, and
leaves the result private and quarantined. It never starts an application,
contacts a host or activates a controller. One damaged byte is refused rather
than partly restored.

Losing every copy of the passphrase makes recovery impossible: the archive
contains the credential for the bucket it is stored in, which is exactly why
the passphrase is kept outside the controller. Keep it in a password manager
or another secure place independent of this machine, and never on an
application host. Use a controller-only bucket and a bucket-scoped key.

## Activation boundary

The command above proves the copy restores. It does not activate anything, and
activation is deliberately manual:

1. Retrieve the independently stored recovery kit; issue new storage
   credentials through the provider account if the old ones are gone.
2. Check out the manifest's source revision and install its dependencies. A
   dirty checkout was not preserved; the manifest says whether it was dirty.
3. Inspect the restored database **read-only**. Establish that the old
   controller is stopped before enabling a replacement. Never run two
   controllers against the same hosts.
4. Review every absolute path, the disabled environment files, provider
   connections, deployment access and the backup-destination credential
   reference. Repoint `pi-settings.json` at `recovery-provider-auth.json`, or
   reconnect the model account. Credentials and SSH host identities may have
   changed since the copy.
5. Only then copy state into explicitly chosen activation paths, remove their
   `RECOVERY_QUARANTINE` markers and start the replacement. Validate the UI and
   read-only host access before requesting any change.

The database and config directories inside a copy carry `RECOVERY_QUARANTINE`
markers, and Server Guy refuses to open a marked directory as its runtime
database or configuration — the schema preparation, Drizzle configuration and
schema-stamping entry points enforce the same guard. The restored `.env` files
are disabled. Treat the whole restored directory as secret.

[REHEARSAL.md](REHEARSAL.md) describes what a replacement rehearsal has to do
and what the September 2026 one established. Encryption protects
confidentiality, not deletion; storage immutability is a later hardening step.

## Tests

`npm test -- controller-protection` captures a live controller, proves
committed WAL data is in the copy, encrypts and uploads to a local stand-in
for the bucket, skips while a change runs, backs off after an attempt that
produced nothing, applies retention, and opens a copy again through the
command above. It calls no real provider. The first real upload to Cloudflare
R2 is recorded in
[docs/testing/2026-09-15-controller-protection.md](../../docs/testing/2026-09-15-controller-protection.md).
