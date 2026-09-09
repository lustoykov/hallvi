# Combined Phase 2 and 3 implementation

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

2026-09-07. Branch `codex/phase23-core-followups` combines PR #19, PR #20 and Fable's experience branch (`abf40ed`, merged in `36ec0de`). Main is unchanged. This document records the combined implementation; the original split remains historical context in `phase23-followups.md`.

## Implemented

- Pi selects repository files and supplies cited profile/contract proposals. Inspection establishes identity and a selected commit; it does not infer the stack from a fixed manifest scan.
- Product GitHub access uses Server Guy's GitHub App. Publication requires its current grant; the host's `gh` credential is not a fallback.
- Explicit shared preparation starts a branch at the selected commit and opens a draft PR with the first meaningful source checkpoint. Further checkpoints use the current branch head without force-pushing. Collaborator edits to affected files require a fresh read and reconciliation. Unrelated edits survive. Merging remains a separate user action.
- Candidate refresh retains the observed merge result rather than silently following later main commits.
- Rootless isolated builds use the repository's reviewed Dockerfile, context and optional target. Runtime checks use the resulting application image; source tests use the isolated source runner. Configuration, migrations, health and application behavior are checked separately.
- An explicit application preview rebuilds and verifies the candidate, then retains its application, disposable database and a fixed local relay for at most one hour. It binds only to loopback. Stop, expiry, failure, cancellation and worker restart remove owned resources. User confirmation is tied to the successful run, image, candidate, contract and behavior definition.
- Revision changes require a saved impact review before applying. Reinspection alone keeps the selected commit. Setup changes also show impact: changing repositories returns to Phase 1, retains historical work, requires new repository evidence and revokes publishing authority. Renaming avoids reruns; changing policy revokes publishing authority without inventing a code change.
- Earlier completed workspaces are reopened rather than replaced. Later phases are paused and read-only until their prerequisite review completes. Saved contracts, chats, evidence and results remain inspectable.
- Fable's top bar, current-step controls, outline Record, evidence drawer, saved versions and reply reference links are integrated. New correction and preview controls use the same authoritative view. Synthetic demos explicitly label their providers and do not navigate to invented GitHub pages.
- Real inspection uncovered the old two-minute timeout. Inspection now has a bounded ten-minute budget; ordinary chat keeps two minutes and build/edit work keeps thirty minutes.

## Verification and limits

See `phase23-verification.md` for the acceptance matrix and current evidence. Real-provider acceptance is reported separately from deterministic fixtures; a passing fixture does not prove GitHub publication or model quality.

The supported execution case remains one Python/uv/FastAPI application with PostgreSQL. Image recipes are repository-selected, but this PR does not claim Next.js, TanStack, arbitrary microservices or private-registry support. Local confirmation is not production health. Provisioning and later launch phases remain future work.

The development schema is version 10. Existing records are never silently deleted; unsupported older databases require an explicit development reset. No user database was reset for acceptance testing.
