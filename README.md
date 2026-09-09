# Server Guy

**The agent for self-hosted software.** Deploy one application stack on a server you control, keep it healthy and protect its data. Conversation drives setup and operations; stable views show the same recorded facts and results.

The target is Docker Compose on one instance, with PostgreSQL or SQLite, required Redis/Valkey services, workers, scheduled commands and persistent files. Compute starts with Hetzner + BYOM; backups with R2 + S3. **Coolify is a reference, not a parity requirement.**

## Documentation

Start with **Product → Roadmap → Architecture**.

| Read | Answers |
| --- | --- |
| [Product](PRODUCT.md) | Who it serves, what we support and where we stop. |
| [Roadmap](ROADMAP.md) | What works, what remains and the only implementation sequence. |
| [Architecture](docs/architecture/agent-directed-operations.md) | How conversation, records, the agent and execution fit together. |

### Supporting references

| Document | Responsibility |
| --- | --- |
| [Capability spec](docs/specs/self-hosting-capabilities.md) | Supported behavior and reusable interaction requirements. |
| [Journeys](docs/user-journeys/README.md) | Concrete user goals, success and failure outcomes. |
| [Compatibility tests](docs/testing/self-hosted-compatibility.md) | Representative software and the evidence required for support. |
| [Testing](docs/testing/README.md) | Acceptance navigation and dated results; [runner instructions](tests/README.md) own commands. |
| [Design](src/components/server-guy/DESIGN.md) | Fable's current visual language and interaction rules. |
| [UI integration](docs/design/2026-09-09-conversation-first-integration.md) | What the conversation-first shell actually binds to. |
| [Supported-stack brief](docs/design/2026-09-09-fable-supported-stack-brief.md) | Current handoff to Fable, leaving layout decisions to the designer. |
| [Terminology](CONTEXT.md) | Domain glossary, not another specification. |
| [Architecture decisions](docs/architecture/README.md) | Accepted boundaries and historical PR diagrams. |
| [GitHub setup](docs/integrations/github.md) | Existing connection and credential setup. |

### Historical and educational references

[Archive](docs/archive/README.md) contains superseded plans, phase specifications, workshops and explorations. Preserve evidence and unresolved regression checks when replacing legacy code; do not implement their abandoned product/UI instructions.

[Research](docs/research/README.md) contains dated findings and proposals. Coolify comparisons do not impose parity; pricing/provider facts require a fresh check before use. The [learning guide](docs/learning/stack-with-server-guy.md) is educational material, not a product backlog. [Reviews](docs/reviews/2026-09-08-fable-merge-readiness.md) and dated test reports apply to the candidate they inspected.

### Maintaining the docs

- Put a decision in its owning document once; link to it elsewhere.
- Replace superseded wording instead of appending another clarification.
- Keep status and implementation order in Roadmap; link evidence with date and candidate.
- Put abandoned explorations in the archive. Do not promote a research suggestion into scope without a product decision.
- Preserve runbooks and regression evidence. A documentation cleanup never proves a feature, retires a table or waives a failing test.

## Implementation status

A real repository-to-Hetzner deployment with private persistent PostgreSQL and external behavior checks was [verified on 8 September](docs/testing/2026-09-08-real-deployment-acceptance.md), followed by [hardening](docs/testing/2026-09-08-deployment-hardening.md). Fable's [conversation-first integration](docs/design/2026-09-09-conversation-first-integration.md) uses the real deployment record and conversations.

The executor is still narrower than the target: one source-built HTTP app plus optional PostgreSQL. Generic Compose/image intake, additional services, backups, ongoing monitoring and routine releases need implementation. Historical results do not prove the current branch is ready to merge or that the deployed host is still online.

## Run

Use Node.js 22, the checked-in CI baseline, with the locked dependencies. Pi is bundled; a separate Pi CLI installation is unnecessary. Configure the supported ChatGPT subscription in Settings and connect GitHub explicitly through the [GitHub App setup](docs/integrations/github.md).

```sh
npm install
npm run db:push
npm run dev
```

Open <http://127.0.0.1:3000>. In another terminal from the same checkout:

```sh
npm run worker
```

Both processes must use the same database/configuration. The worker loads `.env` and `.env.local`. `SERVER_GUY_DB_PATH` overrides the default `.server-guy/server-guy.db`. Without the worker, accepted requests remain queued. The current controller binds to loopback and rejects arbitrary Host headers; public deployment of the controller still needs authenticated setup.

### Data and migrations

Stop the web process and worker before applying schema changes. Schema v12 upgrades known versions 6, 8, 9, 10 and 11 with a private backup before migration; unknown versions require investigation. Keep the database, WAL/recovery material and native sessions rather than resetting an unexpected schema. `src/server/db-schema.ts` owns the schema.

Native conversation histories live beside the database in `pi-sessions/<application-id>/<chat-id>.jsonl`. For a consistent offline controller backup, stop both processes and preserve SQLite, native sessions, configuration and recovery/credential material privately. Restoring SQLite alone cannot restore missing native history. This developer procedure is not the planned automated application-backup feature.

### Diagnostics

Local metadata-only diagnostics write rotating `diagnostics/replies.ndjson` and `diagnostics/spans.ndjson` beside the database, unless `SERVER_GUY_LOG_DIR` overrides it. Settings exposes their paths and optional trace export. Product outcomes must remain understandable without a tracing account. Detailed configuration and privacy behavior are in the [implementation reference](docs/archive/implementation/action-history-and-tracing.md).

## Verify

```sh
npm test
npm run lint
npm run build
npm run test:e2e:smoke
```

[tests/README.md](tests/README.md) describes full browser journeys, synthetic fixtures, Docker checks and opt-in real-model evals. `npm run test:dashboard` opens the local testing workbench at <http://127.0.0.1:4317>. Synthetic tests are not provider or deployment evidence. See the [testing index](docs/testing/README.md) for acceptance coverage and known limits.
