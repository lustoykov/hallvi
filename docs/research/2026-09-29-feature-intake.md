# Initial product feature intake

Checked **29 September 2026** against GitHub `main` and local source
`cc7e9179ba053553163d2ee0a025ae4cd48ec2c7`. The existing research and eleven plans
are in open [PR #246][planning] at `f6c0dd56e57c1a07db9cf4cd6403cca8b97139b1`.
This note selects three proposals for owner review; it grants no implementation
authority or delivery commitment.

## Recommendation

| Candidate | Intended result | Intake status |
| --- | --- | --- |
| Open the same private route again | Return to the application through a clear Reconnect action | Proposed |
| Explain current work and interruption | Understand the action, target and uncertainty without reading every command | Proposed |
| Copy a reproducible problem for a coding agent | Carry useful evidence across Hallvi's operating/code boundary | Proposed |

The order reflects fit with the deployment/return journey; benefit and demand
remain hypotheses. The [external-user beta walkthrough][beta] is still open.
These features are not new beta prerequisites; [ROADMAP][roadmap] owns delivery.

### Open the same private route again

- **Problem / current evidence:** Reopen currently invokes `askInConversation`,
  which prepares a draft and focuses the composer; it does not submit the
  reconnect request. The access endpoint checks whether the SSH master exists,
  while the shell maps its boolean to application `answering`/`silent`.
  Tunnel presence and application HTTP behavior are different observations.
  See [shell][shell], [access endpoint][access] and [tunnel check][tunnel].
- **Intended result / smallest scope:** One owner-initiated Reconnect for an
  established private route, submitted through the existing main Pi operator
  and its permission boundary. Bind the request to the saved route; keep the
  same host/ports and show the observed result. A model turn remains initially.
  Follow [plan 02][reconnect-plan], including truthful access states.
- **Limit / owner decision:** Select this scope explicitly. Removing Pi from
  reconnect would need a separate mutation/approval contract. Reopening a
  tunnel grants no authority to publish, restart software or repair it.
  Laptop access still needs the supported forwarding arrangement; controller
  HTTP success cannot establish that the owner's browser can use the app.
- **Acceptance:** After disconnect and controller restart, reopen from the
  owner's actual device, use a named saved item, and preserve private exposure.
  Distinguish closed tunnel, failed SSH, no HTTP answer and unreachable
  controller. Exercise the selected permission mode without changing it.
- **Dependencies / related work:** A valid saved route, attached host and main
  conversation; coordinate shell/evidence changes with the performance work.
  Existing [AF-007][reconnect-feedback] is in unmerged #246. Reuse it rather
  than create another feedback entry; it is not an accepted implementation.

### Explain current work and interruption

- **Problem / current evidence:** The existing [work line][work-line] already
  distinguishes approval, command, quiet output and model waits. Its command
  description usually states only the execution location. The [interruption
  panel][interruption] gives a generic explanation, including “Nothing has run
  since”; it does not identify the last confirmed result or unsettled call.
  This source observation establishes an ambiguity, not a measured usability
  failure or proof that a remote command stopped.
- **Intended result / smallest scope:** Add the recorded action and target to
  that work line, then one evidence-based interruption explanation before the
  existing Continue/Stop controls. Reuse the current transcript/execution
  join. [Plan 03][work-plan] contains later approval/handover improvements;
  those need not enter this first slice.
- **Limit / owner decision:** Select the increment and agree wording for
  intention, confirmed result and unknown outcome. Neither a running command
  nor an interrupted status proves the intended effect. Continue can resume
  queued work; Stop does not undo effects. Keep current permissions and native
  continuation semantics.
- **Acceptance:** An unfamiliar owner correctly identifies the action,
  target, pending decision and unknown result after refresh and one controlled
  interruption. Link only evidence from the matching conversation/operation;
  check that no interrupted call is replayed. Use disposable state for the
  interruption trial, then verify real Pi wording in the scoped walkthrough.
- **Dependencies / related work:** Coordinate shared snapshot/shell edits
  with #248/#249 and evidence vocabulary with the packet below. #246 holds
  the plan; no matching merged feedback entry was found on inspected main.

### Copy a reproducible problem for a coding agent

- **Problem / current evidence:** [Product][boundary] requires application
  defects to reach the owner's coding agent. [Copy reply][copy] exports the
  reply body. [Saved information][records] supports bodies, evidence and keyed
  checks, but its typed content has no investigation-packet variant. These are
  useful foundations; packet usefulness is untested.
- **Intended result / smallest scope:** Save one investigation packet and
  provide a preview plus Copy for my coding agent. Include observed revision
  or explicit unknown, reproduction, selected redacted evidence, attempts,
  uncertainty and one behavior criterion. The owner chooses where to paste it.
  Reuse saved information and the existing CLI; [plan 05][packet-plan] defines
  the proposed contract and repair/recheck loop.
- **Limit / owner decision:** Select the bounded copy/export scope and
  criterion meaning. Keep excerpts and omissions explicit; existing redaction
  does not guarantee removal of arbitrary private prose. A saved procedure is
  not authorization to run it, and Pi's business-logic boundary remains.
- **Acceptance:** Give a receiving coding agent only the packet and repository
  access for one disposable defect. It can reproduce and repair the behavior;
  after owner merge and ordinary authorized release, repeat the original
  criterion against the observed running revision. Merge, HTTP 200 and CLI
  completion alone do not establish the repair. Check copy/refresh behavior
  and synthetic secret redaction before the operational trial.
- **Dependencies / related work:** Agree evidence meanings with plan 03;
  its full UI implementation is not a blocker. The request CLI is already
  merged in [#241][cli]; plan 11 is an adoption experiment, not a missing
  transport. #246 holds the packet plan; no matching merged feedback entry
  was found on inspected main.

## Work accounted for and verification limits

- **Implemented on main:** [CLI #241][cli], [host label #240](https://github.com/lustoykov/hallvi/pull/240), [verification #244](https://github.com/lustoykov/hallvi/pull/244) and [smoke fixes #245](https://github.com/lustoykov/hallvi/pull/245). Merged source establishes repository status, not an installed deployment.
- **Active, unmerged:** [#248][cache] caches execution evidence; [#249][sqlite]
  moves runtime SQLite work to database threads. Do not seed competing
  performance proposals. [#247's learning map](https://github.com/lustoykov/hallvi/pull/247) and [#250's inspector retirement](https://github.com/lustoykov/hallvi/pull/250) are also open; neither implements this shortlist.
- **Deferred product care:** Quiet care needs an owner-enabled background
  observation contract; recovery/update rehearsal and broader stack adoption
  remain separate proposals in #246. Existing backups and controller
  protection are present. Their historical proofs do not certify a new
  recovery run. [Product][product] and [ROADMAP][roadmap] own these boundaries.
- **Unverified external-user experience:** Public installation on a non-owner
  machine, their macOS installed-service update, external GitHub App access,
  and one fresh-user deploy/use/restart/return journey remain explicitly open
  in [beta preparation][beta]. No live app, Pi, provider or account was used
  for this note; no usability or speed improvement is claimed.

Verification followed [verify-hallvi][verification]: documentation/source and PR-state checks; future acceptance above has not been run.
Coding agents can still record useful bugs, friction and wishes directly in
[AGENT_FEEDBACK][feedback], without research prerequisites or a quota.

[planning]: https://github.com/lustoykov/hallvi/pull/246
[roadmap]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/ROADMAP.md
[beta]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/ROADMAP.md#public-self-service-beta-preparation
[shell]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/src/components/hallvi/operator-shell.tsx#L308-L633
[access]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/src/app/api/applications/%5BapplicationId%5D/access/route.ts#L39-L62
[tunnel]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/src/server/private-access.ts#L173-L229
[reconnect-plan]: https://github.com/lustoykov/hallvi/blob/f6c0dd56e57c1a07db9cf4cd6403cca8b97139b1/docs/plans/2026-09-29-product-improvements/02-open-reconnect.md
[reconnect-feedback]: https://github.com/lustoykov/hallvi/blob/f6c0dd56e57c1a07db9cf4cd6403cca8b97139b1/AGENT_FEEDBACK.md#af-007--reopen-a-known-private-application-directly
[work-line]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/src/components/hallvi/run-activity.ts#L127-L179
[interruption]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/src/components/hallvi/chat-pane.tsx#L1059-L1088
[work-plan]: https://github.com/lustoykov/hallvi/blob/f6c0dd56e57c1a07db9cf4cd6403cca8b97139b1/docs/plans/2026-09-29-product-improvements/03-work-and-results.md
[boundary]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/PRODUCT.md#operating-boundary
[copy]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/src/components/hallvi/chat-pane.tsx#L98-L125
[records]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/src/server/operator-data.ts#L119-L386
[packet-plan]: https://github.com/lustoykov/hallvi/blob/f6c0dd56e57c1a07db9cf4cd6403cca8b97139b1/docs/plans/2026-09-29-product-improvements/05-coding-agent-handoff.md
[cli]: https://github.com/lustoykov/hallvi/pull/241
[cache]: https://github.com/lustoykov/hallvi/pull/248
[sqlite]: https://github.com/lustoykov/hallvi/pull/249
[product]: https://github.com/lustoykov/hallvi/blob/cc7e9179ba053553163d2ee0a025ae4cd48ec2c7/PRODUCT.md
[verification]: ../../.agents/skills/verify-hallvi/SKILL.md
[feedback]: ../../AGENT_FEEDBACK.md
