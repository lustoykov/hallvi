# Agent feedback

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-001 — Record the waiting messages Stop drops](#af-001--record-the-waiting-messages-stop-drops) | 1 | New |
| [AF-002 — Record a workspace command's exit code](#af-002--record-a-workspace-commands-exit-code) | 1 | New |
| [AF-003 — Avoid rereading unchanged execution history](#af-003--avoid-rereading-unchanged-execution-history) | 1 | New |
| [AF-004 — Reopen a known private application directly](#af-004--reopen-a-known-private-application-directly) | 1 | New |
| [AF-005 — Make agreed ongoing care visible](#af-005--make-agreed-ongoing-care-visible) | 1 | New |

## How to contribute

Write down bugs, friction and ideas you would like to see in Hallvi or its
development workflow. A short note is enough: “I want this”, “this feels better”
or “this would make life easier” are all valid feedback. No required justification,
evidence, impact rating or questionnaire. Add context or reproduction steps if
you have them and they help. No feedback quota or separate audit is needed.

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
3. Give a new request the next unused `AF-NNN` ID, a short title and a brief
   description. Add a linked overview row with count `1` and status `New`.
4. Recount +1s from the task references and sort active requests by count, with
   closed requests below. Count is interest, not priority. Reconcile duplicate
   requests and ID collisions before merging; never reuse a merged ID.

**Status:** New (awaiting owner review), Accepted (owner wants it), Declined
(owner passed on it), Resolved (done, with a fix reference). Preserve closed
entries. If you want to revisit one, add your feedback and flag it for the owner
rather than changing their decision.

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

### AF-003 — Avoid rereading unchanged execution history

Each open chat rebuilds its snapshot every 500 ms and reads all application
execution files before suppressing unchanged output. I would like long-history
return visits to avoid this repeated work. The [product research](docs/research/2026-09-29-product-opportunities.md#1-make-the-interface-fast-by-avoiding-work-that-has-not-changed)
includes an isolated measurement and a proposed multi-chat check; it does not
establish a production slowdown or justify a database replacement.

**+1:** 2026-09-29 — task `codex/hallvi-product-research`

### AF-004 — Reopen a known private application directly

I would like a clear Open/Reconnect action for an application's previously
established private route, so returning to use it does not require a free-form
conversation. The [proposal](docs/research/2026-09-29-product-opportunities.md#2-make-open-work-after-the-owner-comes-back)
identifies the permission-contract decision this would require.

**+1:** 2026-09-29 — task `codex/hallvi-product-research`

### AF-005 — Make agreed ongoing care visible

When Hallvi agrees to check something later, I want to see what it will check,
where it runs, its last result, its next due time, and how to pause it. Start
with one quiet care loop after the current beta gate. The [proposal](docs/research/2026-09-29-product-opportunities.md#6-prove-one-quiet-ongoing-care-loop)
keeps this separate from approval of background collection or repair.

**+1:** 2026-09-29 — task `codex/hallvi-product-research`
