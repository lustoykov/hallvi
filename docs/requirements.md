# Required outcomes

These are product requirements, not a list of shipped features or a prescribed sequence for Pi. [Product](../PRODUCT.md) owns the support boundary; [Roadmap](../ROADMAP.md) records delivery; [architecture](architecture.md) explains the current implementation.

| User request | Required outcome and evidence |
| --- | --- |
| Deploy this repository or packaged application | Inspect actual source/upstream requirements; reuse Dockerfiles, Compose and images; prepare missing host/configuration within authority; verify the intended revision and useful behavior. Do not drop required services to fit the executor or require the user to own an upstream repository. |
| Change configuration or release an update | Bind the exact candidate and permitted effects, preserve state and relevant private connections, execute and check the actual serving version. Return diagnostics to Pi for correction. Existing CI can provide candidate evidence; GitHub Actions is not mandatory for prebuilt software. |
| Something broke | Establish where, impact and evidence; investigate with actual logs/state; correct operational configuration within authority or provide a coding-agent handoff. Suspected cause, failed behavior and unknown execution are distinct. |
| Give this to my coding agent | Produce a copyable packet with application/revision, affected behavior, timestamped redacted evidence and the check that should pass. The owner-merged fix returns through ordinary release verification. No integrated MCP transport is required for a useful handoff. |
| Protect my data | Identify every required database/file/key, select a consistent method, configure schedule/retention/off-host transfer, and verify an isolated restore that boots the restored application and checks useful behavior inside it. Record what was captured, copied, restored, booted and verified separately, and when a declared procedure or a stop fails, which step and what it printed, with private values masked. A database dump does not include uploaded files; a copied SQLite file is not automatically consistent; a matching fingerprint alone is not a working application. |
| Recover or roll back | Establish actual current state and data compatibility first. Reverting images does not reverse migrations. Replacement-host recovery preserves application history and establishes one active writer/scheduler before cutover. Never repeat an unknown side effect blindly: a command whose result was lost is read back from the host's record before anything runs again. A first deployment that stopped continues on the same host under its approval; only an effect outside that approval asks for a decision. |
| Run scheduled or background work | Reuse the application's commands, scheduler and queue library. Record actual execution and meaningful job behavior, not merely an idle/running process. Keep queue payloads and retries in the application's machinery. |
| Tell me what needs attention | Show observed health, resource/job/backup failures, freshness and gaps. Create durable, deduplicated in-app issues with evidence and next actions; record recovery separately from acknowledgement. Routine success belongs in history. In-app delivery is not an external alert or independent controller-outage detector. |

## Shared behavior

Chat and stable views read the same records. Preserve drafts, origin, progress and required attention across navigation, reload and different conversations. An approval changes authority, not observed runtime. One operation's receipt can be referenced elsewhere without another execution or another approval form. Unused infrastructure should not create empty controls.

Recommend one sensible path and let the user override it. Ask for missing access/inputs or effects outside authority, not every container command. Preserve spending, private data and existing workloads. R2/S3 access does not grant Cloudflare DNS or broader provider authority. Check reachability before promising public access from a private/home host. Public delivery requires the intended address, appropriate TLS and tested caching behavior without leaking private responses.

## Background-work requirements

A schedule triggers work; a queue retains pending work; a worker executes it. Do not install a duplicate trigger when the application already owns scheduling.

- Record command, target, revision, timezone, next/last run, duration and bounded/redacted output. Run now, pause/resume and schedule edits must not create duplicate triggers. Immediate execution needs authority for its effects; pause prevents new runs rather than silently killing an existing one.
- Prevent overlapping starts, apply a timeout, and retain failure/missed/unknown outcomes. Do not replay all missed occurrences or retry arbitrary effects after downtime. Coordinate releases with running jobs and migration compatibility.
- Respect the application's shutdown/redelivery policy and broker persistence. A cache eviction policy must not silently discard queued work. Do not add a competing retry loop or promise exactly-once processing.
- Display queue depth/age/failures only from an actual integration. Keep payloads in the queue; Server Guy retains configuration, observations and history. External queues can remain connected with explicit management/visibility limits.
- Host-owned schedules should continue without the controller or chat. Reconnection must not duplicate records or repeat unknown work. Backups have one schedule owner, not a second independently editable copy in a generic jobs view.

## Protection and offline operation

Application data, controller records/native sessions and diagnostic archives have separate protection and retention. Isolated restoration must not overwrite live data; production restoration requires its own authority. Record failed/partial transfers, expired access and stale recovery points honestly. Restore may replay queue work; use the application's documented recovery behavior.

Configured host collection should retain bounded evidence while the controller sleeps, with timestamps, source identity and retention gaps. An unreachable host is not proof of a crash, and older samples do not establish current health. A shared-host controller cannot independently report its own outage. A backup schedule alone promises neither zero data loss nor automatic failover.

## Proving reuse

Choose applications for requirements they exercise, not names to dispatch on in production:

| Case | Capability it exposes |
| --- | --- |
| Source web application / notes | Missing packaging, HTTP behavior, private PostgreSQL inputs, updates and retained data. |
| Independent web and worker builds | Multiple build contexts, shared files with per-mount access, SQLite and processed results across updates. |
| Grafana/Prometheus or Uptime Kuma | Persistent configuration/embedded data, private service checks and meaningful monitoring data. |
| Paperless | Document files, PostgreSQL, broker/worker behavior, ingestion and restoration. |
| Forgejo / Vaultwarden | Git repository files/additional protocols or HTTPS-sensitive clients and state; still targets to verify. |
| Immich | Heavier multi-service deployment, database extensions and media/ML requirements; pin a released definition and size from real requirements. |

These cases are not a certification list or a requirement to co-host everything on a small server. Verify current pinned upstream requirements before execution. An application's own database server (MariaDB for BookStack, for example) is declared as the owner of its volume with a dump procedure; do not replace an application's database to make it fit the managed PostgreSQL slot.

For a configuration claimed supported, prove **deploy → useful work → recreate → update → isolated restore → verify**, plus a controlled failure/recovery. Test missing setup, denied access, persistent state, actual image/configuration identity, interruption and relevant job behavior. A login page, a passing model answer or a file upload is not full lifecycle evidence. See [recorded proof](testing/README.md); requirements beyond that evidence remain requirements.
