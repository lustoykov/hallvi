# Journey 5: Ship a routine release

Status: confirmed interaction direction, 2026-09-08; the prototype simulates this flow. GitHub monitoring and remote release execution are not implemented by the shell.

A repository revision, a build, a deployment attempt and a verified current Release are different events.

1. A new commit on the connected branch, or an explicitly selected revision, becomes an available candidate with its identity and relevant changes.
2. The user chooses **Deploy revision** or asks Server Guy in conversation. The initial scope does not automatically deploy every push. A required approval names effects on services, configuration, data and cost without adding a routine approval ceremony beyond the user's policy.
3. Server Guy records the attempt, builds or resolves its artifact, performs required checks, and deploys within authority. The conversation and dashboard read the same records. Switching conversations does not restart the work.
4. Verification determines the outcome. A failed candidate remains distinct from the serving release. Where the deployment method allows it, preserve the previous release until the candidate is ready; report any required downtime honestly.
5. Failure produces evidence and a next action. Recovery uses the predecessor only when artifact, configuration and data compatibility permit it, then verifies the actual restored service. Database changes are not assumed reversible with an image rollback.

There are no deployment-preview environments. Existing local disposable verification is not production verification. An app-code defect produces a [coding-agent handoff](04-codex-mcp-remediation.md); the returned revision uses this same release flow.

## GitHub Actions integration

Inspect and reuse existing CI before proposing a new workflow. The intended path is GitHub push → required tests/build → exact image/candidate → explicit Deploy revision or chat request → deployment and verification. Workflow changes follow the repository's authorization/review path; a failed or missing required check is visible and must not be treated as a passed check. Bind checks and the image to the selected revision so a later push cannot silently replace an accepted candidate. Reuse the standard CI service rather than creating a separate Server Guy CI platform.

Acceptance should demonstrate a failing CI run blocking the affected candidate, an eligible candidate, explicit deployment, failed application verification and an honest serving-release/recovery outcome. Existing tests and local conformance evidence remain distinct from deployed application health.
