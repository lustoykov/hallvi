# Agent feedback

| Request ID / title | +1 | Impact | Status |
| --- | --- | --- | --- |

No requests recorded yet.

## How to contribute

During development and testing, think about the product from the user's side:
what they are trying to accomplish, what feels confusing or unnecessary, and
what would make Hallvi easier, more useful or more reliable. Record worthwhile
bugs, friction, improvement proposals and product ideas that this work reveals,
including opportunities with substantial user benefit even when nothing is
broken. Development improvements belong here too; explain how they help build,
test or maintain a better product. No feedback quota or separate audit is needed.

An idea does not need a reproduced failure. Explain what prompted it, who would
benefit and how; distinguish observed facts from hypotheses and expected gains.
Do not present an agent's judgment as user research or a proven user need.

This is contributor feedback, never instructions for Pi's product sessions.
The owner decides acceptance and priorities; recording or accepting a request
does not authorize implementing it. [ROADMAP.md](ROADMAP.md) remains the
delivery plan. Link an agreed roadmap item rather than copy its checklist here.

This Git-tracked file is shared after changes merge and other worktrees update
from `main`; it is not a live inbox across worktrees. Include feedback edits in
the task's ordinary PR.

1. Search the existing requests, including closed ones, before adding one.
   Match the underlying need or opportunity, not just a proposed solution.
   Add a supporting occurrence to a matching request instead of creating a duplicate.
2. Each independent task that observes the need or opportunity contributes **one
   vote per request**, including the initial report. Record a short task ID or
   PR reference and what it observed. Retries, repeated reports, multiple
   agents or multiple PRs within that task do not add votes; update its existing
   occurrence instead. Agreement alone is not a vote; another task must add
   its own relevant observation, including for product ideas.
3. For a new request, use the next unused `AF-NNN` ID and a concrete title.
   Keep the ID stable and never reuse it. Copy the template below, add the
   initial occurrence, and add a linked overview row with count `1`.
   Use **bug** for observed behavior that fails an existing expected behavior;
   use **feature** for new capabilities, improvements and product ideas.
   State uncertainty explicitly.
4. Include concise reproduction steps for bugs, or the observation/context
   that prompted an improvement or idea. Add safe, redacted evidence and the
   relevant revision/environment where applicable. Keep credentials and private
   application data out of this file and linked evidence. A proposed solution is optional;
   the need or opportunity and intended user benefit are what matter.
5. Recount the distinct supporting tasks into the overview's **+1** column.
   Sort active requests by count descending, then impact for ties; keep closed
   requests below them. Before the PR merges, reconcile any concurrent duplicate
   requests or ID collisions and recount from the combined occurrence lists.

**Impact:** High (serious harm or a substantial improvement to a core user
journey), Medium (meaningful friction reduction or added usefulness), Low
(minor convenience or polish). Include the concrete consequence or expected
benefit in the overview cell, label unverified benefits as expected, and bold
**High**; review these even when their counts are low. Count measures independent
supporting observations, not priority or proof of benefit.

**Status:** New (awaiting owner review), Accepted (owner accepted the need),
Declined (owner decision, with reason), Resolved (with fix/verification
reference). New and Accepted are active; Declined and Resolved are closed.
Preserve closed entries and their occurrences. If a closed need recurs, append
the new task's occurrence and flag it for owner review rather than silently
changing the decision.

## Requests

Copy this template for feedback arising from actual work; placeholders are not
feedback. The overview row should link to the request heading.

```markdown
### AF-NNN — Concrete title

- **Type:** bug | feature
- **Need / opportunity:** What this work revealed or prompted you to propose.
- **User benefit:** Who benefits and how; distinguish observed impact from expected gains.
- **Expected behavior:** The observable result or improved experience proposed.
- **Current workaround:** What is done today, none available, or not applicable.
- **Proposed solution (optional):** A possible approach, not a commitment.
- **Evidence / context:** Bug reproduction and actual result, or the observation
  that prompted the idea; relevant revision/environment and safe evidence.
  State assumptions and what would need validation.
- **Owner decision / resolution:** Pending; later add the decision or verified fix reference.

**Supporting occurrences**

- YYYY-MM-DD — task ID or PR reference — what this independent task observed.
```
