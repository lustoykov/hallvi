# Durable Pi requests

Status: implemented; merged as [PR #13](https://github.com/lustoykov/server-guy/pull/13) on 2026-09-05. This document is the current contract for accepted requests: durable acceptance, cancellation, retry, saved message revisions and atomic Decision commits. This branch replaces the original bounded replay with the [native Pi session contract](native-pi-and-permissions.md), while preserving those durable request guarantees. [ROADMAP.md](../../ROADMAP.md#make-pi-requests-durable) owns build order and completion status.

## Outcome

Sending a message records the engineer's intent immediately. Closing the tab does not cancel accepted work; reopening the Chat reconstructs its progress or outcome from SQLite. A worker restart exposes an interrupted attempt instead of silently repeating it.

Previously, `sendChatMessage` waited for `askPi` inside the HTTP request and then saved both messages and accepted Decisions together. The browser's pending message was only local presentation. This milestone changes acceptance, not the requirement that Decisions pass validation before commit.

```text
Browser POST
  → SQLite transaction: user message + queued Pi Run + assistant placeholder
  → 202 response: stable message and run IDs

One local worker
  → claim queued run
  → reopen Chat's native history; append current checks and actual prior outcome
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
- Multiple Chats may enqueue work. Preserve accepted order within a Phase Workspace; shared Decisions are read from current SQLite state when the model calls `search_decisions`. Show queue state rather than pretending queued work is already generating.
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

This changes the old “failed turn leaves no messages” expectation: **accepted intent survives failure, while failed attempts never become completed answers or committed Decisions**. Native attempted history is retained, including a fully generated but uncommitted answer. Every subsequent Run carries the previous attempt's actual saved outcome; native conversation text is not evidence of a database commit.

## Reconnectable delivery

Expose application-scoped run/message snapshots and a reconnectable SSE endpoint. Keep access checks on snapshot, stream, cancellation and retry routes; a run ID is not authorization.

Deliver only persisted revisions. A reconnect starts with the latest snapshot and then newer revisions, so a missed frame cannot lose accepted text or change an outcome. Ignore duplicate/older revisions. No historical row per token is needed to rebuild the latest state. Closing a stream releases its resources but does not cancel the Pi Run.

## Bounded context

Pi owns native history and compaction. Existing Chats import a clearly labeled bounded legacy summary/text note once; subsequent Runs append native messages instead of replaying SQLite text. The previous custom summary rows are preserved but no longer updated.

Instructions stay stable. A bounded Run-context message supplies the Run's identity and the actual prior outcome without embedding Decisions or an application summary. `get_application_status` reads the current saved configuration, checks and evidence when an answer depends on them ([spec](application-status-tool.md)), `search_decisions` reads active saved records with pagination when needed, and `propose_decision` stages changes for the final guarded transaction. Compaction summaries are model-authored context, never authorization or proof of a saved effect. Cancellation aborts both compaction and generation and retains the writer lock until settlement; a non-draining worker exits rather than allowing overlapping writers. Native logs and SQLite both belong in backups.

## Implementation and verification order

1. **Durable acceptance and completion:** schema/types, idempotent enqueue, one worker, atomic terminal commit. Prove the HTTP response returns before the synthetic Pi turn completes and database records survive process boundaries.
2. **Failure recovery and delivery:** cancellation, timeout, interruption, linked retry, snapshots, SSE and the desktop pending/queue/reconnect experience. Prove worker crashes and browser disconnects with real local processes and synthetic Pi.
3. **Native context:** session identity/import/recovery, compaction, scoped Decision retrieval, isolation between Chats, and cancellation settlement. Live evals exercise the same durable path and review model behavior after compaction without requiring a browser.

Use disposable databases and synthetic Pi for deterministic and desktop tests. Cover duplicate submission, multiple Chats in one workspace, independent applications, stale completions, removal during execution, cancellation/completion races, timeout, worker restart and reconnect after the final commit. Preserve old accepted data when applying the new schema; never reset the user's live database as a test setup step.

Real Pi verification remains opt-in and separately reported. Do not treat fixture success as proof of provider streaming behavior or semantic quality. Keep Phase 2, provider mutations, distributed workers, OpenTelemetry and Langfuse out of this milestone; tracing follows under its [own spec](action-history-and-tracing.md).

## Implemented boundaries

- `src/server/pi-runs.ts` owns enqueue, claim and terminal transitions. Runs use accepted insertion order; retries have new assistant placeholders and preserve their original user-message ID.
- `src/server/pi-worker.ts` owns one execution at a time. A separate SQLite sidecar holds an OS-released exclusive lock, without locking application writes. The 120-second execution deadline includes summarization. Progress snapshots are written at most every 250ms; SSE reads saved state every 500ms and releases timers on disconnect.
- `src/server/pi-context.ts` keeps up to eight recent completed exchanges, bounded to 16,000 characters. Summary inputs are at most 20,000 characters plus a 6,000-character previous summary. All active Decisions must fit 24,000 serialized characters; current checks have a separate 12,000-character budget. A budget or summary failure is visible, never an unlimited fallback. These are character budgets, not exact provider token counts.
- Summaries record their last covered message. Cancelled/failed attempts and their unpaired user inputs are excluded from completed context. Successful retries enter context at the position of their new answer, so they cannot disappear behind an older summary marker. Summary updates commit only after successful generation and while the owning run remains active.
- `piCalls` counts Pi adapter sessions, including summary calls. It is not a provider-request or billing count: tools and SDK retries can make additional provider requests within a session.
- Schema v5 preserves legacy messages as completed with revision 0. The pre-push v4 upgrade backs up the database and adds columns in place, avoiding Drizzle's message-table rebuild cascading into Decisions. Drizzle remains the authoritative table definition.
