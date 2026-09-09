# Agent-directed operations

[Product](../../PRODUCT.md) defines the supported boundary; [Roadmap](../../ROADMAP.md) tracks delivery. This document separates the current mechanism from the target lifecycle. It does not require a new generic framework before the next useful operation.

## Responsibility and state

```text
Application conversations ↔ stable application views
                  │ shared receipts and facts
             Next.js routes
                  │
       SQLite records + private native sessions
                  │
         Node worker / embedded Pi
         ├── inspect, explain, recommend
         └── typed operations + authority + verification
                              │
                  Hetzner API / SSH / GitHub
                              │
                 one Linux host / Docker Compose
                  ├── web/API and workers
                  ├── required data/broker services
                  └── schedules and persistent files
                              │
                         R2 / S3 backups
```

The diagram shows the target responsibilities, not shipped support for every service. Keep the Next.js modular monolith and existing Node worker. Use straightforward modules and persistent records; a distributed queue, workflow engine or general plugin runtime is not a prerequisite.

Pi interprets repository/upstream evidence, investigates ambiguity and revises the next work. Deterministic code validates requests, enforces authority, executes bounded effects and records observations. Untrusted repository text and command output are evidence, never permission or instructions to the controller.

## Current implementation

`deployment-planner.ts` inspects a pinned repository and submits a validated plan. `deployment-executor.ts` currently emits one HTTP service with optional private PostgreSQL, prepares a fresh Hetzner host and checks the resulting application. It cannot faithfully represent arbitrary Compose stacks yet; required unsupported services must block planning rather than disappear.

`deployment-store.ts` retains the initial deployment intent, source/connection identity, recommendation/approval, progress and results. Conditional writes prevent stale record replacement. Provider creation uncertainty is reconciled using the original identity before another purchase. Exact cost/offer and source identity are refreshed at the effect boundary.

`operation-store.ts` persists application operations. Existing deployment writes synchronize their receipt into this store; each log collection keeps a separate snapshot record. The existing deployment row still owns provider identity, source and spending authority. History, chat receipts, view activity, navigation marks and Overview consume the shared operation list. This adds operation history, not a completed multi-release executor.

A partial unique index allows one `working` change per application. Approval, queue selection and completion run in immediate SQLite transactions. Approved changes blocked by another change are `queued`, with a reference to the blocker. Completion advances the oldest approved change. Repository, contract, revision, plan and input-name assumptions are checked both on advancement and executor claim; a changed assumption returns the operation to `proposed` without running it. Inspections do not take this change slot.

Existing source preparation/publication commands and initial deployment are the current executors. Typed persisted commands let queued source work resume without its originating HTTP request. Source permissions, approved file digests, provenance and deployment pricing checks remain mandatory. The model cannot supply arbitrary shell commands or declare unsupported operations executable.

The generic decision endpoint accepts approve/retry/cancel with an `updatedAt` comparison. Deployment approval and recovery retain their source/price/secret checks in the dedicated endpoint; a deployment still waiting behind another operation can be cancelled through the generic endpoint before any host effect. Cancelled records remain in History. Retrying creates a linked attempt and retains the failure.

A dead local worker fails its claimed operation. If no external effect began, the queue continues. If a GitHub write or deployment effect may have occurred, the failed record holds the slot until its existing reconciliation/retry path establishes the result. Process death alone never authorizes another conflicting change. The operation record owns this hold; the agent never acquires or releases a lock.

## One application, multiple conversations

Conversations belong directly to an Application. Each has its own transcript, draft and native Pi session; all refer to shared operational facts. An accepted run retains its application/conversation context when the user changes views. Request deduplication, cancellation, retry and atomic commits survive navigation and worker restarts.

An operation records its origin and affected resources. The initiating reply renders the full receipt; other conversations can reference it. Stable views show the same pending work and independently verified current state. A proposal never masquerades as applied configuration. The server serializes changes regardless of which conversation or automatic task requested them. Duplicate unresolved intents reuse the same operation and record a mention in the requesting conversation. Every model turn receives compact live operation context, with `list_operations`, `propose_change` and `record_inspection` tools; other transcripts are excluded. The inspection tool records a read of saved application records and explicitly does not claim current remote health.

Automatic jobs/checks record a schedule or system origin without inventing a user message. Failures become durable issues; investigation can link a conversation. Routine successes remain in history. Fable's [integration report](../design/2026-09-09-conversation-first-integration.md) owns the current presentation and browser-local seen-state limitation.

## Prepare the repository and the host

Inspect the actual source, existing Docker/Compose definitions and upstream instructions. Preserve required services, files, commands, versions, ports and persistence. Official image intake must not require a user-owned repository or a GitHub Actions build. Host preparation establishes authorized access, Docker/Compose, directories, permissions, network reachability and sufficient resources while respecting existing workloads.

Generate missing deployment configuration when supported. Application-code changes remain limited to owner-merged operability PRs. Never rewrite queue libraries, invent business commands or drop a dependency to make a plan fit the executor.

The target runtime supports PostgreSQL, SQLite, required Redis/Valkey, application-specific disk state, web/API services, workers and schedules. These run on one host. Source/image/configuration identity and observed readiness belong to the deployment record; credentials stay in private storage and out of transcripts and generated UI.

## Background work

Reuse the application's worker and scheduling machinery. A host schedule triggers an existing command; a queue library stores/delivers work; a worker executes it. Server Guy configures and observes those mechanisms instead of becoming the job runtime.

Avoid duplicate schedulers, overlapping scheduled runs, blind command retries and a second queue retry loop. Preserve execution revision, times, bounded output and known/unknown outcome. A release must respect in-flight work and incompatible migration windows. Queue payloads remain with the application. See [background-work acceptance](../user-journeys/08-scheduled-jobs.md).

## Controller placement and bootstrap

The controller can share the application host or run separately, including on a laptop. Separate its configuration, records, native sessions and recovery material from application volumes and releases. Same-host installation needs authenticated access and a safe bootstrap/update path; the current loopback-only controller does not establish that capability.

A controller backup must include both SQLite and native sessions. The operator must retain access/recovery material privately. Avoid self-update behavior that interrupts its own unfinished operation without a recovery path.

## Telemetry while the controller is offline

Target: host-side collection, configured schedules and backups continue on a healthy host while the controller sleeps. Keep bounded local logs, samples and check results; return current summaries first and detailed evidence on demand. Reconnect without duplicating records or requiring a full log download. Record observation time, source identity, freshness and retention gaps.

Periodically archive bounded diagnostics to the configured R2/S3 destination independently of the controller. Diagnostic archives and restorable application backups have separate coverage and retention. Failed uploads, bounded spool exhaustion and inaccessible credentials must be visible. Archive identities/access must remain available without contacting a failed host.

An unreachable host does not prove a crash. Cached/archived evidence remains inspectable but is not live health. A shared-host failure stops both controller and host collection; no archive guarantees the last seconds or provides independent outage detection. Choose the simplest host tooling that passes these cases; a custom telemetry platform is not mandated.

## Releases, protection and recovery

A release binds the chosen source/image, configuration and applicable checks. Reuse GitHub Actions when useful; a push makes a candidate available and the user requests release. Keep attempts and actual serving state separate. Existing migrations need outcome reconciliation; an image rollback does not reverse schema/data changes.

Backup methods must suit PostgreSQL, SQLite and other persistent state. Verify transfer off-host and an isolated restore, then record the recovered data and remaining gaps. A live SQLite database cannot be protected by an uncoordinated file copy; follow a consistent method for the actual application.

Manual recovery onto a replacement host preserves Application identity/history, with new host/deployment attribution. Establish one active writer and scheduler before cutover; a returning old host must not resume conflicting work. This is recovery within a single-instance topology, not multi-host operation or automatic failover.

## Implementation reality and migration

Schema v13 retains Decisions, Observations, contracts, conformance/publication evidence, phase workspaces and native histories. The phase-oriented UI model is superseded; its evidence and authority checks remain until equivalent behavior replaces them. Migration renames the legacy PID guards to `application_operation_processes` without discarding them and creates durable `application_operations`. Stop both web and worker processes before migrating. Preserved live guards prevent new changes from bypassing older in-flight preparation.

Use known-version, backed-up migrations with populated-state tests. Preserve application/chat/message IDs, native-session associations, pending work, source provenance and exact tested candidates. Do not drop tables because their old UI names disappeared.

The [legacy implementation references](../archive/README.md#implementation-reference) describe those existing mechanisms and tests. The [roadmap](../../ROADMAP.md#integration-acceptance-and-remaining-reconciliation) owns their explicit acceptance disposition.

## Plugins

Optional later work. If revisited, use one Plugin concept for UI plus fetching/processing, authorized actions, configuration and persistent state. Its authority cannot exceed the normal operation boundary. Runtime isolation, versioning, import/export and backup need a concrete design then; core conversation, views, collection and operations do not depend on it now.
