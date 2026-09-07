# Core follow-up progress

2026-09-07. Work is on `codex/phase23-core-followups` in the separate core worktree, based on PR #20. These are implementation checkpoints; the full follow-up plan is not complete.

## Implemented

- Inspection records identity and tree first. Pi chooses files and supplies a supported profile selection with checked repository citations. Filename classifiers and automatic pyproject reads are removed.
- Runtime GitHub credentials come from Server Guy's App. Legacy CLI selections require reconnecting and setup never discovers host CLI credentials.
- Refresh selects the exact observed merge result or returned external commit, preserving that candidate when main advances. Full candidate content is checked against the reviewed scope.
- Publication receipt recovery finds the original proposal commit beneath collaborator commits and leaves their branch head untouched. This is recovery support, not yet the shared preparation branch/checkpoint workflow.
- Application image builds use a pinned, disposable rootless BuildKit container and a restricted download proxy. No host mounts, Docker socket, controller credentials, registry credentials or unrestricted build network are supplied.
- Pi can save an image build recipe (Dockerfile, context, optional stage) in the contract. Normalized relative paths are validated, the recipe appears in the execution brief, and it is recorded with each run.
- Configuration, migrations, startup, health and behavior use the built image. Image entrypoint, command, user and working directory are retained; repository tests and diagnostic commands use the source runner. Check set v2 prevents v1 runner-only evidence from passing as image verification.
- Images stream into Docker without host extraction or whole-image buffering. Owned build resources are cleaned after success, failure and cancellation; targeted crash cleanup preserves other active runs' resources.
- Source-only contract changes and build-recipe changes have meaningful Activity descriptions.

## Verification

- Full application suite: 742 passed, 14 Docker cases skipped in the ordinary suite.
- Real Docker: all 11 existing conformance cases passed; all three application-image cases passed separately. Coverage includes FastAPI/PostgreSQL migrations and behavior, failing app variants, restricted runtime access, cancellation, failed builds, cleanup, and a non-root Dockerfile path with a separate context and selected stage.
- TypeScript, lint/formatting, and production build passed during this checkpoint. Production build retains the existing Docker socket filesystem-tracing warning.
- Real Docker tests use executable synthetic application repositories. No new live Pi + real GitHub App publication journey has been claimed or performed for this checkpoint.

## Still to implement

- Shared preparation branch, early draft PR and meaningful incremental checkpoints under an explicit work grant, including race-safe reconciliation of collaborator edits.
- Persistent interactive preview lifecycle and owner confirmation bound to the tested image/revision/configuration.
- Earlier-phase correction and revision-adoption impact preview/apply operations, preserving history and invalidating affected evidence.
- Integration with Fable's experience branch, browser review and real authorized Pi/GitHub/Docker end-to-end acceptance.

## Integration notes

The user accepted Fable's prototype recommendation: A's top bar, C's current-step bar and outline Record, A's detailed-evidence drawer, and B's reply reference lines without duplicate actions. See the accepted experience direction in `phase23-followups.md`. Fable's local branch is now at `abf40ed`, verified clean: the current-step bar, outline Record, reply references, compact environment status and explicit demo labels are implemented. The prototype is removed from that branch. Fable reports 759 passing unit/integration tests and 19 synthetic browser journeys; those are not integrated-branch or real-provider acceptance. The profile-check definition now explicitly describes the condition for passing rather than implying a blocked check has already succeeded. The source-only Activity wording fix is already in the core branch.

Fable's next integration depends on core preparation, preview/acceptance and correction interfaces. Its shared browser specifications now use the Record complementary landmark, named section regions, page-level decision buttons and non-clickable demo citation labels. Preserve those changes when integrating; reconcile their expectations with the new model-led inspection and application-image execution behavior. Do not treat Fable's existing workflow stages as the final shared-branch/preview lifecycle.

Fable continues to own the experience worktree. The existing data shapes remain available; profile resolution can now be `pending`, GitHub setup's retired `detected` entry is always empty, and the contract may include `imageBuild`. There are no new preview or correction endpoints yet; do not present fixtures for those surfaces as completed functionality.

The image builder supports repository-selected build recipes independently of runtime profile. The current conformance checks still support the simple Python/uv/PostgreSQL case; this checkpoint does not claim Next.js, TanStack, arbitrary services or private registry support. Interactive preview will need to retain its exact image; ordinary conformance runs currently remove their temporary image tag after checks finish.
