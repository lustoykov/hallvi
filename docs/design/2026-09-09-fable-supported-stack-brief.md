# Fable brief: represent the agreed self-hosting stack

User-facing brief to send to Fable; not dispatched by Codex.

Please adapt the sidebar and related application views in the UI you are integrating on `codex/self-hosted-shell`, in:

`/Users/aiwithlyubomir/biz/code/server-guy/.worktrees/self-hosted-shell`

Keep your conversation-first A design language. You own the information architecture: choose the labels, grouping, hierarchy, navigation and presentation. Earlier Codex suggestions prescribing particular Jobs tabs or resource placement are superseded. Treat the following as product coverage and experience requirements, not a layout specification.

## Agreed scope

- One application stack on one VPS, potentially with several web/API processes, worker processes and scheduled commands.
- PostgreSQL and embedded SQLite. PostgreSQL must retain compatible extensions/images where required; SQLite is embedded application state, not a separate server.
- PostgreSQL-backed queues and Redis/Valkey services when the application needs them. This replaces the earlier PostgreSQL-only queue proposal. Reuse the application's existing queue library and worker setup; Server Guy does not build its own queue engine.
- Persistent files/volumes, private service connections, domains, HTTPS and appropriate CDN setup.
- Releases, logs, monitoring, backups/restoration, in-app issues and external notification providers. External provider selection/order are still open.
- Only install and expose what the particular application needs. MySQL/MariaDB, RabbitMQ/Kafka operation and multi-host application orchestration remain outside the selected scope. Coolify is a reference, not a parity requirement.

## Experience to achieve

Keep this as simple and frictionless as possible. The user describes an outcome; Server Guy investigates, reuses existing configuration, recommends a sensible default and performs authorized setup. Ask only when missing information, consequential decisions or authority require it. Users should not have to become infrastructure administrators or traverse configuration stages.

They must be able to discover their application's relevant resources, understand what is healthy, running, waiting, failed or unprotected, inspect useful evidence, and continue work in conversation. Chat and application views share underlying operation/resource state, including across conversations. Distinguish scheduled work, pending queued work and the processes executing it without requiring the user to manage our internal abstractions. Show complexity when it helps with the current task; avoid empty infrastructure controls in simple applications.

Use Uptime Kuma, Grafana/Prometheus, Forgejo, Vaultwarden, Paperless-ngx and Immich as representative scenarios. Each can run on one appropriately sized VPS; they are compatibility targets, not existing support claims. Paperless and Immich require more involved dependency coverage. WordPress remains excluded because it needs MySQL/MariaDB.

Read the updated sources: `PRODUCT.md`, `docs/specs/self-hosting-capabilities.md`, `docs/testing/self-hosted-compatibility.md` and `docs/user-journeys/08-scheduled-jobs.md`. `ROADMAP.md` owns delivery order.

Implement the UI changes within your current integration work, preserving unrelated changes. Bind existing capabilities honestly; use clear unavailable states for missing backend functionality and keep synthetic interaction demos dev-only. This brief does not request a queue/scheduler backend, application deployments or provider changes. Verify a simple application and a richer multi-process example in the browser, including failures and conversation continuity, and share screenshots plus remaining gaps.
