# SQLite and multi-service restore proofs

The tested applications now have real R2 round-trip and isolated-restore
evidence. These are operator proofs, not scheduled protection or replacement-VPS
cutovers. The Backups UI does not yet consume these receipts.

**Follow-up:** [Functional Grafana recovery and application evidence](2026-09-09-grafana-functional-restore.md)
extends this initial result with saved dashboard, encrypted credential and plugin
tests, and connects the receipts to the application UI. The results and gaps below
describe the original proof runs.

## Results on 9 September 2026

| Application | Proof | Restored and checked |
| --- | --- | --- |
| Todo / PostgreSQL | `15c5e5a7-4c24-41fd-94e9-949fde4f9305` | One temporary row; complete schema, indexes and constraints; a successful write rolled back in the isolated database. The source was empty before the canary. |
| Uptime Kuma / SQLite | `79310e32-14d8-416e-ba9b-cd297210877e` | 29 tables, 969 rows, five files; actual user, monitor, settings and heartbeat history; pinned application boot and business records checked after boot. |
| Grafana + Prometheus | `c5e9741a-7b2f-4253-996b-18f4906ca006` | 92 SQLite tables, 1,786 rows, 692 files including plugins and provisioning; Grafana and Prometheus boot; authenticated Grafana datasource configuration and successful datasource health; 21 identical historical Prometheus samples. |

The private archives were uploaded to `server-guy-backups`, downloaded again,
and compared by size and SHA-256. All restores consumed the downloaded bytes.
Each SQLite schema and every table row matched the captured source before boot;
every archived file matched its manifest hash. Permissions and numeric ownership
were retained when loading fresh Docker volumes.

| Application | Archive bytes | SHA-256 |
| --- | ---: | --- |
| Todo | 2,340 | `40807d7c6e16b238f445d083f817f805640a448b37ec87129e381ffb7cb4a559` |
| Uptime Kuma | 46,744 | `b062af9b3eabf98189e756c44cb84244746baa48db01b4c7cebf89b9f33bd681` |
| Grafana + Prometheus | 70,498,408 | `3c14efb9eca3f016348f480a6ec6c1de0c7ca02d7abe1b6db4151e19689938c8` |

Receipts live in `.server-guy/backup-proofs/<proof-id>/receipt.json`. Stack
archives and their receipts are retained privately under
`applications/<application-id>/<proof-id>/` in R2. The earlier failed attempts
remain identified as failures; they are not protection evidence. Local dumps,
extracted state, and inspection copies are retained in the private proof folder.
No automatic retention policy is configured. These archives contain live
credentials, including Grafana's admin password in its Compose configuration;
they must remain private.

## Consistency, isolation, and source recovery

For a complete snapshot including mutable files, each source stack was stopped
cleanly while its state was copied. SQLite databases were reconstructed through
[SQLite's backup API](https://www.sqlite.org/backup.html), including committed WAL
data. The accompanying directories and actual Compose/provisioning configuration
were included. Grafana's
[backup guidance](https://grafana.com/docs/grafana/latest/administration/back-up-grafana/)
also calls out configuration, plugins, and stopping its SQLite-backed service.

The final source pauses were 4.74 seconds for Kuma and 2.83 seconds for Grafana
and Prometheus. Sources restarted before compression and upload. Prometheus's
complete stopped data directory included its WAL and head data; a fixed historical
query was compared after restoration. This avoids treating a live directory copy
as a consistent [Prometheus backup](https://prometheus.io/docs/prometheus/latest/storage/).
A brief pause can miss scrapes; it does not imply zero data loss.

A transient systemd unit owns capture, has a runtime limit, and uses
`ExecStopPost` to restart the original container IDs after failure. A separate
live fault test stopped a disposable container and killed the unit's main
process with SIGKILL; the recovery hook restarted that container. Production
containers were untouched by the fault test.

Restores used fresh local volumes and the exact source image digests. Their
Docker network was internal, with no published ports. A helper on that network
checked the applications. Restored monitors and alerting could not reach external
systems. Restored Grafana could communicate with restored Prometheus.

All disposable containers, networks, volumes, and source staging paths were
removed. Final checks found all source applications running, Kuma healthy,
Prometheus ingesting fresh samples (latest sample under one second old at the
check), and Server Guy's applications page returning HTTP 200.

## What the Grafana comparison learned

A byte-for-byte database match is required before starting the restored app.
Afterward, Grafana legitimately updates `user.last_seen_at` on authenticated
access. Datasource provisioning changes its update timestamp and re-encrypts
its empty secret payload. Treating these changes as lost state caused two failed
trial receipts, which were retained rather than relabeled as successes.

After boot, the proof therefore verifies user identity and password fields,
organization and encryption-key records, plus datasource UID/name/type/URL through
Grafana's authenticated API and its health against restored Prometheus.

The fixture has no saved datasource password and no user-created dashboard.
Encryption keys and ciphertext are preserved, but recovery of a **nonempty
external datasource credential** and a **saved dashboard** remain untested.
These checks must be added before making those broader claims.

## Opus review and corrections to PR 24

Claude CLI resolved the requested reviewer to `claude-opus-5` with max effort.
The first review examined the supplied PR 24 source packet; it did not independently
access the repository or execute tests. Its useful findings led to:

- Binding an API-created Todo canary to the actual source database, then verifying
  removal by querying that database instead of trusting an HTTP status.
- Using existing Todo data when available and creating a canary only when empty.
- Checking R2's public development URL and custom-domain settings before capture.
  Unknown privacy output fails closed.
- Recording source host-key identity, container/image identity, restore resource
  names, retained artifacts, and uncertain upload outcomes.
- Bounding the remote PostgreSQL command independently of the local SSH process;
  recording sanitized exit/signal metadata; labeling disposable resources;
  handling ordinary termination and excluding overlapping proof runs.
- Comparing PostgreSQL schema, indexes and constraints, plus a rolled-back write.
- Testing equal-length corruption, mismatched canary identity, SQLite WAL content,
  damaged databases, unsafe archives, and source restart after a failed copy.

A second source-packet review by Opus 5 at max effort recommended merging. Its
remaining substantive finding was fixed before merge: post-boot SQLite inspection
now requires a clean application exit and no nonempty WAL sidecar, preventing a
stale main-file copy from masquerading as post-boot evidence. The real Kuma and
Grafana proofs were rerun with that check. Its smaller suggestions were also
applied: derive the Grafana database path from the manifest, quote volume paths,
check the cached image platform before pausing the source, and disclose retained
live credentials. Connection-handle cleanup and IPv4 validation were tightened.

One speculative finding was rejected after checking the schema:
`deployments.application_id` is unique, so selecting its one deployment record
is not ambiguous. Scheduling, retention policy, queue integration, AWS S3, and
replacement-host cutover remain explicitly outside this operator proof.

## Running and recovering an operator proof

```sh
python3 scripts/backup-proof/prove-sqlite-stack.py \
  <application-uuid> <cloudflare-account-id> <private-bucket>
```

Requires Python 3.12+, Docker/Compose, cached exact application images and
`alpine:3.20`, existing pinned SSH identities, and Wrangler authentication.
Run with the application idle. Active application operations and overlapping
proofs are refused; this is not yet integrated with the product's operation queue.
`SERVER_GUY_CONFIG_DIR` and `SERVER_GUY_DB_PATH` select alternate controller state.

Receipts name `restoreProject` or `restoreContainer`. Disposable containers carry
`sg-backup-proof=<proof-id>` labels. SIGINT/SIGTERM trigger cleanup; SIGKILL or a
machine crash cannot. After a crash, first confirm the recorded process has
stopped, inspect only that proof's resources, then remove its own containers and
volumes. For a stack proof, its private `restore-compose.json` allows:

```sh
docker compose -p sg-proof-<proof-id> \
  -f <private-proof-directory>/restore-compose.json down --volumes
```

A leftover `backup-proof-<application-id>.lock` must be removed only after
confirming its recorded process is no longer running and checking source recovery.
For an interrupted Todo canary, use its receipt's unique token/ID to locate and
remove only that temporary row through the application API, and verify absence.
Do not remove unrelated application data or volumes.
