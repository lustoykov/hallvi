# Single-instance capability requirements

Support target as of 9 September 2026. [Product](../../PRODUCT.md) owns scope; [Roadmap](../../ROADMAP.md) owns status/order. This specification defines observable outcomes, not a provider catalogue or sidebar layout.

## Agreed stack and scope

One application stack on one Linux instance through Docker Compose. Accept repositories, existing Dockerfiles/Compose and upstream images. Support PostgreSQL, embedded SQLite, required Redis/Valkey, web/API services, workers, scheduled commands and application-specific persistent files. External dependencies can remain connected without implying that Server Guy operates them.

Do not require PostgreSQL for software that uses SQLite, replace an existing queue library or install unused dependencies. MySQL/MariaDB, Kafka/RabbitMQ operation and multi-host application orchestration are excluded. The [compatibility matrix](../testing/self-hosted-compatibility.md) verifies the selected combinations.

## Capability and experience

| Capability | What Server Guy does | Evidence of completion |
| --- | --- | --- |
| Inspect and prepare | Discover real requirements, reuse deployment definitions, prepare repository and host within authority, ask for missing access/inputs. | Pinned source/configuration, required services accounted for, observed runtime/host readiness or precise blocker. |
| Deploy | Recommend a suitable Hetzner instance or adopt BYOM, start the intended stack and check useful behavior. | Intended host and exact source/image, externally observed behavior where public access is expected, persistent state retained. |
| Configure | Manage secrets, build/runtime variables, required ports, mounts and private connections; explain release impact. | Configuration applied to the correct target without secret leakage or accidentally public databases/brokers. |
| Deliver publicly | Configure domain routing, TLS/renewal and CDN only where useful. | Intended hostname, trusted certificate and application response; actual cache behavior if enabled. |
| Release | Reuse CI/build checks, offer a candidate and deploy it on request; handle existing migrations. | Chosen candidate remains pinned; actual serving revision and health after success or failure. |
| Protect | Configure appropriate backups to R2/S3 for database and persistent files, with schedule and retention. | Off-host recovery point, isolated restore evidence and visible coverage/failures. |
| Run background work | Reuse worker/queue libraries and schedules; configure existing commands. | Actual job outcome/revision/logs, worker connectivity, supported queue observations and safe release handling. |
| Observe | Collect bounded logs, health, traffic/resource and job observations, including offline-controller history. | Source/time/freshness, retention gaps and successful catch-up; unavailable is distinct from healthy. |
| Investigate and recover | Explain where/impact/cause with evidence; perform authorized operational correction or hand off application bugs. | Reverified recovery or a precise unresolved state and copyable coding-agent packet. |
| Notify | Record meaningful issues, deduplicate repeated signals and link to investigation. | Persistent in-app issue and recovery state; acknowledgement does not erase an unresolved problem. |
| Maintain | Diagnose resource pressure, log growth and host readiness; propose targeted operational changes. | Impact-aware action, protected data and post-change verification. Investigation alone does not authorize deletion. |

## Agent-first setup

Recommend one sensible path from the application's evidence and existing user access. Explain why and allow an override through conversation. Ask for access, a missing secret, a consequential trade-off or required approval at the moment it matters. Carry out mechanical setup and verify it instead of returning an infrastructure checklist.

Supported provisioning starts with Hetzner; BYOM can use an existing compatible instance from another provider. R2/S3 backup access does not grant Cloudflare DNS/CDN or broader AWS authority. Cloudflare is a supporting delivery service, not a replacement for the selected application host. Confirm private-network reachability before promising public access.

## Components and durable homes

Every supported flow needs an interactive representation in conversation and a discoverable stable view of the same records. Reuse components for connection/access requests, missing inputs, recommendations/approvals, progress, results/evidence, logs, configuration and failure/recovery.

The agent selects relevant existing components; it does not invent unverified dashboard facts. Origin links and references connect the same operation across conversations/views. Keep pending work separate from confirmed state, preserve drafts/navigation and make required attention visible. Unused services should not create empty infrastructure controls.

Fable owns the actual sidebar, labels, grouping and layout within the accepted [design language](../../src/components/server-guy/DESIGN.md). These requirements do not prescribe one tab per component or a permanent sidebar/picture-in-picture view.

## Notification delivery

Start with persistent in-app issues, including observation time, evidence, impact when known and a next action. Create factual issues without waiting for model interpretation; enrich them through investigation. Deduplicate recurring signals and record recovery separately from acknowledgement.

Routine successful schedules/backups remain in history. Automatic failures have a system/job origin and can link to an investigation conversation. External notification providers are an agreed expansion with selection still open. In-app-only delivery cannot alert someone outside the app or independently detect an outage of its own controller.

## What counts as support

For a pinned supported configuration, prove deployment, useful behavior, recreation, update, protection/restore and a controlled failure. Claims must match evidence: a running container is not a processed queue job; an uploaded file is not a tested restore; synthetic UI data is not live monitoring.

[Testing](../testing/README.md) owns evidence navigation. [Coolify research](../research/2026-09-08-coolify-feature-parity.md) remains a dated comparison, not a parity contract.
