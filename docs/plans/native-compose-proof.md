# General deployment reuse proof — step 3

Owner authorized completing steps 1–3 overnight, with Opus 5 High as workhorse and Codex coordinating/verifying/merging. Steps 1 and 2 are merged (PR43 and PR44). Baseline af49419. Generalization-delivery.md holds the overall plan. Read PRODUCT.md development priority: architecture and simplicity first, no speculative hardening or application-specific production branches.

## Goal

Prove the SAME actual configured Pi initial-deployment and update path on a second materially different application. The first app is already proven on PR44: Python notes + PostgreSQL/private input, then adding a worker, correcting real build failures and retaining data. Its redacted evidence lives in ../native-compose-intake/tests/results/native-compose-intake/pi-proof, and the source proof is native-release.docker.test.ts. Do not spend time rerunning that proof unless new production changes affect it.

Use tests/fixtures/shared-builds (independent web/worker subdirectory builds, shared read-write/read-only files and SQLite) or an equivalently concrete arrangement. Add minimal documentation/readme needed for Pi to discover how it works. No hints that secretly prescribe a production app-name recipe.

## Acceptance

1. Run the real configured Pi model through initial source inspection -> native recommendation -> existing approval/worker -> shared managed execution. Scripted callbacks do not establish the claimed model loop. Use the existing test harness and fake provider/local SSH transport; no new test framework.
2. Demonstrate useful application behavior: web produces a request/file, worker processes it and the result is observable. Assert independent images/builds and shared-volume RW/RO arrangements are actually running.
3. Seed state, update through real Pi on the SAME architecture, and verify both retained old state and new behavior/revision. Capture correction of an actual configuration/build/execution problem from feedback (the first-app proof already did this; a second topology-specific correction is valuable if it occurs naturally or a small deliberate fault is useful).
4. Fix only concrete failures that block this general path, with reusable changes. No app names, image prefixes or dedicated branches in core. No broad hardening, backup rewrite, private-check project or UI polish.
5. Record exact revision/model, inputs, selected services/builds/mounts, attempts/feedback, behavior/state checks and cleanup in a concise committed evidence summary. Detailed redacted output can remain in tests/results/native-compose-proof. State local transport/provider stand-ins clearly and do not claim universal Compose support.
6. Verify affected behavior and commit locally; write opus-report.md with exact results and remaining limits. Codex reviews/merges. If a missing primitive truly prevents the proof, implement the smallest coherent reusable capability; do not downgrade the acceptance to scripted Pi or configuration-only validation.

## Boundaries

Work only here. Use owned disposable local Docker resources and isolated records/synthetic private inputs. Existing live apps, data, dashboard and other worktrees stay untouched. No new paid host/provider mutations. Use configured Pi credentials only through the runtime, never print them. No push/merge or further delegation. Preserve older evidence. Keep this plan current, stay in the print session while awaiting tests (a detached waiter does not revive an exited CLI), and report actual completion.

Runtime: tests/results/native-compose-proof/task.json, brief.md, opus.stream.jsonl, opus-report.md. Inspect task.json/process before restarting to avoid duplicate implementers.

## Proof outline (recorded before edits)

**Path, unchanged.** Deployment worker → Pi intake (`recommend_deployment` → `prepareInitialRelease`) → approval route → provisioning against the fake provider → `runInitialRelease` → `releaseLoop` → locked host script, receipt and verification. The update is `proposeApplicationRelease` → `runApplicationRelease` → the same `releaseLoop` with Pi's `deploy_release`. Every Pi session uses the configured model; nothing is scripted.

**Second application.** `tests/fixtures/shared-builds` plus a README documenting its routes, paths and data flow; it prescribes no Compose, service names or mounts. Pi must arrive at two images built independently from `web/` and `worker/`, SQLite in a named volume, documents written by the web service and read by the worker, and results written by the worker and read by the web service. No managed database, no private input. Compared with the notes app: no PostgreSQL, two subdirectory build contexts, and a file handoff across shared volumes with per-mount access.

**Revisions.** A is v1. B is v2 in both components, and its worker Dockerfile moves the worker from UID 65534 to 10001. This is a realistic upstream change that a fresh install tolerates, but the results volume v1 created stays owned by the old UID: the deliberate topology-specific fault, which only the host run reveals. Pi may foresee it; the correction, or its absence, is recorded rather than asserted.

**Harness checks,** recorded apart from the product's verification:

1. Install: live and verified at A; two built, distinct images; running mounts equal the retained facts, with a volume shared by a read-write writer and a read-only reader; a write through a read-only mount fails.
2. Behavior: POST a value, then `/result` returns `<value>@v1` (web → documents → worker → results → web). The product can only verify read checks here: the check rules require writes to be read back and deleted by ID, and this app has no IDs. The worker's processing is harness evidence, as in the worker-only proof.
3. Update: verified at B. The SQLite value is retained. `/result` becomes `<value>@v2`, meaning the new worker processed the retained document into the retained results volume. `/version` reports v2, every volume keeps its creation time, and both images are rebuilt.
4. Evidence: selections, feedback, attempts, tools, authored files and running mounts, asserted free of private values. Cleanup removes the stack, its images and Pi's workspaces.

Production changes only for a concrete failure of this path. Detailed evidence: ignored `tests/results/native-compose-proof/pi-proof`. Committed summary: `docs/testing/2026-09-11-native-compose-reuse.md`.

## Progress

- [x] Concrete proof outline recorded.
- [x] Real Pi initial install and useful behavior pass.
- [x] Real Pi update preserves shared files and SQLite state.
- [x] Necessary reusable corrections and affected checks pass. The path needed no production change.
- [x] Evidence summary, cleanup and local commit complete.
- [ ] Codex verification and final merge/handoff.

## Handoff

**Opus candidate, 11 September 2026.** One local commit on `codex/native-compose-proof`, not pushed or merged. The commit SHA, commands and results are in `tests/results/native-compose-proof/opus-report.md`. The evidence summary is [2026-09-11-native-compose-reuse.md](../testing/2026-09-11-native-compose-reuse.md).

- **Real configured Pi** (`openai-codex`/`gpt-5.6-sol`, high) installed and updated `tests/fixtures/shared-builds` through the unchanged native path in 215.6 s. The stack has independent `./web` and `./worker` builds, SQLite, documents that the web service writes and the worker mounts read-only, and results that the worker writes. It has no managed database or private input.
- **Install.** Intake refused Pi's first criterion: a write check that could not be read back and deleted, and would overwrite user data. Pi resubmitted with read checks. The approved release was verified on its first execution. The harness showed a value passing web → documents → worker → results → web.
- **Update.** The deliberate fault (the worker moving from UID 65534 to 10001 while the results volume keeps the old owner) never reached the host. Pi diffed the v1 Dockerfile retained in `.server-guy/current/` against v2 and set `user: "65534:65534"`. The update was verified on its first execution. The value, documents, results and volume identities were retained, and the v2 worker reprocessed the retained job.
- **Changes.** An opt-in real-Pi test in `native-release.docker.test.ts`, the fixture README, the evidence summary, and one sentence in `shared-storage-builds.md`. No production code changed.
- **Remaining limits:**
  - This application had no correction from host feedback; the first application's run 3 shows that loop.
  - Product verification of the worker is readiness plus read checks.
  - The proof ran once.
  - Backup capture, rollback and recreation of this stack were not exercised.
  - Stand-ins: local SSH, a fake provider, fixture trees and a loopback port.

## Codex verification

Reviewed candidate `80d3e8b`, the actual model evidence and assertions. Both phases completed with verified attempts and no harness error. The three retained volumes, distinct rebuilt images and worker output across the update match the report. Confirmed the proof's containers and volumes were removed. Corrected a test comment: the UID problem can be anticipated from retained files, as Pi actually did.

Independent checks passed: TypeScript and the scripted first-deployment Docker regression (27.61 s), exercising the shared harness after the additive test. Opus's default run passed 1,006 tests with 26 opt-in skips. The expensive model run was not repeated because no production or executable test logic changed after its successful run. Ready for the authorized merge.
