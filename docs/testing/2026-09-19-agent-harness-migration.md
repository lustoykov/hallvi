# Conversations on Pi's AgentHarness — verification, 19 September 2026

Branch `claude/pi-agent-harness`, on top of the recoverable 0.84.4 checkpoint
`aef2500b` (tag `checkpoint/pi-0.84.4-native-session`). Node 22.23.2, locked
install (`npm ci`), `@earendil-works/pi-agent-core`, `pi-ai` and
`pi-coding-agent` all exactly 0.85.1. The design this proves is
[Interaction while Pi is busy](../operator-design.md#interaction-while-pi-is-busy).

Scripted-model results and real-provider results are kept apart below. A
scripted result is never offered as evidence about the real provider or a host.

Code under test: `beae2f10`. The application suite, typecheck, lint, format and
the browser journeys below were run on exactly that commit, which includes
`main` as of `df44e2a9`. The real-provider run was made on this branch just
before `main` was merged in; the merge changed the workspace prompt the harness
is given (main's optional Docker isolation) and nothing in the conversation
lifecycle. Later commits change only this document.

## Real provider, real workspace, real host

One run, from this checkout: `scripts/dev.mjs` on `127.0.0.1:3290`. Before it
was used, the listening Next server and the worker were each checked to have
this worktree as their working directory and the worker to be running under
Node 22. Model: the configured ChatGPT subscription account
(`openai-codex`), through Pi's own `ModelRuntime`; workspace: the real Docker
repository workspace; provider: an authorized Hetzner project; a
fresh schema-17 database in this worktree's own `.hallvi/`.

| Step | What happened |
| --- | --- |
| Deploy | "Deploy this application on a new Hetzner server and give me a private link" for `traefik/whoami`. Pi read the repository in the workspace, read Hetzner prices, rented a CX23 in Falkenstein, connected over SSH with a pinned host key, installed the runtime, deployed, opened the private tunnel and verified from outside that 80, 443 and 8080 do not answer. 26 executions recorded, about seven minutes. `curl http://127.0.0.1:8080` on the controller returned the application's own page. |
| Send next | Sent while Pi was reading the repository: "When you are done, tell me in one sentence which Hetzner location you chose and why." It showed as Waiting, was acknowledged by Pi with an entry id, ran only after the deployment reply completed, and was answered. |
| Steer | Sent after it: "Prefer a location in Germany if the price is the same." Acknowledged with its own entry id, read by Pi at its next step — before the older follow-up — and acted on: the next reply opens "I'm selecting a CX23 in Falkenstein, Germany". The work Pi did before the steer stayed under the earlier reply. |
| Interruption | Asked for one harmless command: `echo start >> /tmp/hallvi-interrupt-test.log; sleep 100; echo end >> …; cat …`. Once its execution record said `running`, the worker process was killed with SIGKILL. The launcher started a new worker. The conversation said Interrupted: "The worker stopped. Whether the last command finished is not known: read execution evidence before continuing. Nothing is run again by itself." For more than thirty seconds nothing ran: same message count, same execution count, status `interrupted`. |
| Continue | The owner's next message ("What happened with that command? Find out whether it finished, without running it again…") opened the conversation again. Pi resumed the operation it had open: the interrupted call was not made again and the resumed reply said "It printed nothing before the execution was interrupted; I ran it only once, so the final remote outcome is unknown." Then it answered the new message by inspecting: the log holds one `start` and one `end`, and no matching process remains. Across all execution records exactly one command ever wrote `start`. |

Not exercised against the real provider: a provider-side retry, native
compaction (the conversation stayed far below the context window), Stop during
a real approval wait, and two applications at once. Those are covered with the
scripted model below.

### Resources and cleanup

Task owner `12ab5b3e-4ab5-4d11-91d8-3f81126e318e`, recorded in the development
cleanup registry. The product created one server (166556691, CX23, Falkenstein),
one firewall (11648629) and one SSH key (130223996), each carrying all seven
`sg-*` lifecycle labels because the conversation asked for them. After the run
each was re-checked for this owner and `sg-cleanup=allowed`, deleted by exact
id, re-read as 404, and the owner's label query returned nothing for servers,
firewalls, SSH keys, primary and floating IPs, volumes and snapshots. The
server's primary IPv4 was gone ten seconds later. The controller, its worker
and its SSH tunnel were stopped. Another task's server seen in the listings was
not touched.

## Scripted model, real everything else

`npm test`: 95 files, 954 tests passed, 3 skipped. `npx tsc --noEmit` and
eslint clean; `npm run format` applied.

- `integration/pi-worker.test.ts` — Hallvi's worker, tools, permissions and
  database against the installed SDK: application B answers while A waits for
  approval; a steer and two identical follow-ups as one ordered transcript;
  Stop during an approval wait and mid-stream, with nothing that waited ever
  starting; the shared-server rule; a worker going away and coming back runs
  nothing, then the owner's message resumes and the interrupted approval is
  not asked again; Stop after a worker went away ends what Pi held; a message
  Pi took before Hallvi recorded it is handed over once; Pi's own retry and
  compaction with truthful status; a session that will not stop poisons the
  worker.
- `integration/pi-operator.test.ts` — what Hallvi relies on `AgentLane` for:
  ids from the moment a message is queued, identical text kept apart, steer
  before follow-ups, one tool call at a time with the definition's own argument
  shim, Stop during a running tool, the idle-lane case, restoration after a
  dead owner without repeating the effect, and that Pi does not itself stop a
  second owner.
- `integration/pi-sessions.test.ts`, `integration/db-upgrade.test.ts` — the
  upgrade path, below.
- `integration/pi-shared-account.test.ts` — the harness authenticating through
  Pi's `ModelRuntime`, including one OAuth refresh shared by two runtimes.

### Browser journeys

Run from this checkout under Node 22 against the fixture app on 3180, which
copies this checkout and starts its real worker. Ports were checked first:
3410, 3411 and 3432 were held by servers from other checkouts (one an old
"Server Guy" build), so the record specs were pointed at a scenario server
started here (3431, working directory verified) and the acceptance-only URL at
an unused port.

- All 22 conversation-facing journeys pass on `beae2f10` (application shell,
  applications, experience continuity, transcript, still-working, streaming
  output, typed information, workspace navigation, worker restart), including
  the new
  `tests/browser/worker-restart.spec.ts`, which kills the fixture's real worker
  with SIGKILL mid-answer with a follow-up Pi already holds, starts another,
  checks nothing runs and the same entry id still waits, then continues.
- Independent baseline failures, reproduced on a pristine `origin/main`
  checkout with its own locked install: the 7 destination and interaction
  specs fail identically against a scenario server from `main` (same pass/fail
  set), and `controller-protection` and the GitHub expired-access renewal spec
  failed identically on untouched `main` earlier in this work.
- Not run: the 6 `secrets.spec.ts` cases, which need a separately running
  acceptance application; nothing in this change touches that path.
- `worker-restart.spec.ts` first ran against the shared fixture app and left
  later specs without a worker; it now uses an app of its own.

## Upgrade and rollback, on copies of real data

- **Database.** A read-only SQLite backup of the owner's real schema-15
  database (24 messages, 2 conversations) was upgraded with
  `npm run db:upgrade`: the result has the same columns and indexes as a fresh
  `db:push` database, all 24 messages, `integrity_check` ok, and the original
  beside it still at schema 15. A second run changes nothing, and it refuses to
  overwrite an existing rollback copy. The real database was never opened for
  writing.
- **Histories.** Copies of the owner's two real format-3 histories (169 and 173
  entries, one with a compaction) open through Pi's public
  `JsonlSessionRepo.list()`/`open()`. Opening changes nothing; the first write
  rewrites the file as format 4; a prompt on top of each completed with the
  earlier context in front of the model. In the product the original file is
  copied, never moved, and the test asserts it is byte-identical afterwards
  and still readable by the session manager the earlier version used.
- **Rollback.** Stop the app and worker, put `<database>.before-v17` back in
  place of the database, and run the earlier version: it reads the original
  histories where they always were. Messages sent after the upgrade exist only
  in the new copies.
