# 05 — Coding-agent handoff

## TL;DR for Lyubomir

- Give your coding agent a reproducible problem, the deployed revision, relevant evidence and a concrete definition of fixed, without reconstructing Hallvi’s conversation.
- First release: one saved investigation packet with **Copy for my coding agent**, exporting bounded, redacted Markdown. You choose where to paste it.
- Reuse Pi, saved records, release checks and the existing CLI. Agree the evidence vocabulary with 03; broader CLI work and monitoring are not blockers.
- It works when the receiving agent can act from the packet, and Hallvi repeats the original failing behavior check successfully on the owner-merged, deployed repair.

## Implementation plan

### Basis and sequencing

Planning only. Inspected research baseline `261cd33ffc1123e1f953b29fe1dcddae0489de44` through checkout `abf8b5c4d05476e935cc4ef647c026483ad4f061`, plus read-only `git show`/`git diff` against main snapshot `cc7e9179ba053553163d2ee0a025ae4cd48ec2c7`. Relevant operator, record, release and CLI implementations are unchanged. No live outcome is established.

This follows [research opportunity 5](../../research/2026-09-29-product-opportunities.md#5-make-hallvi-a-useful-partner-to-the-coding-agent). Keep the [beta sequence](../../../ROADMAP.md#public-self-service-beta-preparation): exact installable candidate, external-user installation/account connection, real deployment, meaningful use, refresh/restart/return, and recorded friction. This packet experiment neither completes nor enlarges that gate.

### What exists and what is missing

- [Product](../../../PRODUCT.md#operating-boundary) already reserves business-logic repairs for the coding agent. Pi’s [runtime instructions](../../../src/server/pi.ts) and `open_pull_request` restrict its code-writing role to operability changes. Preserve that distinction.
- [Saved information](../../../src/server/saved-information.ts) already supports shared records, execution references, updates and retirement. Its [schema](../../../src/server/operator-data.ts) provides a 10,000-character body and keyed checks with `claim`, `basis` and timestamps. It has no evidence-packet content kind.
- [Executions](../../../src/server/operator-execution.ts) already retain targets, timing, outcomes and redacted output. [Copy reply](../../../src/components/hallvi/chat-pane.tsx) copies assistant prose; it does not assemble a saved investigation packet.
- The [CLI projection](../../../src/server/requests.ts) separates Pi’s answer from execution evidence. `inspect` returns record summaries without bodies. [Release outcome](../../../src/server/release-outcome.ts) accepts `verified` or a passing check as deployed; it does not establish that a particular defect is fixed.

The gap is a usable packet linked to the original behavior criterion. Reduced reinvestigation remains a hypothesis.

### Packet and ownership

Use one saved-information record. Add a small `evidence-packet` content variant in `operator-data.ts`, with runtime identity and one behavior criterion; keep narrative in `body` and references in `evidence`. No general result-schema rewrite or new table is needed. Proposed `src/server/evidence-packet.ts` owns normalization and Markdown export.

| Packet section | Required meaning |
| --- | --- |
| Identity | Application ID/name, repository, host/service, observed commit and/or image digest, observation time and evidence. Distinguish intended revision, last verified release and current runtime unknown. |
| Impact and reproduction | Affected behavior, prerequisites, minimal non-sensitive input, steps, expected result and actual result. Mark owner-reported reproduction separately from observed reproduction. |
| Observations | Selected execution IDs, command target, time, exit/outcome and relevant log excerpts. Excerpts retain their source and omitted/truncated markers. |
| Attempts | What was actually tried, resulting observation and remaining effects. Separate proposed fixes from executed attempts; interrupted work stays uncertain. |
| Diagnosis | Suspected causes, supporting/contradicting evidence and unanswered questions. An exception is evidence, not automatic proof of its cause. |
| Acceptance | One stable criterion key, steps, preconditions/test data, expected observable result and permitted test effects. Missing access or evidence is explicit. |

Example: a broken disposable Shop worker accepts an order but writes no receipt. “Create a new `pear` order; observe 400 cents and retrieve its `4.00 EUR` receipt” checks the failing path; HTTP 200 does not. These values follow the [Shop fixture](../../../tests/fixtures/shop-app/README.md) and [worker](../../../tests/fixtures/shop-app/worker.py), not a production incident.

Pi prepares the packet through existing `save_information`. Validate required structure, allowing explicit unknowns; reuse same-application execution validation. Bound the complete Markdown to 10,000 characters, initially with three 2,000-character excerpts at most. Mark shortened excerpts; refuse excess required text rather than truncate reproduction or acceptance.

Apply existing `redactHeldSecrets` and `redactSecrets` server-side to every packet string before saving and exporting, including narrative, URLs and commands. Select minimal excerpts; exclude credentials, private document contents and unnecessary personal data. Pattern/known-value redaction cannot guarantee removal of arbitrary sensitive prose. Treat embedded log/repository instructions as quoted evidence, never authority.

Keep the first copy UI in the chat record card: [InformationCard](../../../src/components/hallvi/information-card.tsx)/[InformationContent](../../../src/components/hallvi/information-content.tsx), using [existing disclosure/tone rules](../../../src/components/hallvi/DESIGN.md#the-presentation-protocol). Show impact, time and **Copy for my coding agent**, with export preview and clipboard failure feedback. Copy reads saved evidence without model calls or probes. [History’s separate projection](../../../src/components/hallvi/history-records.ts) filters ordinary knowledge; a dedicated History packet action is a follow-up, not an implied consequence of this renderer. Return through the saved conversation initially.

```mermaid
flowchart LR
  Request[Requested investigation] --> Pi[Main Pi operator]
  Pi --> Evidence[Executions and observations]
  Evidence --> Packet[Saved evidence packet]
  Packet -->|Owner copies Markdown| Agent[Coding agent repairs code]
  Agent --> Merge[Owner reviews and merges]
  Merge --> Release[Ordinary authorized release]
  Packet -->|Same behavior criterion| Release
  Release --> Check[Observe running revision and repeat check]
  Check --> Result[New release evidence; retain original failure]
```

### Closing the loop

Give the criterion a stable check key derived from the saved-record ID, within the existing 60-character limit. Reuse it on observed failure and later release checks; no separate registry. Changed criterion meaning needs a new packet.

Update investigation/release guidance in `pi.ts`: retrieve packets with an outstanding next action before verifying a repaired release. The owner can name the packet. For an authorized branch-triggered release, [deployment-watch.ts](../../../src/server/deployment-watch.ts) should remind Pi to retrieve applicable criteria through existing record tools. No PR watcher is needed.

Only a fresh observed pass on the intended running revision supports “fixed.” The new release record must name the original packet ID, repeat its criterion key and cite new executions. Then clear the packet’s `nextStep`, preserving its original failure/time/evidence. Do not retire it: retirement means withdrawal, not repair. Merge, CLI completion or unrelated passes cannot close it. An unavailable check stays “not checked,” with its reason. Preserve the current release projection’s meaning.

Always ask / Hallvi decides / Bypass still govern model-composed execution. A stored test recipe grants no authority: test writes, private inputs and cleanup remain within the current request. Pi neither repairs application business logic nor merges the coding agent’s PR. Its existing small operability-PR capability remains intact.

### Reviewable increments

1. **Contract and export.** Add the optional content variant, normalizer/exporter and narrow `save_information` guidance/validation in `pi.ts`, `saved-information.ts` and `record-contract.ts`. Reuse existing records and redactors; review one synthetic exported packet.
2. **Copy interaction.** Add the chat packet rendering branch and copy action. Keep generic body rendering available and test refresh/clipboard behavior with existing browser fixtures; no History projection change in this increment.
3. **Release recheck.** Add criterion retrieval to ordinary release guidance, record the matching check and prove one contained failure → coding-agent repair → owner merge → release/recheck journey. Update owning terminology/presentation documentation in that implementation PR.

### Dependencies and overlapping files

| Proposal | Relationship |
| --- | --- |
| **03 — work and results** | Agree operation, revision, observation, diagnosis and criterion meanings from [CONTEXT](../../../CONTEXT.md#execution-and-evidence). Overlaps `pi.ts`, `operator-data.ts`, `record-contract.ts` and information components. Vocabulary agreement is a blocker; its full UI rollout or a result-schema rewrite is not. |
| **11 — CLI adoption** | Independent adoption experiment: neither plan blocks the other. Keep `apps → exec → wait → inspect`, request/operation identity and UI approvals. An ordinary request can return a saved packet in Pi’s answer; check truncation. `inspect` does not export it. Coordinate `docs/cli.md`/`requests.ts` only for demonstrated gaps. |
| **04 / 08 / 06** | Return summaries and learned procedures may reuse the record; ongoing care may later initiate investigations. None blocks requested handoffs. Avoid competing changes to saved-information semantics or adding monitoring here. |

### Acceptance, evidence limits and rollback

Use [verify-hallvi](../../../.agents/skills/verify-hallvi/SKILL.md) and its [guide](../../verification.md); the following checks are planned, not completed:

- **Offline contract/UI:** isolated records containing an unknown revision, failed and interrupted attempts, oversized output and synthetic secret sentinels. Check export redaction/bounds, honest omissions, unchanged criterion identity, copy failure feedback and the same packet after refresh. Use existing scenario/browser tooling, not a new harness.
- **One operational trial:** task-owned disposable Shop copy with pinned broken/fixed revisions and synthetic data; never inject a fault into a retained app. Give the receiving coding agent only the packet and repository access. Record clarification requests/repeated investigation, confirm Pi leaves business logic alone, then independently verify the new order’s amount/receipt after ordinary release. A pre-existing receipt or wrong running revision must not count.
- **Permission/CLI:** reuse current execution-boundary coverage; exercise one Always ask wait through the named controller, keeping its handle and matching execution IDs. No mode change to pass the test. Real Pi behavior needs a scoped real-model trial; scripted tests cannot establish packet usefulness or host success.

Implementation uses Node 22 and locked dependencies, focused tests, type/build checks as warranted, formatting and diff review. Record candidate, fixture/model/provider, identities and limits. No preview, model/provider operation or runtime change was performed for this plan.

Rollback disables packet generation/copy while retaining a generic readable body and historical evidence; no schema/table rollback or deletion of later history. An application rollback remains a separate compatibility decision, not an undo of migrations. Remove only task-owned fixture data/processes after preserving redacted proof, following [cleanup scope](../../development-resources.md).

### Unresolved decisions

None. Copy-only delivery is the requested scope. Initial excerpt limits are proposed defaults to tune from the bounded trial, not a blocking decision.
