# Documentation archive

Preserved evidence and superseded direction. **[Product](../../PRODUCT.md), [Roadmap](../../ROADMAP.md) and [Architecture](../architecture/agent-directed-operations.md) govern new work.** Historical instructions, proposed scope and unchecked lists below do not create a second backlog.

## Implementation reference

These mechanisms still inform existing code and regression coverage. Their phase-era product/UI assumptions are superseded; moving the documents does not remove their evidence, authorize broader source edits or waive applicable acceptance checks.

- [Native Pi sessions and permissions](implementation/native-pi-and-permissions.md).
- [Durable requests](implementation/durable-pi-requests.md).
- [Activity and tracing](implementation/action-history-and-tracing.md).
- [Application-status tool](implementation/application-status-tool.md).
- [Application Contract](implementation/application-contract.md).
- [Conformance and local verification](implementation/phase-three-conformance.md).
- [Full phase acceptance casebook](implementation/phase-one-acceptance.md); the [testing dashboard entry point](../testing/phase-one-acceptance.md) is retained.

## Previous product and implementation direction

- [Workshop notes](previous-direction/docs/PRODUCT-WORKSHOP-NOTES.md), [old use cases](previous-direction/docs/USE-CASES.md) and [north star](previous-direction/NORTH-STAR.md).
- [Nine-phase launch reference](previous-direction/docs/user-journeys/01-application-launch-phase-reference.md).
- [Earlier implementation sequence/checklist](previous-direction/docs/plans/implementation-history.md), [phase follow-ups](previous-direction/docs/plans/phase23-followups.md), [progress](previous-direction/docs/plans/phase23-core-progress.md), [verification](previous-direction/docs/plans/phase23-verification.md) and [Fable prompt](previous-direction/docs/plans/fable-phase23-prompt.md).
- [AWS expansion/lab proposal](previous-direction/docs/integrations/aws.md): not the current compute scope.

## Design history

The current [conversation-first design](../design/2026-09-09-conversation-first-adoption.md) replaces these explorations. Fable's current [integration report](../design/2026-09-09-conversation-first-integration.md), [supported-stack brief](../design/2026-09-09-fable-supported-stack-brief.md) and component design files remain in place.

- [2026-09-09-application-navigation](previous-direction/docs/design/2026-09-09-application-navigation.md).
- [2026-09-09-chat-and-views-exploration](previous-direction/docs/design/2026-09-09-chat-and-views-exploration.md).
- [2026-09-09-conversation-first-handoff](previous-direction/docs/design/2026-09-09-conversation-first-handoff.md).
- [2026-09-09-fable-chat-and-views-brief](previous-direction/docs/design/2026-09-09-fable-chat-and-views-brief.md).
- [2026-09-09-fable-chat-and-views-response](previous-direction/docs/design/2026-09-09-fable-chat-and-views-response.md).
- [2026-09-09-floating-companion](previous-direction/docs/design/2026-09-09-floating-companion.md).
- [FABLE-UI-EXPLORATION-BRIEF](previous-direction/docs/design/FABLE-UI-EXPLORATION-BRIEF.md).
- [adaptive-agent-experience](previous-direction/docs/design/adaptive-agent-experience.md).
- [shell-prototype-2026-09-07](previous-direction/docs/design/shell-prototype-2026-09-07.md).
- [sidebar-refinement-2026-09-07](previous-direction/docs/design/sidebar-refinement-2026-09-07.md).

## Cleanup record — 9 September 2026

Audited all 71 Markdown files present at the start of the pass. Consolidated current scope, roadmap, architecture and journeys; moved 27 superseded plans/specifications/explorations here; retained setup, review, testing and current design references. Dated research is classified separately and cannot override current requirements.

The test dashboard's acceptance path, the legacy shell comment's prototype path, the retained implementation-checklist entry point and two contracts linked from historical PR diagrams remain available. Relative Markdown links were rebased when documents moved. Original byte snapshots and the per-file audit manifest were saved outside the repository before editing; no application code or database was changed by this pass.
