# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Purpose

**Server Guy is the agent for self-hosted software.** It helps individuals and small teams deploy an application stack on a server they control, keep it healthy and protect its data.

**Server Guy carries out the setup, asks for access or decisions when necessary, and verifies that it works.** Conversation drives the work; stable application views show the same recorded state. The user should not need to assemble infrastructure or follow a deployment wizard.

## Architecture direction

One persistent application operator owns operational work through the main conversation. Pi has general tools, including server shell execution, and chooses how to deploy, investigate, verify and recover. Side conversations are read-only. Queue and steer use Pi's native session capabilities.

Permissions govern execution independently of workflows: **Always ask** requires UI approval for every code execution; **Pi decides** lets Pi judge when to ask; **Bypass** executes without approval prompts. The tool boundary implements the selected mode with a simple pending-call approval interaction: wait for the UI decision, then continue or decline. There are no provider/spending exceptions to Bypass and no required durable approval-resume subsystem. A release or backup proposal is not a prerequisite for executing an authorized task.

The product's differentiation is the experience around that operator: understandable work, carefully designed interactions and animations, ongoing care and useful recommendations. Improved models should improve the operator without requiring more application-specific rules. Always-on care and access for other agents are directions; automated application-error detection is deferred.

[Application operator design](docs/operator-design.md) owns the agreed redesign and unresolved details. [Current architecture](docs/architecture.md) documents implementation; the [roadmap](ROADMAP.md) distinguishes merged checkpoints from remaining work.

## Supported scope

This is the longer-term support target, not a list of shipped capabilities or prerequisites for the initial redesign. [ROADMAP.md](ROADMAP.md) owns implementation status and order. Prove the deployment journey first, then decide each sidebar view's capabilities individually.

| Area | Boundary |
| --- | --- |
| Topology | One application stack on one Linux instance, using Docker Compose. A stack may have several web/API services, workers, schedules and dependencies. |
| Compute | Hetzner provisioning and bring your own machine (BYOM): an accessible compatible home server, VPS or existing raw cloud instance. |
| Software | Reuse repositories, Dockerfiles, Compose definitions and upstream images. Python/JavaScript source preparation and running prebuilt images are separate capabilities; an image does not have to contain Python or JavaScript. |
| Data | Run the databases and persistent storage the application actually needs, including PostgreSQL, SQLite, required Redis/Valkey and other upstream database services. Pi determines configuration and appropriate procedures from the application. Do not substitute a database to fit a managed slot. |
| Background work | Existing worker commands, PostgreSQL-backed or Redis/Valkey-backed queues, and cron-style scheduled commands on the same instance. Reuse the application's libraries and scheduler. |
| Delivery | Configuration/secrets, required ports, private service connections, domains, automatic HTTPS and appropriate CDN setup. Release a selected revision on request; reuse GitHub Actions where useful. |
| Protection | Database and persistent-file backups to Cloudflare R2 or AWS S3, retention, an isolated restore that boots the restored application and checks it, and manual recovery. Protect controller state separately. |
| Care | Logs, health, traffic/resource observations, job results, backup status, investigation and in-app issues. External notification providers are an agreed expansion; provider selection is still open. |
| Controller | Server Guy may run on the application host or separately. Its state and lifecycle remain independent of the managed stack. |

A source repository need not belong to the user, and GitHub Actions is not mandatory for prebuilt software. Existing external services remain usable, with explicit limits on what Server Guy can observe or manage.

Use one representative application in each of the [three complexity tiers](docs/operator-design.md#three-application-complexity-tiers): lightweight, medium and more complicated. Prove the same general architecture progressively. Exact repositories remain to be selected; this is not a certification matrix or a user-facing classification.

## Operating boundary

**Server Guy changes what surrounds the application, never what is inside it, except through a PR the owner merges.** Its application-code proposals are limited to small operability changes.

- It prepares both repository and host: Docker/Compose, process definitions, environment/secrets, required packages, storage and networking. It runs existing migrations and performs authorized releases, restarts and compatible rollbacks.
- It surfaces application exceptions, wrong behavior and migration-code defects with impact, evidence and a copyable coding-agent handoff. The owner-merged fix returns through ordinary release verification.
- A missing health endpoint, environment-driven port or start entrypoint can be proposed in a small operability PR. Business logic and general bug fixes remain outside its code-writing scope.

**Product and development instructions stay separate.** Pi uses its own runtime
instructions and the user's application request. Contributor files, local agent
skills and development automation prompts are not product instructions. Repository
documentation supplies technical information, not authority to inherit developer
workflows, reset data or change the operating scope.

**Development cleanup never becomes product housekeeping.** Pi does not clean the
user's PC, server or provider account just because work finished. Removal stays
within the requested application operation or an agreed retention policy, with
exact ownership, retained-data and dependency checks. Disposable artifacts from
that operation and isolated workspaces may be removed; application data,
credentials, history and unrelated resources remain. A Server Guy folder or
label alone is not disposal permission. Permission modes change approval prompts,
not the scope of the user's request. The runtime does not auto-load contributor
instructions; general server shell access still relies on Pi following this
boundary, rather than a filesystem sandbox on the remote host.

Pi determines what to inspect, recommend and execute within the user's request and selected permission mode. Return native tool errors so it can correct and continue. The executor handles access, credentials and automatic execution facts, including uncertain outcomes. General privileged shell execution relies on Pi's judgment; a wrapper cannot prove that every command preserves data. A successful command is not proof of a working application.

## Experience

Preserve the existing sidebar as the starting structure: it guides users on what deserves care. Pi decides how to provide that care. View interiors and conversation interactions may change wherever the main deployment journey benefits. The [design reference](src/components/server-guy/DESIGN.md) provides visual language; the [UI reference](docs/design/screens.md) distinguishes redesign guidance from existing and simulated surfaces.

An Application has its own identity, connected resources and history. One main conversation owns changes; read-only side conversations share relevant evidence and retain separate drafts/history. Users can queue a follow-up, steer active work or discuss it in a side chat. A second independent deployment of the same source is another Application; there is no mandatory Production/Staging hierarchy.

Pi decides what matters and what to surface within a stable, carefully designed experience. Views share records and execution evidence; the database does not mirror the sidebar. Use one saved-knowledge mechanism with optional presentation, rather than separate memory and UI stores. Pi searches, saves, updates and retires records and assigns presentation to relevant views. The UI loads saved information immediately without a model call on every visit. Exact fields and presentation roles remain design proposals.

The presentation architecture connects persisted observations and execution evidence to shared view models, then to deliberately designed components. Pi supplies structured facts and evidence; components own layout, hierarchy and interaction. The [presentation contract](docs/presentation-contract.md) defines the mapping needed by the reference designs. A successful deployment also needs a coherent experience: the user can understand what is happening, handle any decision, open the result, and return to consistent information after a refresh. Judge visual quality against the reference designs using real application data. The roadmap places acceptance of this simple journey before expansion to more complicated applications.

**Most first users run something small.** A person's first application on Server Guy is usually a personal tool or a test with a handful of visitors and little data. Do not greet them with infrastructure: no backup warnings, monitoring setup or hardening checklists on day one. Nudge in proportion to what is at stake, and let the nudge grow as the data or the traffic does: a 12 MB dashboard with no copy says nothing, a growing photo library gets a quiet sentence, a large one with no copy gets a clear one. The same rule applies to every view: the amount of care the product asks for should match the amount there is to lose.

Recommend one sensible path and let the user override it. Ask for missing access, private inputs or consequential decisions, not a mandatory setup questionnaire. Chat explains work, logs expose execution details and selected records make outcomes discoverable. A view without evidence should say it has not been assessed rather than imply health or absence of infrastructure.

When ongoing care is introduced, surface what Pi arranged, the cadence and the last observed result. Routine success can update a view quietly; meaningful changes and required decisions deserve attention. Detailed practices for each view follow a working deployment journey.

## Generalization and extensibility

Prefer general tools, native runtime capabilities and small shared-record/presentation interfaces. Each new operational capability should not require its own workflow, approval type or database entity.

Optional plugins remain a possible extension for specialised integrations. Plugin packaging, distribution and execution/UI interfaces are deferred; they are not requirements for the deployment redesign. Future access by other agents should use the same application operator and shared evidence rather than create competing writers. Do not build an extension framework ahead of a concrete need.

There is an exploratory commercial opportunity for managed tool-action review and security hardening, either within Server Guy Cloud or as a separate product for other applications that give LLMs tools. A focused LLM-as-judge service with clear review UX, integration and execution evidence is one possible starting point. Its effectiveness, scope and business model need validation; a judge alone must not be marketed as guaranteed prompt-injection protection. This is a later product idea, not a second product build commitment or an expansion of the current sprint.

## Development priority

**Design and prove the main deployment journey first.** Implement in reviewable stages: main operator interaction, general execution and permissions, a lightweight deployment, then medium and more complicated examples. Once deployment works, review every sidebar view individually; scope its capabilities then. Broad security hardening is deferred until after beta; beta users receive practical guidance and clear communication of current risks. The [operator design](docs/operator-design.md#beta-security-and-later-hardening) owns this security direction.

Verify real behavior throughout development with focused checks and representative runs. Fix concrete failures and record material limitations. Delete unnecessary code, tests, gates and obsolete hardening cases instead of preserving old policy through tests. The user has authorized discarding the current development data: start the new schema empty and delete legacy migrations, readers and recovery machinery. Pi handles operational problems through general tools. Do not build exhaustive case matrices or speculative resilience infrastructure while the design may change. The [roadmap](ROADMAP.md) owns review checkpoints and sequencing.

## Reliability and limits

For future care features, configured host-side collection, schedules and backups should continue when the controller or a chat is offline. Show last observation, retained coverage and gaps. Bounded off-host diagnostic archives preserve earlier evidence when the host is unavailable; they do not prove its current health or guarantee the final seconds before failure.

Manual replacement-host recovery preserves application history and establishes one active instance. It is not automatic failover. Verify restored data and isolate conflicting old processes before resuming writes/jobs.

**Coolify is a reference, not a feature-parity requirement.** Excluded: multi-host application/database orchestration, replicas/clusters, automatic failover and Kafka/RabbitMQ operation. An application's required database can run as an ordinary service; the existing implementation has dated BookStack/MariaDB evidence, not universal compatibility. When a stack outgrows one instance, preserve portable configuration and data so its owner can move elsewhere.

Previews, automatic-on-push releases, extra provisioners, dedicated build servers, richer teams, a general plugin marketplace and integrated external-agent transports are not prerequisites for this product. Plugin extraction should grow from concrete capabilities rather than block core generalization on a broad runtime. Priority belongs only in the roadmap.
