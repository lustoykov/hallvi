# Agent feedback

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-001 — Record the waiting messages Stop drops](#af-001--record-the-waiting-messages-stop-drops) | 1 | New |
| [AF-002 — Record a workspace command's exit code](#af-002--record-a-workspace-commands-exit-code) | 1 | New |

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

**+1:** 2026-09-28 — hallvi CLI task (`claude/hallvi-codex-plugin-b3aaa1`)

### AF-002 — Record a workspace command's exit code

`server_bash` records a numeric exit code; a repository workspace `bash` records
only succeeded or failed. Evidence from `hallvi exec` would read the same for
both if the workspace kept the code too.

**+1:** 2026-09-28 — hallvi CLI task (`claude/hallvi-codex-plugin-b3aaa1`)
