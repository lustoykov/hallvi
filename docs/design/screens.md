# UI reference

The [component design reference](../../src/components/hallvi/DESIGN.md) owns typography, color, spacing and interaction language. [Settings](settings.md) records the existing settings surface. This page explains how to inspect the UI without confusing a simulated flow with a deployed feature.

## Redesign interaction principles

[Operator design](../operator-design.md) owns the new interaction and data direction. The sidebar keeps its guiding purpose: it says what deserves care, and Pi decides how. What it lists grows with the application — a destination appears when a record gives it content, Access is always listed because its unknowns are the point, and the rest wait under "Show more" with the reason on the row. The [component design](../../src/components/hallvi/DESIGN.md#the-sidebar-grows-with-the-application) owns that rule. View interiors and interactions may change while proving the main deployment journey; detailed capabilities for each view are decided afterward.

One main conversation owns operational work. Queue and steer use native Pi capabilities; read-only side conversations let users discuss work without starting another writer. Permission handling is independent of deployment or backup workflows.

Pi chooses which knowledge and outcomes to surface and assigns them to relevant views. Views share those records and underlying execution evidence. Designed components provide layout, visual language, interactions and animation; they need not require the existing operation-record shape or five-state receipt model. Presentation roles and exact fields are provisional.

Views load saved information without a model call on every visit. Preserve drafts and context across navigation; show what was established and when. Empty states describe missing assessment rather than claim absent infrastructure or healthy operation. When ongoing care is implemented, its commitments must be visible; routine successful results need not produce repeated attention cards.

## Existing UI and prototypes

The existing implementation places Pi's records and execution evidence under the replies that produced them, and builds History from the same records. Its workflow approvals and data contracts are descriptions of current behavior, not redesign requirements. The prototype documentation records selected visual directions, not a commitment to implement all depicted care capabilities before deployment works.

Reuse useful components and omit irrelevant controls. A prototype action completing does not establish executor support. [Current architecture](../architecture.md), [requirements](../requirements.md) and [Roadmap](../../ROADMAP.md) distinguish current behavior, intended outcomes and delivery order.

## Inspecting the reference

From the repository, run the documented [development setup](../development.md#run-locally), choosing an available port, for example `npm run dev -- --port 3300`. No particular local server is guaranteed to be running.

- `npm run scenarios -- <port>` serves every scenario state through the real pages, from the records in `tests/fixtures/scenario-records.ts`. It prints one address per scenario, and each destination is a fragment on that address.
- `/prototype` indexes what is left that has no records behind it; production returns 404 for these routes.
- `/applications` and `/applications/[id]` use real application records.
- `/setup/pi`, `/setup/github` and `/setup/workspace` are real controller settings, not isolated demo accounts.

The reference shell that replayed invented scenario state has been retired: a state that renders only in a layout the product does not ship proves nothing about the page an owner opens. Scenario records are the replacement, and they are read by the same components a real application uses. Keep synthetic records out of a real application's database — the scenarios command builds its own.

The [browser capture script](../../tests/browser/reference.capture.mjs) accepts a base URL and writes screenshots under ignored test results. Use fresh browser verification for UI changes; old screenshots and capture counts are not current acceptance evidence.
