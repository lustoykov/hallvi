# Generalization delivery plan

Owner authorization: 10 September 2026, before going to sleep. Complete steps 1–3, using Claude Opus 5 High as workhorse and Codex as coordinator/reviewer/verifier. Push and merge completed, verified PRs. This supersedes the earlier restriction to one Opus assignment. No unrelated work or delegation.

## Working mindset

Get the general architecture right first; fine-tune, harden and polish afterward. Favor native Pi tools and intelligence, actual execution feedback and a small set of reusable record/effect operations. No application-name production branches, replacement Compose language, fixed deployment recipes, speculative framework or exhaustive hardening checklist. Fix concrete failures that prevent this flow from working; keep corrections proportional. PRODUCT.md records the standing principle.

## Step 1 — Finish the native release PR

- Active branch/worktree: `codex/native-compose-execution`, `.worktrees/native-compose-execution`.
- Baseline main: a7c2c7d, merged PR #42. Initial Opus candidate: d0b2446.
- Read `native-compose-execution.md` and ignored `tests/results/native-compose-execution/task.json`, `codex-review.md`, and latest `opus-report.md`.
- The resumed Opus session is 72b13be6-82dd-4336-a5f6-efd6af105049. Current output is `opus-review.stream.jsonl`; the original `opus.stream.jsonl` is a COMPLETED earlier round, not evidence that the correction round finished. Never start duplicate implementers.
- Corrections focus on a real configured Pi authoring/execution/feedback proof, minimal fixes to demonstrated data-identity/network-ownership omissions, and explicit remaining limits. Do not expand to a broad backup or security rewrite.
- Codex independently reviews and runs appropriate focused verification, creates a cohesive PR and merges when ready. CI is not an owner gate. Tests or concrete failures still matter.

## Step 2 — Unify initial deployment and updates

- After step 1 is merged, start from verified current main in an isolated `codex/` branch. Preserve unrelated worktrees and the running dashboard.
- Delegate the smallest coherent implementation to Opus 5 High. Both initial installs and updates should let Pi author native Compose/packaging and use the same selection/resolution/execution/feedback path.
- Initial provisioning still needs the existing host/cost/private-access authority; keep that outside application topology. Retain necessary legacy readers/hashes, but stop requiring new applications to fit the custom primary-app/companion plan before execution.
- Keep durable host/release/attempt/observed-versus-verified records. Pi chooses application structure and how to recover; tools execute and return actual results. Avoid another service DSL or parallel orchestration engine.
- Write a short concrete outline and acceptance checks before broad edits. Identify and retire now-obsolete authoring/validation duplication rather than growing permanent parallel paths.
- Codex reviews, verifies and merges the coherent PR. Record the merge revision and exact remaining limits.

## Step 3 — Prove reuse across application structures

- Exercise the SAME actual Pi-driven path on at least two materially different application structures: a simple web application and a multi-service application with independent builds, workers and shared persistent files. Include a database/private inputs where useful to the existing scope.
- Prove initial install, useful application behavior, an update that preserves state, and Pi correcting a real configuration/execution failure from tool feedback. Do not substitute scripted Pi callbacks for the claimed model proof.
- Use owned disposable local Docker resources and isolated application records; a local SSH adapter is acceptable if documented. Do not modify existing application data, create new paid hosts or expose secrets. Use the existing configured Pi credentials privately.
- If a proof fails, delegate a minimal reusable correction, rerun affected verification, and merge it. Do not add app-specific fixes or broadly harden unrelated paths.
- Record exact model, candidate/merge revisions, topology, actions, outcomes, retained data, cleanup and gaps. Passing two arrangements demonstrates reuse, not universal Compose compatibility.

## Progress

- [ ] Step 1 reviewed and merged (record PR and merge SHA).
- [ ] Step 2 unified native initial/update path reviewed and merged.
- [ ] Step 3 real Pi proofs completed and necessary corrections merged.
- [ ] Final concise handoff: what changed, proof results, limitations and next useful product step.

## Continuation and monitoring

The existing heartbeat `monitor-opus-compose-implementation` coordinates all three steps. Inspect the current phase, process and current log before acting; wait quietly during normal Opus work. Continue independently after each completion; do not wait for the sleeping owner for routine reversible decisions or previously authorized merges. Pause after all steps and handoff are complete, or if a real blocker requires user input. No redundant monitoring automation.

When resuming after a context reset, read this plan and the current step checkpoint, then inspect Git/process state and the latest report. Update this file with branch/session/log details as steps change. Keep proposed work distinct from verified results.

CLI note: the attempt to use `claude --bg` on 10 September reported an idle session but its daemon socket disappeared and no worker remained. The current correction round was therefore resumed with the known-working `claude -p` mode. Do not claim it is attachable. Prefer attachable background mode for later delegation only if it actually starts and remains alive; avoid spending the architecture budget on CLI tooling.
