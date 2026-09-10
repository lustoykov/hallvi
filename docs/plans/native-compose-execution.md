# Native Compose execution: implementation plan and handoff

Updated: 10 September 2026. Status: delegated to Opus; implementation pending.

## Goal and ownership

Support applications through their declared requirements with a small reusable core. Pi authors native configuration, chooses commands and recovery, and uses actual tool feedback. Server Guy retains identities, authority, data guarantees and evidence. No application-name branches, replacement service DSL, fixed model workflow or redundant Compose validator.

Owner explicitly requested **Claude Opus 5, High effort** for this next step. Opus implements and tests in this worktree; Codex coordinates, reviews the diff, verifies the result, and handles PR/merge. Do not delegate further. This authorization is specific to this assignment; later Opus work needs another explicit owner request.

## Sources of truth

- [Reviewed architecture and delivery sequence](../architecture/requirements-driven-deployment.md).
- [Fable reviews, including reversal of the custom-schema recommendation](../architecture/requirements-driven-deployment-review.md).
- [Consumer-fact ledger and real Pi correction proof](../architecture/native-compose-consumer-facts.md).
- [Native workspace implementation and verification boundaries](../testing/2026-09-10-pi-native-workspace.md).
- This file is the living implementation checkpoint. Update it at meaningful milestones and before stopping; do not overwrite historical evidence with new claims.

## Starting state

- Baseline main: `a7c2c7df7640f8213220add57897fd75620566c0`, merged PR #42.
- Working branch: `codex/native-compose-execution`, `.worktrees/native-compose-execution`.
- Root checkout is old main with unrelated dirty documentation; leave it and the running dashboard alone. Other worktrees, especially Claude's UI work, are not this task.
- Pi's eight native tools now run in an isolated per-run workspace in conversations and deployment planning. Compose 2.40.3 validates native files without a Docker daemon. Native tool output is available to Pi.
- The production executor still consumes the restrictive custom plan. Native artifacts/effect feedback have NOT been wired into managed execution.
- Recorded Paperless native and legacy configurations resolved identically after Pi corrected data/network mismatches. Feedback was supplied by the acceptance operator, not a new production authorization tool.
- A worker-only arrangement with independent builds and shared read-only storage validated through the same native tool adapter. It was not a model run or deployment proof.
- The workspace has no external network/host credentials. Do not treat current access limits as the permanent product design, or quietly expand them in this task.

## Intended next PR

Deliver the smallest working managed native-artifact path, using the current operation/Pi loop. This is implementation, not another design-only pass.

1. Inspect the relevant consumers and write a short concrete implementation outline here before broad edits. Resolve the lifecycle dependency below explicitly.
2. Let Pi select actual native Compose/packaging artifacts. Retain the selected artifact bundle, immutable source/private-input references, resolver version and resolved configuration identity. Do not let model-supplied parsed JSON stand in for actual native resolution, or let inventory regenerate a reduced Compose file.
3. Derive the management facts current consumers need. Compare data identity/access, network/exposure and target effects against the authorized baseline. Return useful generic diagnostics/mismatches to Pi, allowing correction within the request. Syntax belongs to Compose; user authority belongs to the existing records. Neither ordinary corrections nor service names need new approvals.
4. Apply the selected configuration through existing managed execution, preserving locks, credentials, release/attempt identities, actual outcomes and unknown-outcome reconciliation. Validate/compare and execute the same resolved selection. Retain legacy readers/rendering without rewriting old hashes, data names, schedules or receipts. Do not create permanent parallel orchestration engines.
5. Verify the new path with the existing-app preservation case and a materially different topology. Exercise successful correction, an out-of-scope data/exposure change, and uncertain execution without replay. Cover affected backup/rollback/UI consumers where the new representation reaches them. Tests must prove boundaries and behavior, not mirror every field or preserve obsolete code for its tests.
6. Document actual evidence, remaining limits, and custom admission/rendering/validation removed versus introduced. Commit the completed candidate locally and write the handoff below. Codex will inspect, verify and manage the PR.

### Dependency that must not be hidden

The reviewed design puts truthful observed-versus-verified baselines and a real private check path before admitting worker-only/check-less applications to production. Today `lastVerified` gates updates. Do not invent HTTP checks or promote readiness to useful-behavior verification to bypass that.

Choose a coherent vertical scope: implement the necessary lifecycle changes with the path if feasible, or explicitly retain a capability error for production arrangements whose lifecycle cannot yet be managed. In the latter case, the PR must still deliver real native-artifact managed execution for a supported arrangement, and report worker-only runtime support as unfinished. A native configuration proof alone is not completion of this next PR. If a broad rewrite is unavoidable, checkpoint the concrete blocker and smallest working split instead of building another framework.

## Authorized working boundary

Work in this isolated branch. Local code, tests, synthetic data and owned disposable Docker resources are authorized. Never read secrets into logs/model-visible files. Do not alter existing applications, their databases/volumes, live provider resources or the existing dashboard. No new hosts/spending. Codex can perform any required real-environment acceptance after reviewing a concrete candidate. Do not push, merge, reset another checkout, clean other worktrees or send external messages. Do not delegate further.

CI is not a user gate. Run appropriate local checks once, repeat only for changed code or failures. Report exact revisions, commands/results and untested claims. Existing root application URLs do not prove they run this branch.

## Progress checkpoints

- [x] PR #42 merged; native workspace tools and configuration proofs recorded.
- [x] Reviewed direction and consumer-fact ledger available.
- [x] Next assignment isolated and explicitly delegated to Opus 5 High.
- [ ] Concrete implementation outline and lifecycle scope recorded by Opus.
- [ ] Native artifact selection/resolution and generic effect feedback implemented.
- [ ] Managed execution wired through the existing operation boundary.
- [ ] Meaningful acceptance checks passed; remaining topology limits explicit.
- [ ] Codex review and independent verification.
- [ ] PR merged and next step recorded.

## Execution and resumption

Runtime coordination files are in ignored `tests/results/native-compose-execution/`: `task.json`, `brief.md`, `opus.stream.jsonl`, `opus-report.md`. `task.json` records the Claude session ID and model/effort. The CLI session is persisted so it can be resumed with the same session ID if needed. Inspect current process/session state before launching another instance; never run duplicate implementers against this tree.

On a context reset: read this file, inspect Git state and the latest Opus report/checkpoint, then read only the necessary source/design sections. Do not restart completed proofs or treat a planned checkbox as completed evidence.

## Latest implementation handoff

Pending Opus implementation. Record decisions, changed files, validation, exact remaining work and concrete blockers here. Preserve the boundary between model-generated configuration, observed runtime and verified application behavior.
