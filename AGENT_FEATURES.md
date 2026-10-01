# Agent features

Researched proposals for improving Hallvi. The owner selects work; agents can
then implement a scoped proposal and bring back a verified PR.
[Agent feedback](AGENT_FEEDBACK.md) stays the place for short observations,
bugs and wishes from ordinary tasks. [Roadmap](ROADMAP.md) owns delivery order.

## Proposals

The owner selected the traffic-consent setup below on 30 September.
Completed scopes and their remaining evidence limits are in the Archive.

| Proposal | +1 | Status | Assignment |
| --- | --- | --- | --- |
| [Traffic consent and privacy notice](#traffic-consent-and-privacy-notice) | 1 | In progress | [PR #306](https://github.com/lustoykov/hallvi/pull/306) |

### Traffic consent and privacy notice

**Status:** In progress
**Problem and intended result:** Cookie-free script measurement started immediately,
without consent integration or a site-specific notice. The default checklist
also implied automatic sign-up tracking that requires manual application code.
**Smallest scope:** Default-off script with grant/withdrawal API; Pi's setup
includes existing consent controls or offers a small prompt and completed notice
in the site's design. Keep the owner-reviewed application PR boundary. Remove
the default goal claim while retaining manually instrumented events. No CMP
framework, live-site mutation or automatic compliance certification.
**Evidence:** [Design, current collection behavior and dated primary sources](docs/design/traffic.md#analytics-consent-and-privacy-notice).
**Acceptance:** In a real browser, unknown/refused consent sends no events,
grant starts the current view, withdrawal stops measurement, and regrant never
replays refused activity. Setup includes missing notice facts and rollout/cache
checks. The checklist omits goals, and the Goals card requires recorded events.
**Open decisions:** Each site's missing legal/retention details and implemented
controls remain application-specific; local checks do not certify them.
**Assignment:** Owner's 30 September request to fix analytics privacy notice and
consent, explicit selection to offer a prompt/notice where absent, and request
to remove the default goals claim. Branch `codex/traffic-consent`,
[PR #306](https://github.com/lustoykov/hallvi/pull/306) in review.

**+1:** 2026-09-30 — owner's traffic privacy and goals task,
[PR #306](https://github.com/lustoykov/hallvi/pull/306).

Votes show interest, not priority or approval. Each count comes from the task
references in that proposal, including its initial proposal task.

Earlier candidate research is in the [29 September intake](docs/research/2026-09-29-feature-intake.md),
which rechecked the existing research in [PR #246](https://github.com/lustoykov/hallvi/pull/246)
against current code and open work. The detailed plans remain in that PR; completed selections are archived below.
Performance work from #248/#249 merged through [#252](https://github.com/lustoykov/hallvi/pull/252)
and is not proposed again. The
fresh-user beta walkthrough remains open; these ideas add no beta prerequisites.

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

## Archive

| Proposal | +1 | Status | Delivered scope |
| --- | --- | --- | --- |
| [Post-merge fixes and simplification](#post-merge-fixes-and-simplification) | 1 | Done | Ten selected scopes; bounded acceptance and measured reductions |
| [Reconnect to a known private application](#reconnect-to-a-known-private-application) | 1 | Done | Saved route through Pi, with installed acceptance |
| [Explain current work and interruption](#explain-current-work-and-interruption) | 1 | Done | Work line and truthful existing recovery panel |
| [Copy a problem for a coding agent](#copy-a-problem-for-a-coding-agent) | 1 | Done | Saved Markdown and existing Copy reply |

### Post-merge fixes and simplification

**Status:** Done (the ten scopes selected on 30 September 2026).
**Problem and intended result:** Keep recent capabilities while removing
unnecessary complexity and closing demonstrated bugs and generalization gaps.
**Smallest scope:** [Four bounded Traffic fixes, focused test pruning, a small
UI pass and broader acceptance](docs/research/2026-09-30-post-merge-scope.md).
The measured reader load did not justify another shared-reader abstraction;
independent generator, oracle and UI fixtures keep distinct verification roles.
**Evidence and acceptance:** The linked scope records the audited and refreshed
revisions, AF-029–AF-032/AF-039, and a concrete completion check for each package.
**Delivered:** [#301](https://github.com/lustoykov/hallvi/pull/301),
[#302](https://github.com/lustoykov/hallvi/pull/302),
[#303](https://github.com/lustoykov/hallvi/pull/303),
[#307](https://github.com/lustoykov/hallvi/pull/307),
[#308](https://github.com/lustoykov/hallvi/pull/308),
[#310](https://github.com/lustoykov/hallvi/pull/310),
[#312](https://github.com/lustoykov/hallvi/pull/312) and
[#313](https://github.com/lustoykov/hallvi/pull/313). Acceptance includes real
proxy isolation, explicit routing and consent, retained Paperless ingestion and
a fresh-controller Linkding bookmark across container recreation, controller
restart and reconnection.
**Remaining limits:** The walkthrough reused an existing account and a packaged
foreground controller. Native plugin hosts, fresh-account installation, external
user comprehension and production capacity are separate evidence boundaries.
No recovery/backup claim, release publication or feature-removal quota was added.
**Assignment:** Implementation and acceptance in task
`01a0f19e-1f49-7d70-947b-28c911465e09`, following
[the scoped proposal](https://github.com/lustoykov/hallvi/pull/292). The owner
authorized the four fixes, test pruning, UI simplification, broader acceptance,
measured reductions, supplemental audit and fresh-user walkthrough, with review
between increments.

**+1:** 2026-09-30 — owner-requested scope in the task above.

### Reconnect to a known private application

**Status:** Done (selected scope)

**Problem and intended result:** An owner returning to a private app needs its
established route reopened and verified through one Reconnect action.

**Smallest scope:** Submit through the existing main operator and permission
mode, keep the saved host/ports, and show truthful tunnel and HTTP observations.

**Evidence:** [Dated source review, existing plan and feedback](docs/research/2026-09-29-feature-intake.md#open-the-same-private-route-again).

**Acceptance:** After disconnect and controller restart, reopen from the owner's
actual device and use a named saved item while preserving private exposure.
Distinguish closed tunnel, SSH failure and an application that does not answer.

**Open decisions:** Bypassing Pi remains outside the selected scope. No additional
Reconnect implementation task is assigned.
**Assignment:** Increment 1's truthful observations and current saved-route
selector landed in [PR #256](https://github.com/lustoykov/hallvi/pull/256).
[Verification and matched captures](https://github.com/lustoykov/hallvi/pull/256#issuecomment-5893828846)
cover that increment only. On 2026-09-29 the owner selected increment 2:
direct main-operator submission and the saved-route tool form. Assigned to
`codex/reconnect-saved-route`, merged in
[PR #263](https://github.com/lustoykov/hallvi/pull/263). It preserves the
existing permission, queue and execution evidence contracts and does not add
an automatic recovery service. [Installed alpha.9 acceptance](https://github.com/lustoykov/hallvi/pull/267#issuecomment-5896833172)
passed on 29 September: real Pi saved-route approval/reopen, laptop access to the
same saved item, and unchanged data through an installed restart.

**+1:** 2026-09-29 — initial feature intake, [PR #253](https://github.com/lustoykov/hallvi/pull/253)

### Explain current work and interruption

**Status:** Done (selected scope)

**Problem and intended result:** Existing activity and interruption text can
leave the owner unsure what ran, where it ran and what remains unknown.

**Smallest scope:** Add the recorded action and target to the existing work line
and an evidence-based interruption explanation beside Continue/Stop. The selected
increment in [PR #255](https://github.com/lustoykov/hallvi/pull/255) covers the
current action/target and mobile elapsed-time wrapping and is merged. The owner
selected the next increment: concise interruption evidence in the existing
Continue/Stop panel and truthful Stop wording. Approval-consequence metadata and
handover redesign are outside this assignment.

**Evidence:** [Dated source review and existing plan](docs/research/2026-09-29-feature-intake.md#explain-current-work-and-interruption);
[scoped verification and matched visual evidence for #255](https://github.com/lustoykov/hallvi/blob/49fac0dbac12ae4f66c6df9eb040098d166112ea/docs/assets/clear-progress/README.md).

**Acceptance for the selected increment:** After refresh and a controlled
interruption, show only matching action/target/result evidence, unknown outcomes
and queued follow-ups. Preserve native continuation and Stop semantics on
disposable state. Unfamiliar-owner comprehension is a separate product hypothesis.

**Open decisions:** Broader approval and handover proposals remain unselected. User benefit and
earlier findings remain unproven: the real Pi check reported its findings only
in the final reply; the screenshots' early finding is synthetic.
**Assignment:** The first increment merged in #255. On 2026-09-29 the owner
selected the interruption/Stop increment, assigned to the existing implementation
task on `codex/interruption-evidence`. It reads matching native tool history and
execution results, distinguishes returned results from unknown effects, and counts
waiting follow-ups. Delivered in [#268](https://github.com/lustoykov/hallvi/pull/268),
with focused evidence/queue checks and browser restart/Continue/Stop coverage.
Continue/Stop retain native behavior. [Readable captures](https://github.com/lustoykov/hallvi/pull/268#issuecomment-5896795339)
show the existing panel at desktop and mobile sizes. Unfamiliar-owner comprehension
and earlier findings during real Pi work remain unmeasured; neither is claimed by
this bounded implementation.

**+1:** 2026-09-29 — initial feature intake, [PR #253](https://github.com/lustoykov/hallvi/pull/253)

### Copy a problem for a coding agent

**Status:** Done (selected scope)

**Problem and intended result:** Application defects need a reproducible handoff
across Hallvi's operating/code boundary; Copy reply currently copies prose.

**Smallest scope:** Copy the smallest useful coding-agent handoff from existing
matching evidence. The owner chooses where to paste it. No new investigation
store, generic packet framework or broader handover redesign.

**Evidence:** [Dated source review and existing plan](docs/research/2026-09-29-feature-intake.md#copy-a-reproducible-problem-for-a-coding-agent).

**Acceptance for the selected increment:** Native Pi saves a useful Markdown
packet and returns its saved body; copying yields that complete body before and
after refresh. Redaction holds for creation and update. The
[29–30 September real repair rehearsal](https://github.com/lustoykov/hallvi/pull/284#issuecomment-5899206065)
also established one downstream repair: an independent worker reproduced the
filter defect, its reviewed fix was merged only to the rehearsal branch, and Pi
redeployed it. The original checks, browser filters and exact record preservation
passed. This is one observed repair loop, not broad downstream adoption.

**Open decisions:** Broader packet storage, automation and procedure work remain
deferred. Broader downstream adoption remains untested.
**Assignment:** Selected by the owner on 2026-09-29 and delivered in
[#270](https://github.com/lustoykov/hallvi/pull/270). A bounded real-Pi trial with
explicitly synthetic observations made one save call; the saved body equaled the
final reply and clipboard before and after refresh. Existing records and Copy
reply are reused; no new schema or UI layout is introduced. The later installed
alpha.10 rehearsal copied an 8,339-character packet from observed source/API
evidence and completed the separate repair/deployment acceptance linked above.

**+1:** 2026-09-29 — initial feature intake, [PR #253](https://github.com/lustoykov/hallvi/pull/253)
