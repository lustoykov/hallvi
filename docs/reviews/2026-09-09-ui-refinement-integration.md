# Application view refinement integration

The four commits ending at `claude/app-ui-refinement` / `87758e2` were
cherry-picked onto `codex/single-instance-runtime` / `acfbedf` in the isolated
branch `codex/app-ui-refinement-integration`. No source branch was moved.

| Source | Integrated |
| --- | --- |
| `284633d` | `9298c9c` |
| `ce3b4bc` | `7cdd44c` |
| `2409648` | `b36bccd` |
| `87758e2` | `496bc0e` |

The architecture canvas had one content conflict. Resolution preserves the
runtime branch's private-service descriptions, pinned-image distinction and
truthful SQLite backup wording, together with the refinement's node indicators
and destination links. The database view also retains the runtime branch's
explicit statement that an unprotected SQLite database is not backed up.

Sidebar identity, separate Domains/CDN/Security destinations, reveal wording
and the single primary pulsing mark remain as specified in the handoff.

## Status correction

The incoming canvas labelled green dots as "verified by a check" but also
coloured nodes green solely because deployment status was `live`. Unobserved
nodes now remain neutral. Recorded checks still supply passing/failing colours
where the canvas has a corresponding check mapping. Two rendering regression
tests cover a live deployment with no observations and mixed check results.

## Firewall coordination

At integration time, `.worktrees/self-hosted-shell` contained uncommitted work:

- `src/components/server-guy/views/domains-view.tsx`
- `src/components/server-guy/views/firewall-section.tsx`
- `src/server/firewall-status.ts`
- `src/app/api/applications/[applicationId]/firewall/`
- `tests/application/unit/firewall-status.test.ts`

These files were inspected but neither copied nor committed here. The component
currently mounts inside Domains and fetches provider status itself. Integration
needs to map that response into `ApplicationFacts.security` at the boundary and
render it in Security. Preserve the reader's distinction between allowed
firewall rules and actual service reachability. Until that work is integrated,
real routes continue to show the honest unavailable Security state.

## Validation

- Original refinement branch: 852 tests passed, 15 skipped.
- Integrated runtime branch: 864 tests passed, 15 skipped; the two additional
  architecture rendering regression tests also passed in a focused run.
- TypeScript, ESLint and Prettier passed, including the new test file.
- Overview, Architecture, Security and CDN checked at 1440 and 390 pixels:
  no page exceptions or page-level horizontal overflow. Screenshots and the
  machine-readable checks are in `tests/results/refinement-integration/`.
- Browser journeys: 5 passed, 3 failed on both the integrated branch and runtime
  base `acfbedf`, with identical failure messages. Both activity-history failures
  resolve the broad `History` button selector to two controls. The deployment
  journey cannot find the expected "Proposed change · not applied" status.
  These are reproduced baseline failures, not new failures from integration.

Browser fixtures use disposable synthetic applications without copying local
credentials or application state. The base comparison changes only the fixture
port offset from 3180 to 3280 so both suites can run independently. An initial
attempt with the older root checkout's incomplete dependencies was discarded;
the recorded checks use the refinement checkout's matching dependencies.
