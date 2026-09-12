# Documentation

Read [Product](../PRODUCT.md) for product direction, [Operator design](operator-design.md) for the agreed redesign and open questions, and [Roadmap](../ROADMAP.md) for reviewable delivery stages. [Architecture](architecture.md) describes the existing schema-14 implementation, not restrictions the redesign must preserve.

| Reference | Purpose |
| --- | --- |
| [Operator design](operator-design.md) | Agreed direction, draft deployment journey, sequencing boundary, complexity tiers and unresolved design details. |
| [Architecture](architecture.md) | The current system, execution loop, records, protection/rollback and limits. |
| [Required outcomes](requirements.md) | User-facing behavior and acceptance, without prescribing Pi's workflow. |
| [Presentation contract](presentation-contract.md) | Proposal: the data and interaction contract the accepted reference designs need from real Pi output. |
| [Browser terminal](browser-terminal.md) | Implemented application-server terminal contract, session lifecycle and acceptance. |
| [UI reference](design/screens.md) | Interaction principles and how to inspect real versus simulated screens. |
| [Settings design](design/settings.md) | Existing settings layout/typography; the component design file owns overall visual language. |
| [GitHub setup](integrations/github.md) | Connection and credential setup that still applies. |
| [Testing and evidence](testing/README.md) | What has actually been proved, coverage gaps and links to dated source accounts. |
| [Dashboard acceptance guide](testing/phase-one-acceptance.md) | Small reference retained at the path the test dashboard loads. |

The owning references outside this directory are [Product](../PRODUCT.md), [Roadmap](../ROADMAP.md), [terminology](../CONTEXT.md), [component design](../src/components/server-guy/DESIGN.md) and [test runner instructions](../tests/README.md). Avoid duplicating them here.

Update the current document when behavior changes. Delete completed handoffs, old reviews and superseded designs instead of retaining competing instructions. Preserve requirements, practical setup and useful proof; Git is the archive. The 11 September cleanup retired a much larger set of old documents. Original details remain at [the pre-cleanup revision](https://github.com/lustoykov/server-guy/tree/0682ab257469bc5cee994572285283ea949bc3c6/docs).

## Authority and evidence

The redesign changes general execution, permissions, conversation ownership and record presentation. Follow the operator design for those decisions, the roadmap for stage order and the requirements for current outcomes. Existing architecture, runner contracts and prototype descriptions remain useful accounts of their implementation; they are not competing redesign plans.

Dated audits and proof reports retain their historical claims and limitations. Their old next actions do not override the current roadmap. Setup, fixture instructions and visual tokens continue to apply where their implementation remains in use. The user has explicitly authorized discarding old development data. Remove obsolete code, tests, migrations and recovery machinery rather than adding compatibility layers. Historical documents describe old behavior, not a preservation requirement.
