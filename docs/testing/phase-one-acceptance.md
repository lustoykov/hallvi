# Acceptance guide

This stable path is loaded by the local testing dashboard. The complete phase-era casebook and dated results are preserved in the [archived guide](https://github.com/lustoykov/server-guy/blob/0682ab257469bc5cee994572285283ea949bc3c6/docs/archive/implementation/phase-one-acceptance.md); they remain regression/migration evidence, not a mandate to restore phase navigation.

## Current acceptance contract

| Outcome | Required evidence |
| --- | --- |
| Conversation-first integration | Real receipt/approval state, cross-conversation references, preserved drafts, correct origin and failure/retry across navigation and reload. |
| Deployment | Pinned source/image/configuration, authorized intended host, required services and useful observed application behavior. |
| Data protection | Correct persistent state, consistent backup, verified off-host transfer and meaningful isolated restore. |
| Release and recovery | Chosen candidate, required checks, actual serving revision, migration uncertainty handled without blind retries and recovery reverified. |
| Background work | Existing commands/library behavior, known run outcome/revision, logs, non-overlap and safe interruption/release handling. |
| Ongoing care | Observed health/failure with source/time, durable issues, deduplication, freshness and honest offline/retention gaps. |

These are support targets; [Roadmap](../../ROADMAP.md) records what is implemented. [Compatibility cases](README.md#dated-evidence) exercise them against selected applications. A synthetic fixture or an uploaded backup does not establish live deployment or recoverability.

## Regression and execution

Preserve provenance, accepted source/connection identity, owner-merged candidate verification, cancellation/retry, known-schema migration and native history while replacing legacy phases. Each applicable old expectation needs preservation, replacement or explicit retirement. Unreviewed model answers remain unreviewed; passing schema checks do not establish semantic quality.

Use the dashboard suite picker or these local commands:

```sh
npm test
npm run test:e2e:smoke
npm run test:e2e
```

The smoke subset is not the full browser suite. Real Docker tests and real-model evals require explicit opt-in; [test runner instructions](../../tests/README.md) document those commands. [Dated evidence](README.md#dated-evidence) applies only to the candidate/configuration recorded there.

The repository links in this guide are for a Markdown viewer; the local testing dashboard renders this document but does not serve the rest of the repository. Use the Git permalink for the full historical casebook.
