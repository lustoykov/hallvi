# Server Guy

[Documentation map](docs/README.md) · [Current deployment architecture](docs/architecture.md)

**The agent for self-hosted software.** Deploy one application stack on a server you control, keep it healthy and protect its data. Conversation drives setup and operations; stable views show the same recorded facts and results.

The target is Docker Compose on one instance, with PostgreSQL or SQLite, required Redis/Valkey services, workers, scheduled commands and persistent files. Compute starts with Hetzner + BYOM; backups with R2 + S3. **Coolify is a reference, not a parity requirement.**

## Documentation

Start with [Product](PRODUCT.md), [Roadmap](ROADMAP.md) and [Architecture](docs/architecture.md). The [documentation map](docs/README.md) links requirements, UI, setup and evidence; [CONTEXT.md](CONTEXT.md) owns terminology, the [component design reference](src/components/server-guy/DESIGN.md) owns visual language, and [tests/README.md](tests/README.md) owns test commands.

Keep each decision or requirement in its owning document. Update current wording and delete obsolete handoffs; Git retains development history. Documentation cleanup does not waive tests, drop runtime records or establish new support.

## Implementation status

A real repository-to-Hetzner deployment with private persistent PostgreSQL and external behavior checks was [verified on 8 September](docs/testing/README.md#dated-evidence), followed by [hardening](docs/testing/README.md#dated-evidence). The [UI reference](docs/design/screens.md) distinguishes real records from simulated scenarios.

The executor is still narrower than the target: first deployments and releases run Pi-authored native Compose on one Hetzner host, HTTP only, verified by a behavior criterion over public HTTP. Applications without a public endpoint, BYOM, ongoing monitoring and broad compatibility evidence need implementation. Historical results do not prove the current branch is ready to merge or that the deployed host is still online.

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

Stop the web process and worker before applying schema changes. Schema v14 upgrades known versions 6 and 8–13 with a private backup before migration; unknown versions require investigation. The v14 step retires the phase preparation workflow and legacy deployment plans, keeping their records as read-only history ([details](docs/architecture.md#schema-14-retired-preparation-and-deployment-plans)). Keep the database, WAL/recovery material and native sessions rather than resetting an unexpected schema. `src/server/db-schema.ts` owns the schema.

Native conversation histories live beside the database in `pi-sessions/<application-id>/<chat-id>.jsonl`. For a consistent offline controller backup, stop both processes and preserve SQLite, native sessions, configuration and recovery/credential material privately. Restoring SQLite alone cannot restore missing native history. This developer procedure is not the planned automated application-backup feature.

### Diagnostics

Local metadata-only diagnostics write rotating `diagnostics/replies.ndjson` and `diagnostics/spans.ndjson` beside the database, unless `SERVER_GUY_LOG_DIR` overrides it. Settings exposes their paths and optional trace export. Product outcomes must remain understandable without a tracing account. Implementation: [local diagnostics](src/server/diagnostics.ts) and [trace configuration](src/server/tracing-config.ts).

## Verify

```sh
npm test
npm run lint
npm run build
npm run test:e2e:smoke
```

[tests/README.md](tests/README.md) describes full browser journeys, synthetic fixtures, Docker checks and opt-in real-model evals. `npm run test:dashboard` opens the local testing workbench at <http://127.0.0.1:4317>. Synthetic tests are not provider or deployment evidence. See the [testing index](docs/testing/README.md) for acceptance coverage and known limits.
