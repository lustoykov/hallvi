# Execution evidence reader — 29 September 2026

Candidate: `codex/execution-history-cache`, based on `cc6db62190d80ee2bc385aee90999f2fdbe5bd77`. The PR identifies the tested head. Node 22.23.2, macOS arm64. All records and application commands used here are disposable, synthetic fixtures; no retained controller, account or deployment was opened.

## Repeatable measurement

Run `node --import tsx scripts/benchmark-execution-reader.ts` with Node 22. It creates and removes its own fixture under `work/` and prints JSON. There are 2,000 execution records, roughly 3,853 output characters each, in one application history. Each wave has 1, 5 or 10 simultaneous readers. Baseline uses the previous synchronous list algorithm; async uses the production reader. Baseline and warm stages have five samples; cold and one-update stages have one each.

Counts measure file-content read calls and JSON parses, not physical disk sectors. The OS page cache is uncontrolled. Read mode isolates evidence retrieval; response mode adds serialization of the full execution array for each caller. Neither includes SQLite, Pi transcripts, HTTP transport or browser rendering. These are evidence-component costs, not full chat latency or production throughput.

### Count evidence

Counts below are per wave and identical in read and response modes.

| Readers | Baseline reads / parses | Async cold reads / parses | Async warm reads / parses | One changed record reads / parses |
| --- | --- | --- | --- | --- |
| 1 | 2,000 / 2,000 | 2,000 / 2,000 | 0 / 0 | 1 / 1 |
| 5 | 10,000 / 10,000 | 2,000 / 2,000 | 0 / 0 | 1 / 1 |
| 10 | 20,000 / 20,000 | 2,000 / 2,000 | 0 / 0 | 1 / 1 |

Each coalesced async wave still scans the directory once and checks 2,000 file versions. Cold adds 2,000 post-read metadata checks; one update adds one. This slice does not eliminate scanning. The benchmark asserts the content-read and parse counts, with no timing thresholds.

### Timing observations

All values are milliseconds. Wave p50/p95 measure completion of all readers; loop maximum is the largest sampled event-loop delay across that stage. Timings are one machine/run and can vary.

| Mode | Readers | Stage | Wave p50 | Wave p95 | Max loop delay |
| --- | --- | --- | --- | --- | --- |
| read | 1 | synchronous | 38.53 | 46.39 | 47.78 |
| read | 1 | async-cold | 75.69 | 75.69 | 2.86 |
| read | 1 | async-warm | 15.38 | 16.50 | 4.10 |
| read | 5 | synchronous | 175.47 | 180.08 | 181.40 |
| read | 5 | async-cold | 68.43 | 68.43 | 2.60 |
| read | 5 | async-warm | 15.53 | 15.85 | 4.06 |
| read | 10 | synchronous | 355.39 | 356.39 | 357.30 |
| read | 10 | async-cold | 63.64 | 63.64 | 3.09 |
| read | 10 | async-warm | 15.89 | 16.67 | 3.80 |
| response | 1 | synchronous | 46.34 | 47.15 | 47.64 |
| response | 1 | async-cold | 78.41 | 78.41 | 9.54 |
| response | 1 | async-warm | 24.15 | 27.34 | 9.88 |
| response | 5 | synchronous | 243.25 | 276.71 | 278.13 |
| response | 5 | async-cold | 118.48 | 118.48 | 43.68 |
| response | 5 | async-warm | 59.05 | 59.22 | 44.60 |
| response | 10 | synchronous | 443.43 | 451.26 | 452.72 |
| response | 10 | async-cold | 145.89 | 145.89 | 83.23 |
| response | 10 | async-warm | 94.63 | 95.56 | 82.44 |

The cold async scan is slower than one synchronous reader in this run, while yielding to the event loop. Warm scans avoid content reads and parsing. With ten readers, read-only wave p50 falls from 355.39 to 15.89 ms; adding serialization raises the warm wave to 94.63 ms and leaves an 82.44 ms loop delay. Caching does not make JSON serialization asynchronous.

## Behavioral evidence

- `execution-reader.test.ts`: shared list/single reads and an eight-job global I/O bound across two directories; independent caller objects; same-size atomic replacement with preserved mtime; running/completed output; additions, removal during a scan, and recreated storage; changed-during-read and invalid-JSON recovery; count/byte eviction without truncating returned history; notifications starting a fresh scan instead of joining an older one.
- Existing operator execution, repository transfer, saved-information, deployment-watch, Pi tool and Pi owner checks exercise async propagation with real disposable SQLite and the installed Pi session packages, with model/provider behavior scripted.
- The CLI browser journeys passed against the real app and worker with a scripted model: apps → exec → wait → inspect, full execution detail, request identity, timeout/interrupt semantics, and browser approval continuing the same request. The fixture used ports 3936–3937 and cleaned up its own controller state. A separate diagnostic fixture used port 3938 and was stopped after inspection.

The first browser run failed because Playwright's `FORCE_COLOR` conflicted
with inherited `NO_COLOR`, putting a Node warning in the CLI's expected-empty
stderr. The CLI fixture now removes `FORCE_COLOR` from its subprocess
environment. The approval timeout recurred on another cold fixture. A standalone reproduction
measured 9.51 seconds from browser request to response. Next logged 4.4 seconds
for the decision request: 2.9 seconds in Next, 1.5 seconds in its proxy and 27 ms
in application code; other cold requests also occupied browser connections.
The existing fixture warm-up now includes operator, connections, secrets and
decision routes using GETs against missing IDs (the POST-only decision route
returns 405 and performs no approval). The interaction timeout and product
approval semantics remain unchanged.

The final run with fixture warm-up and the original colour environment passed
both CLI journeys (15.0 s and 11.7 s). The diagnostic fixture matched request
and operation `0d0ddfce-87a9-4b6b-a21d-f56891b217f3` to execution
`c868bc81-cca1-4e24-8b71-735a9db5b629` in application
`c712117e-b7ae-41a1-ada3-5b1011ccb421`; the approval completed and CLI wait
reported `completed`. The fixture and previews were stopped, with ports
3936–3938 closed and no checkout preview reported by the cleanup check.

Checks: 58 selected application tests in seven files, six of them focused
reader cases; `npx tsc --noEmit`; `npm run lint` (36 existing warnings, no
errors); `npm run format`; and `git diff --check`.

## Limits and integration

The cache is per process, at most 4,096 entries and 32 MiB of estimated retained content. It does not cap full responses or transient memory. Histories larger than the budget can reread evicted entries; this measurement fits in the cache and does not establish performance for oversized histories or ten distinct large applications.

`invalidateExecutionReads(applicationId)` drops an in-flight directory scan so a notification starts after its change; call it without an ID on reconnect. Cached contents remain safe because every new scan or single-record read checks file identity and timestamps. No TTL, file watcher or shared event bus is added.

Execution writes, approval decisions and the recovery sweep remain synchronous. The separate DB integration must replace `executionsForRecovery` with awaited `listExecutions`, awaiting settlement before socket intake and before clearing `driving`. This branch changes neither SQLite execution nor SSE polling. No live model/provider, retained-state upgrade or deployment was verified.
