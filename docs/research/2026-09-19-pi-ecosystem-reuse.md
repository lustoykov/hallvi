# Pi ecosystem reuse audit

Date: 2026-09-19. Status: source and package audit; no runtime proof of fit.

## Decision

Before finalizing Hallvi's remaining queue adapter, evaluate the published
`pi-agent-core` 0.85.1 `AgentHarness`/`AgentLane`. It implements native durable
queue identity and cancellation that were stubs in Hallvi's installed 0.84.4.
The earlier review was too narrowly scoped to the installed `AgentSession` SDK.
This is a candidate for deleting Hallvi behavior, not a recommendation to upgrade
production or rewrite the controller immediately.

The owner's preference is to accept Pi's native behavior unless it materially
harms Hallvi. Compare ongoing maintenance responsibility, not just diff size.

## Evidence and version boundaries

- Hallvi's package manifest pins coding-agent and pi-ai to 0.84.4. Its installed
  nested agent-core harness throws `HarnessNotImplemented` for prompt, steering,
  follow-up, cancellation, abort and resume. Fable's assessment of that version
  as a scaffold was correct.
- Published agent-core 0.85.1 contains executable lane admission, driving,
  cancellation and restoration code. Its npm metadata identifies source commit
  `d981de1229ef899957bbe968bc8dcda02a21f477`, published September 5, 2026.
- Upstream main was separately sampled at
  `36b60d2e8985899743c4cf5bd5f8929832a3f05d`. Main-branch integration and design
  documents must not be treated as installed or published functionality.

The audit inspected official sources and published tarballs without installing
dependencies or changing Fable's worktree. It triaged the official repository
inventory and inspected relevant components; it did not audit every repository,
third-party extension or runtime path.

Sources: [published core metadata](https://registry.npmjs.org/@earendil-works/pi-agent-core/0.85.1),
[official repositories](https://github.com/orgs/earendil-works/repositories).

## Reuse candidates

| Component | Finding | Implication for Hallvi |
| --- | --- | --- |
| AgentHarness / AgentLane, core 0.85.1 | Implemented durable inbox, queued-entry IDs, ID-based cancellation, execution and restoration. | Strongest candidate to replace the text-matching mirror and some restart reconciliation. |
| Session repositories and SQLite backend | Core provides JSONL and memory repositories; a separate SQLite backend is published. | Potential authority for agent transcript, inbox and execution records. Product records still have separate needs. |
| Chord | Generic services, replicated state and transport-independent RPC. | Possible reduction in transport plumbing; separate evaluation from queue ownership. |
| pi-durable / Pico5 | Main exports record contracts and memory storage; the full scheduler is planned, not a shipped replacement. | Track upstream; do not adopt a design as if it were implemented. |
| pi-chat | Discord/Telegram extension with Gondolin workers and its own application job queue. | Useful reference, not a reusable native scheduler that eliminates Hallvi orchestration. |
| Absurd | Separate Postgres durable-task system. | Adds infrastructure and a second workflow model; no demonstrated need here. |
| Gondolin | Execution sandbox and filesystem/network policy. | Relevant to tools and secrets, not conversation scheduling. |

Sources: [Chord](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/chord/README.md),
[SQLite backend](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/session-backends/sqlite-node/README.md),
[pi-durable exports](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/durable/src/index.ts),
[Pico implementation plan](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/durable/docs/pico-v5-handoff.md),
[pi-chat runtime](https://github.com/earendil-works/pi-chat/blob/9adbd29b40ee27ff1decf0fc87cbe180b40924f5/src/runtime.ts),
[Absurd](https://github.com/earendil-works/absurd),
[Gondolin](https://github.com/earendil-works/gondolin).

## What the newer harness could own

The published lane implementation commits a generated entry ID, message payload
and updated inbox together. Steering and follow-up return that ID. Cancellation
addresses the ID and distinguishes cancelled, already consumed and not found.
Restoration reloads inbox and operation state. These are implementations, not
just API declarations.

| Responsibility currently discussed | Proposed boundary to test |
| --- | --- |
| Durable message states | Let Pi own agent delivery/execution state; retain Hallvi's business records and only necessary projections. |
| Intake loop | Keep application routing and hosting in Hallvi; use Pi's native admission and execution lifecycle where compatible. |
| Text-matching queue mirror | Replace with native entry IDs and queue state if the integration proves workable. |
| Stop ordering | Evaluate native abort and queue cancellation together; verify what remains queued after Stop. Do not assume abort clears queued work. |
| Whether a stretch may start | Pi can own lane execution rules. Hallvi must retain authorization, preflight and conflicts over shared deployment resources. |

Sources: [lane implementation](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/src/harness/runtime/lane.ts),
[public contracts](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/src/harness/agent-harness.ts),
[restoration](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/src/harness/runtime/restore.ts).

## Limits that prevent a drop-in recommendation

`watchSession()` remains unimplemented in the published harness; lane observation
and snapshots are separate paths. The harness contract leaves one writable
session owner and platform scheduling to its host. Storage transactions do not
establish cross-process ownership or make external deployment effects exactly
once. The design also records gaps around migrations, search, forks and telemetry.

Published coding-agent 0.85.1 does not include the newer main-branch server/harness
integration. Its tarball contains no `dist/server` directory. The presence of
implemented core primitives therefore does not establish a complete published
coding-agent server suitable for Hallvi.

Sources: [harness status and boundaries](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/docs/harness.md),
[published coding-agent package](https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-0.85.1.tgz).

## Bounded follow-up for Fable

Compare the current `AgentSession` adapter with published core 0.85.1 in an
isolated proof of fit. Reuse the existing real-SDK harness and scripted provider
where possible. Exercise duplicate-text follow-ups, steering, cancellation,
Stop, restart with queued work and independent applications. Check custom tools,
permissions, provider authentication, transcript projection and interrupted
external effects.

Report which Hallvi responsibilities and code disappear, which remain, and what
integration/migration machinery would be added. Do not assume upgrading the
coding-agent dependency switches it to AgentHarness. Do not adopt unfinished
Pico or unpublished server integration to force the result.

Native cancellation may remove the technical reason for dropping Withdraw;
whether to expose it remains a product decision. No product or implementation
change is authorized by this research note.
