# Documentation

Read [Product](../PRODUCT.md) for scope, [Roadmap](../ROADMAP.md) for shipped/remaining work, and [Architecture](architecture.md) for how Pi, records and execution fit together.

| Reference | Purpose |
| --- | --- |
| [Architecture](architecture.md) | The current system, execution loop, records, protection/rollback and limits. |
| [Required outcomes](requirements.md) | User-facing behavior and acceptance, without prescribing Pi's workflow. |
| [UI reference](design/screens.md) | Interaction principles and how to inspect real versus simulated screens. |
| [Settings design](design/settings.md) | Existing settings layout/typography; the component design file owns overall visual language. |
| [GitHub setup](integrations/github.md) | Connection and credential setup that still applies. |
| [Testing and evidence](testing/README.md) | What has actually been proved, coverage gaps and links to dated source accounts. |
| [Dashboard acceptance guide](testing/phase-one-acceptance.md) | Small reference retained at the path the test dashboard loads. |

The owning references outside this directory are [Product](../PRODUCT.md), [Roadmap](../ROADMAP.md), [terminology](../CONTEXT.md), [component design](../src/components/server-guy/DESIGN.md) and [test runner instructions](../tests/README.md). Avoid duplicating them here.

Update the current document when behavior changes. Delete completed handoffs, old reviews and superseded designs instead of retaining competing instructions. Preserve requirements, practical setup and useful proof; Git is the archive. The 11 September cleanup reduced this directory from 119 documents to eight. Original details remain at [the pre-cleanup revision](https://github.com/lustoykov/server-guy/tree/0682ab257469bc5cee994572285283ea949bc3c6/docs).
