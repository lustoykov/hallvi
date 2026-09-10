# General capabilities and specialised Plugins

10 September 2026. **Agreed direction; first deployment slice described in [service-based deployment](service-deployment.md). Plugin execution remains undecided.**

The [requirements-driven deployment design](requirements-driven-deployment.md) reviews the remaining generalization gaps against `ee396b2`, after generalized backups and compatible rollback merged. It proposes reusable tools composed by Pi before any plugin runtime. The baseline assessment below is historical, not the current backup-support limit.

[Product](../../PRODUCT.md#generalization-and-extensibility) owns the scope and experience. [Roadmap](../../ROADMAP.md#current-priority-service-based-deployment) owns sequencing. This brief explains the proposed responsibility boundary, not a new parallel delivery plan or a completed plugin system.

## Why this direction

The inspected baseline is `10880c7`. Deployment already loops over plan-defined services, volumes and configuration. However, scheduled backups reuse application-specific proof machinery: image-name admission, fixed service combinations, Grafana/Kuma database filenames and a Prometheus-specific query. The Architecture view also compresses recorded resources into fixed slots. These are limits of the implementation, not definitions of supported software.

Relevant sources:

- [Generic deployment loops](../../src/server/deployment-executor.ts) and [plan constraints](../../src/server/deployment-types.ts).
- [Backup admission](../../src/server/scheduled-backup-install.ts), [scheduled runner](../../scripts/scheduled-backups/runner.py) and its [application-specific capture helper](../../scripts/backup-proof/capture-sqlite-stack.py).
- [Grafana evidence interpretation](../../src/server/backup-evidence.ts), [plugin-specific labels](../../src/server/backup-plugin-evidence.ts) and [Architecture projection](../../src/components/server-guy/architecture-canvas.tsx).

An allowlist can bound an unproven implementation, but removing it does not make the underlying capture or recovery procedure general. Existing protections stay until a verified replacement exists.

## Decide where a difference belongs

| Difference encountered | Intended treatment |
| --- | --- |
| Different image, command, path, port or environment value | Recorded configuration, consumed by the same executor. |
| A missing capability already promised by the supported scope | Improve the core; do not require each application to supply a workaround. |
| Application-specific API, useful-behavior check or domain presentation | Candidate Plugin with explicit inputs, results and access. |
| A genuinely different storage or provider protocol | Review a specialised integration contract; do not assume existing capture semantics apply. |
| A requirement outside the agreed one-instance product boundary | Explain the limit. Plugin availability does not silently expand supported scope. |

Application names belong in fixtures and specialised integrations when relevant. Branching on them in core behavior requires a specific reason and an explicit location for that exception. Merely moving name checks into a registry is not generalization.

## Proposed responsibility boundary

```text
Plugin: application knowledge, specialised behavior, functional checks
                    | declared requests and results
Core: authority, execution, coordination, secrets, records and evidence
                    | approved effects and observations
Managed application: services, owned storage and external dependencies
```

The general model should describe services, storage ownership, writer relationships and supported consistency procedures. For example, the SQLite path comes from the application's recorded state; a supported SQLite/file capture procedure belongs in the core. A Grafana dashboard query is a specialised functional check. A successful integrity check and a successful application-level restore check remain distinct evidence.

Plugins may need to supply code for specialised protocols. Such code must operate within an explicitly chosen trust and execution model. A permissions field or a TypeScript interface is not enforcement: arbitrary in-process code can otherwise access controller secrets and bypass checks. Isolation, supported operations and acceptable trust levels are open design questions, not claims of current protection.

Core controls must remain effective for extension work: scoped authority, spending limits, secret access, serialization of application changes, interruption/recovery handling and durable records. Plugins supply evidence with source, version, criteria and time; they cannot silently change the meaning of core success states.

## Agent-assisted authoring and ownership

The intended loop is draft a package, exercise it against an isolated fixture, present its source/access/results, and activate a selected version under user authority. Generating code grants no new authority. Testing that changes external state still uses the applicable authority; uncertain or failed checks remain visible.

A user may keep a package private, export it, or authorize a PR to share it. Track immutable version identity and compatibility requirements. Shareable exports omit credentials; recovery preserves the package/version, required configuration and plugin-owned state, with secrets separately protected. Disabling or upgrading must account for active operations and schedules; old evidence remains readable with its original plugin identity.

Provide an extension inventory with origin, version, access, affected applications and verification results. Prefer contributions to existing Monitoring, Backups, History and other relevant views. Custom panels are an option when needed, not a required tab per plugin. The rendering contract and UI-code isolation remain undecided.

## Open questions before Plugin implementation

1. Which missing recorded facts are enough to separate generic capture from the current Grafana/Kuma helper without inventing a universal backup engine?
2. What is the smallest extension contract that can express Grafana's functional checks and one different integration?
3. Which work can use existing core operations, and which executable extension code requires a separate enforced trust boundary?
4. How do existing deployments, backups, receipts and scheduled jobs migrate without losing recovery access or changing historical claims?
5. Which result types let plugins explain useful application behavior through existing views without adding a Grafana-shaped field for every new product?

Prefer extracting concrete capabilities over building a marketplace, broad plugin framework or general workflow engine first. The next proof must distinguish configuration-only reuse, necessary core changes and justified specialised behavior.
