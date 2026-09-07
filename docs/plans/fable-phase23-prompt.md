# Prompt to forward to Fable

Implement the user-experience follow-ups from our completed Server Guy PR #19 and #20 walkthroughs. Own the UI/UX and the read APIs/view models/integration needed to finish it. Codex is implementing core inspection, GitHub publication/revision safety, application-image execution, earlier-phase correction and preview lifecycle in parallel.

## Start in the correct branch

Repository: `https://github.com/lustoykov/server-guy` (local saved repo `/Users/aiwithlyubomir/biz/code/server-guy`).

PR19: `codex/phase-two-application-contract`. PR20: `codex/phase-three-conformance`, stacked on PR19.

Create a SEPARATE worktree and branch `codex/phase23-experience-followups` from reviewed PR20 commit `c76b4a851c1a3e4609abdcfe9d44b8a710a14582`. Inspect Git first. Do not switch the user's checkout, modify the existing PR19/PR20 branches, or work on `codex/native-pi-permissions-design`. If this exact branch/worktree already exists, inspect and reuse it safely rather than resetting it. Do not merge into main.

Codex's separate branch is `codex/phase23-core-followups`, worktree `/private/tmp/server-guy-phase23-core`.

Read these local handoff files first:

1. `/private/tmp/server-guy-phase23-core/docs/plans/phase23-followups.md` — ownership, dependencies and acceptance criteria.
2. `/Users/aiwithlyubomir/.codex/visualizations/2026/09/05/01a072b6-19ba-7833-b136-0e77778f3d0a/pr19-walkthrough/review-follow-ups.md` — all 30 detailed walkthrough items; the user-approved direction supersedes older contradictory specs.

Read the repository's product/domain docs and current implementation. Treat old docs as intent, not proof of behavior. Do not overwrite Codex's planning files.

## What to implement

**First use `/prototype` for the top bar and right-hand inspector.** The user finds the header unsatisfying and the Record/Activity/Changes/Receipts area too crowded. Read `/Users/aiwithlyubomir/.codex/skills/prototype/SKILL.md`. Produce inspectable alternatives and recommend a coherent direction before production redesign, following that skill's review boundary. Keep independent implementation moving while a design choice is pending. Desktop first; no unsolicited mobile polish. Preserve clear application identity, environment, current phase, policy and Settings without giving all details equal prominence.

**Make each phase understandable without finding the first chat message.** Show its purpose, current work and next action. Phase 2 means understand the application and identify required changes. Phase 3 means make those changes and verify the app runs. A completed inspection must accurately state remaining work, including zero. Never imply a profile match proves execution, or a responding endpoint proves full application health.

**Explore where actions belong; Chat is not a settled design.** The user explicitly questioned whether putting actions in Chat is the best UX. Include action placement in the prototype exploration: compare contextual Chat actions, a focused current-task/action area, or a coherent hybrid. Recommend based on discoverability, context, persistent current status and avoiding duplicate controls. The requirement is that Continue, proposed behavior tests, code review/approval, publication and the resulting PR link are easy to find and understand. Do not implement Chat cards as an assumed requirement. Reuse the actual saved records and existing operations. An old card must show that its proposal was superseded and must not approve the replacement. Keep these distinct: accepting a test plan, authorizing code/publication, successful automated execution, and confirming the app works in a preview. Record provides current structured detail, not a second source of truth. Ordinary replies/file reads are not Activity items.

**Make history and evidence usable.** Expose saved contract versions with commit, changed values/sources and reasons; keep old versions read-only. Use plain language such as Source. Make detailed evidence available without permanently filling the sidebar with it. Prefer a coherent focused view/progressive disclosure over adding more panels. Fix misleading presentation copy and ask Codex for underlying domain-description fixes where needed.

**Design correction and revision adoption clearly.** Users can revisit an earlier mistake. Before applying an earlier setup correction or adopting newer code, show what is retained, what must be reviewed/rerun and what is uncertain. Offer keeping the current revision. Preserve history. Consume Codex's impact/apply operations; do not invent a frontend-only reset or directly mutate phase state. A newer push must not silently switch the user's selected version.

**Use one normal GitHub App connection experience.** Remove CLI login as a product choice in coordination with Codex's authentication change. Clearly explain repository access and any required self-hosted App configuration. Developer use of `gh` is separate. Show the dedicated preparation branch/draft PR early, meaningful checkpoints, incomplete/untested status, collaborator updates/conflicts and next steps. Routine pushes are covered only by the granted scope; never silently change approval semantics. Merging remains a separate user action.

**Make real preview and recovery understandable.** Show build/check progress, a reachable preview link or useful API interaction, exact tested version, owner confirmation and problem reporting. Separate automated checks from the user's confirmation. Show when a change invalidates earlier results/confirmation. The preview runs on the Server Guy execution host, which may differ from the browser machine and eventual deployment server. Avoid labeling the existing generic runner check as an application-image preview. Codex is supplying the real lifecycle/acceptance operations. While Docker is healthy, keep status compact with last-checked time and optional refresh; when unavailable, show a useful install/start/recovery path. Do not make Docker refresh look like a required application test.

**Make demos honest.** Clearly label synthetic repositories/runs/publications at the relevant action. Do not send users to invented `github.com/qa/...` links; offer local inspectable evidence or non-clickable demo labels. Name/link the exact demo application when presenting evidence. Fixtures do not establish real Pi, GitHub or Docker success.

## Parallel ownership

You own `src/components/server-guy/**`, UI pages/layout/styles, new dedicated presentation/read modules and endpoints (such as contract history), and your feature-specific tests. You may implement backend integration for this work; do not stop at mock screens. Reuse existing DB readers and domain operations.

Codex owns shared domain types/schema/database writes, `operator-view.ts`, existing domain mutation routes, phase/revision state, Pi inspection/runtime, GitHub/auth/publication and Docker/executor logic, dependency manifests and shared QA adapters. Keep presentation-only types in your own modules. If you need a change in a Codex-owned file, record the exact interface need or a small proposed patch and continue independent work. Do not implement parallel approval/invalidation/preview stores.

Start phase/history/header/inspector work with the existing APIs now; prototype action placement before committing to its production layout. For new preview, correction and branch-progress surfaces, use one small presentation adapter and clearly labeled test fixtures until Codex's authoritative interfaces arrive. The shared plan defines required semantics. Integrating those real interfaces is part of your completion criteria; fixtures alone are not a finished feature. Do not read live uncommitted core files as an integration strategy: bring in a reviewed interface commit when available.

Use your own port/database/test resources. Do not stop the user's app or change the other worktree. Docker may be started when needed during implementation. That does not authorize unrelated real repository changes, credential changes, destructive setup, or merges.

## Validation and handoff

Test current/replaced chat cards, history/reload, correct phase explanations, unsupported capabilities, Docker recovery, truthful fixture links, no-change/external-work flows and the new integrated preview/correction states. Take desktop screenshots and supply direct runnable demo links with application identity and fixture/real status. Run relevant tests, lint, TypeScript and build. Do not report mocked execution as real acceptance or historical test reports as a fresh run.

Keep useful commits on your dedicated branch. Report the branch and exact HEAD, what changed, validation, screenshots/demo links and any remaining cross-branch integration. Keep prototype-only work distinct from production changes. Do not merge into main or rewrite either original PR branch.

The product direction is human-first, intelligent application setup with a few genuinely verified stacks, then expansion through concrete integrations and eventually plugins. This assignment does not include a marketplace, arbitrary microservice orchestration, production deployment, extra telemetry persistence or broad compatibility machinery. Prefer simple implementations and plain copy.
