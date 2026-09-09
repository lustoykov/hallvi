# Accepted design: conversation first

Selected 9 September 2026: Fable A. Keep its typography, spacing, surfaces, cards and subtle activity marks. The [component design reference](../../src/components/server-guy/DESIGN.md) owns the visual language and the [integration report](2026-09-09-conversation-first-integration.md) owns the dated implementation account.

## Interaction contract

- Conversation is the focused collaboration surface. An operation appears under its originating reply, in affected views and through quiet navigation marks.
- Views and receipts share recorded state. Proposed changes remain separate from current facts; read-only inspection is not an applied change.
- Other conversations use compact references to the original operation rather than duplicate approval forms. Each conversation retains its own transcript, draft and position.
- Work continues across navigation. Required input and unresolved failure remain visible; a new working indicator must not hide them.
- Completed work retains its evidence at that time. New observations update current facts without rewriting history.
- Automatic work has a system/job origin. Routine success stays in history; failure has a durable issue and an investigation entry point.

The adopted experience has no permanent right rail, floating companion or mandatory phase sequence. Existing reusable components provide interaction; arbitrary model-generated UI is not a dependency. Unused infrastructure should not clutter a simple application.

## Implementation boundary

The real initial-deployment record supports the first shared receipts. It does not establish general concurrent-operation scheduling, backups, worker/queue monitoring or routine-release history. The integration currently keeps seen state per browser; account synchronization is not implemented.

The `/explore` simulator is preserved in Fable’s separate `claude/final-ui-screens` worktree and the local recovery archive; it was removed from this integration candidate during merge cleanup. Its synthetic backup scenarios and conflict handling are examples to verify when those operations are built, not production locks or provider evidence. The [earlier handoff](../archive/previous-direction/docs/design/2026-09-09-conversation-first-handoff.md) and [comparison](../archive/previous-direction/docs/design/2026-09-09-chat-and-views-exploration.md) are archived design history.

The [supported-stack brief](2026-09-09-fable-supported-stack-brief.md) gives Fable coverage requirements while leaving sidebar labels, grouping and layout to the designer. Delivery order and unresolved integration acceptance live only in [Roadmap](../../ROADMAP.md).
