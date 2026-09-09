# Stable application navigation

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

The September 9 product direction puts durable application destinations above conversations: Overview, Architecture, Deployment, Database, Backups, Logs, Observability, Domains and Environment Variables. These are application-scoped destinations, not additional deployment stages. Agent intelligence drives the work and adapts deployment progress inside familiar components; it does not redesign navigation or require a generated dashboard.

Vercel is an information-architecture reference: compact labeled destinations, quiet grouping, progressively disclosed settings, and context-specific detail. Reviewed the signed-in Projects, Logs, Observability and GitHub import screens. Official references: [Projects](https://vercel.com/docs/projects), [Logs](https://vercel.com/docs/logs), [Observability](https://vercel.com/docs/observability). Server Guy retains its own visual system and self-hosting scope.

## What works now

- One-click section selection, reload/back support, and preserved conversation drafts.
- Architecture built from the recorded deployment: draggable nodes, keyboard movement, remembered browser layout, reset, pause and reduced motion. Animated connections represent topology, not measured traffic.
- Existing deployment approval, progress, retry and verification remain functional.
- Logs can collect a fresh host snapshot and filter the output. This is not a continuous stream.
- Source, revision, host, database plan, verification time and variable names come from existing records. Variable values are not exposed.

## What the UI reserves space for

Backups, continuous observability, domain/TLS/CDN management, database management and variable editing show honest unimplemented states. They do not imply integrations, live measurements or data protection that are not present. Release/rollback and automatic deployment on push remain unimplemented. No deployment previews.

Custom UI Plugins remain a later design possibility. The core application must be useful and complete through stable built-in views without one.

## Verification

Production build (including TypeScript), lint/formatting and whitespace checks passed. Five targeted browser journeys passed across the initial run and corrected reruns: section/draft navigation, independent application identity, deployment approval/retry/log refresh, chat navigation and archive behavior, and evidence navigation. The tests exercise section reload/back behavior, pointer and keyboard movement, remembered/reset layout, visible mobile controls, log filtering and hidden variable values.

Visual review covered desktop and 390px mobile layouts. Fixed a mobile grid-width issue revealed by screenshots; confirmed the workspace and document both fit 390px, canvas controls remain visible, and reduced-motion disables flowing connections. A real Logs refresh through the UI collected a fresh Compose snapshot from the existing Hetzner host. No new infrastructure was created. Captures are in `tests/results/navigation-milestones/`.

The Vercel account had no deployed project. `getaura` was available through its GitHub installation; a simpler private static repository was inaccessible to that installation. Exploration covered accessible screens only; no Vercel project was deployed.
