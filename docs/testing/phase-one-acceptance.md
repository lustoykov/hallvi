# Acceptance guide

This stable path is loaded by the local testing dashboard. The complete phase-era casebook and dated results are preserved in the [archived guide](https://github.com/lustoykov/server-guy/blob/0682ab257469bc5cee994572285283ea949bc3c6/docs/archive/implementation/phase-one-acceptance.md); they remain regression/migration evidence, not a mandate to restore phase navigation.

## Current redesign acceptance

[Roadmap](../../ROADMAP.md) owns the stages; [operator design](../operator-design.md) owns the new behavior. Review each stage with a focused diff, something the user can try, and evidence proportional to that stage.

| Stage | Evidence to establish |
| --- | --- |
| Main operator | One owner of changes, native queue/steer behavior, useful read-only side chats and understandable message state across navigation/reload. |
| General execution | A direct server task, selected permission behavior, useful output and recorded actual or uncertain outcomes. |
| Lightweight deployment | A working application deployed by Pi through general tools, useful behavior verified and the outcome surfaced in the UI. |
| Medium and more complicated examples | Progressive evidence for dependencies, persistence and meaningful background work through the same architecture. |

These are development checkpoints, not a promise of universal support. Exact example repositories remain to be selected. Backup/restore matrices, monitoring/error detection and detailed per-view care are deferred. Historical operation receipts and approval rubrics are not requirements for the redesigned interface.

## Regression and execution

Existing development data is explicitly disposable; migration and legacy-history compatibility are not redesign acceptance requirements. Keep focused checks for behavior the new design requires; delete or rewrite obsolete workflow and hardening expectations. Schema 14 migration and retired-record evidence describe the old implementation; its code and tests can be removed. Unreviewed model answers remain unreviewed; passing schema checks do not establish semantic quality.

Use the dashboard suite picker or these local commands:

```sh
npm test
npm run test:e2e:smoke
npm run test:e2e
```

The smoke subset is not the full browser suite. Real Docker tests and real-model evals require explicit opt-in; [test runner instructions](../../tests/README.md) document those commands. [Dated evidence](README.md#dated-evidence) applies only to the candidate/configuration recorded there.

The repository links in this guide are for a Markdown viewer; the local testing dashboard renders this document but does not serve the rest of the repository. Use the Git permalink for the full historical casebook.
