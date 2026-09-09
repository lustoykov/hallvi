# Conversation-first integration acceptance — 9 September 2026

This report covers the combined UI, deployment, persistence and documentation candidate over PR #21 at `c7ed574ce3053a2bf7f0be72e85c0ee2f1b39df5`. The tested source snapshot has Git tree `051cbaf85de60769e9ccb6544f83bb7ddf9fcf55`; subsequent documentation records the results. GitHub checks must additionally validate the pushed candidate before merge.

## Changes verified

- Application-owned conversations share deployment state and reference the same operation receipts. Stable application views preserve the conversation's context; unimplemented capabilities remain explicitly unavailable.
- The deployment worker now tolerates another conversation adding a reference during execution. An immediate SQLite transaction merges reference metadata while still rejecting stale execution-state writes. The regression test reproduces the former conflict and checks the worker can persist its result without losing either conversation's reference.
- Legacy preparation instructions and conformance briefs restrict application-code proposals to small operability changes through an owner-merged PR. General application bugs require a diagnosis and coding-agent handoff. This is a model instruction plus existing publication authority, not a deterministic semantic classifier of every code change.
- Obsolete exploration routes and alternative shells were removed from the integration. Fable's separate final-screen worktree retains the design reference. Historical documents and a private recovery archive preserve earlier work.

## Local validation

| Check | Result |
| --- | --- |
| Application suite | **821 passed; 15 opt-in Docker cases skipped.** 77 test files passed and two skipped. |
| TypeScript | `npx tsc --noEmit` passed. |
| Lint and formatting | `npm run lint` passed. |
| Production build | Passed. Existing dynamic-filesystem tracing warning in `src/server/docker.ts` remains. Obsolete generated development-route types were moved out before rebuilding. |
| Browser journeys | Full suite: **34 passed, one failed**. The cancellation case received an HTML 404 from the Next development fixture. That same case passed in a fresh isolated rerun; the separate durable cancellation/retry journey also passed in the full run. All 35 cases therefore have passing evidence, but the initial full suite was not green. No case was removed, weakened or skipped. |

The browser and application tests use synthetic provider/model fixtures. They do not establish live-provider support beyond the dated [real deployment](2026-09-08-real-deployment-acceptance.md) and [hardening](2026-09-08-deployment-hardening.md) reports. No new provider resources or live application changes were made during this final integration pass.

## Retained acceptance disposition

- **Source and connection provenance:** preserved and checked in deployment-source and executor tests, including the approved repository identity, connection and commit. Repricing/rejection/retry are exercised by the shell browser fixture.
- **Owner-merged candidate:** the existing preparation/publication regression journeys remain. The prior real local proposal is not reclassified as a live owner-merged candidate; no new real-model source PR was created in this pass.
- **Durable cancellation/retry:** exercised by the full browser suite and the isolated cancellation rerun described above.
- **Populated database migration:** v10/v11-to-v12 tests preserve application/chat/history identity and check rollback/interruption behavior. Existing decisions, observations, contracts and preparation records remain; this merge does not retire their tables.
- **Live-model semantic casebook:** previously unreviewed answers remain unreviewed. This merge does not certify broad model reliability or mark the historical casebook complete. The supported live deployment retains its separate dated evidence.
- **Legacy UI:** mandatory phase navigation was replaced by conversation-first deployment. Optional preparation and its prerequisite/evidence machinery remain; further retirement is still tracked in the roadmap.

## Independent review follow-up

The [final Fable review](../reviews/2026-09-09-final-integration-review.md) found no merge blockers. Its additional approval/reference race was corrected after the main test pass; all 11 deployment-state tests passed, including unchanged recommendation approval during a cross-chat reference and rejection when the recommendation actually changes. Final GitHub checks must cover this follow-up revision. Unresolved purchase and verification outcomes remain conservative stops with no in-product resolution action; the review records these limits explicitly.

## CI hydration correction

GitHub run `34334341571` passed all **822 application tests**, lint, TypeScript and the production build. Two of four browser smoke cases failed at the new-application form: the trace showed repository/name text in the DOM, a connected GitHub login and a disabled submit button. The form accepted edits before React hydration could retain them.

The form now keeps editable controls disabled until hydration and draft restoration complete. A server-render regression test failed before this fix and passes after it; the existing browser journeys exercise the hydrated form. The two longer shell journeys receive the same 120-second cold-development-compilation allowance as the pre-existing add-application smoke case; assertion deadlines and test coverage are unchanged. All four browser smoke cases passed locally after the correction (48.2 seconds); the five application-screen unit cases, targeted lint and TypeScript also passed. A subsequent CI run must verify this correction before merge.

The next GitHub run (`34335493870`) passed deployment and the other two smoke cases. The remaining conversation test started its ten-second draft assertion while the first-use chat-creation POST was still pending and Next was rebuilding. The test now waits for that exact POST to return HTTP 201 using the existing 30-second HTTP acceptance budget, then applies the unchanged UI assertion. This adds an explicit creation check rather than treating an unfinished request as a broken draft. Its fresh isolated local rerun passed in 28.6 seconds; lint/formatting and all 550 documentation links were checked.

## Product limits

The implemented executor is a first-deployment slice: a local controller, a fresh Hetzner instance, one source-built HTTP application and optional private persistent PostgreSQL. BYOM, HTTPS/CDN, general image/Compose intake, SQLite and worker/broker orchestration, off-host backups/restoration, ongoing monitoring and routine release history remain delivery work. Neither polished placeholders nor this merge imply those capabilities are operational.

See [Roadmap](../../ROADMAP.md) for implementation order and [testing index](README.md) for the evidence hierarchy.
