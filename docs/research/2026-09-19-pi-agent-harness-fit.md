# Pi AgentHarness proof of fit

Date: 2026-09-19. Status: findings from running published packages; the
integration that followed is described in
[operator design](../operator-design.md#interaction-while-pi-is-busy).
Companion to the ecosystem audit in research PR #155.

## What was run

Published `@earendil-works/pi-agent-core` 0.85.1, `pi-ai` 0.85.1 and
`pi-coding-agent` 0.85.1, installed with `--ignore-scripts` into an isolated
scratch directory, against pi-ai's scripted `faux` provider. No Hallvi code.
The scripts are kept in [pi-agent-harness-fit/](pi-agent-harness-fit/) as they
were run; run them from an empty directory after
`npm install --ignore-scripts @earendil-works/pi-agent-core@0.85.1 @earendil-works/pi-coding-agent@0.85.1 typebox`.
Each finding that Hallvi now relies on is pinned by a test in this repository,
named in the last column.

## Findings

| Question | Finding | Pinned by |
| --- | --- | --- |
| Is there an id when a message is queued, or only once it is history? | `followUp`/`steer` return an `entryId` at once, and the history entry Pi later writes has the same id. Three identical texts got three ids. Installed 0.84.4 `AgentSession` had no id until after persistence and matched queued messages by text. | `pi-operator.test.ts` "names each message…" |
| Can the caller's own identity travel with the message? | A field added to the queued message survives in the queue snapshot, across a restart, and on the history entry. Hallvi tags every message with its row id. | same, and "does not lose or repeat a message…" |
| Idle lane | A prompt is admitted by `accept()`, which takes a caller-supplied operation id; the same id again is refused as `LaneBusy` naming that operation, so a second attempt is harmless. A follow-up queued on an idle lane is accepted and never runs by itself, and a later prompt does not consume it. | "puts a message queued on an idle lane as the prompt, by its id" |
| Cancel | `cancelQueued(id)` answers `cancelled`, `not_found` or `already_consumed`. | the same test |
| Stop | `abort()` ends the operation, empties both queues itself and returns what it dropped. No ordering rule is needed. | "Stop during a running tool…" |
| Restart | `AgentHarness.create` reports open operations; the queue is restored under the same ids; nothing runs by itself. `resume()` does not re-run an interrupted tool: the model is given an error result saying the external outcome is unknown. `abort()` on a restored operation ends it and clears the queue. `harness.close()` aborts nothing durable. | "after a dead worker…"; `pi-worker.test.ts` restart tests; `tests/browser/worker-restart.spec.ts` |
| Queue modes | Default is `all` (several follow-ups in one turn). `one-at-a-time` is an option. | `pi.test.ts` composition |
| Tools | `prepareArguments` is honoured; `constrainedSampling` is a field of pi-ai's `Tool` the harness tool inherits; per-tool `executionMode` is **not** read — there is one `toolExecution` setting, default `parallel`. Tool `replay` defaults to `never`. | "runs a turn's tool calls one at a time…" |
| Authentication | coding-agent's exported `ModelRuntime implements Models` and is passed as the harness's `models`. An expired OAuth credential was refreshed once, under Pi's cross-process file lock, and the provider got the new key. Works with a top-level agent-core beside coding-agent's nested copy. | `pi-shared-account.test.ts` |
| Compaction and retry | Both are the harness's own and ran without any Hallvi code. With a model whose context window is smaller than Pi's default compaction reserve, it compacts around every call — a test-fixture trap, not a product one. | `pi-worker.test.ts` "leaves retrying and compaction to Pi…" |
| Earlier histories | The public `JsonlSessionRepo.list()`/`open()` read Hallvi's existing format-3 files (verified on copies of two real histories, 169 and 173 entries, one with a compaction). Opening leaves the file untouched; the first write rewrites it in place as format 4 with no backup of its own, so Hallvi copies before opening. | `pi-sessions.test.ts` "opens a history written before the upgrade…" |
| One writer | Not provided. A second repository instance opened the same session and queued into it, unseen by the first. Upstream's own worker uses a file lock for this. Hallvi's locks stay. | "does not itself stop a second owner…" |
| File privacy | Pi writes session files group/world-readable. Hallvi keeps the directory 0700 and sets the file 0600 after opening and closing. | `pi-sessions.test.ts` |

## What is not published

Upstream's composition of the harness with the coding agent lives in
`packages/coding-agent/src/experimental/` on main and is not in the 0.85.1
tarball; 0.84.4's unexported `dist/server/create-harness` is gone from 0.85.1.
coding-agent 0.85.1's `AgentSession` does not use the harness. Hallvi depends
only on published exports: `AgentHarness`, `JsonlSessionRepo`,
`NodeExecutionEnv`, `createCustomMessage` and the context helpers from
agent-core, and `ModelRuntime` and the tool definitions from coding-agent.

## Addendum: what Pi already owns

`pi-agent-harness-fit/ownership.mjs` shows, against published 0.85.1, the facts the revision of PR #156 rests on: a prompt is durable at `accept`, before anything runs, and is in the lane's transcript at once; a restart restores the operation open and runs nothing; `accept` with an empty prompt followed by `drive` reads an idle lane's queue under the original entry ids; `abort` on an idle lane has nothing to abort, so a queue alone is cancelled by id; and every operation's result (`completed`, `aborted`, `failed`, with the entry it ended at) is kept and readable with `getResult`. One more was found in integration rather than by the probe: a lane snapshot's transcript stops at the last compaction, so a whole conversation is read with `findEntries`.
