# Phase 2 and 3 follow-up implementation split

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

Agreed after the PR #19/#20 walkthrough, 2026-09-07. This is the implementation plan, not a claim that these features exist.

## Branches and ownership

Both workstreams start from PR20 head `c76b4a851c1a3e4609abdcfe9d44b8a710a14582`, which already includes PR19. Keep both existing PR branches unchanged during parallel implementation. Integrate reviewed follow-ups into the stack only after validation; do not merge anything into main automatically.

- Codex: `codex/phase23-core-followups`, `/private/tmp/server-guy-phase23-core` (created).
- Fable: `codex/phase23-experience-followups`, `/private/tmp/server-guy-phase23-experience` (created).
- User forwards the Fable prompt. No task or message has been dispatched to Fable.

## Codex workstream

1. **Interpret the application from evidence.** Establish repository identity, access and a selected commit; expose neutral context/tree; let Pi choose files. Remove mandatory pyproject reads and rigid manifest-based interpretation. Keep enforced permissions, scope, evidence references and honest capability limits. Evaluate Pi reader reuse only if it simplifies the actual implementation. Support the existing simple Python/PostgreSQL use case first; do not claim Next.js/TanStack support until separately verified.
2. **Keep preparation collaborative and revisions deliberate.** Use a GitHub App as the product connection. Begin a short-lived preparation branch from the selected commit when edits are needed, open a draft PR early under an explicit publication grant, and push meaningful checkpoints within that grant. Preserve intervening user commits; use race-safe remote updates, never force-push away their work. Reconcile conflicting changes before retrying. Keep merging a separate user action. Choose the reviewed merge result deliberately instead of silently adopting newer default-branch commits.
3. **Build and verify the intended application image.** Use repository build/runtime configuration, interpreted or proposed by Pi, rather than running every app inside a fixed Python image. Run automated behavior checks against the intended image with supported disposable dependencies. Enforce resource/access/credential isolation independently of model choices. Do not mount the Docker socket or broaden host access for application workloads. Restrict builds appropriately too; a Docker build executes repository-controlled instructions.
4. **Provide a real preview and durable acceptance.** Manage start/status/stop/expiry and a browser-reachable preview on the Server Guy execution host. Bind execution results and owner confirmation to the tested revision, image and relevant configuration/check definitions. A failed or superseded preview cannot retain current acceptance. Local evidence is not proof of production health. Start with one application and simple supported dependencies.
5. **Support deliberate corrections.** Provide a bounded impact preview before changing the selected revision or earlier setup: retained facts, affected work, required reruns and uncertainty. Applying a correction preserves history and marks affected downstream evidence stale; do not delete all work or pretend uncertain impact is harmless. Repository changes require fresh repository-specific evidence and must not reuse old publication grants indiscriminately.
6. Fix source-only Activity descriptions and enforce domain checks underlying the UI. Run meaningful unit/integration checks and real end-to-end acceptance with authorized resources.

## Fable workstream

Own the user-facing Phase 1–3 experience end to end: top bar/right inspector prototypes, phase purpose/current work/next action, prototype-led action placement (Chat is an option, not a settled choice), accessible contract history and evidence, compact Docker status/recovery, GitHub App connection UX, draft PR progress, correction/impact flow and preview acceptance UX.

Fable may implement read APIs, view models, local UI types, presentation adapters and integration tests needed to finish these flows. This is not a CSS-only assignment. Existing domain operations remain authoritative; no duplicate approval or acceptance state in the UI.

## File boundaries

- Fable owns `src/components/server-guy/**`, UI page/layout/style files, new presentation/read modules, dedicated history/read API routes and new UX-specific tests/artifacts. Add presentation types beside the UI/read modules rather than editing shared domain types merely for display needs.
- Codex owns `src/server/types.ts`, `schemas.ts`, `db.ts`, `db-schema.ts`, schema version/migrations, `operator-view.ts`, existing domain mutation routes, phase/inspection/spec/runtime modules, GitHub/auth/publication modules, Docker/executor modules and shared QA adapters. Codex supplies underlying correction, preview/acceptance, revision and publication operations. Fable may consume these functions from thin adapters and new read routes; do not bypass their checks.
- Keep changes to package manifests/lockfiles, shared CSS/config or shared browser fixtures with one owner. Fable owns UI styling; Codex owns shared dependency manifests and QA adapters. Prefer existing dependencies. Propose a patch if a dependency is actually needed.
- Test files should be feature-specific and distinct. Use separate ports, databases and test resources; never share a mutable demo instance during parallel work.
- Ownership is a merge-conflict prevention rule, not an approval bureaucracy. If a necessary change crosses the boundary, write a small concrete integration note/patch and continue independent work; do not silently edit the other owner's core files.

## Small integration boundary

Reuse existing `OperatorView`, API helpers and domain endpoints while implementing independent UX work. Codex keeps current consumers working during the parallel phase where practical; this is coordination, not a long-term compatibility layer.

For the new features, Codex will expose authoritative data/operations for:

| Surface | Required information / operations |
| --- | --- |
| Revision/correction | Selected commit; proposed target/change; impact summary with retained/affected steps and uncertainty; inspect impact; explicitly apply only if the inspected base is still current. |
| Preparation | Repository/branch/draft PR URL; remote commit; working/waiting/conflict/failed/ready status; latest meaningful checkpoint and verification identity. |
| Preview | Starting/ready/failed/stopped/expired status; preview URL when reachable; source commit/image identity; automated results; start/stop/retry; limitations or unsupported cases. |
| Owner acceptance | Current/stale/absent confirmation tied to the preview's tested identity; confirm or report a problem; reject an action based on replaced evidence. |

These are agreed semantics, not pre-existing endpoints. Codex defines runtime-validated request/response shapes in a small feature module before Fable's final integration. Do not create a generic event bus/plugin system to connect two workstreams. Fable may prototype these states with clearly labeled fixtures behind a single presentation adapter, but cannot call the feature complete until it uses the real operations.

## Sequence

1. Fable prototypes top bar/right inspector and action placement, then ships existing-data phase/action/history UX. Codex implements context-led inspection plus the revision/correction and execution/publication foundations.
2. Codex publishes the small interface commit(s); Fable integrates preview, correction, GitHub setup and preparation status against them. Keep interface-only commits separable from large implementation commits where useful; no requirement for a compatibility framework.
3. Integrate the two branches in one checkout, resolve conflicts with each owner, and run real acceptance. No automatic main merge.

## Acceptance and evidence

- Ordinary conversation stays out of Activity; meaningful outcomes belong there. Diagnostic logs/tracing remain separate and optional tracing is not required to use Server Guy.
- Old chat cards cannot approve a superseded proposal. Reloads show the same authoritative state as Record.
- A changed revision/image/configuration cannot silently inherit execution proof or owner confirmation.
- Collaborator commits survive publication and raced remote updates fail safely.
- The actually intended application image builds and runs; checks include meaningful behavior beyond `/health`; owner can use the preview and confirm it.
- Real Pi + GitHub App + Docker journey must be demonstrated with a real authorized repository. Synthetic cases remain useful but must be labeled, with no clickable invented GitHub URLs masquerading as real results. Prior reports are historical evidence, not a fresh pass.
- Test failure/cancellation, unavailable Docker, stale versions, replacement proposals, no-change and external-work routes. Use appropriate targeted tests, then normal repository CI checks and integrated desktop checks.
- Real publication/merge/test-resource mutations must stay within explicit authorization; no permission/account changes or destructive fixture setup inferred from this plan. Docker may be started when needed for the authorized implementation work.

## Traceability to the walkthrough's 30 entries

- Codex inspection/evidence: 5, 7–9, 12, 25–26.
- Codex revision/correction/publication: 1, 13–14, 20, 27–30.
- Codex image/preview execution and Fable preview UX: 7, 11, 24–25.
- Fable phase/shell/chat/history/recovery UX: 1, 3–4, 10, 13, 15–18, 20, 22–23, 27–30.
- Shared honest demos/real verification: 2, 6, 19, 21.

Detailed source notes remain at `/Users/aiwithlyubomir/.codex/visualizations/2026/09/05/01a072b6-19ba-7833-b136-0e77778f3d0a/pr19-walkthrough/review-follow-ups.md`.

## Explicit non-goals

No marketplace implementation, arbitrary microservice orchestration, all-stack support claim, actual production provisioning, automatic merge policy, extra trace persistence, or broad compatibility work. Development database recreation is acceptable; do not delete an existing user database casually.

## Accepted experience direction after Fable's prototype

On 2026-09-07, the user shared Fable's recap and confirmed agreement with its recommendations. This settles the previously open right-column and action-placement choices:

- Keep Variant A's production top bar and quieter buttons, with one solid primary action at a time.
- Use Variant C as the workflow base: a persistent current-step bar above the transcript, including the Phase 3 stage sequence, and an outline Record with Checks, Contract and saved versions, Change and behavior checks, Runs, Environment, and History.
- Borrow Variant A's drawer for detailed evidence and Variant B's small reference line under replies. References point to the authoritative action; they do not duplicate buttons or approval state in Chat.
- Fable owns production integration, the compact Docker status line, and a server-provided demo indicator. Remove the prototype from the production branch once integrated; retain it on the prototype branch.

Verified local experience HEAD at the time of this update: `7427709`. Its current-step model, history route, saved-version control and top bar are present; the recommended complete layout is still follow-up work. Fable reports passing synthetic browser journeys and other checks, not real Pi/GitHub/Docker acceptance. Core preparation, preview and correction operations remain separate unfinished dependencies.
