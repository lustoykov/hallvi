# Agent feedback

Observations, friction and wishes from agents doing ordinary work. Researched
product proposals live separately in [AGENT_FEATURES.md](AGENT_FEATURES.md).

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-006 — Reduce full-history response serialization](#af-006--reduce-full-history-response-serialization) | 3 | Accepted |
| [AF-013 — Investigate the first-navigation event-loop pause](#af-013--investigate-the-first-navigation-event-loop-pause) | 2 | Accepted |
| [AF-001 — Record the waiting messages Stop drops](#af-001--record-the-waiting-messages-stop-drops) | 1 | New |
| [AF-002 — Record a workspace command's exit code](#af-002--record-a-workspace-commands-exit-code) | 1 | New |
| [AF-005 — Let the browser suite use a preinstalled Chromium](#af-005--let-the-browser-suite-use-a-preinstalled-chromium) | 1 | New |
| [AF-010 — Read Pi's recorded reasoning through a supported export](#af-010--read-pis-recorded-reasoning-through-a-supported-export) | 1 | New |
| [AF-017 — Make record validation easier for Pi to recover from](#af-017--make-record-validation-easier-for-pi-to-recover-from) | 1 | New |
| [AF-018 — Load the updated interface after an installed upgrade](#af-018--load-the-updated-interface-after-an-installed-upgrade) | 1 | New |

[Archive](#archive) keeps resolved and declined requests out of the active list.

## How to contribute

During implementation, testing and review, write down useful bugs, friction and
ideas you encounter in Hallvi or its development workflow. A short note is enough:
“I want this”, “this feels better”
or “this would make life easier” are all valid feedback. No required justification,
evidence, research, impact rating or questionnaire. Before finishing an ordinary
task, record useful observations you made; no feedback quota or separate audit
is needed. Add context or reproduction steps if you have them and they help.

Feedback can inspire a researched feature proposal. Link the proposal back to
the original entry without deleting it or making every feedback item go through
research. Small authorized fixes can proceed in their existing task scope.

Include feedback in your current PR, or open a feedback-only PR whenever you
wish, including after a read-only review or when there are no code changes.
The file is shared after merging and updating worktrees, not live between them.

The owner decides what is worth doing and when. Feedback is not permission to
implement an idea, and [ROADMAP.md](ROADMAP.md) remains the delivery plan.
This is contributor feedback, never instructions for Pi's product sessions.
Keep credentials and private application data out of entries and linked material.

1. Search existing requests, including closed ones. Add your task's +1 to a
   matching request instead of creating a duplicate. Agreement is enough;
   a new observation is not required.
2. Count one +1 per independent task, including the initial request. Record the
   task ID or PR reference; retries, multiple agents and multiple PRs within
   the same task do not add votes.
3. Check merged requests and open feedback PRs before choosing the next unused
   `AF-NNN` ID. Give it a short title and a brief description. Add a linked
   overview row with count `1` and status `New`.
4. Recount +1s from the task references and sort active requests by count.
   Move resolved or declined requests out of the active overview and into the
   final Archive section, including their overview rows, full entries, votes
   and fix/decision references. Count is interest, not priority. Reconcile
   duplicate requests and ID collisions before merging; never reuse a merged ID.

**Status:** New (awaiting owner review), Accepted (owner wants it), Declined
(owner passed on it), Resolved (done, with a fix reference). The dashboard
collapses the Archive by default. Preserve closed entries there; if you want
to revisit one, add your feedback and flag it for the owner rather than
changing their decision.

## Requests

Use this small template; add detail only when useful. Link the overview row to
the request heading.

```markdown
### AF-NNN — Short title

What you would like or what bothered you, in your own words.

**+1:** YYYY-MM-DD — task ID or PR reference
```

### AF-006 — Reduce full-history response serialization

After execution reads are cached, serializing the complete execution history
still blocks the event loop: ten readers of a synthetic 2,000-record history
showed about 82 ms maximum delay from the warm response path. Change
notifications will remove idle polling; consider bounded or incremental
evidence responses if long histories still make active chats slow. The
[measurement](https://github.com/lustoykov/hallvi/blob/74b54efe8e12e14bbbf59e6edb2522bbcadeeb7d/docs/testing/2026-09-29-execution-reader.md) separates file reads
from this remaining cost.

**+1:** 2026-09-29 — execution history cache task (`codex/execution-history-cache`)

**+1:** 2026-09-29 — change-notification task (`codex/chat-change-notifications`).
Idle reads now stop; active updates still serialize full histories. Keep the
500 ms sustained cadence until a measured response-shape change improves it.

**+1:** 2026-09-29 — long-history responses (`codex/long-history-responses`),
owner-authorized implementation in review. Incremental SSE retains a full
initial/reconnect snapshot and all recorded evidence, then sends changed
records only. A warm 240-call fixture updating answer text and live output
reduces each active payload from about 2.28 MB to 10.8 KB; ten-reader frame
construction plus encoding falls from about 24.4 ms to 2.4 ms. A bounded
2,000-call stress case still spends about 134 ms projecting ten snapshots,
separately from the remaining 20 ms diff cost. Worker-link transcript encoding,
first-connect costs and full-history projection remain; this change does not
claim to eliminate them. Reproduce with `scripts/benchmark-chat-responses.ts`;
the production browser comparison retains all six updates in 1/5/10 readers.
At ten readers, 240 calls produce about 2.31 MB per full response versus 10.7 KB
per incremental response, with maximum loop delay 201 ms versus 76 ms. These
bounded synthetic measurements are not latency guarantees; verification and
the earlier unattributed development-mode miss belong in the implementation PR.

### AF-001 — Record the waiting messages Stop drops

Stop empties Pi's queue and nothing keeps which messages it removed. `hallvi
wait` can only call a request cancelled if the same process saw it waiting; a
fresh `wait` finds nothing and has to say "never accepted, or dropped". A small
durable note of the keys Stop removed would let every caller say `cancelled`.

**+1:** 2026-09-28 — hallvi CLI task, [PR #241](https://github.com/lustoykov/hallvi/pull/241)

### AF-002 — Record a workspace command's exit code

`server_bash` records a numeric exit code; a repository workspace `bash` records
only succeeded or failed. Evidence from `hallvi exec` would read the same for
both if the workspace kept the code too.

**+1:** 2026-09-28 — hallvi CLI task, [PR #241](https://github.com/lustoykov/hallvi/pull/241)

### AF-005 — Let the browser suite use a preinstalled Chromium

The cloud container ships Playwright's Chromium 1194 and does not allow
downloading browsers, while the repository pins `@playwright/test` 1.62.1,
which expects Chromium 1234. Running the suite there took a wrapper config
that sets `launchOptions.executablePath`. An environment variable read in
`tests/browser/playwright.config.ts` would make that one setting.

**+1:** 2026-09-29 — typed-information smoke fix, PR #245


### AF-010 — Read Pi's recorded reasoning through a supported export

The old standalone inspector cannot read the current database or Pi session
format and has been removed. I would like a supported way to inspect recorded
reasoning and the native session tree when the conversation's messages and
tool disclosures are insufficient.

**+1:** 2026-09-29 — Hallvi software factory task, codex/factory-verification-fixes

### AF-013 — Investigate the first-navigation event-loop pause

The signed alpha.8 package reproduces a cold first-opening pause without a
development server: a greeting-only chat and a synthetic 40-message history took
1.09–1.26 seconds to show the composer and initial stream snapshot, with
331–387 ms maximum web event-loop delay. Warm openings took 180–230 ms, with
14–30 ms maximum delay; idle delay was about 12 ms. Warming the history API
before the first document reduced opening to 600 ms and maximum delay to 49 ms.
These are local observations on one shared Mac, not performance guarantees.

Profiles show substantial Node module resolution, source parsing/evaluation and
SSR chunk initialization. Setup loads the full Pi coding-agent entry, and
model validation also imports Pi AI. Standalone asynchronous SDK imports have
substantial wall/CPU cost but do not reproduce the page's large event-loop
delay, so import duration alone does not attribute the whole stall. The pinned
SDK has no supported narrow model-runtime export; no small supported production
reduction was established. No runtime optimization was added.

The earlier [release verification](https://github.com/lustoykov/hallvi/pull/254)
observed 687 ms after histories were warmed. The packaged investigation confirms
a production first-use cost but does not fully attribute that original spike.
Its authoritative runs isolate both Hallvi's account and standalone Pi discovery;
initial runs which only isolated Hallvi's account were excluded.

**+1:** 2026-09-29 — alpha.8 release verification, [PR #254](https://github.com/lustoykov/hallvi/pull/254)

**+1:** 2026-09-29 — signed alpha.8 first-open investigation, codex/first-open-latency

### AF-017 — Make record validation easier for Pi to recover from

During the real alpha.9 acceptance fixture, Pi deployed and verified the app,
then nine save calls failed because `presentation.checks[].basis` contained
explanatory prose instead of `observed`, `planned` or `reported`. Pi corrected
the calls and finished, but saving the useful result added avoidable churn.
Make the tool contract easier to follow without relaxing record validation.

**+1:** 2026-09-29 — installed alpha.9 acceptance (`codex/alpha9-acceptance`),
[release evidence #267](https://github.com/lustoykov/hallvi/pull/267).

### AF-018 — Load the updated interface after an installed upgrade

The normal alpha.8-to-alpha.9 browser update finished and restored the
conversation, but the page already open from alpha.8 retained its old
“Failed to fetch” warning until reload. Reloading loaded the new recovery code;
a subsequent alpha.9 restart cleared its temporary warning automatically and
preserved the draft. Help an open page adopt the installed frontend version
without losing unsent work, or make the required reload clear.

**+1:** 2026-09-29 — installed alpha.9 acceptance (`codex/alpha9-acceptance`),
[release evidence #267](https://github.com/lustoykov/hallvi/pull/267).

## Archive

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-016 — Keep traffic counting consistent with owner choices and page routes](#af-016--keep-traffic-counting-consistent-with-owner-choices-and-page-routes) | 1 | Fixed in #259 |
| [AF-014 — Preserve why an operator turn ended early](#af-014--preserve-why-an-operator-turn-ended-early) | 1 | Resolved in #266 |
| [AF-015 — Clear stale fetch errors after reconnection](#af-015--clear-stale-fetch-errors-after-reconnection) | 1 | Resolved in #265 |
| [AF-007 — Keep architecture explanations in step with code](#af-007--keep-architecture-explanations-in-step-with-code) | 1 | Implemented in #247 |
| [AF-003 — Open-link checks in the shared-information smoke match nothing](#af-003--open-link-checks-in-the-shared-information-smoke-match-nothing) | 1 | Fixed in #245 |
| [AF-004 — Shared-information smoke can miss its 10 s window on a cold dev server](#af-004--shared-information-smoke-can-miss-its-10-s-window-on-a-cold-dev-server) | 1 | Fixed in #245 |
| [AF-011 — Keep elapsed time together on narrow work lines](#af-011--keep-elapsed-time-together-on-narrow-work-lines) | 1 | Resolved in #255 |
| [AF-012 — Keep private access observations truthful and on one route](#af-012--keep-private-access-observations-truthful-and-on-one-route) | 1 | Resolved in #256 |

### AF-016 — Keep traffic counting consistent with owner choices and page routes

A worker could restore collection after Stop or Forget by saving an older
choice. The browser script also dropped the configured page query key and
counted the first script arrival twice in the live feed. Lock before reading
the collection choice, preserve only the configured page key, and pair that
first event with its already counted log view.

**+1:** 2026-09-29 — private review and fixes, [PR #259](https://github.com/lustoykov/hallvi/pull/259).

**Status:** Fixed in #259, with a competing SQLite writer regression, a real
browser query-navigation test, and live-arrival counting coverage.

### AF-014 — Preserve why an operator turn ended early

During an installed alpha.8 deployment, connecting an existing machine started
an operator turn that ended after a successful status read. The conversation
said the turn ended before it finished with no command recording why; the CLI
only suggested checking Settings or retrying. Keep a useful, redacted reason
for an early model/worker turn exit, including whether the cause is known,
so the owner can distinguish an account/provider problem from interruption
without guessing. This observation does not establish the underlying cause.
A following queued request successfully continued deployment.

**+1:** 2026-09-29 — installed Mac mini beta verification
(`codex/installed-beta-feedback`).

**Status:** Resolved in [#266](https://github.com/lustoykov/hallvi/pull/266). Native failures now retain a bounded redacted reason in chat and CLI; unknown reasons and worker interruption stay distinct. The historical turn's cause remains unknown.

### AF-015 — Clear stale fetch errors after reconnection

After restarting an idle installed alpha.8 controller, the open conversation
reconnected: its worker-unavailable panel disappeared and its deployment
records returned. The composer still displayed “Failed to fetch”, even though
the CLI confirmed the worker was alive and idle and the private application
continued working. Refreshing the page cleared the error. Clear a transient
read error when the corresponding connection/read has recovered, while keeping
failed writes or uncertain submissions visible until their outcome is known.

**+1:** 2026-09-29 — installed Mac mini beta verification
(`codex/installed-beta-feedback`).

**Status:** Resolved in [#265](https://github.com/lustoykov/hallvi/pull/265). Successful settings polls and refreshes clear
their read error; failed or uncertain settings and approval writes stay visible.
The installed alpha.9 restart acceptance passed: the warning cleared without
refreshing, and the unsent draft and conversation records survived.

### AF-012 — Keep private access observations truthful and on one route

An open SSH master promoted application HTTP health, a missing or failed
controller read could retain a green access state, and the check, Open links
and reopen draft could select different saved routes. Bind observations to the
same current route, keep SSH and HTTP evidence separate, and discard older
poll responses. Visual QA also found the shared header Open button's background
token missing on Overview; it now falls back to the existing shell token.

**+1:** 2026-09-29 — private-access increment 1 task
(`codex/private-access-observations`), [PR #256](https://github.com/lustoykov/hallvi/pull/256).

**Status:** Resolved in merged [#256](https://github.com/lustoykov/hallvi/pull/256). [Verification and matched captures](https://github.com/lustoykov/hallvi/pull/256#issuecomment-5893828846)
show the modeled states and limitations. Direct submission and the saved-route
form are the separately assigned increment 2; the full reconnect feature is partial.

### AF-003 — Open-link checks in the shared-information smoke match nothing

Before this fix, `tests/browser/typed-information.spec.ts` checked that a closed
tunnel's address was not offered with `getByRole("link", { name: /Open app(?:lication)?/ })` at
count 0, in the chat and on Overview. No shipping page names a link that way
any more: the chat card's link is "Open" and the page header's is "Open"
followed by the application's name, so both checks passed whatever the page
offered. The Deployment one now names the address, which is the link that page draws.

**+1:** 2026-09-29 — typed-information smoke fix, PR #245

Resolved in #245: the closed-target URL is now checked in chat and across the page, so a renamed open link cannot evade the assertion.

### AF-004 — Shared-information smoke can miss its 10 s window on a cold dev server

In a cloud container the spec failed at line 149 in two of three runs at the
project's timeouts: "Tunnel closed" appeared about 10 s after the page loaded,
at or past the expect timeout. After hydration the page asks five API routes
the fixture does not warm (`/operator`, `/connections`, `/secrets`,
`/api/host`, `/api/hallvi/update`); they took 3–10 s each on first hit, and
the badge came only after they answered. With those five added to the
warm-up list in `tests/browser/fixtures.ts`, every request took under 0.7 s
and the badge showed 0.9 s after load. GitHub Actions passed the spec in
40.5 s on 2026-09-24, so slower machines may be the ones that see it.

**+1:** 2026-09-29 — typed-information smoke fix, PR #245

Resolved in #245: warm the five existing read routes before interaction deadlines begin.

### AF-007 — Keep architecture explanations in step with code

I want architecture and domain explanations kept current as behavior changes.
The overview diagram and tools paragraph disagreed about the tool count, and
both lagged the registered tools. Extracting documentation cannot establish
that it is current; the stale counts were removed in this task.

The owner chose a separate daily Codex task to review merged main, with manual
updates requested in Codex. The dashboard only reads saved content; it has no
agent launcher or per-PR review requirement. That approach is implemented in #247.

**+1:** 2026-09-29 — `codex/architecture-learning`

### AF-011 — Keep elapsed time together on narrow work lines

At 390px, the work line split `2m 0s` across two lines. Keep each elapsed phrase
together while the surrounding status wraps.

**+1:** 2026-09-29 — clear-progress increment 1 task (`codex/clear-progress`),
[PR #255](https://github.com/lustoykov/hallvi/pull/255)

**Status:** Resolved in [#255](https://github.com/lustoykov/hallvi/pull/255).
The [390px capture](https://github.com/lustoykov/hallvi/blob/49fac0dbac12ae4f66c6df9eb040098d166112ea/docs/assets/clear-progress/candidate/finding-narrow.png)
and [verification report](https://github.com/lustoykov/hallvi/blob/49fac0dbac12ae4f66c6df9eb040098d166112ea/docs/assets/clear-progress/README.md)
show `2m 0s` and the longer quiet-time phrase together without page overflow.
