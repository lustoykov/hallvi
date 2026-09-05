# Durable Pi requests

Status: implementation plan, not shipped. This is development milestone 6, still within Launch Phase 1. [ROADMAP.md](../../ROADMAP.md#make-pi-requests-durable) owns build order and completion status.

## Outcome

Sending a message records the engineer's intent immediately. Closing the tab does not cancel accepted work; reopening the Chat reconstructs its progress or outcome from SQLite. A worker restart exposes an interrupted attempt instead of silently repeating it.

Today, `sendChatMessage` waits for `askPi` inside the HTTP request and then saves both messages and accepted Decisions together. The browser's pending message is only local presentation. This milestone changes acceptance, not the requirement that Decisions pass validation before commit.

```text
Browser POST
  → SQLite transaction: user message + queued Pi Run + assistant placeholder
  → 202 response: stable message and run IDs

One local worker
  → claim queued run
  → load current Decisions/checks and bounded Chat context
  → Pi execution → batched assistant-message revisions in SQLite
  → validate → commit final answer + Decisions + successful run together

Browser reload / reconnect
  → read authoritative snapshot
  → SSE delivers newer saved revisions and terminal state
```

## Acceptance and execution

- Keep the existing Node.js Route Handler boundary, strict request validation, awaited route params and same-origin protections. Enqueue in the request; do not start a worker per request or rely on an HTTP callback to finish work.
- The client supplies an idempotency key. Repeating the same accepted submission returns its original IDs; reusing its key with different input is rejected. Validate application/Chat ownership and writability before acceptance.
- Persist the user message, assistant placeholder and queued run atomically. The placeholder is visibly pending, not a completed Pi answer. Preserve the existing message `body` field unless a concrete implementation need justifies a rename; add status and monotonically increasing revision.
- Run one separately started local Node worker, initially with global concurrency one. This also satisfies at most one active run per Phase Workspace. Reject accidental second-worker startup; do not introduce leases, Redis, a workflow engine or independent queue consumers.
- Multiple Chats may enqueue work. Preserve accepted order within a Phase Workspace, and load shared Decisions when execution starts so later runs see prior committed results. Show queue state rather than pretending queued work is already generating.
- Use Pi directly. Persist accumulated user-facing text in batches, not one message or Activity Event per token. Do not expose private model reasoning. Provisional text cannot claim authoritative saved Decisions.
- Validate Decision proposals against current application state immediately before committing. Save the final assistant answer, accepted Decisions, their Activity Events and successful run status in one transaction. Late callbacks cannot complete a terminal run or restore a removed application.

## Terminal states and recovery

| State | Meaning and retry behavior |
| --- | --- |
| `queued` | Accepted, waiting for the worker. May be cancelled without a model call. |
| `running` | The worker owns this attempt. Saved text remains provisional. |
| `succeeded` | Final answer and validated domain changes committed together. |
| `failed` | Generation or domain validation failed; no Decisions committed for this attempt. Preserve a safe error and the accepted user message. |
| `cancelled` | Explicit cancellation won before completion. Persist it, abort active Pi execution and reject late completion. |
| `timed-out` | The configured execution limit expired. Preserve the attempt; do not silently retry. |
| `interrupted` | The worker stopped before a terminal outcome. On restart, mark previously running attempts interrupted; queued work can still start. |

An explicit retry creates a new linked Pi Run and assistant attempt for the original accepted user message. It must not duplicate that user message or erase the failed attempt. Prevent duplicate retries and preserve Phase Workspace serialization. Cancellation races are resolved by the persisted terminal transition: a cancellation after successful commit cannot undo it.

This changes the old “failed turn leaves no messages” expectation: **accepted intent survives failure, while failed attempts never become completed answers or committed Decisions**. Update domain tests, browser journeys and eval snapshots to express that distinction. Incomplete or failed assistant attempts are not ordinary transcript context for the next generation.

## Reconnectable delivery

Expose application-scoped run/message snapshots and a reconnectable SSE endpoint. Keep access checks on snapshot, stream, cancellation and retry routes; a run ID is not authorization.

Deliver only persisted revisions. A reconnect starts with the latest snapshot and then newer revisions, so a missed frame cannot lose accepted text or change an outcome. Ignore duplicate/older revisions. No historical row per token is needed to rebuild the latest state. Closing a stream releases its resources but does not cancel the Pi Run.

## Bounded context

Use a bounded recent-message window plus a durable, per-Chat summary of the older completed transcript. Record the covered message boundary so summarization cannot omit a gap or count the same range twice. Keep the complete transcript for inspection; context compaction is not deletion.

The summary is model-authored context, never new authorization or a replacement for evidence. Always supply every active application Decision and freshly derived checks separately. Never silently drop Decisions to meet a limit. Establish explicit context/summary budgets and visible failure behavior when they cannot be met; a failed summary update must not advance its coverage marker or fall back to unlimited replay. Extra model calls for summarization must be accounted for in live-eval usage.

## Implementation and verification order

1. **Durable acceptance and completion:** schema/types, idempotent enqueue, one worker, atomic terminal commit. Prove the HTTP response returns before the synthetic Pi turn completes and database records survive process boundaries.
2. **Failure recovery and delivery:** cancellation, timeout, interruption, linked retry, snapshots, SSE and the desktop pending/queue/reconnect experience. Prove worker crashes and browser disconnects with real local processes and synthetic Pi.
3. **Bounded context:** summary coverage and recent-message selection, every active Decision retained, isolation between Chats, and summary failure cases. Update the live eval harness to exercise the durable execution path without making a browser mandatory.

Use disposable databases and synthetic Pi for deterministic and desktop tests. Cover duplicate submission, multiple Chats in one workspace, independent applications, stale completions, removal during execution, cancellation/completion races, timeout, worker restart and reconnect after the final commit. Preserve old accepted data when applying the new schema; never reset the user's live database as a test setup step.

Real Pi verification remains opt-in and separately reported. Do not treat fixture success as proof of provider streaming behavior or semantic quality. Keep Phase 2, provider mutations, distributed workers, OpenTelemetry and Langfuse out of this milestone; tracing follows under its [own spec](action-history-and-tracing.md).
