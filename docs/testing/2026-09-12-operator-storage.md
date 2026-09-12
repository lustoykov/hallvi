# Four-table operator checkpoint — 12 September 2026

Implementation in [draft PR #55](https://github.com/lustoykov/server-guy/pull/55) on `codex/operator-data-model`; not merged. This checkpoint changes storage and shared presentation. Hetzner provisioning and first deployment are the next two separate review checkpoints.

## Result

Schema 15 has exactly `applications`, `conversations`, `messages` and `saved_information`. Application settings and repository access live on the application. Conversations keep current status and response identity; response completion and streaming text live on messages. The worker's `PiRun` is a projection of a response for existing execution/API consumers, not another database entity. One worker remains serialized; extra messages in a busy conversation are rejected until it finishes or is cancelled. Queue/steer expansion remains deferred.

Pi can search, save, update and retire shared information. Presentation is optional, and surfaced records can be referenced from a message and selected sidebar views. Rich cards render statuses, checks, next steps, URLs and evidence links through product-owned components. Execution references load executor files, with one shared conversation snapshot rather than a polling request per card. Pending approvals still wait on the original live call.

Deleted the old deployment/operation stores and executors, decision and observation/activity storage, migration and quarantine machinery, and tests/eval scripts that exercised those retired workflows. Pure visual-reference fixtures remain available independently of live storage. The old live workflow eval command reports its retirement instead of silently running obsolete cases; retained answer review remains available.

## Verification

- Application suite: 387 passed, one optional Docker test skipped.
- TypeScript and production build passed.
- Lint and formatting passed; one existing React hook warning remains in the architecture reference prototype.
- Storage integration: application creation/access check, persisted permissions, accepted-response identity, single active work, partial response after database reopen, completion, interruption without replay, scoped saved records, retirement, and application deletion cascades.
- Execution integration: a pending approval remains loadable after SQLite is closed/reopened and resumes the same call after approval; decline/cancellation and all three modes still work.
- Browser smoke: all five journeys verified (four passed in the suite; the navigation journey passed its targeted rerun after replacing obsolete panel assertions). Rich verified/failed cards in chat and Deployment survive refresh. Fixture data lives only in a disposable browser-test database. Screenshots are generated under `tests/results/operator-information-*.png`.
- Real Pi: one isolated request used `save_information`, saved an outcome and attached its card reference. The response succeeded in two model calls. No host commands, provisioning or deployment occurred; the fixture database was deleted afterward.

The normal local application database was reset to the four tables, removing the old fake fixture. Afterward, the owner added `docker/getting-started-app`, tested the UI and reported “it works perfectly.” This user-created application remains in the local database. `.env.local` and existing account/credential configuration were checked unchanged. App and worker restarted successfully.

## Try it

Add a real repository, then ask Pi to save a recommendation in Overview and show it in chat. Refresh, open Overview and inspect the same card. Set Always ask before running a workspace command to try a pending approval across refresh. Server selection is still the upcoming provisioning checkpoint.
