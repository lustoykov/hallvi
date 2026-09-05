# Server Guy

Server Guy is being built to provide PaaS-like deployment and recovery for your own applications and supported self-hosted open-source tools, on infrastructure you own.

The [product direction](docs/PRODUCT-WORKSHOP-NOTES.md#self-hosted-oss-deployment) includes taking a project such as Langfuse from upstream deployment instructions to a verified installation with inspectable configuration and recovery evidence. This is a planned use case, not a shipped installer catalog. The current implementation covers Phase 1 of Journey 1: **Start**.

## Documentation

| Question | Owner |
| --- | --- |
| What do we build next, and what is implemented or still open? | [Development roadmap](ROADMAP.md) — ordered milestones/PRs and the implementation backlog. |
| What should users experience? | [User journeys](docs/user-journeys/README.md) — product behavior, launch phases, deliverables and exit gates. |
| What engineering capabilities does this teach? | [Learning guide](docs/learning/stack-with-server-guy.md) — stack mapping and exercises, not another build plan. |
| How do we prove the implemented behavior works? | [Phase 1 testing guide](docs/testing/phase-one-acceptance.md) — acceptance cases, test/eval procedures and verification evidence. |
| Where are the test runners and saved results? | [Tests index](tests/README.md) — commands, folders and the local dashboard. |

Launch phases are product steps; development milestones are implementation work and may span several PRs. Update each fact in its owning document and link to it from the others.

## Architecture

Phase 1 is one codebase with a Next.js web process and one local Pi worker:

```text
Next.js
├── Operator UI
├── Route Handlers
├── Phase 1 domain logic
├── SQLite durable records
└── GitHub adapter

Local Node worker
├── Same SQLite database: queued Pi Runs, messages and Decisions
├── Pi SDK adapter
└── Bounded Chat context and durable summaries
```

There is no separate API service, distributed queue or workflow engine. The first real intake repository is `lustoykov/todo-fastapi`.

The permission scope is recorded as **Current application launch** in this slice. That is an explicit Phase 1 implementation boundary, not a decision about the eventual global policy model.

## Run

Requirements: Node.js and a supported ChatGPT subscription for Pi. The Pi SDK is installed with the app; a separate Pi CLI installation is not required. GitHub is connected explicitly in Settings, either by choosing a detected GitHub CLI/environment login or by signing in through a configured GitHub App.

```bash
npm install
npm run db:push
npm run dev
```

Open <http://127.0.0.1:3000>.

In a second terminal, run `npm run worker`. Keep both processes running from this checkout with the same database/configuration. The worker reads `.env` and `.env.local`; `SERVER_GUY_DB_PATH` selects the database for both. A second worker for the same database is rejected.

Sending returns immediately after the message is saved. You can leave the page and return to its saved progress. Cancellation and Retry are beside the attempt. An interrupted/failed attempt saves no Decisions; Retry uses the original user message. Without a worker, requests stay visibly queued. Stop the app and worker before applying schema changes. A v4 → v5 upgrade automatically keeps a `.db.pre-v5-*.backup` beside the database and adds message columns without rebuilding it; do not delete this backup until you have verified your records.

Open **Settings → ChatGPT & model** to configure Pi, and **Settings → GitHub** before adding a repository. A detected login is never silently adopted. For a separate GitHub login, follow the [GitHub App registration guide](docs/integrations/github.md); only a public client ID and App slug go in local configuration, never an App private key or client secret.

Durable application records are stored in `.server-guy/server-guy.db`; the Operator View and Gate Checks are derived from them. The TypeScript schema in `src/server/db-schema.ts` is the only schema definition, and `npm run db:push` applies it directly with Drizzle Kit. Delete the database only when you intentionally want a fresh local product state. Before the first release the schema can still change; Server Guy refuses to open a missing or older schema and tells you to push a fresh one.

## Verify

For a visual entry point, run `npm run test:dashboard` and open [Server Guy Testing](http://127.0.0.1:4317). It can run checks and review saved eval answers. Nothing starts automatically; real model work requires explicit confirmation. This is a separate local developer tool, not a production app page.

```bash
npm test
npm run lint
npm run build
npm run test:e2e:smoke
```

Browser checks use synthetic providers and no model credits. See the [tests index](tests/README.md) for the full desktop suite, interactive runner UIs and opt-in live evals.
