# Final UI integration — 9 September 2026

Fable’s finished screens are integrated into the hardened #21 candidate, starting from `9b2b132`. The original UI commits `e17e4c8`, `6f35b57` and `56ae9f2` were cherry-picked as `78c6a8c`, `5434153` and `a5896a7`. The earlier snapshot commit was not replayed: it would duplicate integration work and predate the approval, persistence and hydration corrections.

## What is live and what is a reference

The real application mounts Fable’s Overview, application list and destination views. Its existing deployment panel, spending approval, shared receipts, conversations and host-log refresh remain connected to the existing API. New capability facts and action handlers are optional. Missing executors remain explicitly unavailable.

`/prototype` contains the simple SQLite and richer PostgreSQL/Valkey/worker scenarios, reference Connections screen, proposals, failures, releases and recovery interactions. These are invented in-memory scenarios, not deployment evidence. Production routes return 404. Reference list navigation stays in `/prototype`. The shared Add application form has a reference mode with a separate draft key and scripted navigation; it never calls the real creation API. Provider setup pages linked from the reference are explicitly the real controller’s settings.

No database migrations, provider operations or live host changes were added in this UI integration. The executor limits and unresolved-outcome handling in the [previous acceptance](2026-09-09-final-integration.md) and [independent review](../reviews/2026-09-09-final-integration-review.md) still apply.

## Corrections during integration

- Preserve the earlier pre-hydration form protection and its regression test while merging Fable’s applications-list changes.
- Share monitoring and protection summaries between Overview and the full views. Empty/unknown/stale checks, unreachable hosts and acknowledged-but-unresolved incidents cannot appear healthy. A configured backup schedule, partial coverage, uncovered data or a missing successful copy cannot appear protected.
- Keep prototype form submissions out of the real application store. The capture exercises submission with an API interception guard and requires scripted navigation without a creation request.
- Preserve Fable’s visual language and scenario engine. No replacement shell or new operational backend was introduced.

## Validation

- 834 application tests passed across 79 files. Fifteen opt-in Docker tests in two files were skipped.
- Lint/formatting and the production build, including TypeScript, passed. The existing dynamic-filesystem tracing warning in `src/server/docker.ts` remains.
- All five prototype route families returned 404 from the production server.
- The full reference capture produced 99 screenshots without page/console errors, including both scenarios, every stable destination, dialogs, interactions and mobile layouts. Screenshots are generated local evidence under `tests/results/reference`, not tracked source.
- The final reference list → Add application → scripted scenario interaction passed with a guard against real creation API calls. The focused navigation and truthful-status regression tests passed.
- Four real-application smoke journeys passed. The full browser run passed 34 of 35; repository-check re-run stayed pending beyond the navigation test’s 10-second assertion. The unchanged isolated recheck passed (18.0 seconds test time, 29.5 seconds including setup). All 35 journeys therefore have passing local evidence; the initial full run was not entirely green. No assertion was relaxed and no test was skipped.
- All 66 local file links in the edited documentation and design references resolve; `git diff --check` passed.

These are local synthetic checks; they do not establish live-provider support. GitHub CI is left running at the owner’s request, with no CI troubleshooting included in this integration. This is a UI adoption and integration pass, not a new independent review of the entire backend.
