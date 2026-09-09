# Conversation-first in the real application: integration report

9 September 2026, Fable, in the integration worktree `.worktrees/self-hosted-shell` (branch `codex/self-hosted-shell`). This carries the accepted [conversation-first design](2026-09-09-conversation-first-adoption.md) into `/applications/[id]`, bound to the real deployment record, real conversations and the real approval call. The `/explore` route and its simulator are untouched and remain a reference; nothing simulated appears on product routes.

> Subsequent merge cleanup: the unused `/explore` route and prototype implementations were removed from the integration candidate after Fable created `claude/final-ui-screens`. The report below records the earlier integration; the real application components remain.

## What changed

**One operation record, projected from durable data.** `src/server/operation-record.ts` derives `ApplicationOperation` values from the deployment record: kind (inspection or change), state (proposed, working, inspected, verified, failed), the destinations it touches, the conversation and reply that started it, replies elsewhere that referred to it, steps, the pending decision, evidence and the next step after a failure. It is pure, so the browser derives the same operations from the record it already polls. There is no new table and no migration.

Three small, backwards-compatible fields were added to the deployment record body (`deployment-types.ts`), none of which changes behaviour of the executor:

- `originMessageId`: the recorded reply the receipt sits under. `requestDeployment` records it; older records anchor to the first recorded reply after they started.
- `mentions`: when a second conversation asks to deploy (through the `prepare_deployment` tool or the deployment endpoint) while a deployment exists, `requestDeployment` no longer returns it silently. It posts a recorded reply in that conversation, saying the deployment already exists and was started elsewhere, and records the mention. That reply renders a compact reference chip that opens the original receipt.
- `logsCollectedAt`: set when logs are collected from the host, so the snapshot is an inspection with a time.

**Where the record renders**, all from the same data:

| Surface | Component | What it shows |
| --- | --- | --- |
| Conversation | `OperationReceipt` in `chat-pane.tsx` | Under the reply that started the work: chip, title, relative time, summary, steps while working or failed, evidence once verified, next step after failure, the decision while one is pending, and destination links. A receipt whose reply is missing from the transcript renders at the end, so no operation is lost. |
| Conversation | `OperationReferences` | “Refers to” chips under replies that mention work started elsewhere; each opens that conversation at the receipt. |
| Views | `DestinationActivity` at the top of every destination | Every unsettled operation touching the view as an activity card with its origin link; once settled, one origin line and an “Earlier work” disclosure. Facts below never preview a proposal. |
| Navigation | marks on destinations and conversations | Failed, then waiting for you, then working, then updated since you looked. |
| Top bar | work strip while a view is open | The active operation, preferring work in the viewed area, then the current conversation’s. Clicking opens its receipt. |
| Overview | `application-overview.tsx` | Condition, Needs you, Running, Recent changes, Evidence freshness. |

**The decision lives in the receipt.** `deployment-decision.tsx` is the existing approval form moved into the receipt: recommendation identity, the spending bound, missing inputs as password fields, the configuration review, and after a failure the retry and cancel actions with the same guards as before. The Deployment view keeps the Hetzner connection, the “Deploy application” start, the recorded event history and logs; its activity card links to the receipt with “Review and approve in [conversation]”. The deployment browser journey now approves there.

**The shell.** The permanent right panel is gone. Opening a destination parks the conversation (visibility hidden and inert) instead of unmounting it, so scroll position and draft survive; a bar above the view says “Back to [conversation]” and, when live work is elsewhere, offers “Server Guy is in [view] · show”. The legacy repository-preparation step bar stays as a collapsed disclosure above the transcript, and the legacy Record moved under Deployment as “Preparation record”; the browser helpers follow it there. The `?variant=` prototype hook was removed from the application page.

## Indicators: what a click does and when a mark clears

A mark never opens anything by itself; the row it sits on does. Clicking a destination row opens the view; clicking a conversation row opens the conversation.

| Mark | Set when | Clears when |
| --- | --- | --- |
| Failed (red) | An operation touching the destination failed and nothing verified has addressed it | The operation is retried and reaches a settled state, or is cancelled |
| Waiting for you (amber) | An operation touching the destination is proposed | The decision is made (approve, retry, cancel) |
| Working (blue, pulsing; still under reduced motion) | An operation touching the destination is working | The operation settles |
| Updated since you looked (green) | A verified or inspected operation is newer than the destination’s seen time | The destination is opened; leaving it records the time |

Conversations carry the same three live marks for their own operations, cleared the same way. “Seen” is per browser and application (`localStorage`), initialised to “everything seen” on first visit so old work does not glow. Account-level seen state is the intended replacement once user identity exists; the derivation takes a map of timestamps, so only the storage changes.

## Consistency across views and conversations

- Approval, failure, retry and recovery all mutate the one deployment record through the existing endpoint; every surface re-derives from it on the next poll (2.5 s) or SSE frame, so a receipt, an activity card, a mark and Overview cannot disagree.
- Work continues while the user changes conversation or view: the record is application-owned, the worker runs independently, and the parked conversation keeps polling.
- Conflicting changes cannot run concurrently: one deployment per application is enforced by the unique record, approval is a compare-and-set transaction on the recommendation identity, and a second request from any conversation references the existing operation instead of queueing.
- Read-only work is labelled: the inspection phase of a deployment says “Read-only: nothing is purchased or changed until you approve”; the log snapshot is an Inspected operation.
- Failed work does not replace the last verified state: a failed retry keeps the record’s earlier evidence in the timeline, and views show facts only from the record’s verified fields.
- Historical receipts: the record’s events accumulate, so a receipt that went verified → failed → verified shows the retry in its steps; there is one initial deployment per application today, so history across releases is the [release increment](../../ROADMAP.md#4-release-updates-and-recover-from-failure).

## Automatic operations without a conversation

The projection allows `origin: null`. The log snapshot is the first such operation: it appears in the Logs view’s origin line as “started from this view”, in Overview’s Recent changes as “from the Logs view”, and under Evidence freshness. A failed automatic operation would appear in Overview’s Needs you with an **Investigate** link that drafts a question in the current conversation; the activity card in its view offers the same. Durable in-app notifications with unread state are the [ongoing-care increment](../../ROADMAP.md#5-ongoing-care-and-background-work) and are the intended home for these failures; Overview is the discoverable home until then.

## The stack in navigation and views

The 9 September stack brief asked for the sidebar and views to cover one application stack on one VPS: web and worker processes, PostgreSQL or embedded SQLite, Redis or Valkey when needed, queues, scheduled commands, persistent files and the care around them. The information architecture is now three groups:

- **Application:** Overview, Architecture, Deployment. Always present.
- **Stack:** Processes, Database, Cache & queue, Jobs, Storage. A row appears only when the recorded stack has that resource, so a static site shows Processes alone and the todo application shows Processes, Database and Storage. Opening a hidden destination from a link still works; it lists itself while viewed.
- **The reveal.** A quiet “Show more” row at the bottom of the destinations, just above Conversations, expands the hidden stack destinations as muted rows, each saying why: “not used” when the application does not use a resource Server Guy can record, “not available yet” when nothing can record it (Cache & queue, Jobs today), “after deployment” before inspection. Each revealed view explains what would appear there and offers “Ask in the conversation”, which drafts a question in the current conversation; there are no controls, because there is nothing to control. Overview’s “Not used” line links to the same reveal. Hiding keeps a simple application clean; revealing shows what Server Guy could take on.
- **Care:** Backups, Logs, Monitoring (formerly Observability), Domains, Environment Variables. Always present.

`src/server/application-stack.ts` derives the stack from the deployment record. The web process, PostgreSQL and its `database` volume come from the plan the executor runs. Worker processes, SQLite files, Redis or Valkey, queues, scheduled commands and file volumes come from an optional `stack` block on the record that nothing writes yet; the executor still deploys one web process plus optional PostgreSQL. The views for those resources exist and are exercised with a scripted record in the capture script only.

What each view binds to today:

| View | Real today | Unavailable, said so in the view |
| --- | --- | --- |
| Processes | The web process: command, image, port mapping, health path, verification state | Workers, restart counts, resource use per process |
| Database | PostgreSQL version, placement, private network, its volume | SQLite detection, measurements, connection management, restore |
| Cache & queue | Nothing recorded, so the row is hidden | Redis or Valkey facts, queue backend, backlog (never invented) |
| Jobs | Nothing recorded, so the row is hidden | Schedules, next run, last result, Run now, pause |
| Storage | The PostgreSQL volume and its mount | Sizes, file volumes, cleanup |
| Backups | What needs protection, derived from the stack, each marked not backed up | Destinations, schedules, restore tests |
| Monitoring | What would be watched, counted from the stack | Checks, issues, external providers |
| Architecture | Source, application, host, PostgreSQL | Cache and worker nodes appear once recorded; SQLite as a database node |

Overview's Running block lists processes, database, cache and queue, jobs and storage from the same derivation, names what needs protection, and says in one muted line which of cache or queue, workers and scheduled jobs the application does not use.

## What is real and what is a placeholder

Real: the deployment record in all its states, its approval with real inputs and price recheck, retry and cancel, the recorded reply anchoring, cross-conversation mentions, the log snapshot time, navigation marks, the work strip, parked conversations, Overview’s condition and freshness from the record.

Placeholders, clearly labelled “Not implemented yet” in their views: database measurements, backups (R2/S3 connection, schedule, restore tests), continuous monitoring and issues, external notification providers, domains and HTTPS, variable editing, process health, queue backlog, scheduled-command execution and history, volume sizes. Their Overview rows read “No evidence” and their views show only recorded facts. No simulated value appears on product routes; the richer stack screenshots come from a scripted record in `tests/browser/conversation-first.capture.mjs`.

## Verification

- `npx tsc --noEmit`, `eslint` and `prettier` on the changed files; `vitest` for `operation-record.test.ts` (projection, marks) and the existing chat, record-reference and inspector tests.
- Browser journeys: `application-shell.spec.ts` (drafts across navigation and reload; the deployment journey now approves in the receipt, recovers a rejection there, and sees the marks change), `workspace-navigation.spec.ts` and `activity-history.spec.ts` with the Record under Deployment.
- Manual walkthrough on an isolated QA fixture and read-only against the real record of the 8 September deployment. `node tests/browser/conversation-first.capture.mjs http://127.0.0.1:<port> simple|rich` captures both stack scenarios into `tests/results/conversation-first/`.

## Unresolved decisions

1. Whether the legacy step bar and Record should be retired from the shell rather than parked; the roadmap lists phase-ceremony removal separately.
2. Account-level seen state once user identity exists.
3. Whether a failed automatic operation should create a linked conversation on Investigate, or only draft into the current one as now; the planned notification record should own that link.
4. Release history: the record supports one initial deployment, so “Earlier work” only ever shows the log snapshot today.
5. Who writes the recorded stack: the executor should record worker processes, services, queues, jobs and volumes when it actually runs them (see the [runtime and care work in Roadmap](../../ROADMAP.md#delivery-sequence)); until then the Cache & queue and Jobs rows never appear on product routes.
