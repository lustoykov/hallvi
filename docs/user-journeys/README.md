# Core journeys

These are representative required outcomes, not the only intents the agent may handle. [Product](../../PRODUCT.md) owns scope; [Roadmap](../../ROADMAP.md) owns delivery status and order. A journey is a behavior contract, not a claim of implementation.

| User goal | Journey | Required result |
| --- | --- | --- |
| “Deploy this.” | [Launch](01-application-launch.md) | Prepared repository/host, intended runtime and meaningful verification. |
| “Tell me when something needs me.” | [Monitoring and issues](02-unavailability-alert.md) | Factual, durable, deduplicated attention with evidence and freshness. |
| “Something broke.” | [Investigate and recover](03-incident-recovery.md) | Diagnosis with evidence, authorized action and verified recovery or a precise blocker. |
| “Help my coding agent fix this.” | [Code handoff](04-codex-mcp-remediation.md) | Redacted packet, owner-merged fix and ordinary release verification. |
| “Release the update.” | [Routine release](05-routine-release.md) | Exact selected candidate, honest serving state and failure handling. |
| “Protect my data.” | [Backups and restoration](06-database-backups.md) | Consistent off-host copy, coverage and isolated restore evidence. |
| “Show me what's happening.” | [Observability](07-observability-and-ui-plugins.md) | Useful measured facts and investigation in the existing UI. |
| “Run this every night / process the queue.” | [Background work](08-scheduled-jobs.md) | Existing commands/libraries operated safely, with actual run and worker evidence. |

Across all journeys: recommend one sensible path, ask only for necessary inputs/authority, preserve multiple conversations and show the same operation in receipts and views. Required attention remains discoverable while the user navigates. Fable owns layout; this table does not prescribe navigation tabs.

[Compatibility cases](../testing/self-hosted-compatibility.md) exercise these outcomes against representative packaged applications. [Architecture](../architecture/agent-directed-operations.md) covers shared/separate controllers, offline evidence and manual replacement-host recovery. Earlier phase plans and diagrams are [historical reference](../archive/README.md), not a user journey to reinstate.
