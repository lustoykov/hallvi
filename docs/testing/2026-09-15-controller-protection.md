# Server Guy's own protection, 15 September 2026

What was verified for automatic controller copies, and what was not. Branch
`claude/controller-protection`, on top of `be8c199`. The focused tests use a
local stand-in for the bucket; one real copy has since been written to and
read back from the owner's Cloudflare R2 account, recorded below.

## What the copies are

When a backup destination is connected, the Pi worker copies the controller's
own state after each piece of work it finishes — at most hourly — and once a
day. The database is read through SQLite's online-backup API while the
controller runs; native session files, connection JSON, deployment keys, the
selected model credential and the environment files join it in one tar, which
is encrypted with AES-256-GCM under a generated passphrase and uploaded with a
single signed PutObject under the bucket's `controller/` prefix. The last 14
copies are kept. Pi never runs any of it.

## The first real copy

Run on 15 September 2026 at 12:33 UTC by the reviewing session, with the
owner's authorisation, from this worktree at `70d5e50`: `protectController("daily")`
called directly against the owner's real configuration directory and their real
`server-guy-backups` R2 destination.

- `succeeded`, `controller/20260915T123354Z-9fde0101.tar.enc`, 1,464,372 bytes,
  657 ms from capture to uploaded, retention deleted 0 and did not fail.
- A separately written SigV4 `GET` of that key returned 200 with the identical
  byte count and a matching SHA-256, so both the PUT signature and the stored
  object are proven against real R2 rather than against the stand-in.
- `openControllerCopy` opened it with the generated passphrase: 43 files, the
  manifest verified, both `RECOVERY_QUARANTINE` markers present, and one
  recovery dependency recorded (point `pi-settings.json` at
  `recovery-provider-auth.json`, or reconnect the model account).
- The owner's configuration directory now holds `controller-protection/state.json`
  and `recovery-key.json` with the kit unconfirmed, so Backups shows "Kit not
  saved" for the owner to confirm. Nothing else in that directory was touched.

That run also found one defect, fixed here: `payload/config/pi-settings.json`
was written into the archive twice, because the config directory's `*.json`
sweep and the account-directory copy both add it when `SERVER_GUY_CONFIG_DIR`
is set — the production shape. The manifest and the reopen tolerated it by
keying on path; the capture now skips the account copy when the same path has
already been taken, and a test asserts the archive has no repeated path.

## Verified here

`npm test -- controller-protection` (13 assertions across two files, 5.3 s):

- **Hot capture.** A message committed through WAL and never checkpointed is
  in the copied database; the payload carries the database, the config files,
  the backup destination, both `RECOVERY_QUARANTINE` markers and a manifest.
- **Encryption.** The archive round-trips under its passphrase, the plaintext
  is not present in the sealed bytes, and a wrong passphrase is refused.
- **Upload.** A local HTTP stand-in for the bucket records a PUT whose
  `Authorization` is a well-formed SigV4 header over `host;x-amz-content-sha256;x-amz-date`,
  and the stored bytes match the recorded length. Its signature was **not**
  checked against a real S3 implementation — see the limits below.
- **The copy is openable.** The stored object, decrypted with the recovery
  kit's passphrase, yields a manifest whose files verify, and the passphrase
  itself appears in none of them.
- **Recovery command.** `scripts/controller-backups/decrypt-copy.mjs` opens the
  downloaded object into a new quarantined directory; the restored database
  passes `PRAGMA integrity_check` and holds the message that was written
  before the copy. One flipped bit is refused rather than partly restored.
- **Skips.** With a response still `running`, the copy records `skipped` with
  "A change was running" and sends nothing; once the change settles the next
  copy succeeds. This check is a guard, not the mechanism that prevents
  overlap: the single sequential worker is, and both call sites are outside
  `executePiRun`. It catches a second worker or a stale row left by a crash.
- **Back-off.** An attempt that produced no copy — failed or skipped — is not
  due again for an hour. Without it, a destination that rejects the very
  first upload would be captured, encrypted and re-attempted every minute the
  worker is idle, and 30 identical failures would push the record's real
  copies out of it.
- **Retention.** Sixteen copies leave fourteen objects in the stand-in, two
  DELETEs are issued, and every live record points at an object that is there.
- **Failure.** An unreachable endpoint records `failed` with a reason and the
  view reports `failing` with no last copy — a failed upload never reads as
  protection.

`npm test -- controller-protection-view` renders the real Backups page: the
Server Guy row on the board with its state word and the day cells, the lede
sentence beside the application's, the recovery-kit band when the kit is
unconfirmed, the same band on the "nothing has been looked at yet" page a
fresh controller shows, a failed copy stated rather than hidden, and nothing
at all when there are no controller facts.

`npx playwright test --grep @journey-controller-protection` (31 s) walks the
three states in the browser against the QA fixture: no destination (the row
says Not copied and the storage form is the page's one action), a copy taken
with the kit unsaved (the passphrase is fetched and shown, once), and
"I saved it" clicked, after which the state reads Recoverable, the kit is
gone, and Settings → Connections shows the passphrase again only after
"Show recovery kit".

## Not verified

- **One real R2 round trip, on one account.** The run above proves a PUT, a
  GET and a reopen against Cloudflare R2. It does not prove AWS S3, another R2
  account, a bucket with different permissions, or a copy large enough to need
  multipart upload.
- **No replacement-controller activation.** The command restores and verifies;
  copying state into live paths, removing quarantine markers and starting a
  replacement remains the manual boundary in
  [scripts/controller-backups/README.md](../../scripts/controller-backups/README.md).
- **Retention is recorded, not swept.** Deletion follows this controller's own
  record of what it uploaded. An object written by a controller whose record
  was lost is not found and deleted by anything.
- **The passphrase is stored on the controller** so the worker can keep making
  copies. It is the archive's protection against whoever can read the bucket,
  not against whoever can read this machine.
- **No rehearsal has been run against these copies.** The September 2026
  replacement rehearsal ran against the retired schema and its helper scripts;
  the owner chose to delete that tooling rather than keep it documented as
  broken, so [REHEARSAL.md](../../scripts/controller-backups/REHEARSAL.md) now
  keeps the procedure and its lessons as prose with no code behind it.

## Environment

macOS, Node 26, better-sqlite3 13. The full application suite passes. Three `@smoke` browser specs — `applications-home`,
`operator-information` and `typed-information` — fail in this environment;
they fail identically on `be8c199` with none of this branch's code, so they
are not caused by these changes.
