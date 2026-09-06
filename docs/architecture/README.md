# Architecture explanations

Medium and large Server Guy pull requests include a small architecture explanation generated with `diagram-design`. Small pull requests such as bug fixes and cleanup do not need one.

Each explanation answers three questions:

1. Which components and boundaries does this PR change?
2. How do requests, decisions, and durable state move through them?
3. Which adjacent parts of the system remain deliberately unchanged?

The source of truth is a self-contained HTML file named `pr-NNN-short-description.html`. Open it directly in a browser, or serve the repository root locally:

```sh
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/docs/architecture/` and select the PR artifact.

Each explanation is a snapshot of the architecture when its PR merged, not a living diagram; later PRs changed what earlier diagrams show (for example, PR #13 added the local Pi worker). The [README architecture section](../../README.md#architecture) describes the current shape.

Explanations by PR, oldest first:

- [Journey 1 Phase 1 — initial simplified architecture, before the local worker](pr-001-journey-1-phase-1.html)
- [PR 7 — Pi contract evolution and Phase 1 boundary hardening](pr-007-phase-1-boundary-hardening.html)
- [PR 8 — Drizzle over the existing SQLite persistence layer](pr-008-drizzle-sqlite.html)
- [PR 9 — explicit Pi setup and fixed Phase 1 runtime](pr-009-explicit-pi-setup.html)
- [PR 10 — real Pi evals, exact state checks and human meaning review](pr-010-phase-one-evals.html)
- [PR 15 — native Pi conversation history versus saved Decisions](pr-015-native-pi-sessions.html)
- [PR 19 — Phase 2: explicit transition, pinned inspection, scoped reads and the validated Application Contract](pr-019-phase-two-application-contract.html)
- [PR 20 — Phase 3: the conformance brief, staged changes with isolated previews, reconciled publication, the exact merged candidate and the disposable runner](pr-020-phase-three-conformance.html)
