# Fable review of the product, roadmap and architecture

> Dated research/reference, not an active requirement or implementation plan. Current scope is in [Product](../../PRODUCT.md) and delivery is in [Roadmap](../../ROADMAP.md). Recheck version-sensitive facts before use.

Date: 2026-09-08. Requested by the owner and completed through the installed Claude CLI using `claude-fable-5-1`, high effort. Session: `bc7fa86a-2a60-4993-9faf-f284b54fdfa5`. Only Read, Glob and Grep tools were available; no MCP tools, shell or file-edit tools. The reviewer inspected the uncommitted direction documents and code in the integration tree based on `c7ed574ce3053a2bf7f0be72e85c0ee2f1b39df5`. No tests or provider operations were run. Line references describe the input at review time, before the roadmap readiness clarification below was added.

This is an independent review, not an implementation plan or approval to apply every recommendation. [ROADMAP.md](../../ROADMAP.md) remains the sole plan. The reviewer response is preserved below, followed by Codex's assessment.

## Reviewer response

**Verdict.** The positioning and first scope are coherent, unusually honest about limits, and not overcommitted at the product level. The risk sits in the roadmap's first increment and in what it silently defers. Increment 1 is described as a shell integration, but the phase model is load-bearing in the schema, the write guards, the tool sets and the prompts, so "rework PR #21 with the accepted shell" is a big-bang rewrite in disguise. Three foundations the target depends on are missing or deferred: a durable Operation record for external effects, owner authentication plus a bootstrap package, and an application identity that permits two deployments of one source. Split increment 1 into a data-model migration with no visual redesign, then the shell, and pull authentication and bootstrap ahead of any remote deployment.

## Prioritized findings

- **Blocker: the phase model is structural, not cosmetic.** Chats belong to phase workspaces, not applications, at `src/server/db-schema.ts:76-88`, and runs and activity are keyed the same way at `src/server/db-schema.ts:117-119` and `src/server/db-schema.ts:412-418`. Loading an application requires a current workspace at `src/server/workspaces.ts:37-48`, chats go read-only when a phase completes at `src/server/workspaces.ts:66-79`, and that guard is enforced on send, on final commit and on file reads. Correction: make increment 1a a schema-only migration that adds an application scope to chats and activity, backfills it from the workspace, keeps the workspace table as read-only history, and deletes the read-only-by-phase rule. The additive upgrade mechanism with backup at `scripts/prepare-db.mjs:35-59` already does this shape of change.

- **Blocker: the environment and identity model contradict the product.** The application record hardcodes a single production environment at `src/server/types.ts:31`, creation rejects anything else at `src/server/phase-one.ts:61-65`, and the top bar shows a Production chip at `src/components/server-guy/operator-shell.tsx:649`. The repository URL is unique per application at `src/server/db-schema.ts:45`, which forbids the "second Application called Staging" promised at `PRODUCT.md:57`. Correction: drop both in the 1a migration. SQLite cannot drop a unique constraint in place, so rebuild only the applications table with foreign keys off and record it as the one non-additive step.

- **Blocker: authentication and bootstrap are scheduled after remote deployment.** Increment 2 lists "authenticate its UI" as part of a much larger unit at `ROADMAP.md:28`. Today the app binds loopback at `package.json:7`, the only request guard is same-origin at `src/server/schemas.ts:50-61`, and there is no login anywhere in the source. GitHub and Pi tokens are plaintext JSON under the config directory at `src/server/github-connection.ts:121-129` and `src/server/pi-configuration.ts:59-65`. Either controller placement in `PRODUCT.md:31` exposes this on a network. Correction: a small increment before remote work with a single owner credential, a cookie session, and a Compose file running web, worker and a state volume. No teams.

- **Blocker: no durable Operation primitive exists for host effects.** The roadmap promises "durable operations" and reconciliation after interruption at `ROADMAP.md:26`, but the only operation table is a process-liveness guard at `src/server/db-schema.ts:483-490` and `src/server/application-operations.ts:7-28`. The retired plan carried "specify and test the durable Operation lifecycle" at `docs/plans/implementation-history.md:21`, and the active roadmap dropped it. SSH host mutations without an idempotent record will repeat effects. Correction: add an operations table with kind, target, idempotency key, intent, receipt and guarded status transitions, modeled on `src/server/db.ts:741-771`, and prove it by wrapping the existing publication path.

- **High: increment 2 is too large for one working slice.** Its done-when at `ROADMAP.md:32` spans SSH, host preparation, arbitrary Python and JavaScript inputs, workers, images, interruption reconciliation, packaging and both placements. The first real slice should be one BYOM machine over SSH, Docker installed by Server Guy, the existing FastAPI fixture deployed with Compose, and verification from the controller. Generalizing beyond the profile is a follow-on. Also, increment 3 bundles Hetzner with domains, TLS, CDN and Tunnel at `ROADMAP.md:36`. The research rates CDN and Tunnel as workload-dependent at `docs/research/2026-09-08-coolify-feature-parity.md:49-50`. Keep domain and TLS with public delivery and move CDN and Tunnel after backups.

- **High: the fixed profile is a gate, not a hint.** Any profile other than the FastAPI one resolves to unmatched at `src/server/application-profile.ts:289-295`, and the run configuration only knows PostgreSQL or none at `src/server/types.ts:535`. Retain the contract-with-provenance invariant, but introduce a minimal Compose-derived profile whose material fields are services, ports, volumes and variables, so the Compose file becomes the deployment definition. Its policy fields still cite phases 4, 7 and 8 and open U-codes at `src/server/application-profile.ts:94-100` and `src/server/application-profile.ts:186-230`. Those phases no longer exist in the plan.

- **Medium: monitoring honesty is fine, placement has one hidden coupling.** The controller failure statements at `PRODUCT.md:39` and `ROADMAP.md:64` are accurate. One gap: the worker only polls run queues at `src/server/pi-worker.ts:274-283`, so "checks continue while the controller runs" needs a scheduler that does not yet exist. Placement is realistic, but the local runner refuses remote engines at `src/server/docker.ts:676-689` and the preview binds loopback at `src/server/conformance-executor.ts:724-741`. A separate controller managing host B therefore needs Docker on both machines. Decide whether verification stays controller-local or moves to the target host.

- **Medium: the current UI is a wizard, and the new model could quietly become one.** The nine-phase rail at `src/components/server-guy/phase-rail.tsx:21-33`, the stage list at `src/components/server-guy/current-step.ts:353-428` and the earlier-phase lock at `src/server/workspaces.ts:74-77` are exactly what the ADR retires. Two things are worth keeping: computed readiness conditions that cannot be manually satisfied, and the one-primary-action bar derived from durable state, reattached to operations rather than phases. Approval modes exist at `src/server/types.ts:1-14` but only publication enforces them at `src/server/phase-three.ts:792-802`. Define what one "external change" means for SSH work before increment 2.

- **Later risk: the view payload ships every raw observation.** The view returns all observations with raw JSON at `src/server/operator-view.ts:213`, and the shell polls it every few seconds during runs at `src/components/server-guy/operator-shell.tsx:232-252`. Host inspections will make this heavy. Strip raw bodies from the view before increment 2.

- **Later risk: stale prompt and requirement text.** The system prompt and the upcoming-requirements list still make Hetzner and Cloudflare mandatory before later phases at `src/server/phase-one-spec.ts:106-129` and `src/server/pi.ts:74`. This contradicts BYOM being equally accessible. Remove in 1a.

## Already sound

- **Durable run semantics.** Idempotent enqueue by request key at `src/server/pi-runs.ts:71-126`, one OS-locked worker at `src/server/pi-worker.ts:44-56`, interrupted-on-restart and atomic final commit at `src/server/pi-runs.ts:346-417`. Keep verbatim.
- **Authority by closure.** Tools bind the application from the accepted run, never from the model, at `src/server/pi.ts:304-314`, with read budgets, a deny list and redaction in `src/server/secrets.ts`.
- **Evidence currency.** A passing observation from a replaced connection never supports a current check, at `src/server/phase-one-spec.ts:175-187` and `src/server/phase-two.ts:111-156`.
- **Reconciled publication.** Adopting an interrupted branch and pull request before retrying at `src/server/preparation.ts:313-323` is the exact pattern Hetzner provisioning needs.
- **Session storage is already application-owned.** Native histories are keyed by application and chat, not phase, at `src/server/pi-sessions.ts:86-91`, so conversation migration does not touch them.
- **Honest limits** on Compose downtime, restore versus backup, and controller outage throughout the docs.

## First slice and open decisions

**Proposed PR: increment 1a, application-owned conversations and operations, no visual redesign.** Schema v11 through the existing upgrade script: application scope on chats and activity with backfill, workspaces retained as history, environment dropped, repository uniqueness removed, an operations table with guarded transitions. Remove the read-only-by-phase rule, allow chat creation in any state, unify the system prompt and expose the full tool set with not-applicable errors instead of absent tools. Wrap publication and preparation start in operation records. Drop the upcoming-requirements list. Keep the current shell, but list all application chats and make the phase rail informational.

Tests for that PR:

- **Upgrade:** a v10 fixture with two phases, chats in each, runs and activity upgrades to v11 with every chat visible under the application, native files untouched, and cascade on removal intact. Extend `tests/application/integration/db-setup.test.ts`.
- **Conversation semantics:** a message in a chat created under a completed phase succeeds, two chats share the contract and decisions, and the crash and restart cases in `tests/application/integration/pi-runs.test.ts` still pass.
- **Identity:** a second application for the same repository with a different name is accepted in `tests/application/unit/applications-route.test.ts`.
- **Operations:** an interrupted publication reconciles to the same branch and pull request without a duplicate, added to `tests/application/integration/phase-three.test.ts` against the synthetic GitHub.
- **Browser:** the `chat-navigation` and `phase-two-contract` journeys updated so the first chat still accepts a message after inspection and reload preserves selection.
- **Live evals:** rerun the contract and conformance cases once on the unified prompt, opt-in, and record the outcome. No result is claimed here.

Settle before implementation:

1. Approval semantics for host mutations under Always ask: one named effect set per operation, not per command.
2. Where verification runs: controller-local runner, target host, or both. This fixes the bootstrap requirement for Docker.
3. Owner authentication and the bootstrap Compose package before any non-loopback exposure.
4. Application identity once the repository is no longer unique: name, source and host, and how candidates are attributed when two applications share a source.

Decide just in time:

5. The backup bar, mandatory verification set and rollback expectation, still open as U1, U15 and U16 at `docs/specs/application-contract.md:38-40`, belong to increments 4 and 5 with the first real database.
6. Plugin isolation runtime at increment 7. Reserve only a plugin table with pinned revisions now.
7. CDN and Tunnel placement, and whether Cloudflare DNS is part of the first public-delivery slice.
8. Whether Application Profiles survive as a concept or fold into Compose-derived contract fields, decided when the second stack is exercised.

## Codex assessment and disposition

The code inspection confirms the main migration findings: chats reference phase workspaces; repository URLs are unique; phase completion restricts writes; native sessions already use application/chat identity; and `application_operations` is a process guard, not durable remote-effect orchestration. The existing origin check is not owner authentication. These findings justify a bounded readiness pass, a narrower first migration PR, and explicit remote-operation/authentication prerequisites.

Adopt in the roadmap: map keep/adapt/retire ownership before edits; split the application/conversation migration from broad shell integration; establish external-operation intent, authority, receipts and reconciliation before host mutations; settle verification placement and owner authentication/bootstrap before exposing the controller on a network. Prove one BYOM deployment before expanding all stack/provider paths.

Do not adopt literally:

- The suggested first PR is itself too broad: schema migration, generic operations, unified prompts, full tool exposure and UI semantics should not be bundled automatically. Choose a small coherent migration after dependency inspection.
- Removing phase locks must not remove prerequisite or permission enforcement. Do not expose all tools merely because the interface loses stages; applicability and authority must remain enforced outside model choice.
- Do not reserve plugin tables before the concrete plugin slice needs them.
- Do not treat disabling foreign keys and rebuilding the applications table as a sufficient migration recipe. The existing upgrade script explicitly avoids rebuilds because of cascade risk. Test a copy, check references and retained records, and prove backup/recovery before applying a non-additive migration.
- Keep useful run/publication invariants, but do not promise to keep their implementations verbatim while changing ownership and lifecycle semantics.
- Owner authentication must precede non-loopback controller exposure. A loopback-only controller may legitimately perform an explicitly authorized remote SSH proof before the networked packaging slice; remote application management and exposed controller UI are different boundaries.

The seven product increments remain the coverage map. The readiness pass determines smaller implementation PRs and dependencies within them. Optional CDN/Tunnel work should not block proving first deployment, data protection and a routine release. The review does not change the selected provider/storage/notification scope.
