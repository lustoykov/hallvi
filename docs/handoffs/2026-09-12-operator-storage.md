# Handoff: application operator redesign

Prepared 12 September 2026 for continuing on the owner's main PC. This document records the handoff; [ROADMAP.md](../../ROADMAP.md) remains the single sprint checklist.

## Start here

The owner tried the new UI using `docker/getting-started-app` and reported: “Yea, it works perfectly.” The storage/presentation checkpoint is implemented and user-tested. Finish the PR handover, then work on the separate **Hetzner provisioning** checkpoint. Do not restart architecture planning or combine provisioning with the entire first deployment implementation.

- Repository: https://github.com/lustoykov/server-guy
- Open draft PR: https://github.com/lustoykov/server-guy/pull/55
- Branch: `codex/operator-data-model`.
- Implementation commits before this handoff: `505d99f` and `cd04a74`.
- Base/main when checked: `5426bbc` (the previous execution checkpoint).
- PR #55 is open, draft and mergeable at handoff. It has **not** been merged. User feedback accepts the UI; this handoff request did not itself change GitHub PR state.
- Read [operator design](../operator-design.md), [roadmap](../../ROADMAP.md), [architecture](../architecture.md) and [checkpoint evidence](../testing/2026-09-12-operator-storage.md). Sections explicitly marked as previous architecture are historical, not requirements to restore.

On the other machine, fetch and check out the PR branch rather than starting from main:

```sh
git fetch origin
git switch --track origin/codex/operator-data-model
```

If the branch already exists locally, switch to it and inspect its state before updating it. Check the PR's latest state; these observations are dated.

## Product direction to preserve

Trust Pi's judgment. The product's value is clear, delightful presentation and eventually always-on application care. Pi uses general tools to investigate, deploy, configure and correct failures; workflow-specific gates must not dictate how it works.

- One writable main conversation per application. Side conversations have read-only tools. The worker currently serializes turns globally.
- Exactly three application permission modes: **Always ask**, **Pi decides** (default), **Bypass**. No special provider/spending exception. In Pi decides, Pi can explicitly ask for a decision.
- Approval pauses the original live tool call, shows an inline card, and continues or declines after the UI decision. No reissued-command hashing, durable suspension/replay or dedicated recovery engine.
- Executor records factual execution evidence automatically. Pi chooses what knowledge and outcomes are worth saving and surfacing.
- Preserve the sidebar as guidance about caring for an application. Pi chooses relevant information within product-owned layouts/components; it does not generate arbitrary UI.
- Server selection belongs inside application preparation/deployment, after Pi understands the repository. Do not reintroduce a standalone “Connect server” button with SSH file paths.
- Queue/steer, expanded side-chat interactions, ongoing monitoring, error-detection scripts and detailed per-sidebar capabilities are deferred until the core deployment journey works.
- Deliver small reviewable checkpoints: storage → provisioning → first lightweight deployment → medium app → more complicated app → per-view care/hardening.
- The owner explicitly authorized deleting obsolete code/tests and disposable development data. Avoid compatibility migrations and speculative hardening. Preserve credentials and environment configuration. Do not leave fake test applications in the normal workspace.
- Use focused verification and actual model/journey evidence when useful. The owner does not use CI as a merge gate. Do not rebuild exhaustive legacy test matrices.

## Implemented data model

Schema 15 contains exactly four application tables:

| Table | Responsibility |
| --- | --- |
| `applications` | Identity, repository ID/latest access check, permission mode, optional host connection with controller credential references and optional provider identity. |
| `conversations` | Main/side identity, native session reference, current status and current response pointer, timestamps. |
| `messages` | User-facing text, structured references, streaming/completion state and response delivery metadata. |
| `saved_information` | Title/body, scoped evidence, establishment timestamp, optional presentation, update/retirement timestamps. |

There is **no `pi_runs` table**. `pi-runs.ts` and the `PiRun` type remain a worker/API projection of an assistant response. The response ID is the execution log's `runId`. Avoid interpreting that name as a fifth persisted entity. Message state preserves partial text across refresh; conversation state tracks current activity. A worker restart interrupts started replies without replaying commands. A second message in a busy conversation is rejected; queue expansion is deferred.

Messages have `body` plus supported `blocks`: text, a saved-information reference, or an execution reference. Full Pi/tool history remains native JSONL. Executor files retain commands, target, mode, output, outcomes and approval references. The web process writes a separate decision file; it does not append to the worker's execution file.

Saved information without presentation is working knowledge for Pi. Presentation chooses views, role, status, checks, next step and an optional application URL. The same record renders in chat and selected views. Ordinary knowledge may update in place; separate historical events get separate outcome records. No universal supersede/version-history machinery. Saved preferences cannot override permission settings.

Credentials stay in controller-managed storage. The application stores references, not secret values. Named per-application secret generation/injection is a later deployment need, not completed functionality.

## Useful code entry points

- `src/server/db-schema.ts`, `db.ts`, `operator-data.ts`: schema, persistence and shared record shapes.
- `src/server/pi-runs.ts`: response acceptance/claim, partial persistence, completion, cancellation and interruption.
- `src/server/pi-worker.ts`, `pi-sessions.ts`: serialized worker and native history lifecycle.
- `src/server/operator-execution.ts`: host SSH Bash, three modes, execution files, live approvals.
- `src/server/pi.ts`: main/side tool registration and operator guidance; `search_information` and `save_information` tools.
- `src/server/saved-information.ts`: search/save/update/retire and message references; validates evidence ownership.
- `src/server/operator-view.ts`: public view with surfaced information and execution evidence.
- `src/components/server-guy/information-card.tsx`: rich cards; `chat-pane.tsx` and `application-section-view.tsx` place them.
- `src/components/server-guy/operator-console.tsx`: execution/approval cards and permissions. Execution references share the conversation snapshot instead of each polling independently.
- `src/server/hetzner.ts`: retained provider connection/API primitives to inspect for the next checkpoint. Its existence does not mean the new provisioning journey is implemented.
- `src/server/backup-connection.ts`: retained object-storage credential settings, separated from retired backup execution.

Approximately 28,000 lines of retired deployment/operation execution, migration/recovery machinery and tests were deleted. Some old domain types/pure projections remain for isolated visual-reference screens. Live views use shared information. Do not mistake the reference screens for current backend capabilities.

The old workflow/decision live-eval runner was retired; `npm run eval:pi` explicitly exits with an explanation. Historical saved-answer judging remains. The testing dashboard's old live-case catalog is historical. Only the current browser smoke subset was verified; other legacy browser scenarios may need retirement or adjustment when their areas enter scope.

## Verification already completed

See the [checkpoint evidence](../testing/2026-09-12-operator-storage.md) for scope and limitations.

- 387 application tests passed; one opt-in Docker test skipped.
- TypeScript, production build, lint and formatting passed. One pre-existing hook warning remains in `architecture-prototype/journey-v2.tsx`.
- All five browser smoke journeys verified: four passed in the suite; navigation passed a targeted rerun after updating retired-panel expectations.
- Rich verified/failed cards survived refresh in chat and Deployment, using isolated fixture data.
- Pending approval survived database close/reopen and continued the same call after approval; decline/cancel and three modes passed.
- One real Pi request in an isolated database saved an outcome and attached its card in two model calls. It ran no host commands and deployed nothing. Temporary data was removed.
- The owner then manually tested the normal UI with Docker's getting-started app and reported it works perfectly. Do not infer that every suggested manual subtest or any actual deployment was verified.

Useful commands: `npm test`, `npm run test:e2e:smoke`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Tests need Node 22; browser tests need Chromium (`npx playwright install chromium`). Avoid repeating all checks without a relevant change or unresolved concern.

## Machine-specific state

The source machine checkout is `/Users/lyubomirstoykov/projects/server-guy`. Node was supplied by `$HOME/.local/share/server-guy-runtime/node-v22.23.2-darwin-arm64/bin`; this path is machine-specific. `rg` was unavailable, so searches used Python/grep. Use the main PC's available tools rather than reproducing these limitations.

The app and worker were restarted on schema 15. Local Next runs on `127.0.0.1:3000`; the desktop browser's `localhost:63840` address is a source-machine proxy, not a portable endpoint.

The normal DB was reset with explicit authorization, preserving `.env.local` and saved account configuration. It now contains the owner's real UI test application:

- Name: Docker Getting Started.
- Repository: https://github.com/docker/getting-started-app
- Application ID: `4bda8854-c194-41e5-9bf2-d0766c6b9e77`.
- Main conversation: `28e8d83e-ecea-4be7-8681-859635f797d8`; idle when checked.

This is user-created data, not the old fake fixture. It is local and **not in Git**. The previous fake `test/operator-check` application and temporary local SSH server were removed. Earlier output “Darwin” came from commands on the development Mac, not a cloud deployment.

Credentials, `.env.local`, SQLite, native sessions and execution logs do not travel with the PR. A fresh database on the main PC is sufficient to continue development; configure its environment/account connections there. If the owner wants conversation continuity, treat SQLite and its native-session/execution files as a set and stop writers before copying. Do not commit or print credentials.

For a fresh checkout: install dependencies, run `npm run db:push`, then run `npm run dev` and `npm run worker` in separate terminals. Both processes must use the same database/configuration; export a custom `SERVER_GUY_DB_PATH` for schema setup too if using one. Old schemas have no migration path in this redesign. Do not blindly rerun the source-machine reset on another machine.

Unrelated source-machine working files were deliberately left out of the PR: modified `next-env.d.ts` and untracked `desktop-screenshot.png`. Do not include or delete them as checkpoint work.

## Next checkpoint

First check PR #55's latest review/merge state. The owner has accepted the UI. Finalize that checkpoint through the repository's current review process, and update ROADMAP.md on merge with the actual commit/PR reference. Keep checklist items unchecked until merged.

Then design and implement the smallest Hetzner provisioning interaction within the main conversation: inspect the repository, choose a suitable host through Pi's judgment and general tools, apply the selected permission mode, retain controller-owned credentials, save host/provider identity, and show the meaningful outcome. Review it before completing deployment. No provider resource has been provisioned by this checkpoint.

Use `docker/getting-started-app` as the current small candidate; Grafana was considered but is a much larger source repository. A useful follow-up is the first verified deployment with a saved reachable URL and evidence. Database-backed and multi-service examples come afterward. Do not add monitoring, new approval modes, workflow-specific recovery tools or conversation-control infrastructure as prerequisites.
