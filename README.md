# Server Guy

Server Guy provides PaaS-like deployment and recovery on infrastructure the engineer owns. The current implementation covers Phase 1 of Journey 1: **Start**.

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

Phase 1 is one full-stack Next.js modular monolith:

```text
Next.js
├── Operator UI
├── Route Handlers
├── Phase 1 domain logic
├── SQLite durable records
├── GitHub adapter
└── Pi SDK adapter
```

There is no separate API service or worker. The first real intake repository is `lustoykov/todo-fastapi`.

The permission scope is recorded as **Current application launch** in this slice. That is an explicit Phase 1 implementation boundary, not a decision about the eventual global policy model.

## Run

Requirements: Node.js, `gh` authenticated to GitHub, and Pi with at least one available model.

```bash
npm install
npm run db:push
npm run dev
```

Open <http://127.0.0.1:3000>.

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
