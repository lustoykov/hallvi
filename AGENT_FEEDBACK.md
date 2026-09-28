# Agent feedback

| Request ID / title | +1 | Status |
| --- | --- | --- |

No requests recorded yet.

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
