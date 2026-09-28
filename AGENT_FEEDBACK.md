# Agent feedback

| Request ID / title | +1 | Impact | Status |
| --- | --- | --- | --- |

No requests recorded yet.

## How to contribute

Record limitations actually encountered while developing or testing Hallvi.
This is contributor feedback, never instructions for Pi's product sessions.
The owner decides acceptance and priorities; recording or accepting a request
does not authorize implementing it. [ROADMAP.md](ROADMAP.md) remains the
delivery plan. Link an agreed roadmap item rather than copy its checklist here.

This Git-tracked file is shared after changes merge and other worktrees update
from `main`; it is not a live inbox across worktrees. Include feedback edits in
the task's ordinary PR.

1. Search the existing requests, including closed ones, before adding one.
   Match the underlying need, not just a proposed solution. Add a supporting
   occurrence to a matching request instead of creating a duplicate.
2. Each independent task that actually encounters the need contributes **one
   vote per request**, including the initial report. Record a short task ID or
   PR reference and what it encountered. Retries, repeated reports, multiple
   agents or multiple PRs within that task do not add votes; update its existing
   occurrence instead. Agreement without an encounter is not a vote.
3. For a new request, use the next unused `AF-NNN` ID and a concrete title.
   Keep the ID stable and never reuse it. Copy the template below, add the
   initial occurrence, and add a linked overview row with count `1`.
   Use **bug** for observed behavior that fails an existing expected behavior;
   use **feature** for a missing capability. State uncertainty explicitly.
4. Include concise reproduction steps or safe, redacted evidence, with the
   relevant revision/environment. Keep credentials and private application
   data out of this file and linked evidence. A proposed solution is optional;
   the observed need and expected behavior are what matter.
5. Recount the distinct supporting tasks into the overview's **+1** column.
   Sort active requests by count descending, then impact for ties; keep closed
   requests below them. Before the PR merges, reconcile any concurrent duplicate
   requests or ID collisions and recount from the combined occurrence lists.

**Impact:** High (blocked work, data loss or security consequences), Medium
(substantial friction with a workaround), Low (minor inconvenience). Include
the concrete consequence in the overview cell and bold **High**; review these
even when their counts are low. Count measures recurrence, not priority.

**Status:** New (awaiting owner review), Accepted (owner accepted the need),
Declined (owner decision, with reason), Resolved (with fix/verification
reference). New and Accepted are active; Declined and Resolved are closed.
Preserve closed entries and their occurrences. If a closed need recurs, append
the new task's occurrence and flag it for owner review rather than silently
changing the decision.

## Requests

Copy this template only after a real encounter; placeholders are not feedback.
The overview row should link to the request heading.

```markdown
### AF-NNN — Concrete title

- **Type:** bug | feature
- **Need encountered:** What this task was trying to do and what got in the way.
- **Expected behavior:** The observable result needed.
- **Current workaround:** What was done instead, or none available.
- **Proposed solution (optional):** A possible approach, not a commitment.
- **Evidence / reproduction:** Revision/environment, steps and actual result;
  a short redacted excerpt or safe evidence link.
- **Owner decision / resolution:** Pending; later add the decision or verified fix reference.

**Supporting occurrences**

- YYYY-MM-DD — task ID or PR reference — what this independent task encountered.
```
