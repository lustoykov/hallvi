# Architecture explanations

Every Server Guy pull request includes a small architecture explanation generated with `diagram-design`.

Each explanation answers three questions:

1. Which components and boundaries does this PR change?
2. How do requests, decisions, and durable state move through them?
3. Which adjacent parts of the system remain deliberately unchanged?

The source of truth is a self-contained HTML file named `pr-NNN-short-description.html`. Open it directly in a browser, or serve the repository root locally:

```sh
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/docs/architecture/` and select the PR artifact.

Current explanations:

- [PR #1 — Journey 1 Phase 1](pr-001-journey-1-phase-1.html)
