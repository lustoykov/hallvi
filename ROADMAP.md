# Server Guy development roadmap

This is the single owner of development order, implementation status, and the remaining work. Keep detailed checklists here rather than maintaining a separate TODO file. See the [documentation map](README.md#documentation) for the other documents' roles.

**Launch phases** describe the [user's Application Launch journey](docs/user-journeys/01-application-launch.md#nine-phase-journey). **Development milestones and PRs** describe how we build it. One launch phase spans several PRs: Phase 1 includes boundaries, Drizzle, Pi setup, evals, GitHub connection, and durable requests. Milestone numbers below are not launch-phase numbers.

## Development sequence

The sequence below carries the agreed order formerly kept in the learning guide, with the current Phase 1 eval work made explicit. It is not a replacement for the journey's product requirements or exit gates. Conditional technology adoption is not a mandatory step.

| Order | Development milestone | Status / detail |
| --- | --- | --- |
| 1 | Harden Phase 1 HTTP and Pi boundaries with Zod, TypeBox, and adversarial tests. | Merged: [PR #7](https://github.com/lustoykov/server-guy/pull/7). |
| 2 | Add Drizzle over the existing SQLite database. | Merged: [PR #8](https://github.com/lustoykov/server-guy/pull/8). [Checklist](#add-drizzle-over-the-existing-sqlite-database). |
| 3 | Configure Pi explicitly, with supported model selection and account setup/recovery. | Merged: [PR #9](https://github.com/lustoykov/server-guy/pull/9). [Setup and remaining acceptance work](#configure-pi-explicitly). |
| 4 | Establish repeatable Phase 1 tests and real-Pi evals. Extend relevant cases alongside later milestones. | Merged: [PR #10](https://github.com/lustoykov/server-guy/pull/10). Desktop automation, local dashboard and opt-in judge are implemented; human meaning review and broader journey coverage remain open below. |
| 5 | Connect GitHub explicitly: authorization, scope, revocation, exact repository access. | Implemented on `codex/github-connection`, awaiting PR review. [Checklist](#connect-github-explicitly), [setup and boundaries](docs/integrations/github.md). |
| 6 | Make Pi requests durable: SQLite, one local Node worker, run IDs, revisioned messages, reconnectable SSE, bounded transcript and durable summary. | Planned: [checklist](#make-pi-requests-durable). |
| 7 | Make one chat execution inspectable through durable Activity Events, structured logs, OpenTelemetry, and Langfuse. | Planned; follows durable Pi requests, then extends alongside later Operations. [Checklist](#action-history-and-tracing), [small spec](docs/specs/action-history-and-tracing.md). |
| 8 | Implement the Phase 2 Application Contract as a read-only vertical slice. | Planned; after required Phase 1 acceptance. [Product contract](docs/user-journeys/01-application-launch.md#nine-phase-journey), [learning exercises](docs/learning/stack-with-server-guy.md#the-first-learning-slice-phase-2-application-contract). |
| 9 | Specify and test the durable Operation lifecycle without a provider mutation. | Planned. |
| 10 | Reconcile the first real Hetzner host effect through approval and verification. | Planned. |
| 11 | Containerize and deploy the first exact application Release to a VPS. | Planned; satisfy the relevant launch-phase gates, not just container startup. |
| 12 | Revisit Workflow DevKit only when its durability trigger is present. | Conditional: [trigger](#revisit-workflow-devkit-only-at-its-trigger); not a prerequisite for the next milestone. |
| 13 | Break, recover, roll back, and externally re-verify a deployed application. | Planned. |
| 14 | Add the EC2 Host Adapter, reusing the proven Linux-host lifecycle and Host Record. | Planned: [AWS direction](#aws-integration-direction). |
| 15 | Complete the home-server, managed-platform, Python, and AWS ECS/Fargate transfer labs without expanding Server Guy's V1 boundary. | Later learning work: [home-server constraints](#home-server-controller-mode), [learning guide](docs/learning/stack-with-server-guy.md), [AWS direction](#aws-integration-direction). |

Merge status above and checkbox status below are distinct: a checked item is implemented in this branch, not proof of complete phase acceptance. Test results and unresolved acceptance evidence live in the [testing guide](docs/testing/phase-one-acceptance.md#latest-verification).

## Phase 1 implementation backlog

Finish the required [Phase 1 acceptance gates](docs/testing/phase-one-acceptance.md#what-done-means), including explicit GitHub connection and durable requests, before starting Phase 2. Optional cleanup and conditional architecture studies are not automatic blockers. Server Guy uses Pi as its only model and agent runtime; do not add AI SDK Core or `useChat` to the product.

### Add Drizzle over the existing SQLite database

- [x] Define the existing SQLite tables, columns, constraints, and indexes with `drizzle-orm` while preserving current names and behavior.
- [x] Replace handwritten CRUD queries and unchecked generic row casts with typed Drizzle queries.
- [x] Keep `better-sqlite3`, foreign-key enforcement, WAL mode, transactions, and the prototype reset/nuke policy.
- [x] Prove unchanged domain behavior with the existing tests plus a schema smoke test against a fresh database.
- [x] Keep this PR mechanical: do not add Pi Run, worker, streaming, authentication, or Phase 2 tables yet.

Decision: use `drizzle-kit push` during prototyping. The TypeScript Drizzle schema is the only schema definition; application startup validates the schema but does not create it. We deliberately do not keep handwritten `CREATE TABLE` statements or versioned migration files beside it. Run `npm run db:push` after installing dependencies or intentionally nuking the local database.

### Configure Pi explicitly

- [x] Add a Pi setup screen that shows installation/runtime readiness, authentication state, provider, model, and reasoning effort.
- [x] Use `openai-codex`, `gpt-5.6-sol`, and `high` reasoning effort as the initial Server Guy default.
- [x] Keep Codex CLI credentials separate, show Pi's exact credential source, and start an explicit ChatGPT device-code OAuth flow.
- [x] Cover existing credentials, first-time login, cancellation, expiry/refresh failures, quota errors, missing runtime, and unavailable models with isolated automated tests; live account acceptance remains below.
- [x] Detect existing Pi provider/model/effort and credential presence read-only; require **Use existing Pi setup** or **Use a new ChatGPT connection** before chat.
- [x] Snapshot the adopted preferences in Server Guy’s own config; never import machine tools, extensions, instructions, or custom model/provider definitions.
- [x] Keep authentication limited to ChatGPT subscription OAuth; reject API keys and other providers.
- [x] Offer Pi catalog models and model-supported reasoning levels, validate on save and before each turn, and persist changes only in Server Guy preferences.
- [x] Explain unencrypted JSON token storage and the actual shared/separate destination before reuse or login; keep runtime details collapsed.
- [x] Promote prototype A to the real login screen; keep technical details in a separate help panel and preserve the current connection until replacement login succeeds. See the [current setup rules](docs/testing/phase-one-acceptance.md#current-entry-points-and-setup-rules).
- [x] Automatically detect reusable Pi login on page load, including broken-login recovery; offer **Use existing login** / **Connect another account** without a manual scan button.
- [x] Return from Pi setup to an [applications overview](docs/testing/phase-one-acceptance.md#current-entry-points-and-setup-rules), with explicit creation and switching; keep Pi configuration installation-wide and each application's chats, Decisions, and checks separate.
- [x] Use **Settings** navigation and progressive storage disclosure; add explicit disconnect (forget Server Guy's selection, preserve credential files) and confirmed per-application removal for fresh testing.
- [x] Document the [Phase 1 desktop acceptance contract](docs/testing/phase-one-acceptance.md), separating deterministic UI/domain tests from live Pi behavior, GitHub authorization and pending durable-worker gates.
- [x] Add desktop-only Playwright Test with isolated app/database/config fixtures and failure traces, two CI smoke journeys and manual full-suite runs. Keep Vitest and opt-in live Pi cases separate; all code/config/results live under `tests/`.
- [ ] Extend checked-in browser coverage to remaining branches of the eighteen-case [acceptance contract](docs/testing/phase-one-acceptance.md#current-journey-contract); current automation covers selected branches, not complete Phase 1 acceptance.
- [x] Add a separate localhost-only testing dashboard for fixed runner commands, recent runs, file locations and saved-answer human review; no production app page or test-control service.
- [x] Add optional, explicitly confirmed LLM judging of one saved answer, with configurable model/effort, isolated tools and separate immutable review records. Unit/browser validation does not claim a successful real-provider judge run.
- [x] Fix the September 4 audit's setup request-boundary defect: reject untrusted Origins across all 11 mutation handlers, with regression coverage including saved-setting preservation and a real-Next HTTP check. Browser exploitability of the original defect was not tested.
- [x] Restore keyboard focus to **Disconnect** after its confirmation dialog closes via Cancel/Escape; both paths verified in the desktop browser. Full keyboard accessibility remains separate acceptance work.
- [x] Add eight opt-in real-Pi eval cases with repeatable inputs, exact proposal/state checks, isolated SQLite state, model/source metadata and a human review sheet; reuse Vitest, not a new eval service.
- [ ] Review the live Pi baseline's meaning against its case rubrics and record human verdicts. Keep automated checks and semantic acceptance distinct; rerun relevant cases as each phase changes.
- [x] Clarify the unresolved-conflict eval. Decided 2026-09-04: Pi may suggest a way to resolve the conflict as long as nothing is recorded and it does not claim the engineer chose; the rubric now says so. Earlier judgments used the stricter wording and stay as saved.
- [ ] Retain a repeatable real-route production smoke check that login POST and attempt GET share the coordinator in one process. A fresh September 4 production start/poll/cancel probe passed; the old Fable singleton concern was not reproduced. Do not add cross-process machinery without a demonstrated need.
- [ ] Review remaining unused Pi presentation fields/constants (`billing`, `usesDefaultModel`, `PI_PROVIDER_LABEL`, `PI_MODEL_LABEL`) for removal. Preserve credential validation, API-key rejection and no-API-fallback guarantees; this is cleanup, not an architecture blocker. Carried forward from the September 3 Fable review.

Decision: the packaged Pi SDK is the runtime; users do not install Pi or Codex CLI. **Use saved login** snapshots the detected model/effort and shares Pi’s `auth.json`; token refresh may update that file after consent, but global model preferences stay untouched. **Connect ChatGPT** defaults to `openai-codex` / `gpt-5.6-sol` / `high`; model and effort can be edited before sign-in. Each attempt writes a separate `.server-guy/pi-auth-<login-id>.json`. Only successful OAuth activates that file and the selected preferences by atomically replacing `pi-settings.json`. Failure or cancellation leaves the previous connection intact. Older accepted credential files are retained for in-flight turns. Existing `pi-auth.json` configurations remain readable.

Tokens are unencrypted JSON; new credential files are owner-only (0600), and Pi preserves existing file permissions. `SERVER_GUY_CONFIG_DIR` overrides the storage directory. Detection does not refresh tokens, execute key commands, contact providers, expose secrets, or read Codex CLI auth. Only built-in `openai-codex` models and stored ChatGPT OAuth credentials are reusable. Readiness means local configuration/credentials are present; provider access and limits are checked on send. Live OAuth completion and a real model response still require a user-approved account test.

### Connect GitHub explicitly

- [x] Add a user-visible GitHub authentication and connection flow.
- [x] Detect and explain any reusable local credentials instead of silently assuming access.
- [x] Verify access to the exact selected repository and record the credential source, repository identity, permissions, and observation time.
- [x] Test successful authorization, cancelled or denied authorization, missing scope, revoked or expired credentials, and an inaccessible private repository with controlled provider responses.
- [x] Verify real GitHub App installation, device sign-in and read access to the selected private repository without a client secret or private key.

Decision: offer explicit reuse of a detected GitHub CLI/environment credential or a separate GitHub App device login. The App asks only for Contents read access plus mandatory Metadata read access. Server Guy records exact repository membership in the installation as well as the user/repository identities. Disconnect preserves application history but invalidates old repository gates; reconnect requires re-verification. Expiring App user tokens require sign-in again in this local prototype rather than distributing a client secret for refresh. Detailed behavior and registration steps live in the [GitHub guide](docs/integrations/github.md). No worker, webhook, provider-write or Phase 2 scope is included.

### Make Pi requests durable

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

## Action history and tracing

Give users an expandable history of what Server Guy attempted, accepted, and actually changed, with technical evidence when they want to inspect a step. The [action history and tracing spec](docs/specs/action-history-and-tracing.md) owns the behavior and boundaries; build order and completion stay here. The first slice follows durable Pi requests and does not add a new Phase 1 acceptance gate.

- [ ] Reuse Pi Run identity and durable Activity Events to correlate one chat execution across the worker, Pi, domain validation, database commit, and refreshed Operator View.
- [ ] Instrument Pi model/tool lifecycle and Server Guy's own boundaries with OpenTelemetry; export to Langfuse and attach the same run/trace references to structured logs.
- [ ] Preserve meaningful start, result, retry, cancellation, timeout, interruption, and rejection facts. Record a Decision as saved only after commit; retain failure history when domain writes roll back.
- [ ] Expand the existing Activity view into ordered steps with timing, outcomes, and record/evidence links; keep redacted technical payloads in Evidence and offer an authorized Langfuse trace link when configured.
- [ ] Verify success, domain rejection after tool success, timeout/cancellation, restart/reconnect, unavailable telemetry, and payload redaction against the spec's acceptance scenarios.
- [ ] Extend the same correlation through policy, approvals, provider calls, receipts, and verification as those Operations are implemented; add Sentry for application errors before external-user releases.

## Revisit Workflow DevKit only at its trigger

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

Build order and status stay here. The boundary between an EC2 host and an ECS/Fargate deployment target, capability details, and supporting references live in [docs/integrations/aws.md](docs/integrations/aws.md).

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
