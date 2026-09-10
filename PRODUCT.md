# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Purpose

**Server Guy is the agent for self-hosted software.** It helps individuals and small teams deploy an application stack on a server they control, keep it healthy and protect its data.

**Server Guy carries out the setup, asks for access or decisions when necessary, and verifies that it works.** Conversation drives the work; stable application views show the same recorded state. The user should not need to assemble infrastructure or follow a deployment wizard.

## Supported scope

This is the agreed support target, not a list of shipped capabilities. [ROADMAP.md](ROADMAP.md) owns implementation status and order.

| Area | Boundary |
| --- | --- |
| Topology | One application stack on one Linux instance, using Docker Compose. A stack may have several web/API services, workers, schedules and dependencies. |
| Compute | Hetzner provisioning and bring your own machine (BYOM): an accessible compatible home server, VPS or existing raw cloud instance. |
| Software | Reuse repositories, Dockerfiles, Compose definitions and upstream images. Python/JavaScript source preparation and running prebuilt images are separate capabilities; an image does not have to contain Python or JavaScript. |
| Data | PostgreSQL, embedded SQLite and application-specific persistent files. Redis/Valkey when the application requires a broker or cache. Install only what the software needs. |
| Background work | Existing worker commands, PostgreSQL-backed or Redis/Valkey-backed queues, and cron-style scheduled commands on the same instance. Reuse the application's libraries and scheduler. |
| Delivery | Configuration/secrets, required ports, private service connections, domains, automatic HTTPS and appropriate CDN setup. Release a selected revision on request; reuse GitHub Actions where useful. |
| Protection | Database and persistent-file backups to Cloudflare R2 or AWS S3, retention, isolated restore verification and manual recovery. Protect controller state separately. |
| Care | Logs, health, traffic/resource observations, job results, backup status, investigation and in-app issues. External notification providers are an agreed expansion; provider selection is still open. |
| Controller | Server Guy may run on the application host or separately. Its state and lifecycle remain independent of the managed stack. |

A source repository need not belong to the user, and GitHub Actions is not mandatory for prebuilt software. Existing external services remain usable, with explicit limits on what Server Guy can observe or manage.

Use [representative compatibility cases](docs/testing/self-hosted-compatibility.md) to expose missing machinery: Uptime Kuma, Grafana/Prometheus, Forgejo, Vaultwarden, Paperless-ngx and Immich. Each is a target to verify on an appropriately sized VPS, not a certification or promise to run the entire suite on a tiny server.

## Operating boundary

**Server Guy changes what surrounds the application, never what is inside it, except through a PR the owner merges.** Its application-code proposals are limited to small operability changes.

- It prepares both repository and host: Docker/Compose, process definitions, environment/secrets, required packages, storage and networking. It runs existing migrations and performs authorized releases, restarts and compatible rollbacks.
- It surfaces application exceptions, wrong behavior and migration-code defects with impact, evidence and a copyable coding-agent handoff. The owner-merged fix returns through ordinary release verification.
- A missing health endpoint, environment-driven port or start entrypoint can be proposed in a small operability PR. Business logic and general bug fixes remain outside its code-writing scope.

Model intelligence determines what to inspect, recommend and do next. Tools enforce access, spending limits and effect-specific authority. Recommendations and successful commands are not proof of a working or protected application.

Correctness, authorization and executor capability are separate concerns. Return actionable configuration and execution errors to Pi so it can inspect, correct and retry within the authorized task. Prefer native tool diagnostics over duplicating their rules in a product-specific validator. Keep checks for executable tool inputs, permitted effects, data preservation, uncertain outcomes and actual behavior. Improving models should improve decisions without weakening these boundaries. The [scoped release slice](docs/architecture/agent-releases.md) implements this loop for updates on an existing host; initial deployment still uses its priced recommendation approval.

## Experience

Use **Fable's conversation-first design**: focused chat, interactive operation receipts, stable views, subtle activity indicators and continuity between conversations. The [design reference](src/components/server-guy/DESIGN.md) owns visual language; the [integration report](docs/design/2026-09-09-conversation-first-integration.md) describes the current implementation.

An Application has its own name, host, configuration, releases and history. Multiple conversations retain separate transcripts/drafts and share operational state. A second independent deployment of the same source is another Application; there is no mandatory Production/Staging hierarchy.

The agent recommends one sensible path, explains why on demand and lets the user override it. Ask only for missing inputs, consequential choices or required authority. No mandatory stages, setup questionnaire, permanent right rail or proliferation of equivalent controls. Each supported flow needs reusable interactive components and a discoverable durable view; capability lists do not dictate sidebar labels or a tab per dependency. Unused infrastructure should not clutter the interface.

The user can inspect work, facts and evidence without generating a new view. Plugins should normally contribute findings and actions to the existing application views, with their origin visible. A dedicated panel is appropriate when the domain needs it; installing a plugin should not automatically add another sidebar destination.

## Generalization and extensibility

**The agreed direction is a reusable core with optional, versioned Plugins.** Different images, paths, ports and environment values belong in configuration. Capabilities promised by the supported scope belong in the core; a plugin must not become a required workaround for an incomplete core capability. Specialised application APIs, functional checks and domain-specific presentation are appropriate extensions. Application-name branches in core deployment or backup behavior require a concrete, documented reason; representative application tests remain valuable.

Server Guy should be able to help author a plugin when a missing specialised capability blocks useful work. Drafting and testing the package are separate from enabling its code and access. Users should be able to inspect its source, origin, version, requested access and test evidence; keep it private, export it, or propose it upstream through a PR. Community distribution is a direction, not a promise of a marketplace or universal compatibility.

The core retains authority enforcement, secret handling, operation coordination, durable evidence and recovery records. A plugin cannot grant itself access or silently redefine a successful operation. Exportable packages exclude credentials; recovery preserves the selected version, required configuration and extension state, with secrets separately protected. Disabling a plugin must retain historical evidence and identify any ongoing work that depends on it.

This is a design direction agreed on 10 September 2026, not a shipped plugin runtime. The [architecture brief](docs/architecture/extensible-capabilities.md) records the boundary and open questions; [ROADMAP.md](ROADMAP.md) owns implementation order. API shape, code isolation and UI contribution mechanisms remain open for review with Fable.

## Development priority

**Get the general architecture right first; fine-tune, harden and polish afterward.** Prioritize reusable capabilities, simple interfaces and Pi's ability to reason, execute and recover across applications. Do not let speculative edge cases or an expanding hardening checklist displace that work.

Fix concrete failures that prevent the current flow from working or violate its existing data and authority guarantees. Keep those fixes proportional; document secondary limitations and defer them until the shared architecture is proven.

## Reliability and limits

Configured host-side collection, schedules and backups should continue when the controller or a chat is offline. Show last observation, retained coverage and gaps. Bounded off-host diagnostic archives preserve earlier evidence when the host is unavailable; they do not prove its current health or guarantee the final seconds before failure.

Manual replacement-host recovery preserves application history and establishes one active instance. It is not automatic failover. Verify restored data and isolate conflicting old processes before resuming writes/jobs.

**Coolify is a reference, not a feature-parity requirement.** Excluded: multi-host application/database orchestration, replicas/clusters, automatic failover, Kafka/RabbitMQ operation and MySQL/MariaDB support. WordPress therefore remains outside the selected database scope. When a stack outgrows one instance, preserve portable configuration and data so its owner can move elsewhere.

Previews, automatic-on-push releases, extra provisioners, dedicated build servers, richer teams, a general plugin marketplace and integrated external-agent transports are not prerequisites for this product. Plugin extraction should grow from concrete capabilities rather than block core generalization on a broad runtime. Priority belongs only in the roadmap.
