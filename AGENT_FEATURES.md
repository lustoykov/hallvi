# Agent features

Researched proposals for improving Hallvi. The owner selects work; agents can
then implement a scoped proposal and bring back a verified PR.
[Agent feedback](AGENT_FEEDBACK.md) stays the place for short observations,
bugs and wishes from ordinary tasks. [Roadmap](ROADMAP.md) owns delivery order.

## Proposals

| Proposal | +1 | Status | Intended result |
| --- | --- | --- | --- |
| [Reconnect to a known private application](#reconnect-to-a-known-private-application) | 1 | In progress (partial) | Return to the same private route in one action |
| [Explain current work and interruption](#explain-current-work-and-interruption) | 1 | In progress (partial) | Understand the action, target and unknown outcome |
| [Copy a problem for a coding agent](#copy-a-problem-for-a-coding-agent) | 1 | Proposed | Hand over enough evidence to reproduce and repair a defect |

Votes show interest, not priority or approval. Each count comes from the task
references in that proposal, including its initial proposal task.

These are candidates from the [29 September intake](docs/research/2026-09-29-feature-intake.md),
which rechecked the existing research in [PR #246](https://github.com/lustoykov/hallvi/pull/246)
against current code and open work. The detailed plans remain in that PR; this
list indexes their selection and assignment instead of copying the plans.
Performance work from #248/#249 merged through [#252](https://github.com/lustoykov/hallvi/pull/252)
and is not proposed again. The
fresh-user beta walkthrough remains open; these ideas add no beta prerequisites.

### Reconnect to a known private application

**Status:** In progress (partial)

**Problem and intended result:** Returning to a private app currently prepares
a conversation draft. Offer one Reconnect action for its established route.

**Smallest scope:** Submit through the existing main operator and permission
mode, keep the saved host/ports, and show truthful tunnel and HTTP observations.

**Evidence:** [Dated source review, existing plan and feedback](docs/research/2026-09-29-feature-intake.md#open-the-same-private-route-again).

**Acceptance:** After disconnect and controller restart, reopen from the owner's
actual device and use a named saved item while preserving private exposure.
Distinguish closed tunnel, SSH failure and an application that does not answer.

**Open decisions:** Bypassing Pi would require a separate contract. Direct
submission, the saved-route tool form and the real return/remote-device
acceptance remain unimplemented and unassigned.
**Assignment:** On 2026-09-29 the owner selected plan 02 increment 1: truthful
access observations and one current saved-route selector. Assigned to
`codex/private-access-observations`, based on #255, in draft
[PR #256](https://github.com/lustoykov/hallvi/pull/256). Existing reopen actions
still prepare a main-conversation draft; they do not submit or reconnect.
The full feature remains partial. [Verification and matched captures](https://github.com/lustoykov/hallvi/pull/256)
cover this increment only.

**+1:** 2026-09-29 — initial feature intake, [PR #253](https://github.com/lustoykov/hallvi/pull/253)

### Explain current work and interruption

**Status:** In progress (partial)

**Problem and intended result:** Existing activity and interruption text can
leave the owner unsure what ran, where it ran and what remains unknown.

**Smallest scope:** Add the recorded action and target to the existing work line
and an evidence-based interruption explanation beside Continue/Stop. The selected
increment in [PR #255](https://github.com/lustoykov/hallvi/pull/255) covers the
current action/target and mobile elapsed-time wrapping. The broader interruption
explanation is unimplemented and unassigned.

**Evidence:** [Dated source review and existing plan](docs/research/2026-09-29-feature-intake.md#explain-current-work-and-interruption);
[scoped verification and matched visual evidence for #255](https://github.com/lustoykov/hallvi/blob/49fac0dbac12ae4f66c6df9eb040098d166112ea/docs/assets/clear-progress/README.md).

**Acceptance:** After refresh and a controlled interruption, an unfamiliar owner
can identify the action, target, pending decision and unknown outcome. Verify
matching evidence and existing continuation behavior on disposable state.

**Open decisions:** Broader interruption scope and wording. User benefit and
earlier findings remain unproven: the real Pi check reported its findings only
in the final reply; the screenshots' early finding is synthetic.
**Assignment:** On 2026-09-29 the owner selected the current-action/target increment
and mobile wrapping for completion in #255. Assigned to the existing clear-progress
implementation task on `codex/clear-progress`, building on #252. The full feature
remains partial; no task is assigned to the interruption explanation.

**+1:** 2026-09-29 — initial feature intake, [PR #253](https://github.com/lustoykov/hallvi/pull/253)

### Copy a problem for a coding agent

**Status:** Proposed

**Problem and intended result:** Application defects need a reproducible handoff
across Hallvi's operating/code boundary; Copy reply currently copies prose.

**Smallest scope:** Preview and copy one saved investigation packet with revision,
reproduction, selected redacted evidence, attempts, uncertainty and a check for
the repaired behavior. The owner chooses where to paste it.

**Evidence:** [Dated source review and existing plan](docs/research/2026-09-29-feature-intake.md#copy-a-reproducible-problem-for-a-coding-agent).

**Acceptance:** A coding agent given only the packet and repository reproduces
and repairs one disposable defect. After owner merge and an authorized release,
the original behavior check passes against the observed running revision.

**Open decisions:** Owner selection and packet contract; test redaction and
omissions. Saving a procedure does not authorize execution.
**Assignment:** Unassigned.

**+1:** 2026-09-29 — initial feature intake, [PR #253](https://github.com/lustoykov/hallvi/pull/253)

## Research workflow

Run an initial pass when establishing this list, a weekly discovery pass, and
targeted research when the owner asks or an assigned feature needs a specific
uncertainty resolved. Coding agents keep collecting feedback during their
normal work; broad product discovery is a separate task.

1. Start from current remote main, the owner's goals, product scope and roadmap.
   Read existing feedback, proposals, research notes and merged/open PRs before
   proposing work. Identify already shipped or assigned work instead of
   proposing it again. Coordinate with an active owner before touching its branch.
2. Pick a bounded question that matters to the current product stage. Use the
   code and actual observations for Hallvi behavior, and primary sources for
   external claims. Refresh time-sensitive evidence and distinguish observed
   facts, interpretations and unanswered questions. Follow existing access and
   verification rules; research alone does not authorize live application changes.
3. Update an existing proposal first. Add a new one only when it is useful;
   there is no proposal quota. Cite dated sources and preserve the owner's
   decisions. Keep substantial findings in `docs/research/` and link them here.
4. Publish document changes in a PR from an isolated branch/worktree, reusing
   a free checkout or the existing research PR when appropriate. Keep raw task
   feedback separate. Research does not implement features, merge PRs, change
   product priorities or start other agents on implementation by itself.
5. Report material new findings, changed recommendations or a required decision.
   An unchanged or unproductive pass ends quietly without inventing a proposal.

Scheduled research uses the repository's model default in [AGENTS.md](AGENTS.md).
The schedule and run history live in Codex Scheduled; editing this file does not
start or reschedule a worker. Claude and Codex can both follow this workflow.

## Selection and assignment

**Proposed** means awaiting the owner's decision. **Ready** means the owner has
selected the scope, with their instruction linked or recorded. **In progress**
names the assigned task and branch/PR. **Done** links a merged implementation and
its verification. **Declined** preserves the owner's decision and reason if given.
Research may identify shipped work, but must not silently promote an idea to Ready
or reopen a declined decision. A research-plan PR is not an implementation PR.
Move Done and Declined proposals out of the active overview into a final Archive
section, retaining their rows, full entries, votes and decision/verification
references. The dashboard collapses that section by default.

When the owner assigns a feature, record its task/branch before dispatching so
two agents do not take the same work. Follow the linked scope and acceptance
checks, use `verify-hallvi`, collect ordinary feedback and finish with a
reviewable PR. Update this entry in that PR; mark Done only after merge and
the promised behavior are established. Files synchronize through merges, so
check open PRs as well as this checkout before assigning work.

## Entry format

Use a short stable slug as the heading and link it from the overview table.
Search merged and open proposals, including archived ones, before adding one.
Add a dated **+1** with the task ID or PR reference when an independent task
wants an existing proposal. Count once per task, including the initial proposal;
retries, multiple agents and multiple PRs in that task do not add votes. Agreement
needs no new research. Recount from those references and sort the active overview
by count. Do not copy feedback votes across automatically: these slugs and votes
belong to this file; feedback keeps its separate `AF-NNN` identifiers and counts.

```markdown
### Short feature title

**Status:** Proposed
**Problem and intended result:** Who struggles with what; what improves.
**Smallest scope:** The useful change and its limits.
**Evidence:** Dated primary sources, current code/PRs and linked feedback.
**Acceptance:** Observable behavior that would establish completion.
**Open decisions:** Uncertainty or a choice that still needs the owner.
**Assignment:** Owner instruction, task/branch and PR when they exist.

**+1:** YYYY-MM-DD — task ID or PR reference
```

These files and research instructions are contributor material. Never load them
into Pi's product sessions or publish private application data in proposals.
