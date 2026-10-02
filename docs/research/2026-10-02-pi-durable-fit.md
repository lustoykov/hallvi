# Pi 1.0 durable runtime proof of fit

Date: 2026-10-02. Status: findings from running published packages; the
integration that followed is described in
[operator design](../operator-design.md#interaction-while-pi-is-busy).
Successor to the [AgentHarness proof of fit](2026-09-19-pi-agent-harness-fit.md).

## What was run

Published `@earendil-works/pi-durable`, `pi-ai`, `pi-coding-agent`,
`pi-agent-core` and `chord` 1.0.0, installed with `--ignore-scripts` into an
isolated scratch directory, on Node 22.23.2 and macOS, against pi-ai's scripted
`faux` provider. No Hallvi code. Eight probes (restart, Stop, the queue, the
prompt, models and login, storage, tools, what a reader sees) were each rerun
and attacked by a second reader; where that reader corrected a claim, the table
states the corrected fact. Request bodies are the ones pi-ai's own provider
code builds, captured with made-up keys and the network disabled: nothing was
sent to a provider.

The scripts behind the central findings are kept in
[pi-durable-fit/](pi-durable-fit/) as they were run, with only layout and
comment wrapping changed: `probe-restart-1.mjs` (which calls set unfinished
work going; it kills `probe-restart-crash.mjs` mid-call), `probe-restart-6.mjs`
(Stop on a bare harness after a crash; Continue), `probe-queue-check-3.mjs`
(the queue a failed reply leaves; the passive write that drains it),
`probe-prompt-1b.mjs` and `probe-prompt-check-5.mjs` (request bodies; the
collapse hook), `probe-prompt-check-8.mjs` (the session id),
`probe-storage-check-3.mjs` (copies of an open store; the 3,000-copy count came
from `node probe-storage-check-3.mjs 3000 2 2`) and their `probe-*-lib.mjs`
helpers. Copy them into an empty directory with a `package.json` of
`{ "type": "module" }`, run
`npm install --ignore-scripts @earendil-works/pi-durable@1.0.0 @earendil-works/pi-ai@1.0.0 @earendil-works/pi-coding-agent@1.0.0 @earendil-works/chord@1.0.0 typebox`
there, and run each with Node 22, for example `node probe-restart-1.mjs`. They
write their stores under `data-*` directories beside themselves.

The last column names the Hallvi test that now exercises each finding, in
`pi-owner.test.ts` unless another file is named, and says _not pinned_ where
none does.

## Findings

| Question | Finding | Pinned by |
| --- | --- | --- |
| Does opening a store after a crash run anything? | No. After a SIGKILL mid-tool-call `Harness.open` leaves scheduling `paused`: no model request, no tool execution. It writes one commit (tasks stored `running` become `pending`); a second open writes nothing. A graceful `close()` mid-call leaves the same stored state as the kill. | "after a restart nothing runs…" |
| Which calls set unfinished work going? | Reads (`inspect`, `viewState`, `watch`, `entries`, `submission().status`), `configure`, `abortTask` and `abortSubmission` do not. `resume`, `submit` (even one that throws `ConversationBusy` or is deduplicated by its request id), `submission.wait` (even on a settled one), `waitForIdle`, `compact`, `reset` and `abort` do, for the whole store, with no way back short of closing it. | `pi-sessions.test.ts` "reads what Pi holds…"; "after a restart nothing runs…" (a send is refused first) |
| Several conversations in one store | A message to an idle conversation, or `abort()` on one, resumed every interrupted conversation beside it: a replay-safe tool ran again and the model was called. With one SQLite file per conversation, each turn, Stop and Continue touched only its own file. | `pi-sessions.test.ts` "keeps one private store…"; the shared store: not pinned |
| Continue | `resume()` does not repeat a call cut after its intent was committed, unless the tool declares `replay: "safe"`: the model gets an error result saying it "was interrupted and may have partially run". A call cut before that commit runs for the first time, and the calls still to come in a sequential round run before the model is asked. A cut answer is kept as an `aborted` entry, left out of the next request and asked for again. A queued follow-up runs after the resumed run. | "after a restart nothing runs…"; the rest of a round and a cut answer: not pinned |
| Stop on a store nobody is running | `abort()` on a harness with no provider and no tools settled a crashed run: the cut call got an error result ending "was aborted", and the input and a queued follow-up settled `unanswered`/`aborted`. In 38 crash-and-abort rounds no tool executed and no model was asked. Plain `abort()` skips an interrupted background compaction, which then sends its summary request; `abort(ctx, { background: true })` stops it. `abort()` with an already cancelled context rejected with scheduling already on, and a replay-safe tool ran again. | "after a restart Stop ends what Pi held…" |
| Stop while Pi is working | `abort()` resolves when `execute` or the provider's stream returns: 2–3 ms with a tool that honours `context.abortSignal`, 2,996 ms with one that slept 3 s through it. Nothing forces a stop. A late result is discarded; the stored one holds only output committed before the stop. An input submitted before `abort()` resolved stayed queued with nothing reading it. | "Stop ends an approval wait and a streaming answer…"; a send during a Stop: not pinned |
| Request ids | The same `requestId` twice is one submission and one model call, also for four concurrent copies and across a SIGKILL. With different content it is not refused: `submit` returns the existing submission and drops the new content. A withdrawn message's id returns its `unanswered`/`aborted` record and sends nothing. The record holds no content: that is in the entry it names or in the queue, and gone once a queued message is withdrawn. | "a send repeated after a lost answer…"; "Stop drops what waited behind a failed reply…" (a withdrawn id); different content: not pinned |
| Queue order | A steer is placed after the tool results of the round in progress and shares that run's answer, one steer per round. A follow-up is placed after the run's answer and starts the next run. With no tool round, the first steer and the first follow-up are placed together into one run. Both modes default to `one-at-a-time`. | "delivers a steer at Pi's next step…"; "a request's outcome is the work Pi answered it in…" |
| A reply that fails with messages queued | They stay `queued` and the conversation goes idle; time, `resume()`, a reopen and `wait()` moved nothing. The next `submit` queues behind them, even with `whenBusy: "reject"`. A `write` submission placed itself and the oldest follow-up, and the rest followed. `abort()` dropped them with no model request. | "a message left waiting behind a failed reply…"; "Stop drops what waited behind a failed reply…" |
| Can the caller's marks travel with a message? | Extra fields on an input are dropped and the entry has no `data`. Extra keys on a content part are kept verbatim in the queue and the `pi.user` entry, across a restart, and a `beforeRequest` hook removed them before the provider was handed anything. | "sends the model one prompt…"; "a request's outcome…" (the origin outlives a worker) |
| Where the prompt lands | In a `pi.system` entry after the first `pi.user` entry: a provider is handed user, then system. pi-ai's ChatGPT body for `gpt-6.1-sol` then had `instructions: "You are a helpful assistant."`, `tools: []` and the prompt as a developer message after the user's; a changed section was appended as another. OpenAI models through OpenRouter got the same, its Claude route a top-level system prompt. A `beforeRequest` hook returning `collapseSystemMessages()` gave one leading, current prompt, also after `reset()` and a compaction; an entry seeded at creation held only until the first of either. | "sends the model one prompt…" |
| Session id | pi-durable hands the provider none (options `{}`): the ChatGPT body has no `prompt_cache_key`, and pi-ai opened a WebSocket for each of 13 requests. `settings.stream.sessionId`, not a typed field, is passed through, one value per open harness. | the same test |
| How a run ended; what interrupted looks like | The view says neither: `pi.live` is `{}` after every ending, and after a kill it equals a running one (slot `running`, submission `placed`). The submission record says how a run ended: `done` with `answer`, or `unanswered` with `aborted`, `model_error` and the provider's words, or `no_model`. Settled records are listed only by `storage.scanSubmissions`. Interrupted is `inspect()` reporting `paused` with tasks left. | "Stop after continuing what waited says stopped…"; "a call the worker never finished…"; `pi-failure.test.ts` "reads Pi's own reason…" |
| Reading without Pi's runtime | A store opens and reads with no provider, no tools and no environment; a cleanly closed store's bytes were identical afterwards. After a compaction the view holds only what the model is sent; the whole history is read with `entries()` or `storage.scanEntries`. | `pi-sessions.test.ts` "reads what Pi holds…"; "reads a conversation nobody is running…" |
| Retry and compaction | Both are pi-durable's. Retry defaults to three, at 2, 4 and 8 s, for errors pi-ai classes as transient; each failed attempt is an `error` assistant entry left out of later requests. Compaction is on by default and starts 32,768 tokens before its limit as a background task, which plain `abort()` does not stop; `backgroundTokens: 0` turns that off. | "leaves retrying, compaction and failure to Pi…"; the background setting: not pinned |
| Tools | `execute(args, api, context)`: `api.callId` is the model's tool-call id, cancellation is `context.abortSignal`; `prepareArguments` runs before validation. A tool's `executionMode: "sequential"` made its round sequential under the default `parallel`. A thrown error reaches the model wrapped in `<harness>` tags; a returned `{ content, isError: true }` is stored as given. A result that is not strict JSON is not stored, and the model is told "Tool result unavailable". Output is cut to its first 51,200 bytes or 2,000 lines unless the tool sets `outputLimits`; the cut broke a one-line JSON result. | `pi.test.ts` "executes host and workspace mutations…" (sequential, `prepareArguments`), "closes only the obsolete host request…" (a failure in the tool's words); strict JSON and limits: not pinned |
| Models and login | coding-agent's `ModelRuntime` works as `HarnessOptions.models`; an expired OAuth credential was refreshed once, also by two processes sharing one `auth.json`. `agent` passed to `root()` is ignored on a reopened store: `configure()` sets model and thinking level, and writes nothing when unchanged. | `pi-shared-account.test.ts`; `pi.test.ts` "executes host and workspace mutations…" |
| Storage | Node's built-in `node:sqlite`: no native addon, one `ExperimentalWarning` per process. Open, a store is a main file, a `-wal` with nearly all the data and a `-shm`; a clean close leaves only the main file. A main file created `0600` before opening gives `0600` journal files. No API deletes a conversation. `pi-agent-core` 1.0.0 no longer exports `AgentHarness` or `JsonlSessionRepo`. | `pi-sessions.test.ts` "keeps one private store…", "removes every history…", "starts an earlier release's conversation empty…" |
| One writer | Not provided. A second open of the same file succeeds, from another process or the same one. The stale owner's next entry failed ("ID 11 already belongs to entry") but its document-only commits overwrote the other's. A second process that opened mid-turn and resumed called the model again and left three assistant entries for one message; the first then looped until it ran out of memory. | not pinned; Hallvi's lock is: "a second worker steps aside…", "of workers starting in the same instant…" |
| Copying an open store | A copy of the main file alone (4,096 bytes beside an 824,032-byte `-wal`) opened as an empty conversation, no error. Of 3,000 file-by-file copies taken while the owner committed, 4 were damaged; with a checkpoint between copying the main file and the `-wal`, the copy is malformed. `node:sqlite`'s `backup()` from a second connection: 40 of 40 sound. | `controller-protection.test.ts` "carries a conversation the worker has open…" |

## What pi-durable does not provide

- A way to resume one conversation of a store: `resume()` takes no
  conversation, and scheduling is one switch per open store.
- A time at which a run settles: submission and task records carry none, and
  the SQLite schema has no time column. Only messages are stamped.
- A conflict on a reused request id: the caller has to compare the content.
- Metadata on an input: only keys on a content part travel with it.
- The prompt as what leads a request: it is stored after the first message.
- A session id passed to the provider.
- Protection of a store, across processes or within one.

## Not established

- Real providers' behaviour with this request shape, beyond one real run after
  the integration: with a ChatGPT login, Pi answered a read-only request in
  20 s using saved information and two SSH commands, and a second turn
  recalled the first.
- Deferred responses: a request the provider answers later was never run, for
  recovery or for Stop.
- Power loss: only SIGKILL and a graceful close were exercised. As a stand-in,
  a `-wal` cut 1,000 bytes short opened sound with its last commit gone.
- Linux: everything ran on macOS, with a Node that links an external SQLite
  library.
