# Native Pi sessions and permission boundaries

Status: proposed design; no runtime changes in this document. Baseline: [PR #13](https://github.com/lustoykov/server-guy/pull/13), merged September 5, 2026. Build order belongs in [ROADMAP.md](../../ROADMAP.md).

## Recommendation

Let Pi own the conversation and the tool loop. Let Server Guy own the authority to cause effects and the durable record of those effects.

Use one persistent native Pi session per Chat, reopened by the existing worker for each Pi Run. Replace flattened history and Server Guy's custom summarizer with Pi's native history and compaction. Keep the first migration's tool permissions and atomic Decision-commit semantics unchanged.

The Bitter Lesson favors general methods that benefit from more computation over hand-built reasoning strategies. Applying that idea here is an architectural judgment, not a claim that the essay prescribes an authorization system: provide useful tools, observations and feedback instead of programming Pi's reasoning sequence. Authorization, data integrity and recorded outcomes remain ordinary software responsibilities. [Rich Sutton's essay](https://www.cs.utexas.edu/~eunsol/courses/data/bitter_lesson.pdf).

## Product language: one assistant, Server Guy

The ownership split below is for developers, not a distinction users must understand. Present one assistant named **Server Guy** throughout ordinary chat, settings, progress, approvals and recovery. Pi remains the internal runtime; there is no user-facing handoff between two assistants.

| Current wording | Proposed user-facing wording |
| --- | --- |
| Pi (assistant name/avatar) | Server Guy / SG |
| Message Pi | Message Server Guy |
| Pi is replying… | Replying… |
| Ask Pi about this check | Ask about this check |
| Pi decides | Let Server Guy decide |
| Pi session missing | Conversation history unavailable |

The middle approval option still means Server Guy chooses when to request approval within the granted scope. This is a copy change, not a new policy. Keep internal identifiers such as `pi-decides`, `PiRun`, SDK names and existing routes; do not migrate stored data just to remove runtime branding from the UI.

Keep **ChatGPT** and **GitHub** where they identify the account being connected or the service receiving data. Mention **Pi** only when relevant: the optional existing-Pi-login reuse choice, Storage & privacy, and developer diagnostics. When reusing a Pi login, explain that it shares that login file rather than implying a separate copied credential. Progressive disclosure must not hide consent, storage risks or disconnect consequences.

Preserve the distinction between an AI-generated reply and a **Recorded event**; one brand does not make a model's claim verified evidence. Tell the embedded model to introduce itself as Server Guy and translate runtime failures into actionable product language, with technical details available separately. Do not rewrite historical chat text or raw diagnostic evidence.

Include this terminology pass in the next implementation PR, covering labels, accessible names, generated replies and error states. Ordinary journeys should require no knowledge of Pi; the credential-reuse path should still accurately explain the shared login. This section specifies the proposed copy; the current UI has not been changed by this design document.

## 1. Permission design: constrain effects, not reasoning

Three questions must remain separate:

| Question | Owner | Example |
| --- | --- | --- |
| What should I investigate or try next? | Pi | Compare deployment approaches, inspect evidence, revise a plan. |
| What resources and actions are available? | Server Guy's scoped tools and credentials | This application's repository, not every repository the user's credential can access. |
| Must I ask before this allowed external change? | The user's saved Approval Mode | Always Ask requires approval; Pi Decides lets Pi choose whether to ask. |

### Keep the existing three modes

| Mode | Within the explicitly granted resource/action scope |
| --- | --- |
| Always Ask | Read automatically; obtain explicit approval before each external change. |
| Pi Decides | Let Pi decide when an external change needs a question or approval. No second model classifies risk. |
| Full Autonomy | External changes need no per-action approval, within the granted scope and explicit limits. |

None of these modes grants access to another application, expands credentials, removes a user's explicit limit, or lets Pi change its own mode. Recording messages, Observations and an explicitly stated Decision is internal bookkeeping, not a separate external-change approval.

Today these modes are recorded preferences. Phase 1 exposes only `propose_decision`; it has no deployment, shell or repository-write tool. Do not present a future approval gate as already implemented. See [current tool configuration](../../src/server/pi.ts) and [mode descriptions](../../src/server/types.ts).

### Enforce the scope at the operation

The worker supplies the application/Chat identity through the tool closure. The model supplies the requested change, not the application whose records to edit:

```typescript
// Illustrative interface, not implemented code.
const tools = toolsForApplication(run.applicationId);
// Pi can choose value/replaces; it cannot choose a different applicationId.
```

For a Decision replacement, use one application-scoped mutation that requires the old Decision to still be active. Keep its insert, guarded replacement and Activity Event in the transaction. Consolidate the duplicated checks in [savePiDecisions](../../src/server/phase-one.ts) and [supersedeDecision](../../src/server/db.ts); do not simply delete the precheck and accidentally turn a missing replacement into an additional Decision.

For a future external operation, check the actual target and current authority immediately before the effect. In Always Ask, approval names that concrete operation and target; changing the effect requires new approval. Historical approval is evidence, not reusable authority. Add this when the first external mutation is implemented, not as a generic policy engine now.

Pi may respond to a denied or invalid tool call by correcting it, asking the engineer, trying another allowed method, or explaining the limit. Server Guy should not prescribe which of those thoughts comes next.

### Decision tool errors and commits are a separate decision

Current behavior is `collect proposals → Pi finishes → one SQLite transaction saves answer + Decisions + Run success`. A tool saying “collected” is not a receipt that a Decision was saved.

The native-session migration retains this contract. TypeBox/tool-execution errors already return through Pi's tool loop. Add a small application-scoped active-Decision lookup during proposal collection, plus detection of conflicting staged replacements within the same Run. A bad replacement then returns a useful tool error while Pi can still correct it. Only successful proposals enter the staging collection.

The final transaction still uses a guarded mutation. These are two different jobs: an early read supplies feedback to Pi; the conditional write protects the commit against stale state. Do not duplicate a whole validation framework, but do not claim an earlier read guarantees a later write. A late domain failure still fails the Run and rolls back the staged batch; native sessions alone do not make every final failure repairable inside the same turn.

**Deferred alternative, not a scheduled second milestone:** make Decision recording a committing tool that returns the actual saved result. This simplifies tool feedback but means a saved Decision survives a later narration failure or cancellation. The UI would need to show the effect beside the failed/cancelled Run. Each tool transaction would require its Run to still be running and its Chat writable: if cancellation wins, a late callback cannot save anything; if the tool commit wins, later cancellation does not undo it.

If that alternative is adopted, atomically save a stable operation identity/receipt with the Decision and Activity Event. Reuse the receipt on redelivery; saving it separately would leave a duplicate-write crash window. A fresh model-generated call ID by itself cannot deduplicate every semantic retry. Rebuild current Decisions before retrying; never re-execute an old tool call merely because it appears in history. Implement this only when independently committing tool effects are actually required, with an explicit review of the changed semantics.

No generic `execute_anything` tool, permission DSL, workflow engine, second agent supervisor, model-risk classifier or unrestricted Pi tool bundle is needed for the next PR. A working directory is not a filesystem sandbox.

## 2. Native Pi design: one conversation, many Runs

| Record | Owns | Does not prove |
| --- | --- | --- |
| Pi native session, per Chat | Native user/assistant/tool messages, session identity and compaction entries | That an application mutation committed. |
| SQLite Pi Run | Accepted request, queue/progress, cancellation, retry and terminal outcome | That every tool mentioned in a transcript executed. |
| SQLite application records | Saved Decisions, Observations, checks and Activity | The model's entire conversational memory. |

The `AgentSession` object can be short-lived. Reopening the same native session file is continuity; creating a new in-memory history and pasting old text is not.

### Normal Run

1. Claim the Run with the existing single worker.
2. Open the Chat's own native session and restore its messages and compaction state.
3. Supply current application facts and the actual prior attempt outcome separately from historical conversation.
4. Call `session.prompt` with only the new engineer message, not a rebuilt transcript.
5. Let Pi perform its model/tool loop and native compaction; stream progress through the existing message snapshots/SSE.
6. Keep the existing final SQLite transaction for answer, staged Decisions, Activity and Run success.
7. Dispose the SDK session only after prompt/abort processing has settled; then claim another Run.

### Fresh facts must remain separate from compacted history

Reuse the existing per-Run resource loader's `systemPromptOverride`: stable instructions followed by a separately delimited, timestamped application snapshot. Prepare and validate it before the model starts. It contains the application identity, current saved Decisions/checks, current approval mode and relevant preceding Run outcome. User-authored values within that snapshot are data, not instructions; do not promote a legacy transcript or model-generated summary into this channel.

The system prompt is rebuilt for each Run and is not a persisted conversation entry. Pi's native compaction therefore does not replace it with an old conversation summary. The engineer message is sent separately as a normal user message. Include a lightweight Run marker in native history for correlation, not a full copy of the Operator View on every model call or a new event store.

These facts are current as of Run start; final effect boundaries still check current database state. A future requirement to refresh facts within a long Run may justify Pi's public `context` hook, but slice 1 does not need that extension. Its exceptions can be swallowed by the SDK, so it must not become the sole place for mandatory validation. The existing per-Run path is smaller and fails before a model request if context cannot be prepared.

Example after a cancelled attempt:

```text
Application: todo-fastapi
Previous attempt: cancelled. Its staged Decisions were not committed.
Current saved priority: keep operating cost low.
Repository access: verified at the recorded commit and time.
```

Bound this application-context payload. Keep room for it in the context budget, retain native overflow recovery, and test a near-context-limit request, including a materially changed snapshot. Do not claim that character estimates are exact tokens or that prompt-cache effects are known without measuring them.

### Storage and initialization

Store native session files under Server Guy's private data directory, for example `.server-guy/pi-sessions/<application-id>/<chat-id>.jsonl`. Respect the configured data directory; derive paths from validated server-side identities, never a model-supplied path. Do not mix these files with the user's interactive Pi sessions or load their global tools/extensions/instructions.

Associate the Chat with its expected native session ID. Establish the file and association before the first model request. On resume, a previously established but missing, empty, mismatched or unreadable session is an explicit recovery error, not permission to silently start an empty conversation. Offer **Rebuild conversation from saved chat** as an explicit recovery choice and explain that native tool history may be lost; preserve damaged files. Use owner-only storage; exclude it from Git and static serving.

Installed Pi 0.84.4 defers the first normal file write until an assistant message exists, and `SessionManager.open` can create a missing file. Initialization must account for this: exclusively create the new private file, let the public SDK initialize its header, then associate its native ID. An interruption before association may adopt the same valid header-only file; an existing association must never be silently overwritten.

The SDK tolerates an interrupted final JSONL line and can skip malformed lines. That is not a promise to detect every corruption. Add focused persistence tests; preserve a damaged established file for inspection and provide an explicit recovery action rather than automatically discarding history. JSONL writes and SQLite commits are not one transaction, and ordinary append operations do not imply a power-loss `fsync` guarantee.

Backup/restore must include both SQLite and associated session files. During an explicit application reset/removal, stop and settle its Run before cleaning up its sessions. The native log grows even when model context is compacted; compaction is not disk retention. No scheduled cleanup service is needed now.

### Cancellation, crash and retry

Keep native attempted history rather than rolling every failed attempt back to a successful leaf. A record of an unsuccessful conversation can be useful; current database facts determine what was actually saved.

| Interruption point | Durable outcome and next action |
| --- | --- |
| Before Pi starts | The user message and Run remain recorded; no Decision was committed. |
| After proposal collection, before final transaction | Failure/cancellation/interruption remains visible; staged Decisions are not saved. Supply that outcome to the next Run. |
| After Pi's answer is in JSONL, before SQLite commit | The transcript may contain an unaccepted answer. Run remains interrupted/failed; do not infer success or commit it on restart. |
| After the SQLite success commit | The saved answer and Decisions are authoritative. Do not execute the successful request again. |

Pi's provider-message conversion omits errored/aborted assistant messages and supplies error results for orphaned tool calls; it does not execute those historical calls. Verify that behavior with the installed provider adapter instead of writing our own conversation repair engine. A fully generated but uncommitted answer can still appear in native history, so explicit outcome grounding is essential.

Fix the current worker's cancellation race as part of the migration: recording `cancelled` and winning `Promise.race` is not proof the SDK has stopped. For cancellation, timeout and worker shutdown, call public `abortCompaction()` as well as `abort()`, then await prompt, compaction and session persistence settlement before releasing the single-writer slot. In installed 0.84.4, `abort()` alone does not cancel compaction. If the SDK cannot stop within a bounded grace period, stop that worker rather than running a second writer against the same session; restart marks still-running Runs interrupted and preserves already-cancelled outcomes. Never hold a SQLite transaction open while waiting on a model or approval. Keep compaction inside the existing Run deadline initially; change that budget only on evidence.

Retry remains a new, linked Run. Under the first slice's unchanged atomic semantics, no Decision from the failed Run needs replaying. Native transcript restoration is not automatic action replay. Future external Operations require their own recorded outcome/idempotency/reconciliation, not a claim that session persistence gives exactly-once effects.

### Existing Chats

Existing SQLite text cannot recreate genuine native tool calls, provider metadata or compaction entries. On first native use, import a clearly labeled legacy-context note from the existing summary and bounded completed history, keeping all original UI messages intact. Do not fabricate native assistant/tool records. Only this one-time transition may use the old text representation; subsequent Runs continue the native session.

Delete the active custom summarization/replay path once the native replacement and migration tests pass. Keep old persisted summary data readable during transition; do not erase it as part of this design-only work.

## Implementation slices and acceptance

1. **Next PR — native sessions, unchanged authority/commit semantics:** session identity/storage, native history/compaction, current per-Run context, settlement fix, legacy import and early Decision-proposal feedback with guarded final writes.
2. **Then resume inspectability and later operations:** trace native model/tool events under the existing Run ID; add actual approval enforcement with the first external mutation. Independently committed tools remain a separate semantic choice, not a dependency of native sessions. No new orchestration service.

Required tests for slice 1:

- Continue the same Chat across Runs and worker restarts; keep two Chats' histories isolated while sharing current application Decisions.
- Reopen a compacted native session without a custom summary call; expose updated Decisions/checks even after compaction.
- Fail before making a model request if mandatory application context cannot be prepared; verify snapshot values remain data rather than tool authority.
- Cancel during generation, a tool call and compaction; prove no overlapping session writer or late successful commit.
- Crash after proposal collection, after native final output and after SQLite success; prove truthful outcomes and no blind replay.
- Exercise orphaned tool-call history through the actual SDK conversion with a synthetic provider; no real credentials required for deterministic tests.
- Detect missing/mismatched established files; cover initial-file and association interruption, partial trailing writes and explicit legacy import.
- Verify a recoverable tool error returns to Pi; separately verify final domain rejection still rolls back the entire first-slice transaction.
- Retain desktop send/reload/cancel/retry journeys; live model checks remain separate, opt-in evals for continuity, recovery and truthful saved-state claims.

## Installed-source reference map

Verified against `@earendil-works/pi-coding-agent` 0.84.4, not an assumed future SDK:

- Application adapter: [`src/server/pi.ts`](../../src/server/pi.ts); old context policy: [`src/server/pi-context.ts`](../../src/server/pi-context.ts).
- Run completion/cancellation: [`src/server/pi-runs.ts`](../../src/server/pi-runs.ts); single-worker lifecycle: [`src/server/pi-worker.ts`](../../src/server/pi-worker.ts).
- SDK `dist/core/sdk.js`: restores `sessionManager.buildSessionContext()` and exposes `transformContext` through the extension runner.
- SDK `dist/core/resource-loader.d.ts`: supports the existing `systemPromptOverride` path. Inline extensions and their `context` hook were considered but are not needed for the next PR.
- SDK `dist/core/session-manager.js`: public `open`, `getSessionId`, append/custom-message and compaction APIs; initial write behavior and JSONL loading.
- SDK `dist/core/agent-session.js`: native message persistence, compaction, abort and session disposal.
- Installed `pi-ai/dist/api/transform-messages.js`: provider replay handling for errored assistants and orphaned tool calls.

## Fable review

Reviewed with Fable in two CLI rounds on September 5, 2026, against repository code and installed SDK sources. Fable made no repository changes. Session: `1828e643-c348-4360-880e-5b8f89e23e97` (resume with `claude --resume 1828e643-c348-4360-880e-5b8f89e23e97`).

The exchange changed the proposal:

- **Accepted Fable's simplification:** reuse the existing per-Run system prompt instead of adding a context extension; retain atomic final Decision saves instead of scheduling a second committing-tool milestone.
- **Accepted Fable's lifecycle finding:** worker shutdown needs the same abort-and-settle discipline as cancellation and timeout. Cancelling compaction is a separate SDK operation.
- **Rejected silent reconstruction:** a lost native session is not just a cache miss because SQLite cannot recreate its tool history. Fable agreed a nullable native session ID and an explicit rebuild action are the smallest way to distinguish first migration from lost history.
- **Corrected two overclaims:** an established JSONL file can already contain a failed attempt's user/tool messages; early validation does not guarantee a later commit. The design preserves attempted history and checks current state at the write.
- **Settled the remaining choices:** keep compaction within the Run deadline until measured; import bounded legacy summary and completed text once, without deleting the old persisted records.

A separate disposable SDK probe verified private-file initialization, session/entry identity across reopening, a synthetic compaction checkpoint, custom-message conversion, orphaned tool-call repair and omission of aborted assistant output. It used no model calls, credentials or product database. The compaction entry was manually constructed: this is feasibility evidence, not proof of model-generated compaction, crash recovery or concurrent-writer safety. The acceptance tests above remain required before implementation can be considered complete.
