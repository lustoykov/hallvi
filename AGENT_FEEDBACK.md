# Agent feedback

Observations, friction and wishes from agents doing ordinary work. Researched
product proposals live separately in [AGENT_FEATURES.md](AGENT_FEATURES.md).

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-054 — Check traffic assets after installation](#af-054--check-traffic-assets-after-installation) | 1 | Fix in review |
| [AF-013 — Investigate the first-navigation event-loop pause](#af-013--investigate-the-first-navigation-event-loop-pause) | 4 | Partially improved; pause remains |
| [AF-002 — Record a workspace command's exit code](#af-002--record-a-workspace-commands-exit-code) | 2 | New |
| [AF-017 — Make record validation easier for Pi to recover from](#af-017--make-record-validation-easier-for-pi-to-recover-from) | 2 | Basis fixed in #275; absence-record friction remains |
| [AF-047 — Investigate stdout listener warnings during real Pi turns](#af-047--investigate-stdout-listener-warnings-during-real-pi-turns) | 1 | New |
| [AF-038 — Check installed versions behind upstream shrinkwraps](#af-038--check-installed-versions-behind-upstream-shrinkwraps) | 4 | New |
| [AF-001 — Record the waiting messages Stop drops](#af-001--record-the-waiting-messages-stop-drops) | 2 | New |
| [AF-005 — Let the browser suite use a preinstalled Chromium](#af-005--let-the-browser-suite-use-a-preinstalled-chromium) | 1 | New |
| [AF-010 — Read Pi's recorded reasoning through a supported export](#af-010--read-pis-recorded-reasoning-through-a-supported-export) | 1 | New |
| [AF-022 — Send one review's findings to one branch](#af-022--send-one-reviews-findings-to-one-branch) | 1 | New |
| [AF-024 — Explain local leftovers after Forget](#af-024--explain-local-leftovers-after-forget) | 1 | New |
| [AF-025 — Distinguish a saved-route HTTP check from browser usability](#af-025--distinguish-a-saved-route-http-check-from-browser-usability) | 2 | New |
| [AF-027 — Let a checkout show the installed-only update states](#af-027--let-a-checkout-show-the-installed-only-update-states) | 2 | New |
| [AF-028 — Notice browser journeys that stop passing while checks are off](#af-028--notice-browser-journeys-that-stop-passing-while-checks-are-off) | 8 | Partially fixed |
| [AF-033 — Refuse a second preview before attaching retained state](#af-033--refuse-a-second-preview-before-attaching-retained-state) | 1 | New |
| [AF-034 — Native host checks must exercise link and clipboard failures](#af-034--native-host-checks-must-exercise-link-and-clipboard-failures) | 5 | New |
| [AF-035 — Say "awaiting approval" while request_approval waits](#af-035--say-awaiting-approval-while-request_approval-waits) | 1 | New |
| [AF-036 — Let the plugin label the messages it sends](#af-036--let-the-plugin-label-the-messages-it-sends) | 2 | New |
| [AF-040 — Say whether a Pi upgrade keeps the shared login readable](#af-040--say-whether-a-pi-upgrade-keeps-the-shared-login-readable) | 2 | New |
| [AF-041 — Show OpenRouter credit beside the saved key](#af-041--show-openrouter-credit-beside-the-saved-key) | 1 | New |
| [AF-042 — Include consent and notices in traffic setup](#af-042--include-consent-and-notices-in-traffic-setup) | 1 | Controls retained; mandatory opt-in removed by owner |
| [AF-043 — Do not imply automatic sign-up tracking](#af-043--do-not-imply-automatic-sign-up-tracking) | 1 | Fix in review |
| [AF-044 — Keep dashboard UI checks away from real learning progress](#af-044--keep-dashboard-ui-checks-away-from-real-learning-progress) | 1 | New |
| [AF-048 — Ask the host for a taller panel inside a conversation](#af-048--ask-the-host-for-a-taller-panel-inside-a-conversation) | 1 | New |
| [AF-050 — Keep Pi's replies from summoning the owner](#af-050--keep-pis-replies-from-summoning-the-owner) | 1 | New |
| [AF-051 — Retire or rewrite the conversation-first capture](#af-051--retire-or-rewrite-the-conversation-first-capture) | 1 | New |
| [AF-056 — Check the port before rebuilding the scenario database](#af-056--check-the-port-before-rebuilding-the-scenario-database) | 1 | New |
| [AF-057 — Say which Node a checkout runs under](#af-057--say-which-node-a-checkout-runs-under) | 1 | New |
| [AF-058 — Give the Overview before a verified deployment the same plain labels](#af-058--give-the-overview-before-a-verified-deployment-the-same-plain-labels) | 1 | New |
| [AF-059 — Remove the red a closed head never shows](#af-059--remove-the-red-a-closed-head-never-shows) | 1 | New |
| [AF-063 — Stagger browser fixtures on a shared development machine](#af-063--stagger-browser-fixtures-on-a-shared-development-machine) | 1 | Guidance added |
| [AF-065 — Show a failed recovery-kit read](#af-065--show-a-failed-recovery-kit-read) | 1 | New |
| [AF-066 — Agree the navigation column's width with the design document](#af-066--agree-the-navigation-columns-width-with-the-design-document) | 1 | New |
| [AF-067 — Give the scenarios a new application and a one-application home](#af-067--give-the-scenarios-a-new-application-and-a-one-application-home) | 2 | New |
| [AF-068 — Remove the mascot placements nothing draws](#af-068--remove-the-mascot-placements-nothing-draws) | 1 | New |
| [AF-069 — Carry a long conversation to the page once, and less of it](#af-069--carry-a-long-conversation-to-the-page-once-and-less-of-it) | 1 | New |
| [AF-070 — Land a message link in a long conversation](#af-070--land-a-message-link-in-a-long-conversation) | 1 | Fix in review |
| [AF-071 — Refresh compact message dates after midnight](#af-071--refresh-compact-message-dates-after-midnight) | 1 | New |
| [AF-072 — Give the release's upgrade journey a real conversation](#af-072--give-the-releases-upgrade-journey-a-real-conversation) | 1 | New |
| [AF-073 — Say exactly when a request ended](#af-073--say-exactly-when-a-request-ended) | 1 | New |
| [AF-074 — Let the model look before Continue finishes an interrupted step](#af-074--let-the-model-look-before-continue-finishes-an-interrupted-step) | 1 | New |
| [AF-075 — Keep a worktree from borrowing the main checkout's packages](#af-075--keep-a-worktree-from-borrowing-the-main-checkouts-packages) | 1 | New |
| [AF-076 — Raise the proof of fit's findings with Pi upstream](#af-076--raise-the-proof-of-fits-findings-with-pi-upstream) | 1 | New |
| [AF-077 — Give the scenarios a conversation](#af-077--give-the-scenarios-a-conversation) | 1 | New |
| [AF-078 — Say what Deployment's Took column means when nothing was timed](#af-078--say-what-deployments-took-column-means-when-nothing-was-timed) | 1 | New |
| [AF-079 — Decide the shell's button font reset](#af-079--decide-the-shells-button-font-reset) | 1 | New |
| [AF-080 — Give the registers a phone layout](#af-080--give-the-registers-a-phone-layout) | 2 | Scroll hint in review; stacked layout open |
| [AF-081 — Let the keyboard-ring check fail](#af-081--let-the-keyboard-ring-check-fail) | 2 | Fix in review |
| [AF-082 — Show a stopped reply's text once](#af-082--show-a-stopped-replys-text-once) | 1 | New |
| [AF-083 — Let the checks notice runtime advisories and lockfile drift](#af-083--let-the-checks-notice-runtime-advisories-and-lockfile-drift) | 1 | New |

[Archive](#archive) keeps resolved and declined requests out of the active list.

### AF-083 — Let the checks notice runtime advisories and lockfile drift

A critical advisory against the pinned `next` (GHSA-vcvr-r3jv-pc5j) sat on
`main` until someone ran `npm audit --omit=dev` by hand; `npm run checks`
has no step that would have said so. The same bump showed `main`'s lockfile
was not what npm writes: since the Pi 1.0 move, any `npm install` re-marks
eight root packages (`cross-spawn`, `which`, `yaml` and their kin) as
development-only, so an unrelated diff rides along with the next dependency
change. A step that lists runtime advisories other than the known AF-038 one,
and says when `npm install --package-lock-only` would change the lockfile,
would catch both.

**+1:** 2026-10-02 — Next.js 16.3.8 bump, `claude/next-16.3.8-og-advisory`.

### AF-082 — Show a stopped reply's text once

A failed or interrupted reply that has a transcript prints what Hallvi last
said twice: inside "Show unfinished draft" and again under Try again. Leaving
the disclosure out when the transcript already shows the text is one line,
but `tests/browser/applications.spec.ts:121` opens that disclosure on exactly
such a reply, so it wants a decision rather than a polish fix.

**+1:** 2026-10-02 — interface polish pass, `claude/ui-polish-pass`.

### AF-081 — Let the keyboard-ring check fail

`tests/browser/interactions.spec.ts:209` reads
`getComputedStyle(element, ":focus-visible").outlineStyle`. In this Chromium
that returns an empty declaration, so `!== "none"` is always true and the walk
passes whatever a control draws. Reading the focused element's own computed
outline (or its label's, for the two fields whose label draws the ring) would
make it able to fail.

**+1:** 2026-10-02 — interface polish pass, `claude/ui-polish-pass`.

**+1:** 2026-10-02 — smooth UI pass, `codex/ui-smooth-polish`: corrected
the check to inspect the actual focused element or its label; the keyboard
journey passes with that real outline check.

### AF-080 — Give the registers a phone layout

Below about 1000px a register table now keeps a 720px floor and scrolls
sideways inside its card, with the opened row travelling with it. That stops
the page running off the screen, but nothing hints that the table scrolls and
an opened release's checks sit off-screen until it does. A stacked row for
narrow screens is a design question, not a fix.

**+1:** 2026-10-02 — interface polish pass, `claude/ui-polish-pass`.

**+1:** 2026-10-02 — smooth UI pass, `codex/ui-smooth-polish`: reproduced
the hidden columns in a narrow window. Added a width-aware scroll hint and
keyboard scrolling to the shared table. A stacked-row design remains open.

### AF-079 — Decide the shell's button font reset

`.hv-adaptive-shell button { font: inherit }` in `application-shell.css`
outranks every one-class button rule, so inside an application a button's own
size and weight never apply. This pass restored 13px at 560 for the primary,
the secondary, Send and Backups' primary, as the component design states. About
twenty other classes still render at what they inherit: Steer and
"Review private access" declare 600 and draw 400, the ask pills and the call
lines declare 12 to 12.5px and draw 13px. Removing the reset would move all of
them at once, so it needs a look at every destination first.

**+1:** 2026-10-02 — interface polish pass, `claude/ui-polish-pass`.

### AF-078 — Say what Deployment's Took column means when nothing was timed

A release with no timed steps prints a dash in Took. The component design says
a dash appears nowhere and a missing reading is "not recorded", but those
words do not fit the 84px column, and widening it squeezes "What shipped" at
the table's floor. It needs a wording or a column decision.

**+1:** 2026-10-02 — interface polish pass, `claude/ui-polish-pass`.

### AF-077 — Give the scenarios a conversation

`npm run scenarios` has no worker, so every conversation shows the repository
card and the connect banner and nothing else. Looking at replies, call groups,
a running command, an approval, an interrupted turn and a secret request
needed a hand-written stand-in on the worker's socket, kept in ignored `work/`.
A scripted transcript for a few scenario applications, behind the same command,
would put the conversation in front of a reviewer the way the destinations are.

**+1:** 2026-10-02 — interface polish pass, `claude/ui-polish-pass`.

### AF-076 — Raise the proof of fit's findings with Pi upstream

The proof of fit for Pi 1.0 found six things that are Pi's to change and
worth raising there. One conversation of a store cannot be resumed alone: the
scheduler is one switch for the whole store, which is why Hallvi keeps one
store per conversation. A run records no time at which it settles. A request
id sent again with different content is taken for a duplicate of the first,
so Hallvi compares the text itself. An input has no place for the host's own
data, so when and where a message was sent ride on its content. The system
prompt is stored after the first message and reaches ChatGPT models as a
developer message unless the host gathers it to the front. Pi passes no
session id to the provider, so Hallvi sets one.

**+1:** 2026-10-02 — Pi 1.0 move, `claude/pi-1.0`

### AF-075 — Keep a worktree from borrowing the main checkout's packages

A worktree under `.claude/worktrees/` sits inside the main checkout, so a
package missing from its own `node_modules` is found in the main checkout's.
After `@earendil-works/pi-agent-core` was removed from this branch, tests that
still imported it resolved the main checkout's copy (0.87.1) instead of
failing to find it. A removed dependency reads as present, at whatever version
the main checkout happens to hold.

**+1:** 2026-10-02 — Pi 1.0 move, `claude/pi-1.0`

### AF-074 — Let the model look before Continue finishes an interrupted step

After a restart, Continue has Pi give the interrupted call an error result and
then make the calls that were still to come in that same step, under the same
permission mode and approvals, before the model is asked again. The model
hears that a call was cut only after the calls it had planned beside it have
run. I would like the model to see the interrupted result first and decide
whether the rest still holds. The order is Pi's, not Hallvi's.

**+1:** 2026-10-02 — Pi 1.0 move, `claude/pi-1.0`

### AF-073 — Say exactly when a request ended

Pi records no time at which a run settles, so `operation.endedAt` is when Pi
began its last answer or last heard from a tool. A run whose last answer
streams for a minute ends a minute early in the CLI's JSON. An exact time
needs Pi to record when a run settles.

**+1:** 2026-10-02 — Pi 1.0 move, `claude/pi-1.0`

### AF-072 — Give the release's upgrade journey a real conversation

`scripts/verify-installed-upgrade.mjs` seeds an application, its chats and the
permission setting, and the only message it expects is Hallvi's greeting,
which needs no model. The release's four jobs therefore pass whether or not
the candidate can open or replace a history Pi wrote under the baseline. The
move to Pi 1.0 changed where a conversation lives and was proven by hand on a
retained application instead. I would like the upgrade jobs to carry one
conversation Pi really wrote.

**+1:** 2026-10-02 — Pi 1.0 move, `claude/pi-1.0`

### AF-071 — Refresh compact message dates after midnight

PR #325 memoizes transcript rows, so an unchanged message's `LocalTime` no
longer reads the current date when the pane's clock ticks or the owner types.
In a disposable Chromium fixture, moving the browser clock from 1 October
23:59 to 2 October 00:01 left an earlier message labelled `12:00` after typing;
the same check on the base revision changed it to `1 Oct, 12:00`. Reproduced
on `db6b9aa4`, passing on `cac3e2f5`. Give the timestamp its own day-change
update while keeping the rest of the message memoized.

**+1:** 2026-10-01 — review of [PR #325](https://github.com/lustoykov/hallvi/pull/325), `codex/review-325-feedback`.

### AF-070 — Land a message link in a long conversation

A link to a message (`?message=`) scrolled to its target and was then carried
to the end: the conversation keeps to its latest message as it grows and was
never told the reader had been taken somewhere. On a 160-message synthetic
conversation `?message=reply:40` was not on screen at 0.3, 0.7, 1.5 or 3
seconds after loading. A repeated record's `#record-` anchor after a reload
and Overview's "open the conversation at this reply" scroll the same way and
were given the same fix without being measured separately. The fix tells the
conversation the reader was taken somewhere; the long-history journey checks
the message link.

**+1:** 2026-10-01 — opening a long conversation, `claude/app-open-performance`.

### AF-069 — Carry a long conversation to the page once, and less of it

Opening an application still moves its whole conversation twice: once in the
page and again as the stream's first frame, which is sent uncompressed
(`no-transform`). With 2,000 synthetic calls that is 19 MB each time; the
browser spends about 200 ms taking the frame in although nothing in it is
drawn again, and the server builds the conversation twice (about 140 ms
each). Over a tunnel to a remote controller the second copy is the larger
half of the wait. About 96% of those bytes are command output and call
results behind disclosures that open closed. Two directions, neither built:
start the stream from the state the page was drawn from, so the first frame
is a difference; and send what a closed row shows, fetching a call's output
when it is opened.

**+1:** 2026-10-01 — opening a long conversation, `claude/app-open-performance`.

### AF-068 — Remove the mascot placements nothing draws

`.axbc-guy` in `backup-prototype/calendar.css` and `.axm-guy` in
`deployment-prototype/transit.css` size a Little Server that no component
renders. Found while replacing the three.js mascot with the flat drawing, and
left alone as outside that change.

**+1:** 2026-10-01 — flat mascot, `claude/flat-mascot`.

### AF-067 — Give the scenarios a new application and a one-application home

`npm run scenarios` serves twelve applications that all have records, so three
layouts never appear on it: Add application on a first run, the applications
home with a single application, and the welcome in an untouched conversation.
Checking the flat mascot in them needed the disposable browser fixture and an
API call, and that fixture copies `src` once, so each edit meant restarting
it. An application with no records in the scenario file, and a way to see the
home with one application, would put those states behind the server that
reloads as you edit.

**+1:** 2026-10-01 — flat mascot, `claude/flat-mascot`.
**+1:** 2026-10-02 — interface polish pass, `claude/ui-polish-pass`: the
first-run Add application and the one-application home could not be looked at.

### AF-066 — Agree the navigation column's width with the design document

The component design's Layout section says the workspace shell has a 240px
navigation column; `application-shell.css` lays it out at 224px. One of the
two is stale, and anything aligned to the column from the document lands 16px
off.

**+1:** 2026-10-01 — alpha strip polish, `claude/alpha-notice-polish`.

### AF-065 — Show a failed recovery-kit read

The Backups disclosure silently drops a failed recovery-kit GET and can stay
on “Reading the kit…” with “I saved it” disabled. Closing and reopening retries;
Settings already reports the error and leaves Show recovery kit available.
This is a source-review observation in `controller-protection.tsx`, not a
reproduced browser blocker in this task. Give the disclosure an explicit error
and retry when improving this recovery path.

**+1:** 2026-10-01 — application QA and release,
`codex/application-qa-release`.

### AF-063 — Stagger browser fixtures on a shared development machine

Running several agents' Next.js fixtures and scenario servers simultaneously
on this 24 GB Mac exhausted available memory (14 GB compressed, load average
35). Fixture route warm-up timed out before assertions, obscuring product
failures. The verification guide now calls for coordinating browser/build work
on memory-limited hosts and rerunning affected checks after scoped cleanup.

**+1:** 2026-10-01 — application QA and release,
`codex/application-qa-release`.

### AF-054 — Check traffic assets after installation

Installed alpha.12 contains `src/traffic-script/hv.js` outside `app/`, while
the worker reads it relative to `app/`. The archive includes the file and the
service starts, but Pi's `traffic_script` fails with ENOENT. Move `src/` with
the runtime and check the canonical reader after clean installation and upgrade.

**+1:** 2026-10-01 — hallvi-landing traffic setup repair,
`codex/traffic-script-package`.

### AF-050 — Keep Pi's replies from summoning the owner

The product no longer says "Needs you", "Waiting for you" or "Needs
attention", and `calm-labels.test.ts` keeps them out of the sources. Pi's
instructions still end by asking for "what needs attention"
(`src/server/pi.ts`), so a reply can still open on a "Needs attention:"
heading the guard cannot see. Rewording it wants a live-model check.

**+1:** 2026-09-30 — calm labels, `claude/calm-asks`

### AF-051 — Retire or rewrite the conversation-first capture

`tests/browser/conversation-first.capture.mjs` still waits for the receipts
retired on 20 September ("Proposed change · not applied", "Review and approve
in…", groups named by state), so it cannot run against the current shell.
Only its wording was updated.

**+1:** 2026-09-30 — calm labels, `claude/calm-asks`

### AF-056 — Check the port before rebuilding the scenario database

`npm run scenarios -- <port>` deletes and rebuilds `tests/results/scenarios`
before it starts Next. Run a second time on a port a scenario server already
holds, it rebuilds the database under the running server and only then fails
with `EADDRINUSE`. The owner hit this while a preview was open. Checking that
the port is free before touching the state would let the second run fail
without side effects.

**+1:** 2026-10-01 — Overview leads with visitors, `claude/overview-visitors-first`

### AF-057 — Say which Node a checkout runs under

This Mac's default `node` is 26. `npm run checks` refuses anything but
Node 22, but `npm ci`, `npm test` and `npm run scenarios` use whatever is on
the path. Under Node 26.9.0, `unit/hallvi-plugin-update.test.ts` fails with
"ssh failed (1)" and reads like a product failure; under Node 22.23.2 the
suite passes. Native modules installed under one version also fail to load
under the other. An `.nvmrc` or an `engines` field would say so first.

**+1:** 2026-10-01 — Overview leads with visitors, `claude/overview-visitors-first`

### AF-058 — Give the Overview before a verified deployment the same plain labels

The deployed Overview now says "Recent" and "Checked by Hallvi", and its head
says how the address reads in plain words. The compositions shown before a
verified deployment still say "What has been assessed", "What happened" and
"Is the way in working?". The owner found that family of labels precious on
the deployed page. Overview's title is also the web part's name, so a static
site behind Caddy is titled "Caddy".

**+1:** 2026-10-01 — Overview leads with visitors, `claude/overview-visitors-first`

### AF-059 — Remove the red a closed head never shows

`journey-v2.css` colours `.axj3-closed` red, but `.axj3-open small` is more
specific and always wins, so "The tunnel is closed" and "The address did not
answer" render in muted grey. `DESIGN.md` says a failed observation is neutral,
so the grey is the intended one. The rule reads as if those heads were red, and
this change's first description said so.

**+1:** 2026-10-01 — Overview leads with visitors, `claude/overview-visitors-first`

### AF-017 — Make record validation easier for Pi to recover from

During the real alpha.9 acceptance fixture, Pi deployed and verified the app,
then nine save calls failed because `presentation.checks[].basis` contained
explanatory prose instead of `observed`, `planned` or `reported`. Pi corrected
the calls and finished, but saving the useful result added avoidable churn.
Make the tool contract easier to follow without relaxing record validation.

**Status:** The basis-value problem was fixed in [#275](https://github.com/lustoykov/hallvi/pull/275): explicit basis values in the tool description and runtime prompt, a complete check example, and an actionable validation error directing explanations to `detail`. Accepted values and save-time requirements stay the same. A bounded real-Pi trial saved valid observed, planned and reported values; future retry-free behavior is not guaranteed.

**+1:** 2026-09-29 — installed alpha.9 acceptance (`codex/alpha9-acceptance`),
[release evidence #267](https://github.com/lustoykov/hallvi/pull/267).


**+1:** 2026-09-30 — post-merge audit, task
`01a0f19e-1f49-7d70-947b-28c911465e09`.

A different contract mismatch occurred after verified Linkding cleanup on
`7013e270`: seven absent-state writes included passed removal checks (and two
included facts). Validation rejected them; Pi recovered by saving the absence
states without those fields. The original basis fix is unaffected. Make the
absence/event distinction easier to write correctly on the first attempt,
without weakening the rule that an absent application cannot appear healthy.
This is observed authoring friction, not failed remote cleanup or lost data.


### AF-047 — Investigate stdout listener warnings during real Pi turns

**+1:** 2026-09-30 — post-merge audit, task
`01a0f19e-1f49-7d70-947b-28c911465e09`.

The retained Paperless development controller at `8bbc1ad3` logged
`MaxListenersExceededWarning` for `SyncWriteStream` during real Pi turns.
The requests completed normally and browser error logs were empty. Determine
which listener owner accumulates before proposing a fix; this observation does
not establish a product failure or justify raising the listener limit.

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

### AF-040 — Say whether a Pi upgrade keeps the shared login readable

Attach guards Pi's history format, but every checkout reads the ChatGPT login
in `~/.config/hallvi/pi` whatever Pi it bundles, and a refresh written by one
Pi version has to stay readable by the others. Nothing names that boundary.
Establishing it for 0.99.1 meant diffing `dist/` against another checkout's
0.87.1, because `pi-ai` and `pi-agent-core` ship no changelog. A line in
[the development environment](docs/development-environment.md) naming the
credential file as a boundary, or a check beside the history-format one,
would make an upgrade's live run a decision instead of an investigation.

**+1:** 2026-09-30 — Pi 0.99.1 upgrade, `claude/pi-0.99`
**+1:** 2026-10-02 — Pi 1.0 move, `claude/pi-1.0`: a live run on Pi 1.0.0
used the shared ChatGPT login in `~/.config/hallvi/pi` without a new login.
That it would was again established by hand, by comparing the installed
`dist/` with a 0.99.1 checkout's: `pi-ai`'s `auth/` differs only in its
Anthropic sign-in, and `pi-coding-agent`'s `auth-storage` and
`runtime-credentials` are identical.

### AF-042 — Include consent and notices in traffic setup

**+1:** 2026-09-30 — owner's traffic privacy task,
[PR #306](https://github.com/lustoykov/hallvi/pull/306), merged.

The cookie-free script's requests enter logs with IP/browser information.
PR #306 added grant/withdrawal, versioned includes and setup guidance. On
1 October the owner chose immediate script-only measurement without a banner
or mandatory grant callback. Optional controls remain for sites that use them;
this setup makes no consent-exemption or legal-compliance claim.

### AF-043 — Do not imply automatic sign-up tracking

**+1:** 2026-09-30 — owner's traffic privacy and goals task,
[PR #306](https://github.com/lustoykov/hallvi/pull/306) in review.

“Goals, like sign-ups” appeared as a default benefit although the owner must
mark those actions in application code. This task removes that checklist row
and shows the Goals card only when the selected range has recorded goal events.
Manual event support remains.

### AF-044 — Keep dashboard UI checks away from real learning progress

**+1:** 2026-09-30 — developer dashboard polish task.

A worktree's own dashboard (`HALLVI_DASHBOARD_PORT=… node --experimental-strip-types
tests/dashboard/server.ts`) opens the learning store in the Git common
directory, so checking Learn Hallvi's quiz from a branch reads, and would
write, the owner's real progress. `HALLVI_LEARNING_DB_PATH` exists but starts
empty. A fresh worktree also has no saved eval answers, so the Eval archive's
review layout could only be checked after copying `tests/results/evals` from
another checkout.


### AF-038 — Check installed versions behind upstream shrinkwraps

Alpha.12 preparation found that Pi 0.87.1 ships an `npm-shrinkwrap.json`
pinning its runtime `brace-expansion` to 5.0.9, covered by current denial-of-service
advisories. `npm update brace-expansion` patched development copies but left
that runtime copy alone. A trial root-lock edit made `npm audit --omit=dev`
report zero while a fresh `npm ci` still installed 5.0.9; the misleading edit
was removed. Check actual installed versions as well as audit metadata before
claiming a dependency is patched. A compatible upstream Pi update remains a
follow-up; this release patches Hallvi's direct `ws` runtime to 8.22.0.

**+1:** 2026-09-30 — alpha.12 release preparation, `codex/release-alpha12`
**+1:** 2026-09-30 — Pi 0.99.1 upgrade, `claude/pi-0.99`: 0.99.1's shrinkwrap
still installs `brace-expansion` 5.0.9 under `pi-coding-agent`, so the upgrade
does not close this.
**+1:** 2026-10-02 — Pi 1.0 move, `claude/pi-1.0`: 1.0.0's shrinkwrap still
installs `brace-expansion` 5.0.9 under `pi-coding-agent`, so the move does not
close this either.
**+1:** 2026-10-02 — Next.js 16.3.8 bump, `claude/next-16.3.8-og-advisory`:
with `next` patched, that installed 5.0.9 is the one finding
`npm audit --omit=dev` still reports.

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
**+1:** 2026-10-02 — Pi 1.0 move, `claude/pi-1.0`: Pi now keeps a record of a
message Stop withdrew, settled as aborted with no history entry, so a fresh
`wait` could say `cancelled`. Hallvi reads that record only to count how
often a key was handed over, so that a dropped message sent again is taken as
a new one; what became of a request does not read it yet.

### AF-002 — Record a workspace command's exit code

`server_bash` records a numeric exit code; a repository workspace `bash` records
only succeeded or failed. Evidence from `hallvi exec` would read the same for
both if the workspace kept the code too.

**+1:** 2026-09-28 — hallvi CLI task, [PR #241](https://github.com/lustoykov/hallvi/pull/241)
**+1:** 2026-09-30 — Pi 0.99.1 upgrade, `claude/pi-0.99`: Pi's `bash` now
returns `structuredContent.exit_code`; the workspace bridge drops it today and
could pass the code on instead.

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

**+1:** 2026-10-01 — application QA and alpha.14 release acceptance,
`codex/application-qa-release`: the installed controller opened and reconnected
its own SSH route with HTTP 200, while the in-app browser refused the forwarded
address with `ERR_BLOCKED_BY_CLIENT`. No browser protection was bypassed. A
separate public-address TCP probe connected while HTTP timed out with no bytes;
keep those observations distinct from an application-level response. The
isolated deployment and its access resources were removed after verification.

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
**+1:** 2026-10-01 — alpha strip polish, `claude/alpha-notice-polish`: the
installed strip has no Dev chip and a different tint, and seeing it took the
same kind of script answering `/api/host` without `development`.

### AF-028 — Notice browser journeys that stop passing while checks are off

The GitHub consent journey (`tests/browser/github.spec.ts`, first test) had
failed since #179 reworded the Storage & privacy popover on 20 September
("contents" where the test expected "code"). Nothing ran it after the checks
workflow was switched off, and it surfaced only because a later step of the same
test changed. A cheap way to see which journeys currently fail on main would
separate old breakage from a new change's.

**+1:** 2026-09-30 — sidebar footer Hallvi menu (`claude/sidebar-footer-menu`)
**+1:** 2026-09-30 — settings redesign (`claude/settings-redesign`): on main,
`applications.spec.ts` P1-10 stalls on the synthetic reply ("Writing the
reply") before it reaches Settings, and `controller-protection.spec.ts` looks
for Backups, which now sits behind "Show more" in the application sidebar.
**+1:** 2026-10-01 — Overview visitors first (`claude/overview-visitors-first`):
telling this change's failures from old ones took a second 28-minute run of the
whole suite against main. On main at `4c1e2b17`, five journeys fail.
`applications.spec.ts` P1-07 still finds "QA simulated provider failure." in
the conversation. `controller-protection.spec.ts` and
`experience-continuity.spec.ts` both wait for Backups behind "Show more". With
a scenario server up, `record-journeys.spec.ts` no longer finds "not answering"
on Processes or "did not survive a replacement" on Storage. Its two private
access journeys never run at all: their lookup takes `/applications/new` for
the first application and skips, the fault `interactions.spec.ts` fixed for
itself.

**+1:** 2026-10-01 — application QA and release,
`codex/application-qa-release`: the wider browser pass reproduced stale
Processes and Storage assertions. This task updates those checks and the
private-application lookup so their results exercise the current product.

**+1:** 2026-10-01 — opening a long conversation,
`claude/app-open-performance`: two failures in the whole suite had to be run
again on main to be told from this change's. On main at `cac3e2f5`,
`change-notifications.spec.ts` (line 61) counts two worker subscriptions
where it expects one; it passed at `bc4e2c12`. `settings-account-recovery`
passes alone and fails when `onboarding-first-app` runs before it: both ask
for a fresh, isolated fixture and get the same one, with a model already
connected. `interactions.spec.ts` and `secrets.spec.ts` fail at once unless
a scenario server is already listening on 3410.

**+1:** 2026-10-02 — interface polish pass, `claude/ui-polish-pass`: three
failures in the whole suite, all the same on main at `4d7f0979`. The two
above, and `record-journeys.spec.ts:201` ("never claims a way in before it
knows"), which opens the first application on the scenario home and finds no
"What is running" region on its Deployment; run alone against a scenario
server on main it fails the same way.

**+1:** 2026-10-02 — end-to-end critical bug audit,
`codex/e2e-critical-audit`: Fast Refresh reconnected the main EventSource,
so the cumulative connection count was two even with one live subscription.
The check now measures active subscribers. Account recovery also explicitly
disconnects its synthetic account before starting, because onboarding leaves
the shared fresh-setup worker connected. The connect-and-return selector now
uses the current first-application region, and the secret checks find a real
application instead of silently skipping on the New application link. Those
secret checks still need a pending-request fixture to establish accepted
browser submission and replacement; refusal and absence checks do not prove
those behaviors. The wider record sweep independently found AF-084. Other
external-fixture prerequisites remain as documented.

**+1:** 2026-10-02 — independent fresh end-to-end retest,
`codex/e2e-retest`: the old secret-submission journey posted outside the watched
page, allowed HTTP 500, and often had no pending request. It did not establish
the behavior its title claimed. An isolated pending-request journey now fills
the real masked field, requires HTTP 200, counts exactly one browser POST, and
checks the receipt and absence of the value after reload. It replaces that
misleading check. The wide run also needed a free port and a retained deployment
snapshot for checks whose scenarios have no deployment record.
The latest-main rerun also spent 26 seconds compiling the traffic collection
handler during its first chat action while other previews were active. The
fixture now warms that handler and the application page alongside its existing
API warm-up, before measuring interactions. Its Stop route also needed 13 seconds
to compile while the synthetic six-second reply finished; Stop and Continue now
warm through GET (405), without performing either action. The cold compiler is
fixture setup. The live traffic and history handlers now warm too, after their
first compilation blocked the seeded-history journey's page reads.
Terminal's first compilation also consumed its no-server assertion budget;
its handler now warms without opening a terminal.
The permission-read recovery journey also assumed a clicked write was already
accepted. It now requires the real POST's HTTP 200 before checking recovery
from the subsequent failed read; the UI assertions retain their original budget.

### AF-033 — Refuse a second preview before attaching retained state

Attaching a retained application from a checkout that already serves a
snapshot on another port takes a backup and ownership, then Next.js refuses
its second dev server. The retained runtime is left needing `--after-crash`
even though no application work ran. A preflight check could reject this
before attaching. The verification guide now tells contributors to stop the
snapshot pair first.

**+1:** 2026-09-29 — Codex/ChatGPT plugin proof of concept

### AF-034 — Native host checks must exercise link and clipboard failures

The plugin’s local preview acknowledged every open-link request, hiding the
installed Codex host’s silent rejection of HTTP URLs. A successful bridge
reply did not establish that a browser opened. The panel now offers a copyable
HTTP address and handles clipboard denial and explicit host link failures.
Keep native host behavior separate from fixture results when reporting proof.
Replacing panel bytes at one resource URI also left the native host showing
an older interface. The follow-up adds content-versioned resources and an
explicit UI reload; protocol acknowledgment must still be distinguished from
the host actually rendering the new version. A later failure to open the
plugin was an SSH startup failure: the `.local` Mac mini name no longer
resolved on the laptop's current network, and its known LAN address timed out.
A remote adapter cannot supply its panel while disconnected; distinguish
network reachability from cached UI before recommending plugin resets.

**+1:** 2026-09-30 — plugin update recovery (`codex/plugin-update-recovery`).
The update check completed after the automation observer timed out, and the host
still displayed the old panel. The menu-only result was easy to lose and the
adapter's reopen instruction overstated what same-chat reopen could do. This
fix separates displayed and available versions, retains recovery guidance,
and tests an unchanged adapter resource against a cached panel and a lost reply.

**+1:** 2026-09-30 — plugin follow-up, [PR #283](https://github.com/lustoykov/hallvi/pull/283)
**+1:** 2026-09-30 — operator panel: the local test host accepted
`ui/message` with `send: false` as a draft, while Codex sent it as a user turn
at once; the test host reloaded the panel on demand, while Codex kept the old
resource in the same chat and loaded the new one only in a new chat.

**+1:** 2026-09-30 — PR #293 independent review (`codex/plugin-293-review`).
Browser regressions reproduced lost pending-send identity on navigation and stale
application details after recovery with an unchanged transcript. Fixed in #293:
save the key before sending, settle the original app after switching, and refresh
context after recovery. The checks also cover storage-denied frames.

**+1:** 2026-09-30 — overview-first panel (`claude/plugin-entry-point`). Checked
natively in Codex with an instrumented copy: `ui/open-link` for an HTTP address
answers `{}` and opens nothing, `window.open` returns `null` and a
`target=_blank` link does nothing in the frame; HTTPS opens Codex's browser and
clipboard writes work. An acknowledged link request is still not an opened page.

### AF-035 — Say "awaiting approval" while request_approval waits

While Pi's `request_approval` call waited for the owner (Hallvi decides), the
conversation snapshot's `status` stayed `working`; only an Always-ask command
record made it `awaiting-approval`. The page words it from the call itself, and
the plugin panel now does the same, but every reader of `status` has to know
this. Reporting the owner as the one being waited on in the snapshot would let
one field answer it.

**+1:** 2026-09-30 — Codex operator panel

### AF-036 — Let the plugin label the messages it sends

A message the owner types in the Codex panel reaches Hallvi's page labelled
**CLI**, because `origin` accepts only `cli` and the adapter keeps it for older
controllers. A `codex` (or `plugin`) origin, accepted by new controllers and
retried as `cli` on a refusal, would say where the owner wrote it.

**+1:** 2026-09-30 — Codex operator panel
**+1:** 2026-09-30 — overview-first panel (`claude/plugin-entry-point`): a real
read-only request sent from the panel was recorded with origin `cli`.

### AF-048 — Ask the host for a taller panel inside a conversation

Opened inside a Codex conversation, the panel's frame is about 330px tall, so
the overview's traffic bars and setup scroll inside it; the side panel shows it
whole. Asking the host for the overview's height, if MCP Apps and Codex allow an
app to, might show it without inner scrolling; neither is checked yet.

**+1:** 2026-09-30 — overview-first panel (`claude/plugin-entry-point`)

### AF-041 — Show OpenRouter credit beside the saved key

OpenRouter is paid per use, and an empty balance only shows up as a refused
message (402). OpenRouter's `GET /api/v1/key` answers usage and limit without a
model request; Settings could say "$4.20 left" beside **Key saved**, and the
Model row could warn before the credit runs out rather than after.

**+1:** 2026-09-30 — OpenRouter models (`claude/openrouter-models`)

Review of [#297](https://github.com/lustoykov/hallvi/pull/297) also found that a
402 can report a key spending limit. A credit display should distinguish that
limit from the account balance; the request error now names both possibilities.

## Archive

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-084 — Let Deployment wait for the public address check](#af-084--let-deployment-wait-for-the-public-address-check) | 1 | Resolved in #332 |
| [AF-062 — Drop loaded traffic totals after Forget](#af-062--drop-loaded-traffic-totals-after-forget) | 1 | Resolved in #320 |
| [AF-060 — Keep named applications distinct in the switcher](#af-060--keep-named-applications-distinct-in-the-switcher) | 1 | Resolved in #319 |
| [AF-061 — Cancel interrupted work without a model login](#af-061--cancel-interrupted-work-without-a-model-login) | 1 | Resolved in #318 |
| [AF-064 — Keep completed streamed replies when an older view arrives](#af-064--keep-completed-streamed-replies-when-an-older-view-arrives) | 1 | Resolved in #318 |
| [AF-055 — Make Overview labels and space serve the summary](#af-055--make-overview-labels-and-space-serve-the-summary) | 2 | Resolved in #317 |
| [AF-037 — Close setup requests handled in conversation](#af-037--close-setup-requests-handled-in-conversation) | 2 | Resolved in #295 and #313 |
| [AF-029 — Keep Traffic database waits off the event loop](#af-029--keep-traffic-database-waits-off-the-event-loop) | 1 | Resolved in #310 |
| [AF-031 — Account for hash-routed pages before promising SPA coverage](#af-031--account-for-hash-routed-pages-before-promising-spa-coverage) | 1 | Resolved in #303 and #308 |
| [AF-032 — Bound the live Traffic country cache](#af-032--bound-the-live-traffic-country-cache) | 1 | Resolved in #301 |
| [AF-039 — Keep new tests tied to useful behavior](#af-039--keep-new-tests-tied-to-useful-behavior) | 1 | Resolved in #301 |
| [AF-045 — Keep simulated SPA route identities honest](#af-045--keep-simulated-spa-route-identities-honest) | 1 | Resolved in #308 and #312 |
| [AF-030 — Make the Traffic script template safe for a shared Traefik](#af-030--make-the-traffic-script-template-safe-for-a-shared-traefik) | 1 | Resolved in #302 |
| [AF-046 — Preserve uncertain sends when browser storage writes fail](#af-046--preserve-uncertain-sends-when-browser-storage-writes-fail) | 1 | Resolved in #307 |
| [AF-023 — Discover newer releases despite GitHub listing order](#af-023--discover-newer-releases-despite-github-listing-order) | 1 | Fixed in #285 |
| [AF-021 — Let manual public deployment proceed without GitHub login](#af-021--let-manual-public-deployment-proceed-without-github-login) | 1 | Fixed in #282 |
| [AF-019 — Keep deployment failures out of passing server checks](#af-019--keep-deployment-failures-out-of-passing-server-checks) | 1 | Fixed in #280 |
| [AF-020 — Name failed check groups without claiming they passed](#af-020--name-failed-check-groups-without-claiming-they-passed) | 1 | Fixed in #280 |
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

### AF-084 — Let Deployment wait for the public address check

Deployment offered the saved public address while its access check was pending,
and kept it as a link after the check failed. The shared page header already
withheld that link. Deployment now uses the same observation, with a failed public
address distinguished from a closed private tunnel.

**+1:** 2026-10-02 — end-to-end critical bug audit,
`codex/e2e-critical-audit`.

**Status:** Resolved in [#332](https://github.com/lustoykov/hallvi/pull/332).
Public checking, failed and recovered access are covered by the existing
release-panel and browser checks.

### AF-062 — Drop loaded traffic totals after Forget

**Status:** Resolved in [#320](https://github.com/lustoykov/hallvi/pull/320).

Forget deletes stored totals, but the Traffic page retains its loaded snapshot.
Keep history again with an interrupted history read and it still displays the
deleted views and pages, even though the real history route returns zero.
Drop the loaded snapshot when history is forgotten; stopping collection must
still preserve stored totals.

**+1:** 2026-10-01 — data and traffic QA, `codex/qa-traffic-data`.


### AF-060 — Keep named applications distinct in the switcher

**Status:** Resolved in [#319](https://github.com/lustoykov/hallvi/pull/319).

Two deployments of one repository can be renamed independently, but the
application switcher discarded their saved names and listed both under the
repository name. The current application's label was correct, making the
menu inconsistent at the point where the owner chooses an operational target.
Pass the saved name into the existing switcher and check switching between
the named deployments with separate drafts and a refresh.

**+1:** 2026-10-01 — normal-process QA, `codex/qa-browser-flows`.

### AF-061 — Cancel interrupted work without a model login

**Status:** Resolved in [#318](https://github.com/lustoykov/hallvi/pull/318).

After a worker restart, Stop reopened the full Pi runtime and refused to cancel
an interrupted conversation when its model login had expired. Stopping stored
work and dropping an unread queue should require only the local Pi session.
The fix in this QA branch uses Pi's cancellation API with a credential-free
catalog and no tools; active Stop still aborts the running session.

**+1:** 2026-10-01 — Normal application QA (`codex/qa-operator-core`)

### AF-064 — Keep completed streamed replies when an older view arrives

**Status:** Resolved in [#318](https://github.com/lustoykov/hallvi/pull/318).

An action fetched a running conversation view, the stream completed the reply,
and the delayed HTTP response replaced it with the old partial reply and
“Send next”. A deterministic browser test holds the actual running response
until after SSE completion and reproduces the regression. Action views should
preserve stream state that advanced during the request for the same application
and conversation, while still applying newer HTTP state when the stream is quiet.

### AF-037 — Close setup requests handled in conversation

**Status:** Resolved in #295 and #313. The fresh-controller acceptance verified
that normal reconnection removes the stale host card while preserving history.

**+1:** 2026-09-30 — stale DNS request repair.

**+1:** 2026-09-30 — independent post-merge audit, task
`01a0f19e-1f49-7d70-947b-28c911465e09`: the fresh-controller walkthrough
connected and SSH-verified the application's host through Pi, while its original
host card still asked where it should run. The controller had a host attached
but the request remained open. Pi's successful `connect_server` now dismisses
only that open host request; failed connections, other requests and settled
receipts stay intact. The manual machine-card flow still creates its receipt.

Completing DNS through the conversation left its guided card unanswered. The
plugin promoted it into a current blocker without a date, even after later
successful releases. This fix gives Pi explicit withdrawal for obsolete open
setup cards, preserves a hostname supplied after a blank card was opened, and
shows dated open requests separately from the operator's activity.

### AF-029 — Keep Traffic database waits off the event loop

**Status:** Resolved in #310.

**Implementation:** [PR #310](https://github.com/lustoykov/hallvi/pull/310) moves Traffic to its own database worker and queue, sharing the existing dispatch handling. A real two-second Traffic write lock left production application reads and Pi-alive chat creation responsive. The same work fixes a standalone worker-close exit before the awaited close settled. Combined acceptance is recorded in the audit PR.

Traffic adds synchronous `better-sqlite3` calls in the web and Pi processes,
after #252 moved the main database work into threads. On merged `9c99cf3`,
holding a disposable traffic database's write lock for 350 ms made
`recordCollector` and an unrelated 10 ms timer both take 359 ms. This is a
contention reproduction, not a measured production incident. Use the existing
asynchronous database boundary pattern for Traffic while keeping the atomic
Stop/Forget checks that prevent stale writes from restoring totals.

**+1:** 2026-09-30 — recent-merge audit, task `01a0f19e-1f49-7d70-947b-28c911465e09`

### AF-031 — Account for hash-routed pages before promising SPA coverage

**Status:** Resolved in #303 and #308.

**Implementation:** [PR #303](https://github.com/lustoykov/hallvi/pull/303) adds explicit hash routing while ignoring anchors and credential fragments. Review also reproduced a missed Back navigation to the empty fragment; [PR #308](https://github.com/lustoykov/hallvi/pull/308) distinguishes that physical root from an ignored fragment. The existing browser cases cover both hash forms and distinct Back/Forward views.

The Traffic script compares `location.pathname` and a configured query key;
`/#/home`, `/#/inbox` and `/#/settings` all become one `/` page. Running the
shipped script with those route changes emitted one view, while equivalent
history routes emitted three. The script offer currently promises "Pages
changed in the app" without this boundary. Support an explicit hash-routing
mode or state the limitation. Do not collect arbitrary URL fragments: ordinary
anchors and credential-bearing fragments are not page identities.

A second check with the actual script in the in-app browser and a local HTTP
event receiver confirmed three history views versus one hash-route view.

**+1:** 2026-09-30 — recent-merge audit, task `01a0f19e-1f49-7d70-947b-28c911465e09`

### AF-032 — Bound the live Traffic country cache

**Status:** Resolved in #301.

**Implementation:** [PR #301](https://github.com/lustoykov/hallvi/pull/301) removes the country map. Warm direct lookup cost was about 52 ms per 100,000 lookups locally, and three arrival/expiry cycles retained no country entries. This is a controlled lookup/retention check, not a production capacity claim.

`LiveWindow` expires browsers, open pages and loaded-page keys, but never its
country lookup map. Feeding it 10,000 distinct browser identities, then calling
`now` 24 hours later, left all 10,000 country entries with zero active browsers
and zero loaded-page keys. An open Traffic/Overview stream retains every
identity until it closes, including bot requests. Remove the cache if lookup
cost allows, or bound/expire it with the live window; avoid another permanent
visitor registry. This proves retention, not a production memory-exhaustion rate.

**+1:** 2026-09-30 — recent-merge audit, task `01a0f19e-1f49-7d70-947b-28c911465e09`

### AF-039 — Keep new tests tied to useful behavior

**Status:** Resolved in #301.

**Implementation:** [PR #301](https://github.com/lustoykov/hallvi/pull/301) removes the redundant parse/comment assertion, narrows installation-link checks, and asserts the accessible missing-data description instead of CSS structure. Concrete privacy, ownership and retained-state regressions remain.

The audit follow-up found a redundant script-compilation assertion in
`traffic-script.test.ts:69`: the neighboring contract tests already execute the
same served script. Checking that whole-line comments disappeared pins the
current minification technique without protecting event delivery.

Two checks should be narrowed, not deleted wholesale. `traffic-pages.test.tsx:256`
requires an exact CSS class and attribute sequence; keep proof that a real gap is
shown and future hours are not treated as missing. `install-line.test.ts:15`
forbids versioned installer links in every root/docs Markdown file, including
historical examples. Check the current installation entry points instead; retain
the regression coverage for the stale installer users actually received.

The recommendations on `9c99cf3` are implemented in #301. The retained default
suite passed on the combined candidate. Privacy, approval, Stop/Forget,
retained-state ownership and cross-stack behavior coverage remain.

**+1:** 2026-09-30 — recent-merge audit follow-up, task `01a0f19e-1f49-7d70-947b-28c911465e09`

### AF-045 — Keep simulated SPA route identities honest

**Status:** Resolved in #308 and #312.

The live traffic generator fetched the landing document and script again after
an in-page navigation, then reused that route's view ID for the landing page.
An actual HTTP run produced five views with only three identities. The fix in
[PR #308](https://github.com/lustoykov/hallvi/pull/308) keeps one document load and
a distinct identity per route. Its focused regression checks delivered events;
the simulator still synthesizes instrumentation, so real browser-script tests
remain a separate proof. UI scenario fixtures serve a different visual purpose.

The same review found that completed waits retained their abort listeners.
[PR #312](https://github.com/lustoykov/hallvi/pull/312) removes each listener when
its wait settles, including cancellation. Actual CLI diagnostics confirmed zero
listeners after completion and SIGINT; existing HTTP regressions still pass.

**+1:** 2026-09-30 — post-merge audit, task `01a0f19e-1f49-7d70-947b-28c911465e09`

### AF-030 — Make the Traffic script template safe for a shared Traefik

**Resolution:** [PR #302](https://github.com/lustoykov/hallvi/pull/302) uses stable application-scoped Traefik names. The generated configuration was checked with two apps under Traefik and with actual Caddy and nginx routes. Proxy configuration differs by server; the script/event contract is shared.

`traffic_script` returns the same `hallvi-script` router and service names for
every app. Reusing its labels with two different host rules under one Traefik
3.7 produced "HTTP router defined multiple times with different configurations"
and 404 for both script routes. Removing the second test app restored HTTP 200
for the first. This tested the supplied routing labels with local stand-in
backends, not Pi's full installation journey. Give the configuration per-app
names, or explicitly reuse one shared helper/router with all intended hosts.

**+1:** 2026-09-30 — recent-merge audit, task `01a0f19e-1f49-7d70-947b-28c911465e09`

### AF-046 — Preserve uncertain sends when browser storage writes fail

A readable localStorage can still reject writes because it is full. The panel
then read an older persisted draft instead of the in-memory draft and request
key; switching apps could lose the identity needed for a safe retry. Resolved
in [PR #307](https://github.com/lustoykov/hallvi/pull/307): unsaved drafts stay
authoritative in memory until storage succeeds. One browser regression covers
app switching, retry of the same key, acknowledgement and failed removal.
The unused sent-message set was also removed; it had no readers.

**+1:** 2026-09-30 — post-merge audit, task `01a0f19e-1f49-7d70-947b-28c911465e09`

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

### AF-049 — Do not revive a removed plugin address

Refreshing the plugin could restore an old application-list address after saved
records no longer provided a valid current route. A successful records read must
be authoritative, including an absent route.

**+1:** 2026-10-01 — review of #309.

**Status:** Fixed in #309 with a refresh regression check.

### AF-055 — Make Overview labels and space serve the summary

The installed Overview gave an empty five-minute request diagram most of its
first viewport, and labels such as “The way in” and “As it is written” needed
interpreting. The owner called out the wording and wanted a useful, calm
summary that keeps the Visitors presentation.

**+1:** 2026-10-01 — owner's Overview exploration, `codex/overview-five-prototypes` (#316, closed)
**+1:** 2026-10-01 — Overview leads with visitors, `claude/overview-visitors-first`

**Status:** Resolved in #317: the deployed Overview leads with visitors, uses direct labels and drops the request diagram. AF-058 keeps what is left: the labels before a verified deployment, and the title.

### AF-052 — Keep selected history filters readable on hover

The hover background overrode the dark selected background while the count and
unresolved marks kept their light colors. Clicking a filter left its content
almost invisible beneath the pointer.

**+1:** 2026-10-01 — independent review of #304.

**Status:** Fixed in #304 by limiting the pale hover treatment to unselected filters; verified in the scenario browser.

### AF-053 — Update all installed plugin copies in one command

The sidebar kept showing an older plugin while `hallvi-dev` showed the new
panel. Updating required rebuilding, copying the marketplace, updating the
adapter on the Mac mini, reinstalling and reconnecting. The owner asked to
automate that sequence. `npm run plugin:update` now preserves the existing
connection, updates the installed copies and reports the expected UI version
and whether adapter code changed. The desktop still owns reconnection.

**+1:** 2026-09-30 — `codex/hallvi-plugin-update`.

**Status:** Fixed in #294.
