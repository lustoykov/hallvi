# Operation records review — 9 September 2026

PR #22 adds durable operations, coordination across conversations, History and Domains & CDN discovery. Review covered the stored operation lifecycle, approval/claim ordering, restart behavior and deployment projection. This was a local correctness review, not an independent reviewer sign-off.

One correctness issue was found and fixed: a worker could claim a `deploy-queued` operation and crash before saving `deploying`. Its persisted executor ownership then prevented any future claim. Startup recovery now recognizes this window under the exclusive deployment-worker lock, records failure and clears the claim. An unclaimed approved deployment remains queued for normal execution. Regression coverage exercises both cases.

The separate unresolved purchase and lost verification-response cases remain conservative stops; they are tracked in the final-integration review and must be resolved with evidence before repetition. This PR does not claim those journeys are complete or implement CDN provisioning.

Validation: TypeScript and targeted ESLint pass. The operation-store and deployment-state integration suites pass (27 tests). The complete application suite is rerun before merge. Prior acceptance captures cover History filters, shared receipts, cancellation and mobile layout in `docs/testing/2026-09-09-operation-coordination.md`. CI is allowed to run but is not the acceptance gate for this pass, as requested by the owner.
