# Agent feedback

Observations, friction and wishes from agents doing ordinary work. Researched
product proposals live separately in [AGENT_FEATURES.md](AGENT_FEATURES.md).

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-013 — Investigate the first-navigation event-loop pause](#af-013--investigate-the-first-navigation-event-loop-pause) | 4 | Partially improved; pause remains |
| [AF-001 — Record the waiting messages Stop drops](#af-001--record-the-waiting-messages-stop-drops) | 1 | New |
| [AF-002 — Record a workspace command's exit code](#af-002--record-a-workspace-commands-exit-code) | 1 | New |
| [AF-005 — Let the browser suite use a preinstalled Chromium](#af-005--let-the-browser-suite-use-a-preinstalled-chromium) | 1 | New |
| [AF-010 — Read Pi's recorded reasoning through a supported export](#af-010--read-pis-recorded-reasoning-through-a-supported-export) | 1 | New |
| [AF-022 — Send one review's findings to one branch](#af-022--send-one-reviews-findings-to-one-branch) | 1 | New |
| [AF-024 — Explain local leftovers after Forget](#af-024--explain-local-leftovers-after-forget) | 1 | New |
| [AF-025 — Distinguish a saved-route HTTP check from browser usability](#af-025--distinguish-a-saved-route-http-check-from-browser-usability) | 1 | New |
| [AF-027 — Let a checkout show the installed-only update states](#af-027--let-a-checkout-show-the-installed-only-update-states) | 1 | New |
| [AF-028 — Notice browser journeys that stop passing while checks are off](#af-028--notice-browser-journeys-that-stop-passing-while-checks-are-off) | 1 | New |

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
SDK has no supported narrow model-runtime export.

Next's supported default bundling of Pi AI's public imports reduces a separate
external module-loading cost. On current main, five fresh production processes
per build, including a reversed-order repeat, showed a median usable chat opening
of 894 ms before and 782 ms after (ranges 866–977 ms and 762–799 ms). Readiness
required an enabled composer and an initial full SSE snapshot. Median document
TTFB fell from 659 ms to 562 ms, while maximum web event-loop delay stayed around
300 ms. This is a modest loading improvement, not a fix for the pause. The full
coding SDK remains external; duplicate model-catalog creation measured under a
millisecond and was left alone.

These runs used an unsigned assembled production program with Node 22.23.2 on
the shared Mac, isolated Hallvi and standalone Pi accounts, synthetic OAuth
credentials, and no model calls. All eight model/effort choices matched between
builds; preference changes and fresh setup choice worked without a deferred
first-action delay. This establishes the local loading improvement, not native
release acceptance or provider authentication. The first-open harness and raw
results are kept under ignored `work/first-open-runtime/` in the owning worktree.

The earlier [release verification](https://github.com/lustoykov/hallvi/pull/254)
observed 687 ms after histories were warmed. The packaged investigation confirms
a production first-use cost but does not fully attribute that original spike.
Its authoritative runs isolate both Hallvi's account and standalone Pi discovery;
initial runs which only isolated Hallvi's account were excluded.

A 30 September investigation on current source (`8502eb83`) reproduces the
SDK import itself blocking under Node 22.23.2 on the shared Apple-silicon Mac:
one standalone asynchronous public-entry import took 587 ms with 569 ms maximum
event-loop delay. The earlier nonblocking standalone result was not reproduced
in this environment; it remains historical evidence. CPU and module-loading
profiles show synchronous Node module reads, parsing and SDK dependency
initialization, including its terminal, YAML and HTTP libraries. This attributes
a substantial loading cost locally, not every part of the signed release's
separately observed 342–351 ms pause.

A supported public-package bundling comparison then found a concrete boundary.
Bundling the coding SDK and Pi AI reduced six fresh production browser openings
from a median 832 ms usable / 309 ms maximum web-loop delay to 777 ms / 186 ms.
However, the relocated program's OAuth login failed before reaching the provider:
Pi AI's variable provider import became “Cannot find module as expression is too
dynamic”. Keeping Pi AI external restored real device-code login and cancellation,
but six fresh openings became slower at 877 ms usable / 250 ms maximum delay.
The external baseline also reached device-code login and cancelled cleanly.
The experiment was reverted: a partial pause reduction does not justify slower
usable opening, and the faster variant breaks connection setup.

These are unsigned current-source production fixtures, Node 22.23.2 and isolated
synthetic accounts on one shared Mac; no model calls. Readiness required both an
enabled composer and the initial full SSE snapshot. All eight model choices and
preference changes worked, and the relocated programs honored the isolated
standalone Pi account. The original signed-release measurements remain separate.
A supported narrow SDK runtime export or a bundler-compatible OAuth loader could
remove this boundary; neither was implemented. Profiles and the disposable
comparison harness remain under ignored `work/cold-pause/` in the owning worktree.

**+1:** 2026-09-29 — alpha.8 release verification, [PR #254](https://github.com/lustoykov/hallvi/pull/254)

**+1:** 2026-09-29 — signed alpha.8 first-open investigation, codex/first-open-latency

**+1:** 2026-09-29 — supported Pi AI bundling comparison, codex/first-open-runtime

**+1:** 2026-09-30 — current-source cold-opening attribution, codex/remaining-acceptance-verification

### AF-025 — Distinguish a saved-route HTTP check from browser usability

A saved private-route check can succeed while the owner's browser blocks the
address. On 30 September the ordinary AI-profile Chrome returned
`ERR_BLOCKED_BY_CLIENT` for both harmless plain-text and JSON responses served on
the same local port 3760, while independent HTTP requests returned 200. This
reproduces outside the application and deployment. The blocking component remains
unknown; no browser protection was bypassed, and the probes were stopped and
removed. Keep server-side reachability evidence separate from client browser
acceptance when describing a usable private link.

**+1:** 2026-09-30 — remaining browser acceptance diagnosis, codex/remaining-acceptance-verification

### AF-022 — Send one review's findings to one branch

The traffic v1 review findings were fixed twice in parallel: on main (c0e4bf05)
and on the feature branch (round 2). Both fixed query-routed pages with
different event shapes (`q: {k, v}` against `k`), the first live script
arrival and serialization, and the follow-up merge had to pick one of each
and port the tests. Naming one branch as the owner of a review's findings, or
noting on the other which findings are taken, would save that merge.

**+1:** 2026-09-29 — traffic follow-up (`claude/traffic-v1-followup`)

### AF-024 — Explain local leftovers after Forget

In the release rehearsal, forgetting the idle test application removed its
registration and history but left its managed SSH tunnel and application-specific
operator configuration on the controller. Cleanup needed a separate exact-process
and exact-directory check. I would like Forget to explain those retained local
resources and provide a clear scoped cleanup path. This is not a request to delete
remote deployments or shared credentials automatically.

**+1:** 2026-09-30 — factory coordinator, task `01a0e897-125b-7fb2-82c5-0da106e25ea1`

### AF-027 — Let a checkout show the installed-only update states

The Hallvi menu at the foot of the sidebar has its own states: a release
waiting, an update running, failed or finished, and a release source that could
not be reached. Only an installed Hallvi reaches them; a checkout, `npm run
scenarios` and the retained dev applications all read as a development
checkout. Looking at them took a throwaway Playwright script answering
`/api/hallvi/update` from fixtures. A scenario, or a development-only way to
pick the update state, would make that one command.

**+1:** 2026-09-30 — sidebar footer Hallvi menu (`claude/sidebar-footer-menu`)

### AF-028 — Notice browser journeys that stop passing while checks are off

The GitHub consent journey (`tests/browser/github.spec.ts`, first test) had
failed since #179 reworded the Storage & privacy popover on 20 September
("contents" where the test expected "code"). Nothing ran it after the checks
workflow was switched off, and it surfaced only because a later step of the same
test changed. A cheap way to see which journeys currently fail on main would
separate old breakage from a new change's.

**+1:** 2026-09-30 — sidebar footer Hallvi menu (`claude/sidebar-footer-menu`)

## Archive

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-023 — Discover newer releases despite GitHub listing order](#af-023--discover-newer-releases-despite-github-listing-order) | 1 | Fixed in #285 |
| [AF-021 — Let manual public deployment proceed without GitHub login](#af-021--let-manual-public-deployment-proceed-without-github-login) | 1 | Fixed in #282 |
| [AF-019 — Keep deployment failures out of passing server checks](#af-019--keep-deployment-failures-out-of-passing-server-checks) | 1 | Fixed in #280 |
| [AF-020 — Name failed check groups without claiming they passed](#af-020--name-failed-check-groups-without-claiming-they-passed) | 1 | Fixed in #280 |
| [AF-017 — Make record validation easier for Pi to recover from](#af-017--make-record-validation-easier-for-pi-to-recover-from) | 1 | Fixed in #275 |
| [AF-006 — Reduce full-history response serialization](#af-006--reduce-full-history-response-serialization) | 3 | Implemented in #272 |
| [AF-018 — Load the updated interface after an installed upgrade](#af-018--load-the-updated-interface-after-an-installed-upgrade) | 1 | Fixed in #276 |
| [AF-016 — Keep traffic counting consistent with owner choices and page routes](#af-016--keep-traffic-counting-consistent-with-owner-choices-and-page-routes) | 1 | Fixed in #259 |
| [AF-014 — Preserve why an operator turn ended early](#af-014--preserve-why-an-operator-turn-ended-early) | 1 | Resolved in #266 |
| [AF-015 — Clear stale fetch errors after reconnection](#af-015--clear-stale-fetch-errors-after-reconnection) | 1 | Resolved in #265 |
| [AF-007 — Keep architecture explanations in step with code](#af-007--keep-architecture-explanations-in-step-with-code) | 1 | Implemented in #247 |
| [AF-003 — Open-link checks in the shared-information smoke match nothing](#af-003--open-link-checks-in-the-shared-information-smoke-match-nothing) | 1 | Fixed in #245 |
| [AF-004 — Shared-information smoke can miss its 10 s window on a cold dev server](#af-004--shared-information-smoke-can-miss-its-10-s-window-on-a-cold-dev-server) | 1 | Fixed in #245 |
| [AF-011 — Keep elapsed time together on narrow work lines](#af-011--keep-elapsed-time-together-on-narrow-work-lines) | 1 | Resolved in #255 |
| [AF-012 — Keep private access observations truthful and on one route](#af-012--keep-private-access-observations-truthful-and-on-one-route) | 1 | Resolved in #256 |

### AF-023 — Discover newer releases despite GitHub listing order

After alpha.10 publication, GitHub listed alpha.9, alpha.8, then alpha.10.
The installed updater stopped at its cached alpha.9 and said nothing newer was
available; the official bootstrap also chose the first manifest. Rank update
candidates before the cache shortcut and use GitHub's latest-release object
for the default bootstrap, while preserving signed manifest verification.

**+1:** 2026-09-29 — published alpha.10 updater acceptance
(`codex/release-discovery-order`).

**Disposition:** Fixed in [#285](https://github.com/lustoykov/hallvi/pull/285). The running updater ranks version tags before its verified-cache shortcut; the normal installer selects GitHub’s latest published release. Signature and archive checks remain unchanged. A real public-feed check found and verified alpha.10 despite the older cached tag. Older affected installations need the corrected official installer to recover.

### AF-021 — Let manual public deployment proceed without GitHub login

A fresh account could read a public repository and connect its existing server,
then “Deploy master when I ask” failed with a request to connect GitHub so Hallvi
could watch the branch. Manual branch selection should use the existing public
reader; automatic watching and private repository access still need a connection.

**+1:** 2026-09-29 — fresh-account alpha.10 onboarding acceptance
(`codex/manual-public-deployment`).

**Disposition:** Fixed in merged [#282](https://github.com/lustoykov/hallvi/pull/282) makes the branch read mode-aware, including a
manual-to-automatic transition check. Verification guidance worked as written.

### AF-020 — Name failed check groups without claiming they passed

The same rehearsal's app timeline shows a red failed moment labelled “7 checks
passed”. `lane-rails.tsx` turns every counted check group into that phrase,
including groups containing failures. Keep a failed group's label consistent
with its recorded outcomes.

**+1:** 2026-09-29 — real alpha.10 release rehearsal acceptance
(`codex/overview-subject-verdict`), observed again in its isolated browser proof.

**Disposition:** [#280](https://github.com/lustoykov/hallvi/pull/280) labels only passing groups as
passed; failed, informational and planned groups keep a neutral check count.

### AF-019 — Keep deployment failures out of passing server checks

An installed alpha.9 rehearsal correctly recorded a failed application smoke
check and three passed host checks, but Overview answered “No” to “Is the server
up?” beside “3 checks passed”. The server lane inherited the failed deployment
event's overall status through its passing neighbor-preservation check.
Only a judgement about a subject in that lane should apply; individual failed
host checks must still report failure.

**+1:** 2026-09-29 — real alpha.10 release rehearsal acceptance
(`codex/overview-subject-verdict`).

**Disposition:** [#280](https://github.com/lustoykov/hallvi/pull/280) corrects the projection; the regression
keeps the application failure visible and the passed host checks consistent
with the timeline. Verification workflow guidance worked as written.

### AF-017 — Make record validation easier for Pi to recover from

During the real alpha.9 acceptance fixture, Pi deployed and verified the app,
then nine save calls failed because `presentation.checks[].basis` contained
explanatory prose instead of `observed`, `planned` or `reported`. Pi corrected
the calls and finished, but saving the useful result added avoidable churn.
Make the tool contract easier to follow without relaxing record validation.

**Status:** Fixed in [#275](https://github.com/lustoykov/hallvi/pull/275): explicit basis values in the tool description and runtime prompt, a complete check example, and an actionable validation error directing explanations to `detail`. Accepted values and save-time requirements stay the same. A bounded real-Pi trial saved valid observed, planned and reported values; future retry-free behavior is not guaranteed.

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

**Disposition:** Fixed in [#276](https://github.com/lustoykov/hallvi/pull/276).
An open page that observes completion offers an explicit, confirmed Reload page
action. The warning asks the owner to keep unsent work, images and unsaved
settings first. Existing browser recovery preserves text drafts and pending
text request keys; reload does not resend work or settle unknown writes.
The isolated production browser fixture checks cancellation with an attached
image, one document reload, the newer draft and same-key retry. Already loaded
older release code still needs a manual browser reload: the new control is
prospective, not a retroactive repair of alpha.8's JavaScript.

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

**+1:** 2026-09-29 — long-history responses, merged in
[PR #272](https://github.com/lustoykov/hallvi/pull/272) as
[25491cde](https://github.com/lustoykov/hallvi/commit/25491cde10fa8161d6f122a3ed76c1d9d6dd98ff). Incremental SSE retains a full
initial/reconnect snapshot and all recorded evidence, then sends changed
records only. A warm 240-call fixture updating answer text and live output
reduces each active payload from about 2.28 MB to 10.8 KB; ten-reader frame
construction plus encoding falls from about 24.4 ms to 2.4 ms. At that checkpoint, a bounded
2,000-call stress case spent about 134 ms projecting ten snapshots,
separately from the remaining 20 ms diff cost. Worker-link transcript encoding,
first-connect costs and full-history projection remained; that change did not
claim to eliminate them. Reproduce with `scripts/benchmark-chat-responses.ts`;
the production browser comparison retains all six updates in 1/5/10 readers.
At ten readers, 240 calls produce about 2.31 MB per full response versus 10.7 KB
per incremental response, with maximum loop delay 201 ms versus 76 ms. These
bounded synthetic measurements are not latency guarantees; verification and
the earlier unattributed development-mode miss belong in the implementation PR.
Overlapping same-chat SSE refreshes now share only pending reads; activity
projection uses one reply-position map. Settled reads are never cached.
The development profile also needs durable per-reader milestones: its ten-reader
case can exhaust the total setup budget before recording any update result,
with teardown then erasing client evidence. The profile now writes milestones
as they occur and keeps fixture compilation logs; the ten-second update assertion
is unchanged. The original missed wave remains unattributed.

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
