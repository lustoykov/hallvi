# Hallvi — coordinated implementation plans

**All 11 planning chats have finished.** Each linked plan starts with a TL;DR of at most 120 words, followed by the detailed design, source references, implementation increments, dependencies and acceptance checks. The coordinator reviewed the plans and reconciled their overlaps.

Requested on 29 September 2026, following the [product research](../../research/2026-09-29-product-opportunities.md). The plans inspect main snapshot `cc7e9179`; refresh the relevant source before implementation. They are proposals for review, not completed capabilities or a replacement for the [Roadmap](../../../ROADMAP.md).

**Completed selected scope, 29 September:** the three bounded increments merged as one reviewed batch: **03** interruption/Stop explanations in [#268](https://github.com/lustoykov/hallvi/pull/268), **05** a saved Markdown handoff through existing Copy reply in [#270](https://github.com/lustoykov/hallvi/pull/270), and **11** a verified existing-CLI example in [#269](https://github.com/lustoykov/hallvi/pull/269). Final main `0966f6ea` matches the checked combined tree: 81 focused tests, four browser journeys, TypeScript, formatting/lint and production build passed. The real-Pi handoff trial established saving and copying after refresh using synthetic observations. Downstream diagnosis/adoption/repair remain unproven. This batch is merged source, not a published installed release. Larger mechanisms in the individual research plans were not requirements for these increments.

**Deferred by the owner:** **04**, **06**, **07**, **08**, **09** and **10**. Keep the current Overview; do not add a return brief. Their six planning workers are archived, and the plans remain available for later reconsideration. The completed 02 worker and redundant 01 planner are archived too. The three completed implementation workers are archived after the batch merge. FACTORY and PERF remain independent peer coordinators with their own teams.

**Earlier merged checkpoints:** performance integration [#252](https://github.com/lustoykov/hallvi/pull/252), current-action/target and mobile wrapping [#255](https://github.com/lustoykov/hallvi/pull/255), truthful access observations [#256](https://github.com/lustoykov/hallvi/pull/256), and saved-route Reconnect [#263](https://github.com/lustoykov/hallvi/pull/263). Earlier findings during real Pi work remain unproven. FACTORY completed [installed alpha.9 Reconnect acceptance](https://github.com/lustoykov/hallvi/pull/267#issuecomment-5896833172): real approval/reopen, laptop access and data preservation through an installed restart.

## TL;DR for Lyubomir

This table preserves the original research options. The completed scope and
explicit deferrals above govern current work.

| Plan | Smallest useful release | What establishes success |
| --- | --- | --- |
| [01 — Fast history](01-fast-history.md) | Performance integration merged in [#252](https://github.com/lustoykov/hallvi/pull/252); see its measured results and limits. | Responsive 1/5/10-chat browser sessions with fresh approvals/output, reconnect and restart. |
| [02 — Open and reconnect](02-open-reconnect.md) | One-click request to reopen the same private route through Pi. A model turn remains initially. | Open the app from the owner's laptop after disconnect/restart; distinguish access trouble from app failure. |
| [03 — Clear progress and results](03-work-and-results.md) | Improve the work line, approval consequences, interruption explanations and compact handover. | An unfamiliar owner understands what is happening and what was actually checked. |
| [04 — Return brief](04-return-brief.md) | Up to three meaningful changes or pending matters, with browser-local read state. | Correct understanding after returning; reading never resolves or approves work. |
| [05 — Coding-agent handoff](05-coding-agent-handoff.md) | Copy a saved chat packet: revision, reproduction, evidence and a behavior criterion. | The coding agent can act; the deployed repair passes the original criterion. |
| [06 — Quiet care](06-quiet-care.md) | One daily backup-completion check, quiet results, one current problem and pause. No automatic repair. | Correct failure/recovery and missed-check reporting, including controller downtime. Requires a background-observation contract. |
| [07 — Prove recovery](07-recovery-rehearsal.md) | Correct restore-verification claims and recover selected data from one named remote copy. Check the controller kit separately. | Exact copy/version, retrieved data, clone isolation and verified cleanup. |
| [08 — Learned procedures](08-learned-procedures.md) | One reusable procedure in existing saved information, with prerequisites and owner correction/retirement. | Less rediscovery; changed versions/paths prevent stale instructions being followed. |
| [09 — Adopt an existing app](09-existing-stack-adoption.md) | Repository-optional intake for one running Compose stack; read-only discovery before separate maintenance. | Accurate saved views, unchanged stack during discovery, intact data and unaffected neighbours. |
| [10 — Update rehearsal](10-update-rehearsal.md) | Apply one pinned target version to an isolated restored copy. | Retained data and new work pass; clone results never become live-release claims. Depends on 07. |
| [11 — Existing CLI adoption](11-cli-agent-adoption.md) | A concise example and one builder using their local coding agent with the merged CLI. | Correct attribution, approval handling, failed-check reporting and independently verified behavior. |

## Visual review before approval

**Owner requirement, 29 September 2026:** retain readable before/after evidence for UI changes in the implementation PR. The owner subsequently authorized the coordinator to review and merge the three selected increments without another approval round; visual verification remains required.

Plans **02–10** include visible changes to access, progress, summaries, cards, controls or intake. Plan **01** primarily changes performance; plan **11** starts with documentation and CLI adoption. Apply the requirement to the actual diff: even a backend change can alter loading, interruption or recovery behavior.

- **Matched before/after:** capture the baseline and implemented branch with the same representative data, viewport and scenario. Identify both revisions and label synthetic fixtures. Provide a full-size comparison viewer with zoom and linked scrolling, plus readable full-width images in the PR. Do not squeeze full-screen desktop captures into tiny GitHub table cells.
- **Relevant states:** include the changed state and any affected waiting, missing-input, approval, failure or recovery state. Use a short recording for transitions or timing that still images cannot explain. Include a narrow-screen comparison when responsive layout changes.
- **Preview versus implementation:** a proposed design preview may help settle a substantial layout change early; label it as a proposal. The final PR still needs captures from the implemented revision. An image does not establish that Pi or an application operation works; keep the plan's behavioral checks.
- **Review:** the coordinator inspects the implemented comparison and links it from the PR before merging. If capture or upload is blocked, keep that gap explicit and provide an accessible local preview. The three selected increments do not need another owner approval request.
- **No visible change:** say so. For performance-only work, provide comparable measurements and the tested environment; for CLI or documentation work, show the relevant output/example change. Do not manufacture a visual redesign to satisfy the review format.

Use the existing [visual verification guidance](../../../REVIEW.md#visual-verification-evidence), [PR template](../../../.github/pull_request_template.md) and [verification workflow](../../verification.md). The coordinator carries this requirement into each implementation dispatch and checks that the linked evidence is accessible before merging.

## Completed batch sequence

1. **03:** explained the latest returned result, unknown outcome and waiting messages beside native Continue/Stop; removed unsupported claims about commands having run.
2. **05 and 11:** reused existing records, copy interaction, CLI and permission boundaries. No new packet schema, release automation, dashboard or transport was needed.
3. **Integrated all three:** reviewed source and readable visual evidence, passed proportionate combined checks, and merged the PRs as one coordinated batch.

The other six ideas are deferred, not queued behind this batch. These increments do not make all eleven features prerequisites for beta. External-user acceptance remains a separate unproven milestone, not a blocker to the owner-authorized development and release work.

## Shared choices and dependencies

The relationships below describe the research proposals. They do not activate
the deferred work or enlarge the selected three increments.

- **Reconnect:** recommend Pi first. It removes request composition while preserving execution/approval ownership; removing model latency needs a later deterministic-mutation contract.
- **Care:** agree a narrowly scoped, owner-enabled background reader before adding it. Stored procedures and ordinary notes never activate scheduling or authorize repair.
- **Read state:** start per browser; cross-device acknowledgement can follow.
- **Evidence:** later success resolves a prior failure only when identity and checks establish the relationship. Current work, changes since a visit and a portable defect packet remain distinct presentations.
- **Recovery:** 10 needs 07's application restore/isolation/evidence, **not** its separate controller-kit readability check. Neither rehearsal needs care scheduling.
- **CLI:** 11 uses the merged interface. The packet in 05 is useful later and does not block its pilot.

```mermaid
flowchart LR
    Existing[Existing performance implementation] --> P01[01 Integration and acceptance]
    P03[03 Work and results] -. Shared evidence meanings .-> P04[04 Return brief]
    P03 -. Shared evidence meanings .-> P05[05 Handoff]
    P05 -. Optional example .-> P11[11 Existing CLI adoption]
    P07[07 Application restore proof] --> P10[10 Update rehearsal]
    P06[06 Explicit care contract] -. Optional later scheduling .-> P07
    P08[08 Learned procedures] -. Reuse verified steps .-> P07
    P02[02 Open and reconnect]
    P09[09 Existing Compose adoption]
```

Solid arrows are blocking dependencies; dashed arrows are coordination or follow-ups. These chats performed planning only. Acceptance checks describe future work; historical evidence and current source observations are labelled separately.
