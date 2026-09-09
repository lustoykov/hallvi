# Operation coordination acceptance — 9 September 2026

Candidate: `codex/operation-records`, based on merged PR #21 (`36f18bf`). The [architecture](../architecture/agent-directed-operations.md) is the current mechanism; the [Fable brief](../design/2026-09-09-operation-record-brief.md) records the design discussion.

## Implemented

- Schema v13 durable application operations, with one working change per application enforced by SQLite. Read-only inspections remain concurrent.
- Approved work queues behind an existing change. Settlement advances the oldest approved operation. Changed recorded assumptions return it to a proposal; executor claim checks them again.
- Duplicate unresolved outcomes retain one operation and record cross-conversation mentions. History, receipts, Overview, navigation and model context consume the same operation records.
- Generic approve/retry/cancel decisions compare `updatedAt`. Cancellation retains history; retries retain the failed attempt and link its successor. Initial deployment keeps its dedicated source/price/secret approval checks. Its unstarted queued intent can be cancelled through the common endpoint.
- Existing source preparation/publication commands can execute from the persistent queue. A request that loses the claim race follows the saved result instead of replaying work.
- A dead worker releases work known not to have begun external effects. Unknown outcomes hold the queue pending reconciliation. A reconciliation retry that fails before reaching the provider retains that original hold.
- The model gets live application operation context and three typed tools. No other conversation transcripts are included. Local-record inspection is explicitly distinguished from remote health verification.
- History sits after Deployment with All, Changes, Inspections, Automatic and Needs you filters. The rich prototype includes queued work, changed assumptions and retained cancellation at steps 27–29 (zero-based URLs).

## Verification

- `npm test`: **850 passed**, 15 existing opt-in tests skipped, across 80 passing test files and two skipped files.
- `npm run build`: passed on the final implementation.
- TypeScript and lint/format checks passed.
- Store integration tests exercise independent-process approval races, FIFO, concurrent inspection, stale facts at advancement and claim, duplicate mentions, stale/cross-application decisions, cancellation, worker recovery, lost outcomes, failed reconciliation, dispatcher ordering, request/worker claim races and database reopen.
- Migration tests preserve populated older databases and verify v12 PID guards become preserved legacy guards alongside the new durable store. History import retains source dates instead of implying fresh verification. Distinct log snapshot records survive later collection.
- `node tests/browser/operation-history.capture.mjs http://127.0.0.1:3270`: passed filters, retained cancellation, direct navigation to the blocking receipt, renewed approval and a 390 px mobile layout. This script uses invented reference data and blocks API calls.
- The actual local v12 database was backed up privately and migrated to v13. Its real application and recorded deployment load in History without browser errors. Dev server and worker run against the same migrated database.
- Screenshots are generated under `tests/results/operation-history/` (ignored runtime artifacts).

## Boundaries

This is coordination infrastructure for the existing first-deployment and source-preparation executors. Backups, restarts, scheduled jobs, later releases and monitoring in the rich prototype remain simulated. No new provider purchase, deployment or live-model semantic evaluation was performed for this change. Browser screenshots of the real application show retained deployment evidence, not a new claim that the remote host was checked today.

The controller remains local-only. There are no cross-application locks, parallel resource groups, external notifications or new application-job runtime. Historical log text is retained privately in each snapshot; the current Logs view still opens the latest collection.
