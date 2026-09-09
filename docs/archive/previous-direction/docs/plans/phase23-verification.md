# Phase 2 and 3 verification

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

This is an acceptance record for the consolidated branch, not a claim that all future stacks work. Verification uses isolated databases and owned temporary Docker resources.

| User-visible claim | Verification |
| --- | --- |
| Inspection is read-only, model-led and commit-pinned | Phase 2 integration tests and desktop inspection/correction journey. Real GitHub App access to `lustoykov/todo-fastapi` verified; real model inspection passed with a cited 19-field contract. |
| People can follow preparation and add commits | Shared-branch integration tests cover draft creation, checkpoint recovery, unrelated collaborator edits, same-file conflict/reconciliation and a raced remote push. Synthetic browser journey covers draft publication and merge refresh. Real publication awaits repository authorization. |
| The actual application image works | All 15 opted-in Docker cases passed against Docker Engine: image builds, failing applications, migrations, meaningful HTTP behavior, isolation, cancellation and cleanup. |
| The user can open a retained preview | Real Docker test opens the loopback URL and checks the application, then removes the preview. Browser failure case verifies retry and absence of an invalid confirmation button. |
| Confirmation cannot follow replaced evidence | Integration tests bind acceptance to candidate, contract, image, check definition and behavior checks, and reject stale/current-image mismatches. |
| Earlier setup can be corrected without losing history | Integration tests cover repository replacement, stale impact, preserved records, revoked grants, paused later phases and resumed workspaces. Desktop correction journey passed, including preserved versions and resumed workspaces. |
| Reload and current-step actions agree with Record | Phase 2 and Phase 3 browser journeys, saved versions, completed history, no-change path and failed/stopped/denied Docker recovery. |
| Ordinary conversation is not Activity | Existing application suite remains green; meaningful setup, preparation and confirmation outcomes have domain entries. |

## Checks completed

- Complete application suite: **778 passed**, with **15 Docker cases skipped** in the ordinary run.
- Real Docker suite: **15 passed**, run separately with `SERVER_GUY_DOCKER_TESTS=1`.
- Production build: passed. Existing dynamic Docker socket filesystem tracing warning remains; it is not a test or execution failure.
- ESLint and complete Prettier check: passed.
- Complete desktop browser suite: **32 passed**, including GitHub App consent/renewal/recovery, Phase 1–3, correction history and failed preview startup. Subsequent targeted Phase 3 checks cover the final run-label and Docker-status UI corrections.
- Impeccable detector reported no findings for the added dialogs and integrated shell. Manual desktop review checked preparation and the setup-impact dialog; the real application proposal and its passing preview were also reviewed in the browser. Screenshot review corrected two inconsistent labels: proposed behavior checks and the current Docker status. Interactive owner confirmation remains pending.

## Real-provider observations

The real GitHub App read `lustoykov/todo-fastapi` at `7f281ad2`. The first real Pi attempt saved its chosen source reads but timed out while composing the contract under the old two-minute limit. No contract was committed. That finding led to the inspection-specific timeout correction; the UI retry succeeded in approximately 151 seconds, saved the contract and passed all four inspection checks. Real local Phase 3 preparation built and ran the proposed application image. The first Dockerfile tried downloading a build dependency at runtime, which failed under the runtime network boundary. Pi corrected it. A subsequent run exposed an unsupported prose migration value in the contract; Pi saved contract v2 with `migrations.tool: none`. The final preview passed installation/image build, missing-configuration handling, PostgreSQL startup, application startup, health and two application-behavior steps (create a todo, then read it back). Migration and repository-test checks were explicitly not applicable. This is a real model/provider/Docker result over a local proposal, not a merged-candidate result.

Do not treat scripted `qa/*` branches, PRs or execution results as external acceptance. They remain explicitly labeled in the UI. Real publication, interactive owner confirmation and the final consolidated-PR review are still pending in this checkpoint.
