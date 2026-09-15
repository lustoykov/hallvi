# Controller recovery

Server Guy's own records and access configuration — the keys, history and
decisions recovery depends on. Application data backups remain separate and
continue on their host timers.

There are two paths, and the automatic one is the one that runs:

- **Automatic copies (default).** When a backup destination is connected, the
  worker copies the controller after each piece of work it finishes — at most
  hourly — and once a day, uploading one encrypted archive per copy under the
  `controller/` prefix of the same bucket. It does not stop the controller: the
  database is read through SQLite's online-backup API, so committed WAL data is
  included, and a copy that would overlap a running change is skipped and
  recorded with that reason. The last 14 copies are kept. Backups states it,
  and the passphrase is shown once as a recovery kit. The implementation is
  [`src/server/controller-protection.ts`](../../src/server/controller-protection.ts).
- **The manual stopped-controller checkpoint** below, for a deliberate
  pre-migration checkpoint. It is unchanged and still requires a stopped
  controller and `restic`.

**The manual checkpoint predates schema 15.** `controller_backup.py` still
reads `chats`, `pi_runs`, `application_operations` and `deployments`; the
current database has `applications`, `conversations`, `messages` and
`saved_information`, so a capture against a current controller fails before it
writes anything. Its own tests build the old tables and still pass. Update it
with the tables it needs before relying on it again.

## Opening an automatic copy

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
contacts a host or activates a controller. The payload has the same layout as
the checkpoint below, so the quarantine markers and the activation boundary
apply unchanged. Losing every copy of the passphrase makes recovery
impossible: the archive contains the credential for the bucket it is stored
in, which is exactly why the passphrase is kept outside the controller.

## Manual checkpoint: capture and upload

1. Stop the web application and worker gracefully. Wait for ongoing work to
   finish. Do not kill active deployment or agent operations to make a checkpoint.
   `--stopped` is an operator assertion: the tool cannot discover every web server.
   The tool additionally acquires both worker SQLite locks and a database write
   lock, and refuses unsettled runs, operations and deployments.
2. Run `python3 scripts/controller-backups/controller_backup.py capture --stopped
   --output /private/new-checkpoint`. Explicitly supply `--project`,
   `--database`, and `--config-dir` when using non-default runtime paths. Explicit flags take precedence over `SERVER_GUY_DB_PATH` and
   `SERVER_GUY_CONFIG_DIR` from the process environment. The tool does not load
   `.env` files. Output must not already exist.
3. Restart the original controller immediately after capture. Upload uses only
   the captured copy and does not require the controller to remain stopped.
4. Run `python3 scripts/controller-backups/controller_backup.py upload --settings
   /private/settings.json --source /private/new-checkpoint`. Preserve the exact
   returned snapshot ID. Upload failure does not claim a successful checkpoint.

Settings JSON has `repository` (a restic repository URL), `passwordFile`,
`credentialFile` (JSON containing `accessKeyId` and `secretAccessKey`), `region`,
and optionally an absolute `restic` binary path. Password and credential files
must be private (0600). For a local test repository omit `credentialFile`.
Initialize a new, dedicated repository once with the `init --settings ...`
command. Do not initialize over another repository or use a public bucket.

Restic supports [S3-compatible repositories and password files](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).
It encrypts the backup before uploading it. The password is deliberately outside
the captured payload. Losing every copy of that password makes recovery
impossible. Keep a recovery kit containing the password, repository address,
and storage access instructions in a password manager or another secure place
independent of the controller. Never put it on an application host.

## What survives

- SQLite online-backup API snapshot, including committed WAL data; schema version
  and every table's row count are recorded.
- Native chat JSONL files, validated against their database session IDs.
- Controller JSON connection settings, deployment SSH keys, host identity files,
  database passwords, deployment inputs, backup destinations and schedule evidence.
- `.env` and `.env.local`, saved as disabled files for manual review.
- The selected external model credential, when present; unrelated provider
  credentials from an external auth file are excluded. Reconnection may still be
  necessary for missing, expired or revoked credentials.

The manifest records source paths, revision and whether its checkout was dirty.
The source checkout, dependencies, disposable backup proof archives, diagnostics,
old database copies and process locks are excluded. A dirty checkout is not
preserved by this tool: commit/push needed source changes before a final recovery
checkpoint. Host application volumes are protected by their separate backups.

## Restore verification and activation boundary

Run `restore --settings /private/settings.json --snapshot FULL_64_CHARACTER_ID
--target /private/new-restore`. The target must not exist. Restic downloads and
verifies it; the tool then checks the complete file inventory and SHA-256 hashes,
SQLite integrity and foreign keys, row counts, and native session associations.
The command never starts any application, contacts an application host, or
replays controller operations. `verify --payload /private/new-restore/payload`
repeats the local validation.

Database and configuration directories contain `RECOVERY_QUARANTINE` markers.
Server Guy refuses to open these as its runtime database/configuration. The
restored `.env` files are disabled. Treat the entire restored directory as secret.
A failed capture or restore may leave a private partial directory. Use a new
output path on retry; do not upload or activate an incomplete copy. The schema
preparation, Drizzle configuration and schema-stamping entry points enforce the
same quarantine guard as the runtime.

Actual controller-loss activation is a separate operator action:

1. Retrieve the independently stored recovery kit; recover repository access or
   issue new R2 credentials through the Cloudflare account if necessary.
2. Check out the manifest's source revision and install its dependencies.
3. Inspect the restored database **read-only**, including run, operation,
   deployment and approval records. Establish that the old controller is stopped
   before enabling a replacement. Never run two controllers on the same hosts.
4. Review all absolute paths, disabled environment files, provider connections,
   deployment access and backup-destination credential references. Repoint
   `pi-settings.json` to the restored selected-provider file, or reconnect.
   Credentials and SSH host identities may have changed since the checkpoint.
5. Only after that review, copy state into explicitly selected activation paths,
   remove their quarantine markers and start the replacement. Validate the UI and
   read-only host access before requesting mutations.

This checkpoint proves data restoration; it does not prove replacement-machine
activation, credential renewal, or recovery-key custody. It has no automatic
retention/deletion policy yet. Keep verified checkpoints until a separate policy
is chosen. Use a separate controller bucket and bucket-scoped token, never distributed to
application hosts. Encryption protects confidentiality, not deletion; storage
immutability is a later hardening step.

## Tests

Automatic copies: `npm test -- controller-protection`. It captures a live
controller, proves committed WAL data is in the copy, encrypts and uploads to
a local stand-in for the bucket, skips while a change runs, applies retention,
and opens a copy again through the command above. No real provider is called.

Manual checkpoint: `python3 -m unittest discover -s tests/application/operator
-p test_controller_backups.py -v`

The encrypted roundtrip requires `restic` on PATH (on macOS: `brew install restic`).
Other tests use SQLite and local fixtures only. No real provider calls occur.
