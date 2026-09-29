# Runtime SQLite thread verification — 29 September 2026

Candidate: `codex/async-sqlite-runtime`, based on
`cc6db62190d80ee2bc385aee90999f2fdbe5bd77`. The implementation and checks are
in the accompanying PR. This is a local Apple-silicon macOS run with Node
22.23.2 and `npm ci`. All state was disposable and account directories were
empty or synthetic. No retained application, credential or deployment was
attached or changed.

## Contention and data correctness

`tests/application/integration/database-worker.test.ts` opens a real temporary
schema-18 SQLite file. Another thread holds `BEGIN IMMEDIATE` for 800 ms. The
baseline issues a synchronous `better-sqlite3` update on the measuring thread;
the candidate issues an update through the production `DatabaseClient` and
database worker. A 10 ms interval measures timer gaps on the caller. The
candidate also serves an unrelated HTTP request while the write is pending.

One isolated run observed:

| Measurement | Direct synchronous SQLite | Database thread |
| --- | ---: | ---: |
| Awaited update duration | 878 ms | 879 ms |
| Largest caller timer gap | 882 ms | 12 ms |
| Unrelated HTTP request while the update was pending | — | 8 ms |

Both updates waited for the writer; the final stored value was checked.
This demonstrates that SQLite contention no longer blocks the calling event
loop. It does not establish production throughput or remove SQLite's
single-writer limit. Each process still queues its database operations on one
connection, including online backups.

The same suite verifies:

- A trigger rejects insertion of the first conversation; its application
  insert rolls back, and the SQLite error name/code survive the thread boundary.
- Four concurrent calls with one creation key create one application and one
  main conversation. Concurrent side conversations receive distinct default
  titles inside their storage transactions.
- Close drains accepted work, refuses new calls and permits an explicit reopen
  with the stored value intact.
- Thread termination while a SQLite write is waiting rejects pending and
  future calls without replay. The file remains readable; a lost write
  acknowledgement is deliberately an unknown outcome.
- A synthetic retained-state mark rejects the wrong runtime. An authorized
  database thread keeps the ownership hold after its launcher lock is released,
  and closing the connection releases it.
- Pi serves nothing while asynchronous recovery is pending. Failed recovery
  releases the exclusive worker lock, allowing the next owner to start.

The terminal transport regression closes a real WebSocket while its target
read is held, then releases the read: no SSH process or terminal session is
created. Host lookup and pty creation are test doubles in that regression.

## Runtime and packaging

The application suite exercises the installed Pi packages with scripted models,
including storage, histories, permissions, requests, existing schema upgrades
and controller backup capture. The CLI browser journeys run the actual app,
worker, SQLite and CLI processes with synthetic provider/model responses:
`apps → exec → wait → inspect`, lost acknowledgement, timeout, Ctrl-C, and an
Always ask approval through the page. The restart browser journey kills the
real Pi process while work and a follow-up are in flight; history remains
readable and nothing resumes until Continue or Stop.

A separate `scripts/serve.mjs` production-mode smoke run on port 3898 used an
empty account directory and a disposable schema-18 file. The application and
inspection endpoints returned the stored application and a live Pi worker.
Two starts (launcher PIDs 82674 and 82735), each followed by SIGTERM, retained
application `07e7e742-b7c2-48e9-9f2c-50d1835148d9` and main conversation
`ec49cfe0-7222-4ea5-bf76-31492915636f`. The port closed after each stop.
A separate owner process then terminated its own database thread: the runtime
failure policy exited it with code 1. Reopening the file found schema 18 and
the same one application row. The fixture was removed.

`npm run package` built the macOS arm64 archive using the pinned Node 22.23.2
runtime and production dependencies. Packaging now runs the shipped
`dist/database-worker.mjs` against a real temporary file, reads it and closes
cleanly; no source tree or TypeScript loader is used by that check. The
archive includes both Pi and database workers. The archive was built from the
working candidate and its release metadata says `uncommitted`; no release was
published or installed.

Commands used:

```sh
npm run format
npm run lint
npx tsc --noEmit
npm test
HALLVI_E2E_PORT=3890 npm run test:e2e -- cli.spec.ts worker-restart.spec.ts
npm run build
npm run package
node scripts/check-preview-processes.mjs
```

The CLI stderr assertion initially failed because Playwright's `FORCE_COLOR`
conflicted with the surrounding terminal's `NO_COLOR`. The CLI fixture now
removes `FORCE_COLOR` for its subprocesses; the full CLI request journey then
passed. The approval and restart journeys passed on the first run. Existing
lint warnings remain; no lint errors remain. The final PR records test counts.

## Limits

This verifies macOS development and production builds and the macOS package's
database worker. Linux packaging, an installed service update, live models,
real providers and production concurrency throughput were not exercised.
Retained ownership was checked with a synthetic mark, not a real retained
application. Execution-file caching and chat notification protocols belong to
the parallel improvements and are unchanged here beyond necessary awaits.
