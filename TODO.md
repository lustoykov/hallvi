# Server Guy TODOs

## Phase 1 follow-ups — Start

These are separate follow-up PRs after the current Phase 1 implementation. Complete items 1–4 before starting Phase 2. Server Guy uses Pi as its only model and agent runtime; do not add AI SDK Core or `useChat` to the product.

### 1. Add Drizzle over the existing SQLite database

- [x] Define the existing SQLite tables, columns, constraints, and indexes with `drizzle-orm` while preserving current names and behavior.
- [x] Replace handwritten CRUD queries and unchecked generic row casts with typed Drizzle queries.
- [x] Keep `better-sqlite3`, foreign-key enforcement, WAL mode, transactions, and the prototype reset/nuke policy.
- [x] Prove unchanged domain behavior with the existing tests plus a schema smoke test against a fresh database.
- [x] Keep this PR mechanical: do not add Pi Run, worker, streaming, authentication, or Phase 2 tables yet.

Decision: use `drizzle-kit push` during prototyping. The TypeScript Drizzle schema is the only schema definition; application startup validates the schema but does not create it. We deliberately do not keep handwritten `CREATE TABLE` statements or versioned migration files beside it. Run `npm run db:push` after installing dependencies or intentionally nuking the local database.

### 2. Configure Pi explicitly

- [ ] Add a Pi setup screen that shows installation/runtime readiness, authentication state, provider, model, and reasoning effort.
- [ ] Use `openai-codex`, `gpt-5.6-sol`, and `high` reasoning effort as the initial Server Guy default.
- [ ] Reuse existing Codex credentials only when the source is visible to the user; otherwise start an explicit OAuth flow.
- [ ] Test existing credentials, first-time login, cancelled login, expired credentials, exhausted quota, missing runtime, and unavailable model.

Open decision: confirm whether the packaged Pi SDK is sufficient on every supported machine or whether Server Guy must also distribute or require a separate Pi/Codex runtime. Also choose between a Server Guy-owned credential store and an explicitly shared machine-level credential store.

### 3. Connect GitHub explicitly

- [ ] Add a user-visible GitHub authentication and connection flow.
- [ ] Detect and explain any reusable local credentials instead of silently assuming access.
- [ ] Verify access to the exact selected repository and record the credential source, repository identity, permissions, and observation time.
- [ ] Test successful authorization, cancelled or denied authorization, missing scope, revoked or expired credentials, and an inaccessible private repository.

Open decision: choose the GitHub App/OAuth shape and whether Server Guy may reuse machine credentials or must keep its own isolated connection.

### 4. Make Pi requests durable

- [ ] Replace the unbounded transcript replay with a bounded recent-message window plus a durable summary.
- [ ] Always send every active Decision because it is the application's compact, authoritative state. Never truncate active Decisions by recency; scope or summarize them by phase only when the product requires it.
- [ ] Replace the request-bound, in-memory Pi turn with SQLite-backed Pi Run and assistant-message state.
- [ ] Persist the accumulated assistant message with `content`, `status`, and a monotonically increasing `revision`; batch writes instead of storing one database row per token. Reserve Activity Events for meaningful lifecycle, tool, approval, retry, and failure facts.
- [ ] Add one local Node worker process that owns scheduling and execution. Many Chats may enqueue runs, but allow at most one active Pi Run per Phase Workspace.
- [ ] Validate the multiple-Chat experience with worker concurrency set to one, visible queue state, and cancellation. Add a small bounded concurrency pool inside the same process only if real waiting makes the interface materially unpleasant.
- [ ] Return a run ID immediately, load the authoritative message snapshot after reload, and continue updates through a reconnectable SSE endpoint. SSE frames are delivery notifications, not the system of record.
- [ ] On worker restart, mark an in-flight run `interrupted` and require an explicit safe retry or reconciliation instead of blindly repeating possible external effects.
- [ ] Persist cancellation, timeout, retry, terminal result, and error state in durable Pi run records.
- [ ] Test multiple Chats queueing work, duplicate delivery, client disconnect, timeout, cancellation, worker crash, process restart, and reconstruction after reconnect.

The current Pi session is created and disposed inside one HTTP request, while the full Chat transcript is copied into every prompt. That request lifetime and unbounded context are the concrete trigger for this work. The database is authoritative: the durable summary, messages, Decisions, and Pi Run live there. The live stream is only a delivery mechanism and losing it must not lose or redefine the run.

The first design deliberately has one worker process and no leases. A Chat ID identifies conversation scope; it does not coordinate independent queue consumers. SQLite remains appropriate for one local scheduler, including a bounded in-process concurrency pool. Treat independent worker processes as the separate [horizontal worker scaling study](#later-architecture-study--horizontal-workers-and-durable-queues), not as hidden scope in this follow-up.

### 5. Revisit Workflow DevKit only at its trigger

- [ ] Re-evaluate Workflow DevKit when monitoring, timers, autonomous retries, or multi-step crash recovery make the SQLite-and-Node-worker design difficult to operate.

Do not add it merely because background work exists. If introduced, Server Guy's durable application records remain the product system of record; workflow history does not replace them.

## Later architecture study — horizontal workers and durable queues

This is a separate learning and design challenge, not a Phase 1 requirement and not yet a commitment to any queue or workflow product. Start it when a real Server Guy release or client design needs multiple independent worker processes, multi-host execution, worker failover, or more throughput than one bounded local process can provide.

- [ ] Write the invariants before choosing infrastructure: which work must stay ordered, what may run concurrently, what "claimed" and "complete" mean, and which external effects must never be repeated blindly.
- [ ] Build a small failure lab in which two worker processes compete for queued runs; kill a worker after claiming and after performing an external effect, then observe duplicate claims, lost work, recovery, and stale ownership.
- [ ] Understand and compare atomic database claims, PostgreSQL `FOR UPDATE SKIP LOCKED`, queue acknowledgement plus visibility timeout, and durable workflow execution. Include at least one managed queue and one self-hosted option when the target deployment is known.
- [ ] Compare each option on delivery semantics, ordering, leases and timeouts, retries, idempotency, cancellation, backpressure, crash recovery, observability, operational burden, local development, and multi-host support.
- [ ] Separate queue guarantees from application guarantees: no infrastructure choice removes the need for idempotency keys, durable run state, and reconciliation around external effects.
- [ ] Use the lab and a concrete deployment or client constraint to select a design. Record that choice in an ADR only then, including rejected alternatives and the trigger for revisiting it.

Expected learning artifact: a concise architecture note plus runnable failure scenarios that explain why the selected claim and recovery model is safe enough. Until this study is triggered, keep the production design at one worker process and do not implement leases.

Originating discussion: Codex side chat [`01a06676-6a82-7f03-91b9-95c61504a066`](codex://threads/01a06676-6a82-7f03-91b9-95c61504a066). Side chats are ephemeral, so retain this ID as a searchable provenance handle even if the link stops resolving.

## AWS integration direction

The ordered plan and the boundary between an EC2 host and an ECS/Fargate deployment target are recorded in [docs/integrations/aws.md](docs/integrations/aws.md).

- [ ] Finish and prove the provider-independent Linux-host lifecycle on the Hetzner reference path.
- [ ] Add an EC2 Host Adapter that produces the same Host Record and reuses the Linux-host lifecycle.
- [ ] Manually deploy the same application to ECS/Fargate as a separate enterprise AWS lab.
- [ ] Consider automating ECS/Fargate only after concrete client demand justifies a second deployment target.

## Home-server controller mode

- [ ] Install Server Guy on an always-on home server and connect to it from the Mac over the same Wi-Fi/LAN.

Initial scope:

- The home server runs the authoritative Server Guy controller, monitoring, Pi runtime, and SQLite database.
- The Mac accesses its UI and API over the local network; no Tailscale dependency is required initially.
- Give the home server a stable LAN address or local hostname.
- Require authentication even on the home network.
- Do not share or synchronize the SQLite file with the Mac.
- Consider Tailscale later only for access from outside the home network.
