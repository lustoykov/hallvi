# Pi owns the conversation, the worker owns Pi's sessions — verification, 19 September 2026

Branch `claude/pi-agent-harness`, the revision of [PR #156](https://github.com/lustoykov/hallvi/pull/156)
after review. It follows [the AgentHarness migration](2026-09-19-agent-harness-migration.md),
whose evidence is about the earlier commit `beae2f10` and is kept as it was.
Node 22.23.2, locked install, `pi-agent-core`, `pi-ai` and `pi-coding-agent`
all exactly 0.85.1. The design this proves is
[Interaction while Pi is busy](../operator-design.md#interaction-while-pi-is-busy).

Code under test: commit `55601611`, kept as the tag
`tested/pi-owns-conversations`. The real-provider run, the application suite,
typecheck, lint, format and the browser journeys below were all made on it.
The branch was then tidied into one commit; what differs from the tag is
documentation, one comment's length and the name of a research probe, which
`git diff tested/pi-owns-conversations claude/pi-agent-harness --stat` shows.

Scripted-model results and real-provider results are kept apart. A scripted
result is never offered as evidence about the real provider or a host.

## Real provider, real workspace, real host

One controller from this checkout: `scripts/dev.mjs` on `127.0.0.1:3290`, a
fresh schema-18 database in this worktree's own `.hallvi/`. Before use, and
again after the restart described below, the listening Next server and the
worker were each checked to have this worktree as their working directory, the
worker to run under Node 22, and the worker's socket to be readable only by
its user. Model: the configured ChatGPT subscription (`openai-codex`) through
Pi's own `ModelRuntime`; workspace: the real Docker repository workspace;
provider: the authorized Default Hetzner project.

| Step | What happened |
| --- | --- |
| Three conversations at once | Two applications (`traefik/whoami`, `jwilder/whoami`) and a read-only side conversation of the first were each sent a question in the same instant. All three sends were answered in 0.7 s, once Pi had taken the message; all three were `working` together; their replies ran 19:28:56→29:07, →29:11 and →29:21. |
| Send next and Steer | During the deployment request, a follow-up and then a steer were sent. Both showed as waiting in Pi's queue, in Pi's order. Pi read the steer at its next step, before the older follow-up, and acted on it ("CX23 … in Nuremberg, Germany"). |
| Approval before execution | Pi asked before renting. While it waited, nothing had been created: a label query at Hetzner for this task's owner id returned no server, firewall or key. |
| Stop during a real approval wait | Stop in the page. The approval record became Interrupted, the queued follow-up left Pi's queue and the transcript, Send came back, and Hetzner still held nothing. The reply reads as stopped; that is read from Pi's own result for the operation (`aborted`), because Pi's last words were a finished message and a tool call. |
| Worker restart with history | The controller was restarted to pick up that last change. The conversation came back from Pi's session alone: every message, the stopped reply, and all eight execution records in place under their replies. |
| Deploy | Asked again and approved in the page. Pi rented a CX23 in Nuremberg, registered a key, applied an SSH-only firewall, put all seven `sg-*` labels on all three resources, deployed `traefik/whoami`, opened the private tunnel and checked that 80, 443 and 8080 do not answer publicly. 24 executions. `curl http://127.0.0.1:8080` on the controller returned the application's own page (HTTP 200). |
| Interruption | One harmless command: `echo start >> /tmp/hallvi-interrupt-test.log; sleep 100; echo end >> …; cat …`, with a follow-up queued behind it. Once its execution record said `running`, this worktree's worker was killed with SIGKILL. The launcher started a new one within five seconds. For forty seconds the conversation read `interrupted` with the same message and execution counts: nothing ran. The page showed the reply as Interrupted ("Whether the last command finished is not known…"), the command as stopped, the follow-up as "Pi holds this and has not read it", and Continue and Stop together. |
| A new question is refused | "What time is it on the server?" sent while interrupted: HTTP 409, "This conversation was interrupted. Continue or stop it before sending something new." Nothing was accepted. |
| Continue | Continue in the page. Pi resumed its operation and did not make the call again: "It printed nothing before execution was interrupted. I did not rerun it, so whether it later reached `cat` is unknown." It then read the queued follow-up from its own queue and answered it. Across all execution records exactly one ever contained that command, and it is `interrupted`. Asked afterwards to read the file without running anything again, Pi printed `start` / `end`, once each, and found no `sleep 100` process. |
| A repeated send | The same request key sent twice to the second application, and once more after the answer: one message, one reply (`pong`). The same key with different text: HTTP 409. |

Not exercised against the real provider: a provider-side retry, native
compaction (the conversations stayed far below the context window), a send
while no worker is running, and removing an application. The first two and the
last are covered with the scripted model below; a send with no worker is
covered with the real worker process in a browser journey.

One thing the real run found that no test had: a Unix socket path is limited
to 104 bytes on macOS, and `worker.sock` beside the database in a deep worktree
is longer. The rule now puts it in the user's temporary directory under a name
derived from the database's path when it does not fit
(`scripts/worker-socket.mjs`).

## Scripted model, real SDK, real socket, real database

`tests/application/integration/pi-owner.test.ts` runs the app's side
(`pi-conversation.ts`) and the worker's session owner over the real Unix
socket, with the installed Pi packages, Hallvi's real tools and a real
database. Only the model is scripted, and the Docker workspace is left out.

- No worker: the send is rejected, nothing appears when a worker starts, and
  the same send then succeeds once.
- A send repeated after a lost answer, as a prompt, as a queued follow-up, and
  after Pi has read it: one instruction, read by the model once.
- Approval before execution; evidence kept under Pi's tool-call id and placed
  under the right reply, between what Pi said; two applications on one server
  address and a side conversation answering while the main one waits.
- Steer before follow-ups, in Pi's order.
- Stop during an approval wait and during a streaming answer; the conversation
  is usable afterwards.
- Restart: nothing runs, history and evidence stay, a new question is refused,
  Continue carries on without repeating the call, and Stop is there with
  nothing queued.
- An idle lane's queue is read from Pi's queue, once, under the message's own
  id, with `accept({ prompt: [] })` and `drive`.
- Retry, compaction and failure are Pi's; the page gets advice, never the
  provider's words; the transcript survives a compaction because it is read
  from the branch, not from the lane snapshot.
- A second worker steps aside.

Whole application suite, on the tag and again on the branch head: 940 passed,
3 skipped (96 files); `tsc --noEmit` clean; prettier clean. eslint found one
over-long comment line in a test helper on the tag; it is the one-line change
named above, and the head has no errors.

## Browser

Against an isolated copy of this checkout with its real worker
(`tests/browser/qa-fixture.mjs`, port 3561 and up, verified free first), model
scripted. All 18 conversation-facing journeys pass together: applications,
experience continuity (Send next, Steer, Stop), the worker-restart journey,
and the four page journeys below.

`worker-restart.spec.ts` kills the fixture's real worker process: a send with
no worker fails and the composer keeps the text; the new worker runs nothing;
Send is disabled until Continue or Stop; Continue finishes the answer and the
queued follow-up.

`pi-transcript`, `streaming-output`, `still-working` and `typed-information`
are about the page. They used to write reply rows into SQLite; there are none
now, so they stand in for the worker on its socket with a scripted transcript
(`tests/browser/scripted-worker.ts`). The app still reads it over the real
socket and places real evidence files into it.

The full suite: 34 passed, 9 skipped, 14 failed. One of the 14 was
`worker-restart`, which shared an app whose worker an earlier journey had
replaced; fixed by giving scripted-worker journeys their own app, and it
passes in the run above. The other 13 are not evidence about this checkout:
`controller-protection` fails the same way on `main`, and the twelve
destination, interaction and record-journey specs talk to servers on ports
3411 and 3432, which belong to other worktrees (`sec-real`, `ui-pass`) and
were left alone.

## Upgrade and rollback

`npm run db:upgrade` now only copies the database and stamps the version;
`tests/application/integration/db-upgrade.test.ts` checks that every earlier
row is still there, that everything a fresh database has is present, that the
copy is the database as it was, and that a second run never overwrites it.
Opening an earlier history through Pi's own repository, with the original
left byte-identical, is unchanged from the earlier evidence
(`pi-sessions.test.ts`). Not repeated on the owner's real data in this
revision.

## Resources

Registry record `ba1cfbc0-57ed-4bda-ae4f-02a08e651c24`. Hetzner server
166562867, firewall 11648976 and SSH key 130227065 were deleted by exact id
after re-checking `sg-owner` and `sg-cleanup=allowed` on each; each re-reads
as 404, and a label query for the owner across servers, firewalls, keys,
primary and floating IPs, volumes and snapshots returns nothing. The
controller, its worker and the product's SSH tunnel are stopped. The earlier
run's disposable state is kept under `.hallvi/previous-run-schema17`.
