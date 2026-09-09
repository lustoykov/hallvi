# Fable handoff: marry conversation with stable application views

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

## What the owner wants now

The owner likes the newly implemented sidebar and architecture canvas. Preserve their quiet light visual language and compact application navigation. Overview needs a redesign; the permanent right sidebar in conversations is an unresolved design choice. Explore how conversation and stable views cooperate, especially when the agent operates on a database while the user is in chat. How does the user see what the agent is doing, inspect the relevant state without losing their conversation, and notice which destination changed?

This handoff briefs you for the owner's next conversation. Do not implement or create a worktree yet; the owner plans to ask you to explore alternatives in a separate worktree. Do not assume the suggestions below are selected requirements.

## Product and accepted constraints

Server Guy is an agent for self-hosted software on raw instances owned/rented by the user, initially Hetzner plus Docker Compose; BYOM is planned. Conversation drives operational work. Stable views contain durable application facts. The agent prepares repository and host, obtains needed inputs/authority, executes, and verifies. It changes deployment surroundings; application-code fixes are handed off or proposed through an owner-merged PR. Avoid fixed stages, mandatory next-next-next ceremony, busy cockpit layouts, and duplicate navigation.

Current fixed destinations above multiple application-owned conversations: Overview, Architecture, Deployment, Database, Backups, Logs, Observability, Domains, Environment Variables. The owner is now less convinced of self-configuring/generated UI. Stable built-in views are preferred; the agent can adapt its progress and steps inside familiar components. UI Plugins are a later possibility, not a requirement for this exploration.

## Implemented versus aspirational

The real happy path inspected a private FastAPI repo, generated its Dockerfile, provisioned one Hetzner CX23, prepared Docker/Compose, deployed pinned source with private persistent PostgreSQL, and verified external CRUD. Approval/retry and a fresh host log snapshot work. Architecture has draggable nodes, saved browser layout, animated topology connections, keyboard movement, reset and reduced-motion support. Section selection supports reload/back navigation and conversations preserve drafts.

Database management, R2/S3 backups/restoration, continuous monitoring/traffic metrics, notifications, domain/TLS/CDN setup, variable editing and routine releases are not yet implemented. Their views display honest placeholders. The application currently uses HTTP. A historical successful deployment does not mean continuous health monitoring or protected data. Do not manufacture healthy metrics or successful backups in the real app. Clearly label simulated scenarios in exploration variants. Deployment previews remain deferred.

## The design problem

- In chat about a database, the full Database view is currently unavailable without switching away. The permanent right panel instead repeats generic app/deployment facts.
- Actions should have visible consequences in the relevant stable views. The relationship should be obvious without requiring the user to visit each destination.
- An inspection, a proposed change, an executing action, a verified change, and a failed verification must look different. A view should not show the desired outcome before it is confirmed.
- The user must be able to inspect a changed view, return to the same chat position and draft, and follow background work while browsing another section. Do not steal focus or switch tabs automatically.
- Several conversations may refer to the same application. Results belong to the application while retaining the originating conversation/action; do not imply each chat has its own database.
- Overview should answer: what is running, what needs my attention, what changed, and how recently was it verified? It should avoid repeating every section and the entire legacy record.

## Alternatives to compare, not a prescribed solution

1. Conversation-first: concise action receipts in chat with direct links to the affected views, quiet temporary updated indicators in navigation, no permanent right panel. Open a contextual inspector on demand.
2. View-first: keep Database/Logs/etc visible, with a collapsible conversation drawer scoped to that application and task. Explicit scope and preserved conversation matter.
3. User-controlled split: pin one relevant view beside a conversation. The agent may suggest opening it but never silently replace it. Reuse the same view components and data.

Compare the same scenarios across options: inspect database disk use; ask to configure backups and provide access; approve a consequential change; see progress and verified result; handle a failed backup or stale data; leave chat during work; revisit later from Overview. These can be simulated fixtures, clearly labeled, without implementing providers. Evaluate reading effort, number of navigation steps, awareness of confirmed changes, attention/approval handling, mobile behavior, and whether a right panel actually earns its space. Offer your own alternative if these are poorly framed.

## Source of truth and handoff safety

Current integration worktree: /Users/aiwithlyubomir/biz/code/server-guy/.worktrees/self-hosted-shell
Branch: codex/self-hosted-shell. This tree contains substantial uncommitted and untracked implementation on top of PR #21. A fresh worktree from HEAD alone WILL NOT contain the accepted UI or the latest backend. When the owner asks you to build alternatives, create an isolated source snapshot/worktree that includes the current authorized source and docs, preserving relative paths. Inspect Git first. Exclude .env files, credentials, databases/runtime state, node_modules, .next, nested worktrees and logs. Do not commit, clean, reset, edit or delete the working integration tree. Do not reuse its live database/worker or start a second deployment worker. Use isolated simulated fixtures and a separate port, not 3260. No provider changes, purchases, deployments, GitHub pushes or merges are needed for UX exploration.

Live UI (read-only reference): http://127.0.0.1:3260/applications/ee2ae826-542b-45e0-834b-a23f95fcbf6f

Read first:
- docs/design/2026-09-09-application-navigation.md
- src/components/server-guy/DESIGN.md
- src/components/server-guy/application-navigation.tsx
- src/components/server-guy/application-section-view.tsx
- src/components/server-guy/operator-shell.tsx (navigation, chat and right-panel composition)
- src/components/server-guy/deployment-panel.tsx
- PRODUCT.md and ROADMAP.md for boundaries, not a mandate to build the whole roadmap

Current screenshots under tests/results/navigation-milestones/: overview-desktop.png, conversation-desktop.png, architecture-desktop.png, architecture-mobile.png, backups-desktop.png, logs-desktop.png, observability-desktop.png.

Vercel was inspected as a structural reference: stable sidebar, quiet grouping and progressively disclosed configuration. We have not explored a running project in that Vercel account; no Vercel project was deployed. Do not overstate that research.

## Initial response requested

Read the brief, screenshots and the relevant UI composition. Briefly acknowledge the actual state, identify the most important unresolved UX decision, and suggest how you would run the option comparison when the owner asks. Do not implement now. The owner will continue this session.
