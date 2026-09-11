# Implementation plan

The only active delivery plan. [Product](PRODUCT.md) owns scope, [architecture](docs/architecture.md) owns mechanisms and [journeys](docs/requirements.md) own user outcomes. Research, review snapshots and archived checklists do not create additional work commitments.

## Current state

Reviewed 11 September 2026 against merged main `0682ab2` (PR #45). These are implementation/evidence statements, not a claim that a particular local dashboard or remote application is currently running this revision.

| Area | Evidence and remaining limit |
| --- | --- |
| Native deployment | PRs #43–#44 let Pi author native Compose and use the same managed execution/feedback loop for first deployments and updates. Schema 14 converted retained custom primary/companion plans once into native Compose under their recorded release IDs; no plan reader remains. See [current deployment architecture](docs/architecture.md). |
| Reuse proof | Real configured Pi installed and updated PostgreSQL/private-input notes and independently built web/worker services with shared files and SQLite. State survived; the first app demonstrated host-feedback correction. The [second proof](docs/testing/README.md#dated-evidence) needed no production changes. These were local Docker proofs with provider/SSH stand-ins. |
| Verification limit | Initial intake still requires HTTP behavior checks and the primary host port 80. General private command checks and background-only application verification are not implemented. Worker processing in the second proof is harness evidence. |
| Lifecycle and rollback | Immutable releases, separate attempts, known versus unknown runtime observations, lost-result reconciliation and [compatible rollback](docs/architecture.md) are implemented. Rollback needs retained verified images and a data-compatibility assessment; it does not undo migrations. |
| Data protection | [Generalized capture](docs/architecture.md) uses data and writers for new schedules and has [Paperless/local restore evidence](docs/testing/README.md#dated-evidence). Legacy receipts remain readable. Backup `app`/`postgres` naming assumptions remain, and capture/restore of the second native topology is unproved. |
| Live-host evidence | The [8 September deployment](docs/testing/README.md#dated-evidence) and [9 September scheduled-backup report](docs/testing/README.md#dated-evidence) retain dated Hetzner/R2 evidence. They do not certify all subsequent native deployment changes on a real provider. |
| UI and persistence | Conversation-first receipts and stable views read shared operation records. Schema v14 retains serialized changes, queues, cancellation and native conversation history; releases have their own evidence. [UI integration](docs/testing/README.md#dated-evidence) is dated coverage, not a current browser acceptance claim. |
| Controller recovery | [Isolated Linux recovery and a recovered Pi request](docs/testing/README.md#dated-evidence) passed. Second-device recovery access, credential rotation and full multi-loop takeover remain unproved. |
| Broader gaps | BYOM adoption, additional public endpoints, authenticated controller bootstrap, migration orchestration, replacement-host cutover and broader ongoing care remain incomplete. A plugin runtime is not a prerequisite to finishing reusable core tools. |

## Integration acceptance and remaining reconciliation

Conversation-first integration and its legacy acceptance reconciliation are complete in the [dated integration evidence](docs/testing/README.md#dated-evidence). Schema 14 removed the phase preparation, conformance and publication workflow and kept its records as read-only history; retired operations keep their unknown outcomes and queue holds until the owner records what they verified. Server Guy currently gives a coding-agent handoff for operability changes and does not author or publish pull requests; any operability-PR capability must be built anew within the [product boundary](PRODUCT.md#operating-boundary). Unreviewed model answers remain unreviewed.

The owner does not use CI as a merge gate; relevant local checks and concrete execution evidence still apply. Old completed checklists, AWS labs and UI explorations are not new requirements.

## Delivery sequence

Each increment must connect conversation, durable state, execution and verification. These are engineering increments, never user-facing stages. Implement the smallest useful case within each; do not wait for every compatibility case to finish before exercising a working lifecycle.

### Current priority: finish the reusable native path

The three-step native deployment delivery is complete and merged as PRs #43–#45. [Current architecture](docs/architecture.md) and [reuse evidence](docs/testing/README.md#dated-evidence) replace its completed handoff plans.

1. Give Pi a small managed private-check capability that records actual execution and results, so useful behavior is not restricted to the current HTTP check shape. Keep observed runtime distinct from verified behavior. Prove an application without a public HTTP endpoint through the same initial/update path.
2. Finish backup integration around native data/mount/writer facts, removing remaining service-name assumptions. Prove capture and isolated restoration on the independently built shared-state topology; preserve legacy schedules and receipts.
3. Extend compatible-rollback proof to the native path after those changes, retaining explicit limits around migrations, missing images and unknown outcomes. An image rollback is not data restoration.

Prefer existing native tools, records and execution rather than a new service schema or workflow engine. Fix concrete blockers; do not let speculative hardening displace these capabilities. Application-specific fixtures are evidence, not production dispatch rules. No plugin framework is needed for this sequence; [extension direction](docs/architecture.md) remains optional later work.

### 1. Complete the single-instance runtime

The [runtime acceptance report](docs/testing/README.md#dated-evidence) records purchase and verification uncertainty handling, including the limits of owner-attested purchase reconciliation. Do not clear an unknown outcome merely because the user retries.

Reuse actual Dockerfiles/Compose and support upstream image intake, required services, configuration mounts, persistent files, private connections and explicit ports. Prepare repository and host without discarding existing workloads. Add BYOM through the same Linux-host lifecycle as Hetzner; record the observed prerequisites and unsupported cases.

Introduce workers, PostgreSQL/SQLite and required Redis/Valkey through representative fixtures rather than an installer branch for every product. Preserve scheduler ownership and library-controlled queue behavior. Keep source/image/configuration identities pinned; interrupted external effects require reconciliation before retry.

**Acceptance:** a source app missing deployment setup and a host missing runtime prerequisites; then an image with persistent SQLite and a linked-service configuration. Recreate containers without data loss, inspect logs, reject unsupported dependencies honestly and retain safe recovery after controller interruption.

### 2. Public delivery and controller installation

Finish domain routing, automatic HTTPS/renewal and applicable Cloudflare DNS/CDN setup. Recommend Hetzner size/region from current requirements and cost; keep BYOM equally available. Reconcile provisioning uncertainty before another purchase. Establish reachability for private/home machines before claiming public delivery; a tunnel is a possible mechanism, not a mandatory product choice.

Package authenticated Server Guy installation on the same host and on a separate controller. Preserve controller state and recovery access during application releases.

**Acceptance:** trusted public HTTPS reaches the intended application; failed access/issuance is actionable; configured CDN caching is tested without caching private responses; both controller placements work. These checks do not promise zero-downtime Compose deployments.

### 3. Protect and restore data

**Delivered slice:** scheduled R2 backups/retention and isolated restore proofs, followed by data/writer-based capture for new schedules. See [generalized protection](docs/architecture.md) and its dated evidence. Native consumer integration and the broader acceptance below remain open.

Connect R2 and S3. Discover PostgreSQL, SQLite and other required persistent state; choose consistent backup methods, schedule, retention and off-host transfer. Verify an isolated restore with meaningful application data. Protect controller records, native sessions, configuration and recovery material separately.

**Acceptance:** each storage destination passes backup and restore; failed upload, expired access and stale recovery points remain visible across restart. Restore onto a replacement instance without replaying completed operations, preserving application identity and isolating the previous writer before cutover. A bucket, schedule or uploaded file alone is not proof of recoverability.

### 4. Release updates and recover from failure

**Delivered slice:** chat proposes an exact source revision on the existing host. One approved scope allows three execution attempts with agent-corrected configuration, retained named volumes and fresh verification. Native Compose failures return to Pi. [Release reconciliation](docs/architecture.md) checks a durable host result under the deployment lock and verifies completed replacements without restarting; unknown outcomes without sufficient evidence still stop repetition. The [architecture and evidence](docs/architecture.md) distinguish this from migration orchestration, recovery without a trustworthy host result and broad standing authorization, which remain unfinished. [Compatible rollback](docs/architecture.md) is implemented within its recorded limits.

Reuse existing GitHub Actions/checks or prepare a reviewed workflow when useful. Prebuilt images do not need a source build. A passing commit/image becomes a candidate; the user requests its release. Record distinct attempts and the actual serving revision rather than overwriting the initial-deployment record.

Run existing migrations with outcome tracking; inspect uncertainty before repeating side effects. Roll back only where configuration/data compatibility permits. Hand application-code failures to a coding agent, then verify the owner-merged fix through the same release path.

**Acceptance:** later pushes cannot replace an approved candidate; required failed checks block it. Demonstrate a failed release, interrupted migration, compatible recovery and returned code fix, with fresh application behavior checks.

### 5. Ongoing care and background work

Implement bounded host-side logs, metric/health collection and observed job results independent of an open chat or model turn. Catch up after a sleeping controller; show freshness and retention gaps. Add bounded diagnostic archives to the selected off-host storage so previous evidence remains inspectable when the application host is unavailable.

Configure existing scheduled commands with timezone, non-overlap, timeout, logs and pause/resume. Observe worker health and supported queue summaries without copying payloads into Server Guy or adding another retry system. Create durable in-app issues for meaningful failures, deduplicate noise and link to evidence/investigation. Routine successes belong in history, not unsolicited chat messages.

**Acceptance:** controlled app/worker/job/backup failures, controller downtime, host unreachability and collection gaps produce honest state. Configured host work continues while the controller sleeps; reconnecting does not duplicate history or replay unknown side effects. In-app notifications do not promise out-of-app delivery.

## Compatibility gates

The [compatibility matrix](docs/testing/README.md#dated-evidence) supplies executable acceptance targets. Retain the source-app/PostgreSQL proof; start with Uptime Kuma and Grafana/Prometheus, then Forgejo/Vaultwarden, Paperless-ngx and finally Immich's heavier dependencies. This order is a working priority, not a promise of universal upstream support.

For each supported pinned version prove **deploy → meaningful work → recreate → update → restore → verify**, plus a controlled failure. Add its required machinery to the increments above. Installing all examples is not a gate for the current UI integration. WordPress and the earlier Coolify-as-a-workload experiment are not release requirements.

## Later and excluded

External notification providers are an agreed expansion after in-app issues; choose providers when implementing delivery. Plugin extraction, a general marketplace and a broad plugin/UI runtime remain unscheduled; current priority is the reusable native path above. Additional compute/storage providers, automatic-on-push releases, previews, dedicated build servers, richer teams and API/MCP integration have no committed implementation order.

Multi-host application/database orchestration, clusters/replicas, automatic database failover and distributed job orchestration are outside the product direction. Manual recovery onto a replacement host maintains one active instance. Learning labs and competitor feature lists do not expand this boundary.

## Updating this plan

Change status only with linked evidence and its date/candidate. Replace superseded decisions rather than appending another correction. Put a feature's implementation sequence here once; link from its journey/spec. Do not store live spending authorization, credentials or temporary machine availability as permanent product requirements.
