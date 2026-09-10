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

## Progress

- [ ] Concrete proof outline recorded.
- [ ] Real Pi initial install and useful behavior pass.
- [ ] Real Pi update preserves shared files and SQLite state.
- [ ] Necessary reusable corrections and affected checks pass.
- [ ] Evidence summary, cleanup and local commit complete.
- [ ] Codex verification and final merge/handoff.

## Handoff

Pending proof.
