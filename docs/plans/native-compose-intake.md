# Unified native initial deployment

Status: assigned to Opus 5 High. Baseline: PR #43 merge 4479f98. See generalization-delivery.md for owner authorization and the three-step objective.

## Objective

Initial installs and later updates should use the same native Pi authoring, artifact selection/resolution, managed execution, durable records and feedback architecture. The application should not need translation into Server Guy's custom primary-app/companion topology. Provisioning, cost approval and private input collection remain existing product responsibilities, outside application topology.

## Work

1. Inspect current initial-intake and native-release consumers, then record a concise implementation outline here before broad edits. The native-compose-execution plan has the prior outline for this migration; use judgment rather than mechanically copying it.
2. Let Pi prepare native Compose/packaging and necessary management records for an initial release. Keep management records small: identity, exposure/authority, private input requirements, data/protection metadata and actual behavior criteria. Native Compose stays the deployment artifact; inventory must not become an authoring DSL.
3. Recommendation and approval bind the selected native configuration and host/cost effects. Once existing access is provided, initial execution uses the shared bundle/executor and returns actual configuration/build/verification feedback to Pi for correction within scope. Do not leave initial deployment as a fixed stop-at-first-error script while only updates get an agent loop.
4. Remove obsolete new-plan authoring/validation and duplicate initial bundle machinery where possible. Preserve readers, historical hashes, records, existing deployments and data. Avoid permanent parallel engines. No application-name production branches.
5. Verify initial install -> update through the shared path on owned disposable local Docker. Use the configured actual Pi model at least once through initial intake, not only scripted callbacks. Record exact transport adaptations and where provider provisioning is mocked. Do not use live hosts or buy resources.
6. Commit a coherent candidate and report exact tests/evidence, remaining limitations, code retired vs added and the minimal step-3 proof still needed. Codex reviews, independently verifies and merges.

## Mindset and scope

Architecture and elegant simplicity first. Heavily lean on Pi and native tools; implement only necessary reusable record/effect operations. No exhaustive hardening, speculative edge cases, plugin SDK, workflow language or unrelated backup rewrite. Small corrections to concrete proof failures are appropriate. Do not broaden supported protocols or databases as a side task. A truthful HTTP criterion can remain for current intake until private checks are implemented; never manufacture verification for readiness alone.

Use the existing test harnesses instead of growing a parallel testing framework. Prefer replacing obsolete tests with useful behavior coverage. Step-3 acceptance ultimately needs two materially different real-Pi initial/update arrangements, including independent builds, workers and shared files. Design this path so it can support that without app-specific additions; if convenient, gather that evidence here too and label it clearly.

## Operational boundaries and coordination

Owner authorizes Opus 5 High for all three steps, no further delegation. Work only in this worktree. Preserve root dirty checkout, current dashboard and other agents' UI branches. Disposable local resources and synthetic secrets allowed; no live apps/data/providers/spending. Never print credentials. Private controller Pi settings may be used by the runtime as in step-1 proof. Do not push/merge; Codex handles those. Update this checkpoint at milestones and before stopping.

Runtime files: tests/results/native-compose-intake/task.json, brief.md, opus.stream.jsonl, opus-report.md. Previous real-Pi proof artifacts and candidate logs are in ../native-compose-execution/tests/results/native-compose-execution; read as needed, never modify their private evidence. No duplicate implementers.

## Progress

- [ ] Concrete implementation outline recorded.
- [ ] Initial native selection and approval wired.
- [ ] Shared execution and Pi feedback/correction loop wired.
- [ ] Obsolete custom-plan authoring retired.
- [ ] Real Pi and meaningful local checks passed.
- [ ] Codex review and merge.

## Handoff

Pending implementation.
