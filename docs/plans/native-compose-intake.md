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

## Opus implementation outline (recorded before edits)

Consumers inspected: intake planner/worker, approval route and card, `executeDeployment`, the release loop (`application-releases.ts`), native resolution, facts/scope, lifecycle/attempts, reconciliation, operation projection, stack view, backup runner assumptions and the affected tests.

**One path.** Intake and updates share: Pi authors native Compose and packaging in its workspace → selection tool → exact export → pinned resolver and controller override → derived facts → (intake: priced recommendation | execution: scope check → attempt → locked host script and receipt → verification) → feedback to Pi.

1. **Intake (read-only).** `planDeployment` becomes a native Pi session. Its `recommend_deployment` tool takes the `deploy_release` selection plus small intake records: private inputs with reasons, HTTP access, and the managed PostgreSQL association. A criterion is required. `prepareNativeRelease` runs against a baseline built from those declarations. Intake-only checks: every declared input is referenced, the managed database is the official `postgres` image at its version, only host port 80/tcp is published (the provider firewall opens nothing else), and a criterion is present. Errors return to Pi. Result: `record.native`, `releaseId`, price, awaiting approval. No plan JSON.
2. **Approval.** The card and input validation read derived facts, so legacy plans keep working. Approval stores `authority.releaseId`, binding configuration, price and inputs.
3. **Execution.** `executeDeployment` keeps provisioning, firewall and metadata guard, then hands over to the shared loop. The approved release executes through `executeRelease` (attempt kind `deploy`; same bundle, locked script, receipt and verification). On failure, `planRelease` runs in initial mode with the failure feedback, the approved configuration under `.server-guy/current/`, and the same apply/inspect/reconcile tools. Scope is the approved release's facts (exposure, HTTP access, database, volumes, inputs) on the new host. Authorization is the approved recommendation; three executions per operation. A retry reconciles an unknown outcome through the host receipt, otherwise resumes with Pi rather than blindly repeating.
4. **Shared-loop refactor.** One apply/feedback function serves updates and initial installs. `assertOwned` and `reconcileRelease` take an authorization (release scope or approved deployment) instead of assuming the release command. `executeRelease` treats a missing established runtime as a fresh host: no retained volumes, and it pulls the managed database image.
5. **Retire.** `submit_plan`, `parseDeploymentPlan`, the legacy intake prompt and plan JSON schema, plan-image pinning at intake, `executeDeployment`'s upload/build/start/app-probe/verification sequence, `composeStartCommand`, and the plan schema's authoring refinements. **Keep:** the plan type/shape, legacy renderer, `planFacts`, and legacy bundle/rollback readers. A legacy recommendation that is still awaiting approval executes through the shared executor with its legacy bundle, so in-flight records keep working.
6. **Tests.** Replace plan-authoring tests with intake-selection and initial-loop behavior tests. Add an opt-in Docker proof of initial install → update through the shared path (scripted Pi; fake Hetzner API, local SSH, host port 80 mapped to loopback at execution only), and a real configured-Pi run through intake, execution and an update.

Limits kept explicit: the backup runner still expects `app`/`postgres` naming (Pi is told the convention; not enforced); the private check path is not built, so a criterion stays required; HTTP only.

## Progress

- [x] Concrete implementation outline recorded.
- [x] Initial native selection and approval wired (`recommend_deployment`, `prepareInitialRelease`, facts-based card and inputs, `authority.releaseId`).
- [x] Shared execution and Pi feedback/correction loop wired (`releaseLoop` in `application-releases.ts`, `runInitialRelease`, generalized reconciliation).
- [x] Obsolete custom-plan authoring retired (`submit_plan`, `parseDeploymentPlan`, legacy prompt, plan refinements, bespoke initial bundle, `composeStartCommand`).
- [x] Real Pi and meaningful local checks passed: typecheck, lint, default suite, the opt-in Docker set and the real configured-Pi first deployment → correction → update (run 3).
- [ ] Codex review and merge.

## Handoff

**Opus candidate, 11 September 2026.** The exact commit, commands, results and file list are in `tests/results/native-compose-intake/opus-report.md`. Not pushed or merged.

- **Delivered.** First deployments use Pi-authored native Compose end to end. Intake runs `recommend_deployment` → `prepareInitialRelease`; the priced approval binds `authority.releaseId`; provisioning is unchanged. Execution then runs through the shared `releaseLoop`: the approved release first, Pi's corrections within the approval, receipts and reconciliation. Updates use the same loop.
- **Real configured Pi** (`openai-codex`/`gpt-5.6-sol`, high), run 3, passed in 5.4 min.
  - Install: intake was accepted. The approved release failed in the host build (unserved base-image digest); Pi authored `Dockerfile.server-guy` and `deploy.compose.yml`, and the second execution was verified.
  - Update: Pi added the worker. The first build failed because Pi re-derived the pinned base from the repository Dockerfile; Pi edited it, and the second execution was verified.
  - After both: the note was kept with 4 words, the digest matched the private key, the database volume was kept, and v2 was served.
- **Failed runs, preserved.** Run 1 (`pi-proof-failed-1/`): a verified runtime was then marked failed because the worker stop raced Pi's closing reply; fixed in `releaseLoop`. Run 2 (`pi-proof-failed-2/`, log only): the harness assumed the volume name `database`.
- **Remaining.** The private check path (a criterion stays required); the backup runner's `app`/`postgres` naming convention; HTTP-only exposure at intake; intake input reasons are not carried onto corrections; the step-3 proof on a materially different arrangement.

## Codex continuation checkpoint

The initial Opus print process exited after launching a detached proof. Its claim that a waiter would resume that completed process was incorrect. Codex found the proof completed with exit 1: expected status live but got failed (outcome completed), at native-release.docker.test.ts:2078. Evidence is retained in tests/results/native-compose-intake/pi-proof; original pi-proof.log must not be discarded before diagnosis. Resuming the SAME session to diagnose this concrete flow failure and finish verification/report. Updated log path is in task.json. Do not rely on background tool notifications to restart an exited print session; stay active until the needed proof settles, or explicitly hand off unfinished work.

**Diagnosis (Opus, resumed session).** Failed evidence is preserved in `tests/results/native-compose-intake/pi-proof-failed-1/` (evidence, journal, log). The real model completed the flow: intake was refused once (volume `notes_postgres_data` is not a valid project volume name), and Pi renamed it and was accepted. The approved release failed in the host build (unserved base-image digest). Pi's correction session authored `release.Dockerfile` and `release.compose.yml`, and the second execution was verified. The deployment then ended `failed` ("Deployment interrupted") through a race. A verified `deploy` attempt publishes status `live` while Pi is still writing its closing reply; the harness took `live` as done and stopped the worker; the stop aborted Pi's session, and the worker's catch overwrote the verified deployment. Updates had the same hole on worker shutdown.

**Fix.** `releaseLoop` keeps a verified execution's evidence when Pi's session is interrupted or fails afterwards (regression test in `initial-release.test.ts`). The harness now waits for real completion: live with its URL, recorded after Pi's session ends, or failed. Focused tests (21) and the scripted Docker proof are rerun before the real-Pi rerun.

## Codex verification

Reviewed candidate 53df917 and the recorded real-Pi evidence: initial install and update both completed live, note/worker result/private-input behavior and database volume were retained. Independently passed 21 focused tests (initial-release, application-releases, release-planner), the real-Docker scripted first-deployment flow (30.85 seconds), a production build and diff whitespace checks. No additional broad hardening was added. Ready for PR/merge; step 3 still needs the structurally different independent-build/shared-file application.
