# Diagrams

A diagram earns its place when a boundary or a flow is hard to hold in prose.
The rule is in [AGENTS.md](../../AGENTS.md#changes-and-checks): draw one when a
boundary or a flow changes, keep it only if a document wants it, and never
manufacture one for a change that alters neither.

Eleven of these were added over eleven pull requests and linked from nothing.
Rather than delete them, this index says which document each one serves and
which are historical — a record of a decision as it was made, kept because the
reasoning is still worth reading, not because it describes the product today.

## Current

Each of these is linked from the document that owns its decision.

| Diagram | Owned by |
| --- | --- |
| [Repository workspace boundary](../architecture.md#repository-workspace-architecture) | [Architecture](../architecture.md) |
| [Proposing a repository change](../integrations/github.md#proposing-a-change) | [GitHub](../integrations/github.md) |
| [Development cleanup decision flow](development-cleanup-decision.html) | [Development resources](../development-resources.md) |
| [Cleanup scope](cleanup-scope.md) | [Development resources](../development-resources.md#discarding-development-data) |
| [Where a check belongs, and where it does not](where-coverage-lives.md) | [Testing](../../tests/README.md#the-8020-bar) |
| [Select tests by the behavior they protect](test-selection.md) | [Testing](../../tests/README.md#the-8020-bar) |
| [What counts as published](publishing-evidence.html) | [Architecture](../architecture.md#publishing-at-a-domain) |
| [What a record is allowed to claim](recovery-claims.html) | [Presentation contract](../presentation-contract.md) |
| [Wording that outruns its record](wording-and-records.html) | [Presentation contract](../presentation-contract.md) |
| [What a page may print, and where](page-evidence-and-labels.md) | [Presentation contract](../presentation-contract.md) |
| [Proportionate care](proportionate-care.html) | [Care evidence](../testing/2026-09-16-proportionate-care.md) |
| [Who owns a conversation's lifecycle](conversation-lifecycle.md) | [Operator design](../operator-design.md#interaction-while-pi-is-busy) |
| [Who holds a credential, and who may read it](credential-lifecycle.html) | [Roadmap](../../ROADMAP.md) |
| [Where the way in is answered](private-access-reachability.html) | [Roadmap](../../ROADMAP.md) |

## Historical

These record a decision on the date they were made. They are not a description
of the product now, and nothing is obliged to keep them true.

| Diagram | Records |
| --- | --- |
| [Activity navigation](activity-navigation.md) | The navigation arrangement chosen on 16 September 2026. |
| [Backups: inspect a copy before recovery](backups-recovery-chain.md) | The Backups stage design, 16 September 2026. |
| [Which stage owns a gap](backup-stages.html) | The backup stage alternatives, 15 September 2026. |
| [Deployment release status](deployment-release-status.md) | Latest attempt against last verified release, 15 September 2026. |
| [Deployment: what a release is allowed to say](deployment-release-work.md) | The release list design, 16 September 2026. |
| [Security: access map and selected connection](security-perimeter.md) | The selected Security design, 16 September 2026. |
| [Homepage card: what carries the state](homepage-card-hierarchy.html) | The homepage card decision, 16 September 2026. |
| [Overview miniature density](overview-miniature-density.html) | The Overview thumbnail decision, 15 September 2026. |
| [Bounded mascot sizing](mascot-size.html) | The resize-loop fix, 16 September 2026. |
