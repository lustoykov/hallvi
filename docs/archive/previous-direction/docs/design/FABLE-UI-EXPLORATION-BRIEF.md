# Brief to send to Fable

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

I want you to independently explore Server Guy’s next UI/UX direction. Work in your own separate worktree. Do not change Codex’s current integration worktree or its running application.

## Start from the actual current UI

The working source is at:
`/Users/aiwithlyubomir/biz/code/server-guy/.worktrees/self-hosted-shell`

This contains substantial UNCOMMITTED and UNTRACKED work on branch `codex/self-hosted-shell`. A worktree created from HEAD alone will miss the new UI and much of the implementation. Inspect Git, create your own worktree, then bring across the current application source and docs while preserving paths. Exclude credentials, .env files, databases, runtime state, node_modules, .next, logs and nested worktrees. Do not clean, reset, commit, move or edit the integration tree. Use your own local state and port; leave 3260 and 3270 alone. Do not start a deployment worker or make provider changes.

Read the current source and screenshots, but develop your own alternatives. Codex is exploring this with me separately. Do not copy its new `src/components/server-guy/prototype/` exploration; start from the accepted production shell.

## What Server Guy is

An agent for deploying and operating self-hosted software on instances the user owns or rents. Initial implementation: Hetzner, Docker Compose, application plus PostgreSQL on one server. The agent prepares repository and host, asks for missing inputs and meaningful approval, executes work, and verifies results. It handles operational configuration; application-code changes go through an owner-merged PR or a handoff to a coding agent.

## What I like and want to preserve

The quiet light UI and compact left navigation: Overview, Architecture, Deployment, Database, Backups, Logs, Observability, Domains and Environment Variables, followed by multiple conversations. I like the draggable architecture diagrams and animated connections. I now favor stable, predictable views over an agent constantly generating or rearranging the UI. Agent intelligence should drive work and adapt progress without a fixed deployment-stage ceremony. UI Plugins can remain a later possibility.

## What I want you to explore

How do we marry conversations with these stable views?

If I ask the agent to work on the database in chat, I want to understand what it is doing and see confirmed changes reflected in Database/Backups/etc. Today, opening a section hides chat; the chat’s permanent right sidebar mostly repeats generic application and deployment facts. I’m unsure whether that sidebar should exist, become contextual, or be replaced by another interaction.

Independently propose and build a few materially different interactive options. Consider continuity of conversation and drafts, viewing state while chatting, agent actions and their visible consequences, indicating which views changed, browsing while work continues, and returning later. Do not automatically navigate the user away or mark a proposed change as successfully applied. Distinguish inspection, proposal, approval, execution, verified result and failure without turning them into a mandatory wizard.

Overhaul Overview too. It should quickly explain application condition, attention needed, recent changes and how current the evidence is. The existing setup checks and legacy record should not dominate it.

Use the same concrete scenario across your options: inspect database storage, propose backups to connected R2 storage, request approval, execute, verify a restore, surface the changed views, and handle an upload failure. Label all simulated operations and measurements clearly. Use in-memory fixtures; no real infrastructure or billing actions.

## Product truth

A real initial deployment and host-log refresh work. Backups/restoration, ongoing observability, domain/TLS/CDN setup, variable/database management, notifications and routine releases are not yet implemented. Do not present mock progress as real functionality. Deployment previews are deferred. Historical deployment verification is not continuous health monitoring.

## Useful references

Relative to the integration worktree:
- `src/components/server-guy/DESIGN.md`
- `docs/design/2026-09-09-application-navigation.md`
- `src/components/server-guy/application-navigation.tsx`
- `src/components/server-guy/application-section-view.tsx`
- `src/components/server-guy/operator-shell.tsx`
- `src/components/server-guy/deployment-panel.tsx`
- `src/components/server-guy/architecture-canvas.tsx`
- `tests/results/navigation-milestones/overview-desktop.png`
- `tests/results/navigation-milestones/conversation-desktop.png`
- `tests/results/navigation-milestones/architecture-desktop.png`
- `PRODUCT.md` and `ROADMAP.md` for scope

The running accepted UI is at:
`http://127.0.0.1:3260/applications/ee2ae826-542b-45e0-834b-a23f95fcbf6f`

Build your exploration in your separate worktree, give me a local URL with easy switching between options, and explain the tradeoffs. Preserve the accepted visual language. We are exploring interaction design, not building the remaining platform backend or selecting a winner in advance.
