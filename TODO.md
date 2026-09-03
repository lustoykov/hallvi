# Server Guy TODOs

## Phase 1 follow-ups — Start

These are separate follow-up PRs after the current Phase 1 implementation. Complete items 1–3 before starting Phase 2. Server Guy uses Pi as its only model and agent runtime; do not add AI SDK Core or `useChat` to the product.

### 1. Connect GitHub explicitly

- [ ] Add a user-visible GitHub authentication and connection flow.
- [ ] Detect and explain any reusable local credentials instead of silently assuming access.
- [ ] Verify access to the exact selected repository and record the credential source, repository identity, permissions, and observation time.
- [ ] Test successful authorization, cancelled or denied authorization, missing scope, revoked or expired credentials, and an inaccessible private repository.

Open decision: choose the GitHub App/OAuth shape and whether Server Guy may reuse machine credentials or must keep its own isolated connection.

### 2. Configure Pi explicitly

- [ ] Add a Pi setup screen that shows installation/runtime readiness, authentication state, provider, model, and reasoning effort.
- [ ] Use `openai-codex`, `gpt-5.6-sol`, and `high` reasoning effort as the initial Server Guy default.
- [ ] Reuse existing Codex credentials only when the source is visible to the user; otherwise start an explicit OAuth flow.
- [ ] Test existing credentials, first-time login, cancelled login, expired credentials, exhausted quota, missing runtime, and unavailable model.

Open decision: confirm whether the packaged Pi SDK is sufficient on every supported machine or whether Server Guy must also distribute or require a separate Pi/Codex runtime. Also choose between a Server Guy-owned credential store and an explicitly shared machine-level credential store.

### 3. Make Pi requests durable

- [ ] Replace the unbounded transcript replay with a bounded recent-message window plus a durable summary.
- [ ] Always send every active Decision because it is the application's compact, authoritative state. Never truncate active Decisions by recency; scope or summarize them by phase only when the product requires it.
- [ ] Replace the request-bound, in-memory Pi turn with a SQLite-backed run and event record.
- [ ] Add a Node worker that claims and executes pending runs with idempotent restart behavior.
- [ ] Return a run ID immediately, stream persisted updates over a long-lived HTTP connection, and reconnect from the last observed event after reload.
- [ ] Persist cancellation, timeout, retry, terminal result, and error state in durable Pi run records.
- [ ] Test duplicate delivery, client disconnect, timeout, cancellation, worker crash, process restart, and replay after reconnect.

The current Pi session is created and disposed inside one HTTP request, while the full Chat transcript is copied into every prompt. That request lifetime and unbounded context are the concrete trigger for this work. The database is authoritative: the durable summary, messages, Decisions, run, and events live there. The live stream is only a delivery mechanism and losing it must not lose or redefine the run.

### 4. Revisit Workflow DevKit only at its trigger

- [ ] Re-evaluate Workflow DevKit when monitoring, timers, autonomous retries, or multi-step crash recovery make the SQLite-and-Node-worker design difficult to operate.

Do not add it merely because background work exists. If introduced, Server Guy's durable application records remain the product system of record; workflow history does not replace them.

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
