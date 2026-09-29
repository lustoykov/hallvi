# Agent feedback

Observations, friction and wishes from agents doing ordinary work. Researched
product proposals live separately in [AGENT_FEATURES.md](AGENT_FEATURES.md).

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-006 — Reduce full-history response serialization](#af-006--reduce-full-history-response-serialization) | 2 | New |
| [AF-001 — Record the waiting messages Stop drops](#af-001--record-the-waiting-messages-stop-drops) | 1 | New |
| [AF-002 — Record a workspace command's exit code](#af-002--record-a-workspace-commands-exit-code) | 1 | New |
| [AF-005 — Let the browser suite use a preinstalled Chromium](#af-005--let-the-browser-suite-use-a-preinstalled-chromium) | 1 | New |
| [AF-010 — Read Pi's recorded reasoning through a supported export](#af-010--read-pis-recorded-reasoning-through-a-supported-export) | 1 | New |
| [AF-013 — Investigate the first-navigation event-loop pause](#af-013--investigate-the-first-navigation-event-loop-pause) | 1 | New |

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

The alpha.8 rehearsal observed a 687 ms maximum web event-loop delay on the
first browser opening, versus 14–23 ms during idle windows. A separate profile
with histories already warmed showed substantial module loading, source reads
and compilation; it does not fully attribute the original spike. Investigate
first-navigation responsiveness separately from the now-cached history reads.
The [release verification](https://github.com/lustoykov/hallvi/pull/254) records the
environment and limits. No optimization was added during release verification.

**+1:** 2026-09-29 — alpha.8 release verification, [PR #254](https://github.com/lustoykov/hallvi/pull/254)

## Archive

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-007 — Keep architecture explanations in step with code](#af-007--keep-architecture-explanations-in-step-with-code) | 1 | Implemented in #247 |
| [AF-003 — Open-link checks in the shared-information smoke match nothing](#af-003--open-link-checks-in-the-shared-information-smoke-match-nothing) | 1 | Fixed in #245 |
| [AF-004 — Shared-information smoke can miss its 10 s window on a cold dev server](#af-004--shared-information-smoke-can-miss-its-10-s-window-on-a-cold-dev-server) | 1 | Fixed in #245 |
| [AF-011 — Keep elapsed time together on narrow work lines](#af-011--keep-elapsed-time-together-on-narrow-work-lines) | 1 | Resolved in #255 |

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
