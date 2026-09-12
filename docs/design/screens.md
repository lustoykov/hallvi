# UI reference

The [component design reference](../../src/components/server-guy/DESIGN.md) owns typography, color, spacing and interaction language. [Settings](settings.md) records the existing settings surface. This page explains how to inspect the UI without confusing a simulated flow with a deployed feature.

## Redesign interaction principles

[Operator design](../operator-design.md) owns the new interaction and data direction. Preserve the existing sidebar as the starting structure: it guides users on what deserves care. Pi decides how. View interiors and interactions may change while proving the main deployment journey; detailed capabilities for each view are decided afterward.

One main conversation owns operational work. Queue and steer use native Pi capabilities; read-only side conversations let users discuss work without starting another writer. Permission handling is independent of deployment or backup workflows.

Pi chooses which knowledge and outcomes to surface and assigns them to relevant views. Views share those records and underlying execution evidence. Designed components provide layout, visual language, interactions and animation; they need not require the existing operation-record shape or five-state receipt model. Presentation roles and exact fields are provisional.

Views load saved information without a model call on every visit. Preserve drafts and context across navigation; show what was established and when. Empty states describe missing assessment rather than claim absent infrastructure or healthy operation. When ongoing care is implemented, its commitments must be visible; routine successful results need not produce repeated attention cards.

## Existing UI and prototypes

The existing implementation uses operation receipts under originating replies, references across conversations and facts-derived views. Its workflow approvals and data contracts are descriptions of current behavior, not redesign requirements. Seen state is currently browser-local. The prototype documentation records selected visual directions, not a commitment to implement all depicted care capabilities before deployment works.

Reuse useful components and omit irrelevant controls. A prototype action completing does not establish executor support. [Current architecture](../architecture.md), [requirements](../requirements.md) and [Roadmap](../../ROADMAP.md) distinguish current behavior, intended outcomes and delivery order.

## Inspecting the reference

From the repository, run the documented [development setup](../../README.md#run), choosing an available port, for example `npm run dev -- --port 3300`. No particular local server is guaranteed to be running.

- `/prototype` indexes development-only scenarios; production returns 404 for these routes.
- `/prototype/app?scenario=simple|rich&step=N&section=<view>&chat=<id>` selects a replayable application scenario. The prototype bar advances or resets its invented state.
- `/prototype/applications`, `/prototype/new` and `/prototype/settings/connections` show synthetic list, intake and connection states.
- `/applications` and `/applications/[id]` use real application records.
- `/setup/pi` and `/setup/github` are real controller settings, not isolated demo accounts.

The [reference shell](../../src/components/server-guy/reference/reference-shell.tsx) uses the product's components with replayed scenario state and an in-memory interaction overlay. Prototype commands do not establish real backups, monitoring, deployments or provider effects. Keep synthetic facts off real application routes.

The [browser capture script](../../tests/browser/reference.capture.mjs) accepts a base URL and writes screenshots under ignored test results. Use fresh browser verification for UI changes; old screenshots and capture counts are not current acceptance evidence.
