# Implementation plan

The only active delivery plan. [Product](PRODUCT.md) owns scope, [architecture](docs/architecture/agent-directed-operations.md) owns mechanisms and [journeys](docs/user-journeys/README.md) own user outcomes. Research, review snapshots and archived checklists do not create additional work commitments.

## Current state — 9 September 2026

| Area | Evidence and remaining limit |
| --- | --- |
| First real deployment | The [8 September acceptance](docs/testing/2026-09-08-real-deployment-acceptance.md) records the product deploying `lustoykov/todo-fastapi` to Hetzner, generating its missing Dockerfile, preparing the host, using private persistent PostgreSQL and verifying external create/read/delete behavior at the selected revision. This is dated evidence, not a current uptime claim. |
| Hardening | The [follow-up report](docs/testing/2026-09-08-deployment-hardening.md) records bounded fixes and test results. The [9 September integration report](docs/testing/2026-09-09-final-integration.md) records final local checks and an additional cross-conversation persistence fix. |
| Conversation-first UI | Fable's [integration report](docs/design/2026-09-09-conversation-first-integration.md) describes real deployment receipts, shared views, cross-conversation references and preserved drafts. The [final integration acceptance](docs/testing/2026-09-09-final-integration.md) records local browser coverage and the retained legacy preparation boundary. |
| Final screen reference | Fable’s finished views and replayable `/prototype` scenarios are integrated. Real application routes use recorded state and unavailable placeholders; simulation does not implement backups, monitoring, releases or other missing executors. See [combined acceptance](docs/testing/2026-09-09-final-ui-integration.md). |
| Persistence | Schema v13 adds durable application operations, serialized changes, a queue with precondition rechecks and retained cancellation. Existing domain/deployment evidence and native conversations remain. History and the agent read the same operations; current executors remain source preparation/publication and first deployment. See [coordination acceptance](docs/testing/2026-09-09-operation-coordination.md). |
| Runtime limit | The runtime now represents a source-built web service or pinned Docker Hub image, optional PostgreSQL, private image services, read-only configuration mounts and persistent volumes including SQLite. See the [dated runtime evidence](docs/testing/2026-09-09-single-instance-runtime.md); arbitrary Compose, BYOM, worker lifecycle and backups are not implied. |
| Scheduled data protection | R2-backed host timers, retention and isolated database/file restores now run on the PostgreSQL, Kuma and Grafana/Prometheus test stacks. Failure, interruption and sleeping-worker evidence is recorded in the [scheduled-backup acceptance](docs/testing/2026-09-09-scheduled-backups.md). AWS S3 and replacement-host cutover remain open. |
| Controller recovery | Encrypted manual checkpoints, isolated Linux UI/access restoration, and a real recovered Pi-worker request with clean rollback are verified in the [worker recovery proof](docs/testing/2026-09-09-controller-worker-recovery.md). Apple Passwords holds the recovery kit with iCloud sync enabled; second-device retrieval, credential rotation and full multi-loop takeover remain unproved. |
| Lifecycle gaps | BYOM adoption, routine release history, full controller takeover, replacement-host restoration and ongoing care still need end-to-end implementation. The controller currently enforces local access; shared/separate remote hosting requires authenticated bootstrap. |

## Integration acceptance and remaining reconciliation

While Fable owns the UI, backend work should start from the actual supported-stack gaps and acceptance fixtures. Do not build a second shell or another competing plan.

- [x] Verify the implemented conversation-first slice with persisted state and synthetic failure journeys: approvals, retries, multiple conversations, reload and drafts. The [acceptance report](docs/testing/2026-09-09-final-integration.md) distinguishes passing checks from unresolved-outcome and broader lifecycle gaps.
- [ ] Remove remaining mandatory phase ceremony only after preserving prerequisite checks and evidence access. Enforce the narrow operability-PR boundary in all source-writing paths.
- [x] Reconcile the [legacy acceptance](docs/archive/implementation/phase-one-acceptance.md), [retained checklist](docs/archive/previous-direction/docs/plans/implementation-history.md) and [merge review](docs/reviews/2026-09-08-fable-merge-readiness.md) against the current candidate. Record applicable fixes or deliberate retirement; do not treat archived work as silently waived. Dispositions are recorded in the [final integration report](docs/testing/2026-09-09-final-integration.md).
- [x] Run the relevant local tests, build and browser journeys and get the [independent review](docs/reviews/2026-09-09-final-integration-review.md). The approval follow-up has a passing regression test. The owner explicitly deferred CI enforcement; let GitHub checks run without treating them as the current gate. Relevant local checks and real evidence still apply. PR #22 was merged after local validation; historical results and a prototype are insufficient for later slices.

Retained checks and their [recorded disposition](docs/testing/2026-09-09-final-integration.md): unreviewed live-model semantic cases, source/connection provenance, owner-merged candidate verification, durable request cancellation/retry, populated database migration and history preservation. Earlier AWS labs, workflow-engine research and UI presentation cleanups are not merge requirements unless a concrete current defect requires them. The deployment spending card already supplies an explicit authority boundary; do not recreate a generic phase gate merely to satisfy an old checklist.

## Delivery sequence

Each increment must connect conversation, durable state, execution and verification. These are engineering increments, never user-facing stages. Implement the smallest useful case within each; do not wait for every compatibility case to finish before exercising a working lifecycle.

### Current priority: service-based deployment

Direction agreed on 10 September 2026: follow the [core and Plugin boundary](docs/architecture/extensible-capabilities.md). The first implementation slice is [service-based deployment](docs/architecture/service-deployment.md): shared source images, explicit roles, dependencies, scoped private-input/managed-connection bindings, and readiness plus asynchronous behavior verification. A synthetic web + worker + Valkey stack exercises this without application-name branches. It does not complete the lifecycle or plugin runtime.

- Reconcile the supported application requirements with the plan schema, executor, backup capture path and dashboard model. Separate configuration differences, missing core capabilities and justified specialised behavior.
- Use that review to generalize recorded services, storage ownership, writers and consistency requirements. Preserve existing deployments, recovery points and evidence; replace application-name guards only when the replacement method has equivalent checks and meaningful restore proof.
- Use Grafana's specialised verification as the first candidate bundled Plugin after separating generic capture from functional checks. Exercise a second, different integration before stabilizing the interface. Select one additional application to reveal remaining core gaps without expanding the product's one-instance boundary.
- Define enforceable access, version identity, result contracts and activation behavior before loading generated code. Include inspection, export, recovery and optional contribution through a PR. Prefer existing views for plugin results; a marketplace and arbitrary custom UI are not initial gates.

Acceptance for the first generalization slice: an additional in-scope application works through configuration and supported methods without new application-name branches in core execution; existing test stacks retain their verified behavior. Record any genuinely specialised requirement explicitly. The Docker proof covers initial startup, same-image recreation, a stopped worker, safe test-object cleanup and recovered job processing. It is a local Linux container proof, not a new Hetzner/BYOM or backup certification. Next separate host adoption and subsequent release attempts from the initial-deployment path.

### 1. Complete the single-instance runtime

Close the [reviewed recovery gaps](docs/reviews/2026-09-09-final-integration-review.md) before expanding the executor: provide evidence-backed resolution for an uncertain purchase with no recovered host and for an unknown verification object; clean private material for definitively abandoned setup. Do not clear uncertainty merely because the user retries. The [runtime acceptance report](docs/testing/2026-09-09-single-instance-runtime.md#recovery-gap-dispositions) records the implemented paths and the explicit limits of owner-attested purchase reconciliation.

Reuse actual Dockerfiles/Compose and support upstream image intake, required services, configuration mounts, persistent files, private connections and explicit ports. Prepare repository and host without discarding existing workloads. Add BYOM through the same Linux-host lifecycle as Hetzner; record the observed prerequisites and unsupported cases.

Introduce workers, PostgreSQL/SQLite and required Redis/Valkey through representative fixtures rather than an installer branch for every product. Preserve scheduler ownership and library-controlled queue behavior. Keep source/image/configuration identities pinned; interrupted external effects require reconciliation before retry.

**Acceptance:** a source app missing deployment setup and a host missing runtime prerequisites; then an image with persistent SQLite and a linked-service configuration. Recreate containers without data loss, inspect logs, reject unsupported dependencies honestly and retain safe recovery after controller interruption.

### 2. Public delivery and controller installation

Finish domain routing, automatic HTTPS/renewal and applicable Cloudflare DNS/CDN setup. Recommend Hetzner size/region from current requirements and cost; keep BYOM equally available. Reconcile provisioning uncertainty before another purchase. Establish reachability for private/home machines before claiming public delivery; a tunnel is a possible mechanism, not a mandatory product choice.

Package authenticated Server Guy installation on the same host and on a separate controller. Preserve controller state and recovery access during application releases.

**Acceptance:** trusted public HTTPS reaches the intended application; failed access/issuance is actionable; configured CDN caching is tested without caching private responses; both controller placements work. These checks do not promise zero-downtime Compose deployments.

### 3. Protect and restore data

**Delivered slice:** scheduled R2 backups and retention with isolated restore proofs for the three test stacks. See [dated evidence](docs/testing/2026-09-09-scheduled-backups.md). The broader acceptance below remains open.

Connect R2 and S3. Discover PostgreSQL, SQLite and other required persistent state; choose consistent backup methods, schedule, retention and off-host transfer. Verify an isolated restore with meaningful application data. Protect controller records, native sessions, configuration and recovery material separately.

**Acceptance:** each storage destination passes backup and restore; failed upload, expired access and stale recovery points remain visible across restart. Restore onto a replacement instance without replaying completed operations, preserving application identity and isolating the previous writer before cutover. A bucket, schedule or uploaded file alone is not proof of recoverability.

### 4. Release updates and recover from failure

Reuse existing GitHub Actions/checks or prepare a reviewed workflow when useful. Prebuilt images do not need a source build. A passing commit/image becomes a candidate; the user requests its release. Record distinct attempts and the actual serving revision rather than overwriting the initial-deployment record.

Run existing migrations with outcome tracking; inspect uncertainty before repeating side effects. Roll back only where configuration/data compatibility permits. Hand application-code failures to a coding agent, then verify the owner-merged fix through the same release path.

**Acceptance:** later pushes cannot replace an approved candidate; required failed checks block it. Demonstrate a failed release, interrupted migration, compatible recovery and returned code fix, with fresh application behavior checks.

### 5. Ongoing care and background work

Implement bounded host-side logs, metric/health collection and observed job results independent of an open chat or model turn. Catch up after a sleeping controller; show freshness and retention gaps. Add bounded diagnostic archives to the selected off-host storage so previous evidence remains inspectable when the application host is unavailable.

Configure existing scheduled commands with timezone, non-overlap, timeout, logs and pause/resume. Observe worker health and supported queue summaries without copying payloads into Server Guy or adding another retry system. Create durable in-app issues for meaningful failures, deduplicate noise and link to evidence/investigation. Routine successes belong in history, not unsolicited chat messages.

**Acceptance:** controlled app/worker/job/backup failures, controller downtime, host unreachability and collection gaps produce honest state. Configured host work continues while the controller sleeps; reconnecting does not duplicate history or replay unknown side effects. In-app notifications do not promise out-of-app delivery.

## Compatibility gates

The [compatibility matrix](docs/testing/self-hosted-compatibility.md) supplies executable acceptance targets. Retain the source-app/PostgreSQL proof; start with Uptime Kuma and Grafana/Prometheus, then Forgejo/Vaultwarden, Paperless-ngx and finally Immich's heavier dependencies. This order is a working priority, not a promise of universal upstream support.

For each supported pinned version prove **deploy → meaningful work → recreate → update → restore → verify**, plus a controlled failure. Add its required machinery to the increments above. Installing all examples is not a gate for the current UI integration. WordPress and the earlier Coolify-as-a-workload experiment are not release requirements.

## Later and excluded

External notification providers are an agreed expansion after in-app issues; choose providers when implementing delivery. Plugin boundary review and the first candidate extraction are covered above; a general marketplace and broad plugin/UI runtime remain unscheduled. Additional compute/storage providers, automatic-on-push releases, previews, dedicated build servers, richer teams and API/MCP integration have no committed implementation order.

Multi-host application/database orchestration, clusters/replicas, automatic database failover and distributed job orchestration are outside the product direction. Manual recovery onto a replacement host maintains one active instance. Learning labs and competitor feature lists do not expand this boundary.

## Updating this plan

Change status only with linked evidence and its date/candidate. Replace superseded decisions rather than appending another correction. Put a feature's implementation sequence here once; link from its journey/spec. Do not store live spending authorization, credentials or temporary machine availability as permanent product requirements.
