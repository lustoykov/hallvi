# Testing Hallvi

For a task's end-to-end verification path, use the shared
[verify-hallvi skill](../.agents/skills/verify-hallvi/SKILL.md) and
[guide](../docs/verification.md). This document owns the testing bar and runners.

## The 80/20 bar

We are discovering and polishing the product. Tests should help us change it
confidently without turning every change into a hardening project. Optimize for
useful failures caught versus authoring, maintenance, runtime and review cost.
There is no target test count, coverage percentage or deletion quota.

Keep or add a test when it protects a current, important behavior and catches a
realistic failure that existing coverage would miss. Prioritize:

- The main journey: deploy, open the application, return after a refresh, and
  continue the conversation after a turn completes.
- Concrete risks to data or credentials, such as an incomplete recovery archive
  or discarding the working password after a partially successful change.
- Consequential boundaries and claims: approval before execution when required,
  acting on the intended application/server, and backup or deployment success
  supported by the relevant result.

A small regression test for a serious observed bug can be valuable even if that
bug is uncommon. This does not justify testing every imagined variation.

Delete or consolidate tests for retired behavior, duplicated scenarios, trivial
wrappers, internal call sequences, or exact wording/markup with no meaningful
user contract. Keep wording assertions where the wording itself carries an
important warning or claim. Do not remove a useful test merely because it fails;
first distinguish a product bug from an obsolete expectation or broken fixture.

Use the cheapest check that gives useful confidence. Prefer one representative
integration or journey test over many mocks that repeat the implementation; use
focused unit tests for consequential logic when they give a clearer signal.
For prototypes, spacing and copy edits, inspect the rendered UI and exercise the
changed interaction. Do not build permanent test suites around designs awaiting
selection, or write tests that merely assert the CSS you just added.

A shared rule is proved once, against the thing that implements it, and each
page that reads it keeps one small check that it does. The clock rules live in
`unit/state-matrix.test.ts`, the same-origin rule in `unit/mutation-origin.test.ts`,
and the size parser in `unit/parsers.test.ts`; re-asserting them through another
projection buys nothing and doubles what a change has to update.

Run relevant checks once; broaden or repeat them only for a new change, failure
or concrete unresolved concern. Documentation-only edits need document/link
review. Real provider claims need representative real verification, but that
proof need not become a recurring test for unrelated edits. A pruning pass should
run the retained default suite once to catch broken fixtures and imports.

When pruning, explain removals by group and name the important behavior still
covered. No scoring framework, exhaustive audit spreadsheet, mandatory
counterfactual run for every test, or new test harness is needed. If a decision
would remove the only coverage of an important behavior and its value is unclear,
ask the owner with that concrete example; continue the unambiguous cleanup.

The retained development applications are outside the suites: `unit/retained-state.test.ts` holds the rule that keeps a checkout from opening another checkout's application (the mark, the lock, the runtime id, a copy being free), and reproduces the hand-offs that went wrong once: a process from an old runtime still holding the records, one Ctrl-C read as two, a worker whose status is unknown read as idle, and a snapshot whose histories nothing could read. Everything else about them — a real attach, a drain, a crash — is proved by hand on the applications themselves and summarized in the PR verification notes, because a fixture cannot stand in for records older than the code. To see one controller with several real applications without taking any of them, build a snapshot (`node scripts/retained-application.mjs snapshot <dir> …`): it carries no keys, secrets or logins, so its worker can read the histories and start nothing.

Two pictures of this bar: [how a check is selected](../docs/architecture/test-selection.md)
and [where a check belongs, and where it does not](../docs/architecture/where-coverage-lives.md).

## Candidate experiment: Jev transcript evaluation

[TypeSafe's Jev](https://docs.typesafe.ai/introduction) is a viable candidate to test as an offline evaluator of Pi's claims against recorded execution evidence. For example, flag "the application is working" when the evidence establishes only that a container started, or flag a reply that overlooks an unresolved tool failure. This is the suggested first Jev experiment; no integration or evaluation result exists yet.

Use a small representative set of redacted transcripts and execution records, with human-reviewed judgments. Compare missed unsupported claims, false alarms, latency and cost before deciding whether it adds value. Typed answers and probabilities are judgments, not proof of deployment, backup or restore success. Keep the experiment advisory and separate from live execution or a required test gate; the [operator design](../docs/operator-design.md#general-tools-and-independent-permissions) describes the operational candidates, with heartbeat and command review remaining deferred.

## Commands and limits

`npm test` runs the application tests; `npm run test:e2e:smoke` runs the browser
smoke subset; `npm run checks` runs everything the GitHub checks workflow runs and
prints a summary to put in a pull request; `npm run test:operator` runs the Python checks for the host-side
scripts under `scripts/` — the scheduled-backup runner's bounded failures,
receipts and recovery path, and the SQLite backup proof. They need
`python3` 3.11 or newer — the runner hashes with `hashlib.file_digest` — and
take under a second, and nothing invoked them before this command existed. On
an older interpreter, such as the macOS system `python3`, most of them fail on
that one attribute and the failures look like the scripts are broken. Nothing in `src/` currently installs
`scripts/scheduled-backups/runner.py`; its coverage stays until that is
decided rather than being dropped on the way past. Select checks relevant to the change rather than running both by
default. Tests use disposable databases and synthetic provider/model responses.
The shared-information browser case covers rich cards in chat and Deployment
after refresh. `npx tsc --noEmit` and `npm run build` check the application bundle.

`integration/database-worker.test.ts` uses a real temporary SQLite file and a competing writer to compare timer delay with direct synchronous access, checks an unrelated HTTP request while a write waits, and verifies transaction rollback, concurrent creation keys, close/reopen, worker loss and retained ownership. This proves responsiveness under a forced lock, not production throughput. [29 September evidence](https://github.com/lustoykov/hallvi/blob/74b54efe8e12e14bbbf59e6edb2522bbcadeeb7d/docs/testing/2026-09-29-async-sqlite.md) records the runtime and package checks.

`integration/traffic-store.test.ts` holds an external write lock on the real
Traffic database while a timer and an HTTP handler that writes a main
conversation record continue. It also checks Stop/Forget against competing
collector writes and closes/reopens the existing totals. The default-choice,
day-close and controller-copy checks use the same asynchronous Traffic store;
fake-clock collector tests wait for actual follow and storage milestones.

Conversation coverage runs against the installed Pi packages with only the model scripted. `integration/pi-owner.test.ts` runs the app and the worker's session owner over the real socket, with Hallvi's real tools and database: no acceptance without a worker, a repeated send being one instruction, the model being sent one prompt that leads the request and none of Hallvi's marks, approval before execution with evidence placed by Pi's tool-call id, two applications on one server and a side conversation at once, follow-up and steer order, Stop, restart with explicit Continue or Stop, messages left waiting behind a failed reply, retry, compaction and failure left to Pi, and a request's outcome being the run in which Pi answered it: a steer shares the result of the run it joined, and a follow-up has its own. It is also where the undocumented Pi behaviour Hallvi depends on is pinned. `integration/pi-sessions.test.ts` covers Pi's store: one private store per conversation, a read that writes nothing and sets nothing going, an earlier release's history left as it was while its conversation starts empty, and a store that cannot be opened reported as unavailable and left as it is. `integration/controller-protection.test.ts` covers the recovery copy taking a store the worker has open as it stands, `integration/migrate-state.test.ts` the database upgrade and its rollback copy, `integration/pi-shared-account.test.ts` authentication through Pi's own `ModelRuntime`, and `integration/operator-execution.test.ts` permissions and approvals. `tests/browser/worker-restart.spec.ts` kills the real worker process mid-answer. `tests/browser/cli.spec.ts` runs the `hallvi` request commands as separate processes against the real app and worker: one request's identity through apps, exec, wait and inspect, background, timeout and Ctrl-C leaving the work with Pi, a lost acknowledgement, and an Always ask approval given in the page; `unit/controller-client.test.ts` covers choosing the controller, resending under the same key and refusing redirects against stand-ins. Journeys that are about the page rather than Pi (`pi-transcript`, `streaming-output`, `still-working`, `typed-information`) stand in for the worker on its socket with a scripted transcript (`tests/browser/scripted-worker.ts`); evidence on disk is still placed by the real app. `tests/application/unit/chat-recovery.test.tsx` covers the recovery UI.

Change delivery is checked at its boundaries: `integration/change-notifications.test.ts`
runs a separate socket-owner process for shared subscriptions, scoped fanout,
web relays and storage identity. `unit/pi-stream.test.ts` covers idle reads,
burst coalescing, changes arriving during reads and disconnect cleanup;
`integration/pi-stream-reconnect.test.ts` holds an older execution scan across
a disconnect while another chat keeps the hub connected. The browser
`change-notifications.spec.ts` exercises a real Next mutation and worker
loss/reconnect, and measures 1/5/10 open chats with 2,000 execution records.
Its counters and metrics route are injected only into the disposable QA copy
by `notification-metrics.mjs`, never the product. Scripted-worker journeys
must emit `changed(...)` after writing fixture records or transcripts; there
is no periodic snapshot poll to discover an unannounced fixture edit.
See [29 September measurements](https://github.com/lustoykov/hallvi/blob/74b54efe8e12e14bbbf59e6edb2522bbcadeeb7d/docs/testing/2026-09-29-chat-notifications.md).

`unit/chat-frames.test.ts` checks reconstruction from page-fingerprint
acknowledgements and incremental frames, scope/version fallbacks, ordering,
removals and optional-field clearing. `unit/pi-stream.test.ts` checks fresh
reads, notices during the initial read and full automatic reconnects.
`long-history-responses.spec.ts` verifies that unchanged page collections are
acknowledged, then keeps old evidence disclosures and live output usable through updates and
reconnect. A disposable proxy ends the actual SSE response; the journey checks
the browser's `Last-Event-ID` and fresh full reconnect frame, since a short
offline toggle can leave the existing connection alive. Its opt-in profile compares full and incremental responses on the
same warmed, production-built Next fixture with 1/5/10 real browser readers:
`HALLVI_QA_PRODUCTION=1 HALLVI_RESPONSE_PROFILE=1 HALLVI_E2E_PORT=3960 npm run test:e2e -- long-history-responses.spec.ts --grep 'profile warm' --reporter=list`.
Choose a free QA port. Fixture build and first-connect work are outside the
measured update interval. Production QA uses webpack because its dependency
symlink crosses the disposable root; optimization and type checks stay enabled.
Check the shipping build separately with `npm run build` and its normal bundler.
The profile also records worker transcript bytes, parse/response time and evidence
projection time. For a bounded development diagnostic, omit
`HALLVI_QA_PRODUCTION` and choose `HALLVI_RESPONSE_MODE=changes` or `full`; this
opens one set of readers instead of both modes within the case's setup budget.
The update assertion remains ten seconds. Reader setup, SSE events and update
visibility milestones are written as they happen to `reader-events.jsonl`, so
a case timeout can be distinguished from a missed update. Fixture startup and
Next compilation output is kept in the run's `qa-fixture-*.log`.
`node --import tsx scripts/benchmark-chat-responses.ts`
separates cached file scans, activity projection, frame construction and JSON
encoding for 240 and 2,000 synthetic calls; it excludes database, worker socket,
SSR and browser work. Both profiles make no model calls, isolate fixture
accounts, and keep raw results in ignored `work/` or `tests/results/`. Browser
response counters are injected only into the disposable QA copy.

The same journey checks where a long conversation opens: on its latest
message, and on the linked message when the address names one, without being
carried back to the end. `unit/chat-frames.test.ts` holds the rule that full
state repeating a held conversation keeps the records it repeats, and
`unit/chat-recovery.test.tsx` that the latest messages are drawn first. How
long opening takes is the spec's second opt-in profile:
`HALLVI_QA_PRODUCTION=1 HALLVI_OPEN_PROFILE=1 HALLVI_E2E_PORT=3960 npm run test:e2e -- long-history-responses.spec.ts --grep 'profile opening' --reporter=list`.
It opens 240, 900 and 2,000 synthetic calls from the applications list three
times each while a scripted turn streams, and writes `open-profile.json`:
when the latest reply was on screen, when every message was drawn, and the
long tasks after the click. Synthetic, local and one machine's numbers:
compare a change against the same run on its base, not against a budget.

A browser case asserts what the product says, not what a past layout said. Scope
by landmark and accessible name rather than by layout class: a routine record is
one compact line in a transcript and its content is behind a disclosure, and a
destination is a page composed from records rather than a list of the cards from
the conversation. `[data-information-id]` is the stable way to ask whether a
record is on the page at all. This fixture does not establish a reachable application — a private one is proved by a live SSH control socket, and a
loopback address is refused as a public target — so this journey checks closed access. It does not prove that a reader can open
a deployed application; that still needs verification against a running host.

`npm run scenarios -- <port>` builds an isolated scenario database from
`tests/fixtures/scenario-records.ts` and serves the real application against
it, so the states a real journey never produces — a failure forty days old, an
established absence, a withdrawn record, a release that failed while the one
before it still serves, a way in that has closed while the application is fine
— are read through the shipping pages rather than through a second set of
layouts. It builds its own database under `tests/results/scenarios` every run,
never reads `HALLVI_DB_PATH`, and carries no credentials. It prints one
address per scenario; each destination is a fragment on that address. Add a
state to the fixture file rather than starting a second scenario system.

The `/prototype/app` reference shell, and the `views/*-view.tsx` layouts that
only it renders, carry no tests. A real application's destinations are the
`*-page.tsx` components, and what they may claim is settled by the record
projections behind them; that is where this coverage lives.

The live model evals are gone. Their runner was retired with the workflow it tested and had been a stub that printed an error for some time; its saved answers could only be judged by a second command whose results live in `tests/results/`, which is local and never committed, so on any fresh checkout there was nothing to run and nothing to judge. `eval:pi`, `eval:judge` and `tests/evals/` are removed, and the test runners make no model calls. Learn Hallvi displays content maintained by a separate scheduled Codex task, described below.

Answers saved by earlier runs are untouched and still readable: the dashboard's Eval archive reads them, shows the judgments that were made at the time, and takes your own verdict. New live deployment evals follow provisioning and will be written against the operator that exists.

`npm run dev` starts a local testing dashboard paired with that checkout's app; each worktree gets its own local ports, printed at startup, and the two interfaces link to each other. `npm run test:dashboard` remains available for running the dashboard alone on port 4317. It starts the application tests, the browser smoke subset and the browser journeys, and those check runners make no model calls. Learn Hallvi reads a saved catalog; its scheduled maintenance task runs separately in Codex and consumes Codex usage. Four further pages report rather than run: **Agent feedback** reads this checkout’s `AGENT_FEEDBACK.md`, with active requests, +1 counts, statuses and notes; **Agent features** reads `AGENT_FEATURES.md`, with researched proposals, +1 interest counts (not priority or approval), statuses, owner selection and assignment. Both document pages collapse a final Archive behind its entry count, preserving closed entries and their links; they reload local edits and share changes through merges, and repository links open GitHub main. **Development** says which checkout the paired Hallvi is actually serving, which database it opened and at what schema, the retained sample applications registered on this machine and the copies taken of their records; **Releases** says what a release would be built from, what a built archive actually contains, and which draft is waiting. Building and publishing there are narrow wrappers around the `gh` login already on this machine, and these pages do not exist in a packaged Hallvi: `scripts/package.mjs` copies an allowlist, and `tests/` is not on it. Local tooling can still fail silently or affect data, credentials and spending: its location is not an exemption from the 80/20 bar. Check the relevant behavior when changing these tools; add a focused regression only when a concrete risk warrants it.

`npm run test:e2e -- hallvi-plugin.spec.ts` checks the real plugin panel with a
synthetic MCP host: the overview first, with the operator's work in sight and a
draft kept across view switches, pending-send identity across switches/reloads,
late acceptance with browser storage denied, and unchanged-transcript recovery.
It starts no controller and makes no model calls; it does not establish native
Codex rendering.

Install Chromium with `npx playwright install chromium`. Browser fixtures run on 3180+ with synthetic credentials; they never open the normal application database. Failure artifacts and the rich-card screenshots are under `tests/results/`. The workspace Docker test is opt-in and requires a reachable engine.

For a concurrent worktree, set `HALLVI_E2E_PORT` to a free port from **3100 to
3999**; the fixture rejects ports outside that range before starting a test.
Each worker listens one port above the last, and Playwright starts another
worker after every failed test and for each set of fixture options, so leave
room above the base. A whole-suite run started at 3980 reached 4000 and failed
its last journeys on the port alone.

**Learn Hallvi** (`/learn`) is the dashboard's architecture map and learning
queue. A separate daily Codex task reviews merged `main` and publishes an
incremental update. The page only reads saved content and records answers; it
never launches an agent. [Development](../docs/development.md#learn-the-current-architecture)
owns the task workflow, source and progress lifecycle.
`unit/architecture-learning.test.ts` uses disposable Git repositories to cover
persistent mastery, changed/retired versions, unchanged-main skips, forced
preparation, invalid-output rollback, overlapping reviews and store identity.
The ordinary suite never runs Codex. For updater changes, exercise prepare and
publish on a fixture using `HALLVI_LEARNING_DB_PATH=work/learning-check.sqlite`,
and verify the saved content and source links in the browser. Keep fixture
answers out of the owner's progress file and remove only your verification data.
