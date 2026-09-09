# Monitor and notify

**Goal:** “Tell me when my application needs attention.” Watch health, relevant errors, jobs, resources and backup freshness. This is observable failure detection, not a promise to discover arbitrary application bugs.

1. Configure useful checks and bounded collection for this application. Record source, time and coverage separately from interpretation.
2. Create a durable issue for a meaningful failure without waiting for a model turn. Deduplicate repeated signals; missing monitoring is unavailable, not healthy.
3. Present an in-app notification linked to evidence and the affected resource. The agent may enrich it with impact, diagnosis and a next action.
4. Open an investigation linked to the issue when requested. Automatic work has a system/job origin; do not invent a user message or spam conversations with routine successes.
5. Record observed recovery independently of whether the user read or acknowledged the notification.

Host-side collection continues while the controller sleeps; reconnecting shows retained history, freshness and gaps. When the host is unreachable, cached or configured off-host diagnostic archives provide earlier evidence, not a live health claim. See [offline behavior](../architecture/agent-directed-operations.md#telemetry-while-the-controller-is-offline).

**Acceptance:** controlled service/worker/backup failure, durable issue across reload, deduplication, recovery, unavailable observation source, sleeping controller and host outage. In-app delivery cannot alert the owner outside Server Guy; external notification providers are later delivery work, with provider selection open.
