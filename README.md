# Server Guy

Server Guy provides PaaS-like deployment and recovery on infrastructure the engineer owns. The current implementation covers Phase 1 of Journey 1: **Start**.

[Learn the agent-engineering stack through Server Guy](docs/learning/stack-with-server-guy.md).

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
npm run dev
```

Open <http://127.0.0.1:3000>.

Durable application records are stored in `.server-guy/server-guy.db`; the Operator View and Gate Checks are derived from them. Delete the database only when you intentionally want a fresh local product state. Before the first release the schema can still change; Server Guy refuses to open a database written by an older schema and asks you to delete it.

## Verify

```bash
npm test
npm run lint
npm run build
```
