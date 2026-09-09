# Final UI screens: the reference prototype

9 September 2026, Fable. Worktree `.worktrees/final-ui-screens`, branch `claude/final-ui-screens`, started from the combined state of `codex/self-hosted-shell` (snapshot commit `e847fb0`). This is the complete visual and interaction reference for Server Guy: every page, application view, settings screen and important dialog, in the accepted [conversation-first design language](../../src/components/server-guy/DESIGN.md), with invented data where the backend does not exist yet. It is separate from PR #21 and is the reference Codex integrates against.

## Running it

```sh
npm install
npm run db:push          # only the real settings screens need the database
npm run dev -- --port 3300
```

Open <http://127.0.0.1:3300/prototype>. The index lists every flow, every scenario step and every other screen, each one link away. The routes under `/prototype` exist in development only and answer 404 in production.

- `/prototype/app?scenario=simple|rich&step=N&section=<view>&chat=<id>` opens the workspace at a scenario step. The bar at the bottom (“Prototype · invented data”) switches application and step, plays the scenario forward, resets it and links back to the index. It is the only prototype-only surface; everything above it is the product’s own component tree.
- `/prototype/applications` (`?state=empty|no-chatgpt`), `/prototype/new` (`?state=no-github`), `/prototype/settings/connections` (`?state=connected|expired|fresh`).
- `/setup/pi`, `/setup/github`, `/setup/execution` are the real settings screens, shown in whatever state this controller is in.

`node tests/browser/reference.capture.mjs http://127.0.0.1:3300 [quick]` captures every step, view, interaction and the mobile layout into `tests/results/reference/` (98 screenshots, UTC clock) and fails on any page error.

## How the reference is built

The workspace is `ReferenceShell` (`src/components/server-guy/reference/reference-shell.tsx`): the same navigation, chat pane, receipts, activity cards, Overview and views the product mounts in `operator-shell.tsx`, fed by a scenario instead of the API. A scenario is a list of steps; each step has a clock and a function that mutates the state (application, deployment record with a recorded stack, facts, operations, conversations, messages). `stateAt(scenario, n)` replays the steps deterministically, so every URL is reproducible and server and client render the same ids.

Interactions mutate an in-memory overlay on top of the replayed state. Decisions (approve, retry, cancel) and Investigate jump to the scripted step that shows their outcome, so the user sees the real consequence rather than a generic “done”. Everything else (run a job, pause, measure, refresh logs, back up now, test a restore, acknowledge, ask a question, new conversation, archive) applies immediately, and a tick advances the clock so relative times move.

Nothing in the reference touches a host, a provider, the database or the real deployment endpoint. No fact from it can appear on a product route: the product passes real facts (none yet for most capabilities) and the views show their honest placeholder states.

## Screen inventory

| Screen | Where | States covered | Gaps |
| --- | --- | --- | --- |
| Applications | `/prototype/applications`, real `/applications` | Populated (running, running with an open issue, not backed up, protected); empty first run; ChatGPT not connected | Sorting and search once there are many applications |
| Add application | `/prototype/new`, real `/new` | Repository or upstream image, name, permission policy; GitHub not connected blocks the form | The real form is used; no staged “reading the repository” or “repository unreadable” state |
| Workspace · conversation | `/prototype/app` | First deployment (inspecting, recommendation, deploying, verified), proposals with cost and inputs, protected inputs, working steps, inspected evidence, failed with recovery inputs, recorded events, references to work started elsewhere, investigation conversations adopting automatic work, new conversation, archived (read-only) | The reply interpreter answers only status, logs, backups, jobs, releases and domains |
| Overview | section `overview` | Healthy, open issue, acknowledged issue, failed automatic work, stale host, unprotected and protected, recent changes, evidence freshness | — |
| Architecture | `architecture` | Simple (source, application, host, SQLite volume) and rich (PostgreSQL, Valkey, worker) | Nodes do not yet reflect a failing process |
| Deployment | `deployment` | Waiting for approval, deploying, serving, candidate detected, release requested, releasing, release history, preparation | Roll back is described, not designed as an action |
| Processes | `processes` | Web only; web and worker; healthy, unhealthy (stopped), restarting, verified | Resource use per process |
| Database | `database` | PostgreSQL measured and unmeasured; embedded SQLite; backed up and not; measure now | Connection management, restore from here |
| Cache & queue | `cache` | Valkey broker with persistence and queue observation; hidden when unused; revealed as “not used” | Queue depth is one observed row, not a history |
| Jobs | `jobs` | Three schedules with next run and last result, run now, pause and resume, running now, recent runs with revision and output, queued work | Schedule editing lives in conversation only |
| Storage | `storage` | Volumes with size and protection, instance disk, measured and not measured | Cleanup suggestions |
| Backups | `backups` | Not backed up; proposal pending; setting up; verified with coverage, restore test and history; failed upload with the last good copy; behind policy; recovered; back up now; test a restore | Restore into production (needs its own authority) |
| Logs | `logs` | Per-service streams, snapshot with filter, refresh, retention, redaction; while deploying | Live tail, saved filters |
| Monitoring | `monitoring` | All passing; failing check; open, acknowledged and recovered issues with evidence; resources; host collector running, stale, unreachable; notification providers not connected | Provider configuration flow |
| Domains | `domains` | Instance address only; pending DNS with the one step for you; DNS resolved, certificate pending; HTTPS live with renewal and redirect; routes | CDN configuration |
| Environment Variables | `variables` | Scope, source, hidden values with change times; a pending value requested in the conversation; rotated | Editing here (by design it happens in conversation) |
| Revealed stack views | “Show more” | Each hidden destination explains what would appear and offers “Ask in the conversation” | — |
| Settings · Connections | `/prototype/settings/connections` | ChatGPT, GitHub, Hetzner, Cloudflare R2, S3, Cloudflare DNS; connected, expired, failing, fresh install | Prototype only; the product still has one screen per provider |
| Settings · ChatGPT & model, GitHub, Execution | `/setup/*` | The real screens in the state of this controller (not connected) | No staged connected or expired states |
| Application picker | Any workspace screen | Switch, add, remove | — |
| Remove application | Picker | Typed confirmation, cancel | — |
| Edit setup, Change revision | Real product dialogs | Not staged: they call real endpoints | Would need scenario hooks |
| Check details drawer | Retired | Belonged to the preparation record, which the reference retires from the workspace | — |

Mobile (390 px): the navigation collapses to a horizontal strip, conversations follow it, views stack their tables with column labels.

## Scenarios

**Status page** (`simple`, 16 steps): Uptime Kuma from its upstream image, embedded SQLite, one volume, one CX22.

1. Application added · 2. Deploy requested (read-only inspection) · 3. Recommendation with price · 4. Approved, deploying · 5. Deployment verified (facts appear) · 6. Backup proposal (consistent SQLite copy) · 7. Backups verified · 8. Domain requested (one DNS step) · 9. HTTPS live · 10. Down at night (issue recorded, nobody watching) · 11. Back on its own (gap kept, unread until seen) · 12. New revision available · 13. Release requested · 14. Release verified · 15. Host unreachable (stale, nothing inferred) · 16. Host back.

**Document archive** (`rich`, 27 steps): Paperless-style stack with PostgreSQL 16, a Valkey broker, a Celery worker, three scheduled commands and 15 GB of documents on one CX23.

1. Running for a day, not backed up · 2. Ask for protection · 3. Inspected · 4. Backup proposal with one protected input and cost · 5. Approved, setting up · 6. Uploading the first backup · 7. Backups verified · 8. A nightly upload fails (automatic, no conversation: issue, red mark, last good copy kept) · 9. Investigate (adopts the automatic work into a linked conversation) · 10. Retrying with a new token · 11. Backup recovered · 12. The worker stops (queue backs up) · 13. Investigating the worker (diagnosis, one proposal) · 14. Applying the limit · 15. Worker back · 16. New revision available · 17. Release requested · 18. Releasing · 19. Release verified · 20. Domain requested · 21. DNS resolves, certificate pending · 22. HTTPS live · 23. Rotate a secret (protected input) · 24. Applying · 25. Rotated · 26. Host unreachable · 27. Host back.

Every step is an entry in the index and a URL; the capture has a screenshot of each.

## Decisions made in this pass

- **Investigate has one meaning.** On an issue card, on a failed automatic operation in a view, and in Overview it opens a linked conversation that adopts the automatic operation: the conversation starts with the recorded event, the operation’s origin points there, marks follow. This settles the third open decision of the [integration report](2026-09-09-conversation-first-integration.md). Only when nothing can be adopted does it fall back to drafting a question in the current conversation.
- **An issue carries its operation.** Overview shows the issue card (Investigate, Acknowledge) and not a second card for the failed operation it records. Recovered issues have no Investigate; they link to their conversation if one exists.
- **Automatic work says so.** Origin lines and Recent changes read “automatic” for checks, backups, jobs, releases and issues instead of “started from this view”.
- **Retired.** The `/explore` route and its components, the older chat-views prototype, and the legacy step bar and preparation record inside the workspace (the Deployment view’s Preparation block replaces them). The product still parks the legacy surfaces; removing them is Codex’s call.
- **Applications list** shows condition, stack summary, what needs you and protection per application; `src/server/application-list.ts` now feeds the real `/applications` route from the deployment record.
- **Connections** is proposed as the one settings screen for provider accounts (purpose, scope, state, what uses it, renewals); the per-provider screens stay until it is wired.
- **Times** render in the reader’s zone through `LocalTime`; schedules state their own timezone next to the time.

## Handoff: reusable, simulated, and what integration needs

**Reusable now (product code, no prototype dependency):**

- `src/server/application-facts.ts`: the facts contract per capability (`ProtectionFacts`, `MonitoringFacts` with issues, `DomainFacts`, `VariableFacts`, `ReleaseFacts`, `LogFacts`, `DatabaseFacts`, `StorageFacts`, `JobFacts`) and `ViewAction`, the union of everything a view can start. A view renders its finished design when facts exist and its honest placeholder otherwise; a view without an action handler shows the fact and no control.
- `src/components/server-guy/views/*` and `bits.tsx` (Condition, Pill, Facts, Planned, Possible, When): every view above. `application-section-view.tsx` routes sections to them and threads facts, actions and the Investigate adoption. `application-overview.tsx` composes issues, attention, running facts, recent changes and freshness from the same inputs.
- `operation-decision.tsx`: the generic approval or recovery form inside a receipt (inputs, cost, retry and cancel) for any operation; the deployment keeps its own `deployment-decision.tsx` until the decision endpoint is generic.
- `applications-screen.tsx` with `application-list.ts`; `connections-screen.tsx`; `settings-nav.tsx` accepts a Connections link.
- `operation-record.ts`, `operation-model.ts`, `operation-receipt.tsx`, `destination-activity.tsx`, `application-stack.ts`, `application-sections.ts`, `application-navigation.tsx`: unchanged in shape from the integration branch, with the small behaviour changes listed above.
- Styles appended to `application-shell.css` (pills, conditions, tables, issues, meters, runs, streams, candidate card, mobile rules) and `pi-setup-screen.module.css` (connection states).

**Simulated (never imported by product routes):** `src/components/server-guy/reference/*` (scenario engine, both scenarios, data helpers, list and connection fixtures, shell, bar, index), `src/app/prototype/*`, `tests/browser/reference.capture.mjs`, `tests/application/unit/reference-scenarios.test.ts`. Every fact value, recorded stack block, issue, non-deployment operation, decision outcome, job run, measurement, backup, restore test, log line, candidate, certificate and reply in the prototype is invented.

**Backend capabilities integration will require, by view:**

| Capability | Records and producers | Actions to wire |
| --- | --- | --- |
| Recorded stack | The executor writes `record.stack` (worker processes, SQLite files, Redis or Valkey, queues, scheduled commands, file volumes) when it runs them; until then Cache & queue and Jobs never appear on product routes | — |
| Operations beyond deployment | Durable `ApplicationOperation` records for backup, restore, job, release, domain, variables, check, inspection and issue sources, with steps, evidence, `next`, `resolvedById` for retries, `origin` and `mentions` | A generic decision endpoint (approve, retry, cancel with inputs) behind `OperationDecisionCard` |
| Issues and notifications | Durable issue records: title, impact, evidence, next, source, linked operation and conversation, open/acknowledged/recovered, unread; deduplicated signals; recovery recorded separately from acknowledgement | `acknowledge-issue`; `investigate-issue` creates the linked conversation, posts the recorded event and re-points the operation’s origin |
| Monitoring | Host collector with observation time and reachability; checks (http, process, disk, job) with last result; resource samples; provider list | `verify-now` |
| Protection | Destination, policy with timezone and retention, coverage per state item, attempts with outcome and size, restore tests with recovery point, history | `run-backup`, `test-restore` |
| Domains | Address, domain with DNS state, certificate with issuer, expiry and renewal, redirect, routes, CDN observation | Domain and HTTPS changes stay conversation operations |
| Environment Variables | Variable list with scope, source, hidden values and change times; pending values requested by an operation | Values are provided in the receipt, never in the view |
| Releases | Serving revision with verification, candidate detection from pushes with check results, release history with outcomes, preparation facts | `deploy-candidate`; `roll-back` needs a design of its own |
| Logs | Streams per service with counts and last lines, bounded snapshot with collection time, retention, redaction | `refresh-logs` per service |
| Database and storage | Measurements with time (size, rows, connections, growth), volume sizes and instance disk | `measure-database` |
| Jobs | Schedules with next run, paused state, last run; runs with revision, duration, outcome and bounded output; running set; queue observation (backlog, oldest waiting, failures) | `run-job`, `pause-job`, `resume-job` |
| Conversations | Recorded event messages, references to work started elsewhere for every operation type (deployment mentions exist), archive (exists) | The chat send path answers from facts and refers to existing work instead of starting duplicates |
| Applications list | Condition, attention count and protection summary per application from facts | — |
| Settings | A connections registry (provider, scope, state, expiry, what uses it) behind the Connections screen; account-level seen state once identity exists | — |

## Verification

- `npx tsc --noEmit`, `eslint`, `prettier --check` on the worktree; `npm test`: 78 files, 827 tests passing (2 files and 15 tests skipped as before).
- `tests/application/unit/reference-scenarios.test.ts`: both scenarios replay deterministically, decisions and investigation jump to the right steps, marks and issues derive as designed.
- Browser: the capture script drives every step, view and interaction (run a job and watch it finish, ask about backups and get a reference chip, ask for logs, Investigate from Overview, approve a proposal with a token, the picker, the remove dialog, archive a conversation, three mobile screens) with zero page errors. Manual checks covered navigation between conversations and views with the conversation parked, scrolling in long views and the transcript, the reveal at the bottom of the sidebar, and the failure and recovery paths of the rich scenario.

## Remaining gaps

- The three per-provider settings screens have no staged connected or expired states; the Connections screen shows those states instead.
- Add application has no staged intermediate states; Edit setup and Change revision are the real dialogs and are not staged.
- Roll back is a sentence in the Deployment view, not an action; restore into production is deliberately absent.
- Queue backlog is one observed row; no history or alerting design.
- External notification providers appear as not connected; there is no configuration flow.
- Account-level seen state and per-user unread issues wait for identity.
- The real `/applications/[id]` route shows placeholder states wherever facts are missing; that is by design until the producers above exist.
