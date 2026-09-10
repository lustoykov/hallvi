# Native Compose execution: implementation plan and handoff

Updated: 10 September 2026. Status: Opus candidate committed locally; awaiting Codex review and independent verification.

## Goal and ownership

Support applications through their declared requirements with a small reusable core. Pi authors native configuration, chooses commands and recovery, and uses actual tool feedback. Server Guy retains identities, authority, data guarantees and evidence. No application-name branches, replacement service DSL, fixed model workflow or redundant Compose validator.

Owner explicitly requested **Claude Opus 5, High effort** for this next step. Opus implements and tests in this worktree; Codex coordinates, reviews the diff, verifies the result, and handles PR/merge. Do not delegate further. Owner expanded authorization on 10 September: Opus 5 High is the workhorse for all three steps in [the generalization delivery plan](generalization-delivery.md); Codex coordinates, verifies and merges. No unrelated delegation.

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

## Opus implementation outline (recorded before edits)

Consumers inspected: release scope, lifecycle, release executor/verification, reconciliation, rollback, recreation, backup capture/install and the host runner, stack/UI readers, operation facts and Pi status/release tools.

**Lifecycle scope decision.** Ship truthful observed-versus-verified baselines with this path; do not build the private check path here.

- Runtime gains an observed snapshot and state. Execution/reconciliation that establishes exact per-service images records it; behavior is `passed`, `failed` or `unverified`. `lastVerified` is promoted only when a recorded behavior criterion passes. A behavior failure after identity is established leaves an attributable observed runtime, not `unknown`, so a new scope can fix a known broken release. Unknown/mixed runtime still requires reconciliation.
- Release scopes bind the established runtime (observed or verified). Retries inside the same authorization may supersede their own observed attempts; another authorization's runtime invalidates a queued scope. Rollback still needs historical verified images; a verified target is allowed when the current runtime is merely observed.
- A native release must keep a behavior criterion whenever its baseline has one. Pi may replace checks, not remove them; readiness is never behavior. Consequently a production release settles verified or failed. Releases without a criterion occur only from a criterion-less baseline.
- **Not implemented, concrete reason:** the managed-host private check path is a separate network/credential boundary. Therefore production intake of worker-only/no-public-endpoint arrangements stays closed: initial deployment remains the legacy HTTP-verified intake, and a release cannot add, remove or move exposure. The worker-only arrangement is exercised through the real executor as observed-and-updatable, never verified or a rollback target.

**Native path, one executor.**

1. Releases become native-only. Pi receives the current configuration in its workspace (`.server-guy/current/`: Compose JSON with private values as `${NAME}` references, retained/legacy files and management records), authors native Compose and packaging with its own tools, and calls `deploy_release` with the selected file paths, protection records for new volumes and optional replacement checks.
2. The controller exports those exact bytes from the workspace, refuses edits to repository files (application source changes still need an owner-merged revision), and resolves them with the pinned Compose 2.40.3 in a fresh networkless container: fixed project name, no path resolution, interpolation only from private-input sentinels. A controller override file (retained artifact) pins public image tags, names built images and adds revision labels. The canonical resolved snapshot, resolver version, artifacts and records form a versioned release envelope with its own identity; legacy plan hashes are untouched.
3. Facts are derived from the retained snapshot (or legacy plan): services, per-mount data identity/access, exposure set, managed database association, private inputs, criterion. Scope compares them against the authorized baseline; Compose owns syntax. Host-affecting features without an established boundary (host namespaces, privileged, capabilities, devices, Docker API socket, host/writable binds, external or driver-backed volumes/networks, remote build contexts, profiles, replicas) return capability errors before mutation.
4. The existing locked release script executes the same snapshot (private references substituted into the protected host file), with the same receipt, attempt budget and reconciliation. Verification observes every service's image, revision label and readiness, then runs the recorded criterion.
5. Legacy releases keep their readers; rollback to them still uses the legacy renderer. Consumers read the derived facts instead of the plan where the native release reaches them (backup capture/install, stack view, recreation, operation facts, Pi status/release history, small UI readers).

**Tests.** Pure unit tests for facts/scope/capability/private references; the release integration suite moves to native selections (resolver stubbed); an opt-in Docker proof runs the real resolver and executor for the existing-app preservation case, a correction, an out-of-scope rejection, a lost reply, rollback to the legacy release and the worker-only observed arrangement.

## Authorized working boundary

Work in this isolated branch. Local code, tests, synthetic data and owned disposable Docker resources are authorized. Never read secrets into logs/model-visible files. Do not alter existing applications, their databases/volumes, live provider resources or the existing dashboard. No new hosts/spending. Codex can perform any required real-environment acceptance after reviewing a concrete candidate. Do not push, merge, reset another checkout, clean other worktrees or send external messages. Do not delegate further.

CI is not a user gate. Run appropriate local checks once, repeat only for changed code or failures. Report exact revisions, commands/results and untested claims. Existing root application URLs do not prove they run this branch.

## Progress checkpoints

- [x] PR #42 merged; native workspace tools and configuration proofs recorded.
- [x] Reviewed direction and consumer-fact ledger available.
- [x] Next assignment isolated and explicitly delegated to Opus 5 High.
- [x] Concrete implementation outline and lifecycle scope recorded by Opus.
- [x] Native artifact selection/resolution and generic effect feedback implemented.
- [x] Managed execution wired through the existing operation boundary.
- [x] Meaningful local acceptance checks passed (unit, integration, opt-in Docker); remaining topology limits explicit. No real host or live model run.
- [ ] Codex review and independent verification.
- [ ] PR merged and next step recorded.

## Execution and resumption

Runtime coordination files are in ignored `tests/results/native-compose-execution/`: `task.json`, `brief.md`, `opus.stream.jsonl`, `opus-report.md`. `task.json` records the Claude session ID and model/effort. The CLI session is persisted so it can be resumed with the same session ID if needed. Inspect current process/session state before launching another instance; never run duplicate implementers against this tree.

On a context reset: read this file, inspect Git state and the latest Opus report/checkpoint, then read only the necessary source/design sections. Do not restart completed proofs or treat a planned checkbox as completed evidence.

## Latest implementation handoff

Record decisions, changed files, validation, exact remaining work and concrete blockers here. Preserve the boundary between model-generated configuration, observed runtime and verified application behavior.

**Opus candidate, 10 September 2026.** Exact commit, commands, results and file list: `tests/results/native-compose-execution/opus-report.md`. Not pushed or merged.

- **Delivered.** Releases and their corrections are native Compose. Pi receives the running release under `.server-guy/current/` (configuration with private values as `${NAME}`, mounted/built files, records), authors Compose and packaging with its own tools, and calls `deploy_release` with file paths. The controller exports those exact bytes, refuses edits to repository files, and resolves them with the pinned Compose 2.40.3 in a networkless container, with sentinels standing in for private inputs. A retained controller override pins public image tags, names built images and labels revisions. The release envelope keeps artifacts, the resolved snapshot, resolver version and records; legacy hashes are unchanged. Derived facts serve scope comparison, verification, rollback, recreation, backup capture, stack/UI and operation facts for both representations. The same locked script, receipt, attempt budget and reconciliation execute the snapshot; rollback to legacy releases uses the legacy renderer.
- **Lifecycle.** Observed-versus-verified runtime as outlined above. Releases keep a criterion whenever their baseline has one. A behavior failure after identity is established leaves an observed runtime; the failed operation's retry corrects forward under its own scope, and rollback still needs verified images. Existing queue semantics still block other proposals until that failed operation is retried.
- **Unfinished, with reason.** No managed-host private check path, so worker-only/no-public-endpoint intake stays closed; that arrangement is proven only through the local executor as observed and updatable. An operation completing a criterion-less release settles `verified` at operation level while its evidence and the runtime say behavior is unverified; production cannot reach that state yet.
- **Found and fixed.** The shared tar writer stamped every entry with mtime 0, so BuildKit kept earlier synced files whose size and mtime matched: a same-size source change between releases built stale content (reproduced; legacy releases were affected too). Release and initial-deployment bundles now carry the current time.
- **For Codex to verify.** Real Pi authoring through `deploy_release` with the configured model; the existing-app update on a real host (Paperless-style managed PostgreSQL and private inputs); native recreation and backup capture on a host; the host backup runner's remaining `app`/`postgres` naming assumptions; historical image retention when a same-name rebuild moves a tag (the pre-activation image check fails safely).

## Codex review checkpoint and owner steering

Candidate d0b2446 completed. Codex independently ran 20 focused tests (all passed) and actual Compose resolution probes. Two omissions reproduced: volume subpath and explicit foreign network name passed the current facts comparison. Owner explicitly prioritized architecture over additional hardening on 10 September: defer exhaustive field/security checks, broad backup rewrites and input-version machinery. The correction round prioritizes a real Pi authoring/execution/feedback proof, small fixes for demonstrated data-identity/ownership gaps, and a clear next PR for native INITIAL intake (still custom-plan based). Review details and evidence: ignored tests/results/native-compose-execution/codex-review.md and review-probes.mts. No merge yet.

The standing mindset is recorded in [Product: Development priority](../../PRODUCT.md#development-priority): get the general architecture right first; fine-tune, harden and polish afterward. Apply this when selecting follow-up work and resuming after a context reset.

## Expanded owner authorization: complete steps 1, 2 and 3

The owner is going to sleep and explicitly authorized completing and merging the current PR, unifying initial deployment with native releases, and proving reuse across different application structures. Continue beyond this candidate under [generalization-delivery.md](generalization-delivery.md). Use Opus 5 High as implementer for the whole sequence, Codex as coordinator and independent verifier. Do not stop the monitoring heartbeat after step 1. Architecture and elegant simplicity take priority over extra hardening or speculative edge cases.

## Opus correction round (after Codex review of d0b2446)

Owner steering applied: prove the real architecture first; fix only demonstrated gaps; name broader hardening as follow-ups.

**Small corrections, each with a focused real-resolver check in the opt-in Docker proof.**

- A volume `subpath` is a capability error: preservation, SQLite and backup records identify whole volumes. Codex's `review-probes.mts` case is now refused.
- Networks keep their project-scoped names; joining a foreign name is refused (Codex's second probe). Isolation changes such as `internal` flips are not compared yet; legacy baselines have no custom networks.
- Bind mounts must be exactly selected files, not directories, which matches the host backup runner (read-only mounted files only).
- Activation copies mounted files with `cp -p`; the script's `umask 077` otherwise left them unreadable to an unprivileged container.
- A release without a behavior criterion is refused at the operation boundary, so an operation never says "Verified" while the runtime is only observed. Observed runtimes still arise from behavior failures (the operation fails, and its retry fixes forward).

**Review items.** Native recreation is now proved (all containers replaced from recorded images, configuration fingerprints including a mounted file checked, the criterion verified again, data kept). The backup runner is not rewritten: reachable native releases satisfy its current rules (project-named volumes, file binds, a labeled `app`, the managed database as `postgres`, container images equal to `compose.json`), but a capture of a native release was not executed. Release identity binds private input names; an attempt executes the protected values current at execution, as legacy does, and no input version is recorded. `bundleHashes["compose.json"]` hashes the executable file including private values (also true for legacy), which could let a low-entropy input be guessed from it plus the public snapshot.

**Architecture answer.** The release path removes the custom plan from Pi's work: `deploy_release` takes native files, and no plan JSON is written or parsed while releasing. The executed configuration is the retained resolved snapshot plus a retained controller override (pins, built-image names, revision labels); nothing is reduced or re-rendered. The loop is shared: selection → resolution → derived-fact scope → attempt → the same locked host script, receipt and reconciliation → verification → feedback. The custom plan survives only as initial intake and as the reader of historical releases (baseline views, facts, rollback). The remaining duplication is initial deployment's own upload/build/start sequence beside `releaseCommand`, two planner prompts, and the dual `plan`/`native` record behind `currentFacts`.

**Smallest next PR: native initial intake.** Reuse the release mode for the first deployment with an empty baseline. Pi declares private input names/reasons, the HTTP access choice and any managed PostgreSQL association as records; the recommendation shows derived facts and the price; approval binds the native release identity. `executeDeployment` keeps provisioning, firewall and metadata guard, then runs the bundle through `releaseCommand` without retained volumes. A behavior criterion stays required, so check-less intake remains closed until the private check path exists. This retires `submit_plan`, `parseDeploymentPlan`, the legacy prompt and initial deployment's bespoke bundle code; the legacy renderer and facts stay read-only for history.

**Deferred follow-ups.** Exhaustive Compose field audit; network isolation comparison; backup runner identity by labels and managed database by association, with an executed native capture; private-input versions and keyed fingerprints instead of plain hashes of secret-bearing files; the managed-host private check path; host-side revalidation of observed snapshots; historical image retention across same-name rebuilds.

### Real configured-Pi proof (correction round)

Opt-in: `SG_RUN_PI_PROOF=1 SG_PI_SETTINGS=<saved pi-settings.json>` on `native-release.docker.test.ts`.

The run uses the controller's saved Pi choice (`openai-codex` / `gpt-5.6-sol`, high). Only its settings file is copied into a disposable config directory; the credential stays in place and is read only by Pi's runtime. Real components are the planner, workspace, file export, pinned resolver, controller override, fact scope, locked host script, verification and records. SSH runs the host script locally, and source listing comes from fixture trees. The fixture (`tests/fixtures/notes-app`) runs on managed PostgreSQL with a private signing key and adds a README-documented worker in v2.

Run 1: Pi read the running configuration and records, authored `deploy.compose.yml` (app, worker, preserved `postgres:16` and `database` volume, private values only as `${NAME}`), replaced the criterion for v2, validated with Compose using placeholders, and submitted once. The selection was accepted, executed and verified in 1.6 minutes. The worker counted the retained note, the digest matched the synthetic key, and the database container and volume were kept. No correction was needed, so a second phase adds a host-only failure: v3's upstream Dockerfile pins a base-image digest no registry serves.

Two-phase run: both phases verified, in 4.3 minutes including host builds.

- **v2:** Pi authored its own `Dockerfile.release` (copying only application files) and `deploy.compose.yml` (app, worker, preserved PostgreSQL). A shared YAML anchor gave app and worker the same image name and build. The first execution failed in the host build, which built both. Pi then removed the anchor so only app builds and the worker reuses its image, and the second execution was verified.
- **v3:** Pi first used the upstream Dockerfile. The host build failed with `python:3.12-alpine@sha256:d5d190…: not found`. Pi recreated the `Dockerfile.release` it had read from the retained v2 release, whose base uses the tag, and pointed its Compose file at it without editing repository files. The second execution was verified.
- **After both releases:** the retained note still has its worker-computed word count, the digest matches the synthetic key, the PostgreSQL container and database volume are unchanged, and v3 serves. No private value appears in the evidence, the deployment record (which holds the feedback) or Pi's workspace journal. Pi also worked through native-tool errors in its workspace: `git status` fails because the export is not a repository, and only `python3` is installed.
- **Harness note:** that run kept only the start of each error, so v2's final error line is not retained and its cause is inferred from Pi's fix. The harness now keeps error tails; it was not rerun.
