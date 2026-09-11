# UI reference

The [component design reference](../../src/components/server-guy/DESIGN.md) owns typography, color, spacing and interaction language. [Settings](settings.md) records the existing settings surface. This page explains how to inspect the UI without confusing a simulated flow with a deployed feature.

## Interaction principles

Conversation remains central; stable views expose shared application facts and evidence. Operations render beneath their originating replies and in affected views; other conversations reference them. Keep drafts, origin, required input and unresolved failure visible across navigation. Proposed work is distinct from applied state. Routine automatic successes belong in history, while failures have a system origin and an investigation entry point. Seen state is currently browser-local.

Reuse actual application components and omit irrelevant infrastructure controls. A prototype action completing does not establish executor support. [Architecture](../architecture.md), [requirements](../requirements.md) and [Roadmap](../../ROADMAP.md) own those boundaries.

## Inspecting the reference

From the repository, run the documented [development setup](../../README.md#run), choosing an available port, for example `npm run dev -- --port 3300`. No particular local server is guaranteed to be running.

- `/prototype` indexes development-only scenarios; production returns 404 for these routes.
- `/prototype/app?scenario=simple|rich&step=N&section=<view>&chat=<id>` selects a replayable application scenario. The prototype bar advances or resets its invented state.
- `/prototype/applications`, `/prototype/new` and `/prototype/settings/connections` show synthetic list, intake and connection states.
- `/applications` and `/applications/[id]` use real application records.
- `/setup/pi` and `/setup/github` are real controller settings, not isolated demo accounts.

The [reference shell](../../src/components/server-guy/reference/reference-shell.tsx) uses the product's components with replayed scenario state and an in-memory interaction overlay. Prototype commands do not establish real backups, monitoring, deployments or provider effects. Keep synthetic facts off real application routes.

The [browser capture script](../../tests/browser/reference.capture.mjs) accepts a base URL and writes screenshots under ignored test results. Use fresh browser verification for UI changes; old screenshots and capture counts are not current acceptance evidence.
