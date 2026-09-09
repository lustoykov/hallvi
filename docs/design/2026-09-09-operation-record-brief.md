# Operation record: one store, one change at a time, a queue, a history

Implementation clarification: a dead worker only frees the slot when no remote effect is unresolved. Unknown provider/SSH/GitHub outcomes retain a hold until reconciliation. See [current architecture](../architecture/agent-directed-operations.md) for the implemented rule; the original discussion below is preserved as design context.

9 September 2026, Fable, for Codex. Decided with the owner: the lock is the operation record itself, one change works at a time per application, a blocked change queues rather than being refused, and the model reads the record and never other conversations' transcripts. This brief says what to build. The [reference prototype](2026-09-09-final-ui-screens-reference.md) shows how every state renders; the [integration report](2026-09-09-conversation-first-integration.md) describes what the deployment already does.

## The principle

Conversations do not own the application. The application owns one list of operations, and every surface draws from it: receipts in the conversation that started the work, reference chips in other conversations, activity cards and origin lines in views, navigation marks, the work strip, Overview. A change is “working” while the host is being changed and settles as verified or failed. That state is the lock: the executor records the end of a change because the receipt needs it, and that same write frees the slot. Nobody holds or releases anything, and the model never does.

The model’s job is the conversation: read the record before proposing, refer to work that already exists, say what is running and offer to queue. The server’s job is the guarantee: one check when a change starts.

## The record

`src/server/operation-record.ts` defines `ApplicationOperation`: id, source (`deployment`, `logs`, `backup`, `restore`, `job`, `release`, `domain`, `variables`, `check`, `inspection`, `issue` plus the source id), kind (`inspection` or `change`), title, state, destinations, origin (conversation and message, or null for automatic work), mentions, timestamps, summary, steps, decision, evidence, next, `resolvedById`. Today it is projected from the deployment record and the log snapshot; the reference prototype invents the rest.

Two states join `proposed`, `working`, `inspected`, `verified` and `failed`:

- `queued`: approved, waiting for the change that is working. Rendered with the working tint, no pulse, chip “Queued · after Restart the worker”; its first step reads “Wait for Restart the worker to finish” with a chip that opens that receipt. Marks treat it as working. The work strip shows the change that is executing, never a queued one.
- `cancelled`: removed from the live set by the user. Muted in history, never marks, never blocks. Today `cancelDeployment` deletes the record and posts a recorded event; the store keeps the row instead.

Add `waitingForId` (the operation a queued change waits for) and `preconditions` (the facts a plan relied on: serving revision, recorded stack version, the inputs’ names) to the record.

## Build list, in order

1. **Store.** A durable `application_operations` table with the record’s fields, one row per operation, all sources. The deployment record and the log snapshot keep their tables and are projected into the same list (the pure projection stays), or are written through; either way `operationsFor(applicationId)` returns everything newest first and is what the API, the SSE frame and the worker read. No migration of existing deployment rows.
2. **Start.** `startChange(operation)` runs in one transaction: if any change for the application is `working`, insert as `queued` with `waitingForId`; otherwise insert as `working` and hand it to the worker. Inspections never wait and never block. This replaces the pid registry in `application-operations.ts` (used by revision correction) as the meaning of “busy”; keep the pid only for liveness.
3. **Settle and continue.** When a working change settles, the same transaction takes the oldest queued change, re-checks its `preconditions` against current facts, and starts it. If a precondition changed, it goes back to `proposed` with a note in the receipt: “Facts changed while waiting: the serving revision is now a91f4d2. Review again.” An abandoned working change (worker died: the existing liveness check) settles as `failed` with next “Server Guy stopped mid-change; retry or cancel”, which frees the slot and continues the queue.
4. **Decisions.** One endpoint for approve, retry and cancel with inputs, guarded by compare-and-set on the operation’s `updatedAt`, rendered by `OperationDecisionCard`. Approve moves `proposed` to `working` or `queued` through step 2. Retry creates the retrying operation with `resolvedById` on the failed one. Cancel moves `proposed`, `queued` or `failed` to `cancelled` and posts a recorded event. The deployment keeps `deployment-decision.tsx` until it is moved onto this endpoint.
5. **No duplicates.** `findUnresolved(applicationId, source.type, target)` returns the proposed, queued, working or unresolved failed operation about the same thing. The agent’s propose tool calls it first and returns that operation instead of creating one; the agent’s reply gets a mention, exactly as `mentionDeployment` records today.
6. **What the model sees.** Every turn’s context carries the application’s live operations as a compact list: state, title, origin conversation title, current step, what it waits for. Tools: `list_operations`, `propose_change` (returns an existing unresolved operation or the new proposal), `record_inspection`. Instruction, verbatim: “Before proposing a change, read the operations. If unresolved work exists about the same thing, refer to it and start nothing. If a change is working, say which one and from where, then propose; it will queue.” Never inject other conversations’ transcripts.
7. **History view.** A stable destination in the Application group after Deployment, named History. Every operation newest first: state chip, title, origin (conversation link or “automatic”), destinations, relative time and clock time. Live work first (working, queued, waiting for you), then settled. Filter chips: All, Changes, Inspections, Automatic, Needs you. A row opens the receipt when it has an origin and the first destination otherwise. Overview’s Recent changes keeps six and links “All history”. Retain every row; bound evidence and output per operation as views already do.

## Acceptance

- Two conversations approve changes at the same instant: one is working, one is queued, never two working. The queued receipt names what it waits for and links to it.
- The working change settles; the queued one starts after its precondition check. With a changed precondition it returns to proposed with the note, and nothing runs.
- The same outcome requested from a second conversation returns the existing operation, records a mention, creates no row.
- The worker dies mid-change: the change settles as failed, the slot frees, the queue continues, the failed receipt offers retry and cancel.
- Cancel on a queued change removes it from the live set, keeps it in History as cancelled, posts the recorded event.
- Approve with a stale `updatedAt` is refused; the receipt re-renders from the record.
- History lists deployment, log snapshot, automatic and conversational operations alike; marks, the work strip and Overview all derive from the same list.

## Out of scope

Resource groups (parallel changes on disjoint resources), locks across applications, external notification delivery, account-level seen state. The prototype does not yet stage the queued change or the History view; both follow the receipts and views already in it.
