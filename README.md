# Server Guy

Server Guy is being built to provide PaaS-like deployment and recovery for your own applications and supported self-hosted open-source tools, on infrastructure you own.

The [product direction](docs/PRODUCT-WORKSHOP-NOTES.md#self-hosted-oss-deployment) includes taking a project such as Langfuse from upstream deployment instructions to a verified installation with inspectable configuration and recovery evidence. This is a planned use case, not a shipped installer catalog. The current implementation covers Phases 1 to 3 of Journey 1: **Start**, the read-only **Inspect app**, which establishes the Application Contract, and **Make launch-ready**, which resolves the contract's required changes through a reviewable pull request and verifies the exact merged revision in disposable containers.

## Documentation

| Question | Owner |
| --- | --- |
| What do we build next, and what is implemented or still open? | [Development roadmap](ROADMAP.md) — ordered milestones/PRs and the implementation backlog. |
| What should users experience? | [User journeys](docs/user-journeys/README.md) — product behavior, launch phases, deliverables and exit gates. |
| What belongs in application Activity? | [Activity inclusion rules](docs/specs/action-history-and-tracing.md#application-activity-inclusion-rules) — event criteria, flow inventory, and exclusions. |
| What does Inspect app establish, and how? | [Application Contract spec](docs/specs/application-contract.md) — the phase transition, inspection bounds, the supported profile, contract provenance, gates and Pi's scoped tools. |
| What does Make launch-ready produce, and where does repository code run? | [Phase 3 spec](docs/specs/phase-three-conformance.md) — the brief, staged changes and isolated previews, publication under the Approval Mode, the exact merged candidate, the versioned check set, the Docker runner and its boundary. |
| What engineering capabilities does this teach? | [Learning guide](docs/learning/stack-with-server-guy.md) — stack mapping and exercises, not another build plan. |
| How do we prove the implemented behavior works? | [Phase 1 testing guide](docs/testing/phase-one-acceptance.md) — acceptance cases, test/eval procedures and verification evidence. |
| Where are the test runners and saved results? | [Tests index](tests/README.md) — commands, folders and the local dashboard. |

Launch phases are product steps; development milestones are implementation work and may span several PRs. Update each fact in its owning document and link to it from the others.

## Architecture

Phases 1 to 3 are one codebase with a Next.js web process and one local Pi worker:

```text
Next.js
├── Operator UI (phase strip, chats, Record with checks, the Application
│   Contract and the Conformance Result; Settings → Execution)
├── Route Handlers
├── Phase 1–3 domain logic, phase transitions, publication through GitHub
├── SQLite durable records: applications, phase workspaces, chats, Decisions,
│   Observations, contracts, conformance proposals and runs, behavior checks,
│   publishing grants
└── GitHub adapter: identity check, bounded reads at one commit, archives,
    Git Data API branch/pull request, merge observation

Local Node worker
├── Same SQLite database: queued Pi Runs and conformance runs
├── Pi SDK adapter with per-phase instructions and scoped tools
├── One native Pi JSONL session per Chat, with Pi-owned compaction
└── Disposable runner: Docker Engine on this machine, one container per
    step, internal network, allowlisting proxy for installation only

Docker Engine (controller host)          GitHub
└── runner image, PostgreSQL image        └── the reviewable pull request; the
    per attempt, removed on every end         engineer merges, never Server Guy
```

There is no separate API service, distributed queue or workflow engine. Repository code runs only inside the disposable runner, never in the web or worker process. The first real intake repository is `lustoykov/todo-fastapi`; its actual layout has not been inspected by this code yet, and the supported profile is defined by conventions tested on synthetic repositories.

The permission scope is recorded as **Current application launch** in this slice. That is an explicit Phase 1 implementation boundary, not a decision about the eventual global policy model.

## Run

Requirements: Node.js and a supported ChatGPT subscription for Pi. The Pi SDK is installed with the app; a separate Pi CLI installation is not required. GitHub is connected explicitly in Settings through a configured GitHub App. Server Guy does not borrow GitHub CLI or environment credentials.

```bash
npm install
npm run db:push
npm run dev
```

Open <http://127.0.0.1:3000>.

In a second terminal, run `npm run worker`. Keep both processes running from this checkout with the same database/configuration. The worker reads `.env` and `.env.local`; `SERVER_GUY_DB_PATH` selects the database for both. A second worker for the same database is rejected.

Sending returns immediately after the message is saved. You can leave the page and return to its saved progress. Cancellation and Retry are beside the attempt. An interrupted/failed attempt saves no Decisions or contract; Retry uses the original user message. Without a worker, requests stay visibly queued. Stop the app and worker before applying schema changes. The current schema is version 9: `npm run db:push` upgrades a version-6 or version-8 database in place after writing a `.pre-v9-<id>.backup` copy beside it. Every other prototype version, including the abandoned version-7 branch, requires moving aside the disposable database and its `-wal`/`-shm` files before pushing a fresh database; no old-chat import is supported. Keep credential/configuration files and `tests/results/`. Missing native history offers **Start a new chat**, not reconstruction.

When the Launch Brief's four checks pass, **Continue to Inspect app** starts Phase 2. Server Guy pins the repository's default branch to one commit, records its tree, resolves the supported Application Profile (FastAPI + uv, PostgreSQL as the intended database) and starts one request of its own, shown as Server Guy's. In that request Pi reads the files it needs through read-only tools bound to that commit; each read is saved as an Observation before the model sees it. Pi proposes the Application Contract through a typed tool that checks every field's source before staging it and again when the reply is saved. The Record shows each field with its provenance, the conformance work Phase 3 owes, the values that need your decision, and the product policies that stay open until later gates. Phase 1 chats become read-only but stay readable; **Re-inspect repository** in a check's details re-pins the commit after a push. Nothing in Phase 2 builds, runs, tests, deploys or changes the repository. See the [Application Contract spec](docs/specs/application-contract.md).

When the contract's four checks pass, **Continue to Make launch-ready** starts Phase 3. The Record shows the conformance brief: the base commit, the contract's required changes, the allowed scope and the acceptance bar. **Continue with Server Guy** starts one request in which Pi reads the base commit, stages a complete change through a typed tool, proposes application-behavior checks from routes it read, and verifies the staged tree in a disposable container preview; **Export brief** gives Codex, Claude, another harness or manual work the same brief, and the change comes back as a pull request, branch or commit that Server Guy fetches and checks itself. The engineer approves the change (or the Approval Mode does), allows publishing once per repository, and Server Guy publishes one branch and one pull request; merging is the engineer's on GitHub in every mode. **Refresh from GitHub** records the merged revision as the candidate and compares it with the reviewed change; **Verify candidate** has the worker run the check set (locked install, enforced configuration, disposable PostgreSQL with migrations, startup, a health probe from a sibling container, the accepted behavior checks, the repository's tests) over that exact commit. Built-in execution needs a reachable Docker Engine on the machine running Server Guy, checked in **Settings → Execution** with Check again and one recovery action; Docker Desktop is not required, and Phases 1 and 2 never need it. See the [Phase 3 spec](docs/specs/phase-three-conformance.md).

Each Chat continues its private native Pi session across requests and worker restarts. Server Guy sends stable instructions, a small current-state note and the new user message; the model looks up current Decisions through a scoped read-only tool. Proposals remain pending until the final SQLite transaction. No filesystem, shell or external mutation tools are granted. See the [native session contract](docs/specs/native-pi-and-permissions.md).

Native histories live beside the configured database at `pi-sessions/<application-id>/<chat-id>.jsonl`. Back up **both SQLite and pi-sessions** with the web app and worker stopped; restoring only SQLite can leave a missing-history error. Compaction reduces model context, not disk history. A damaged/missing established history offers **Start a new chat**; existing records remain and no old messages are imported or retried automatically. Cancel an active reply and wait for it to stop before removing its application; removal deletes that application's records and native files, not credentials or other applications.

### Activity and diagnostics

Two surfaces answer two questions. **Activity** in an application's Inspector answers *what happened to this application*: the workspace was created, a repository check passed or failed, a requirement was saved or changed (old → new), or a GitHub disconnect/replacement invalidated an earlier repository verification. Ordinary replies, lookups, failed attempts and chat creation/archive add nothing there, following the [inclusion rules](docs/specs/action-history-and-tracing.md#application-activity-inclusion-rules).

Chat keeps answers, working/failed/cancelled states, unfinished drafts and retry. It has no Reply details panel. Product outcomes remain understandable through Chat, Record and Activity without a tracing service.

Metadata-only diagnostics work locally by default. `diagnostics/replies.ndjson` contains event logs; `diagnostics/spans.ndjson` contains completed OpenTelemetry spans, one OTLP JSON envelope per line. Both live beside the database unless `SERVER_GUY_LOG_DIR` overrides the directory. Each file rotates at 1 MiB with three archives. **Settings → ChatGPT & model → Storage & privacy** shows both absolute paths with copy buttons and the optional export configuration. Read the files with a text editor, `jq`, or an agent. Unfinished spans can be lost on a crash; missing diagnostics never establish a product outcome.

Optional remote export supports Langfuse or another OTLP/HTTP trace backend. Set `SERVER_GUY_TRACING=1` and either Langfuse project keys or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` in ignored `.env.local`, then restart the server and worker with the same environment. Export off still records local spans. Export uses in-memory batches; local files are not a replay queue and are not automatically resent. No Collector or account is needed for local use, and diagnostic failures cannot change reply or Activity outcomes. See [configuration and data boundaries](docs/specs/action-history-and-tracing.md#configuration-and-data-boundaries).

Open **Settings → ChatGPT & model** to configure Pi, and **Settings → GitHub** before adding a repository. A detected login is never silently adopted. For a separate GitHub login, follow the [GitHub App registration guide](docs/integrations/github.md); only a public client ID and App slug go in local configuration, never an App private key or client secret.

Durable application records are stored in `.server-guy/server-guy.db`; the Operator View and Gate Checks are derived from them. The TypeScript schema in `src/server/db-schema.ts` is the only schema definition, and `npm run db:push` applies it directly with Drizzle Kit. Delete the database only when you intentionally want a fresh local product state. Before the first release the schema can still change; Server Guy refuses to open a missing or older schema until `db:push` initializes it. Version 9 is current; versions 6 and 8 are upgraded in place with a backup. Recreate disposable development databases from other prototype versions; there is no compatibility layer for the abandoned version-7 branch.

## Verify

For a visual entry point, run `npm run test:dashboard` and open [Server Guy Testing](http://127.0.0.1:4317). It can run checks and review saved eval answers. Nothing starts automatically; real model work requires explicit confirmation. This is a separate local developer tool, not a production app page.

```bash
npm test
npm run lint
npm run build
npm run test:e2e:smoke
```

Browser checks use synthetic providers and no model credits. See the [tests index](tests/README.md) for the full desktop suite, interactive runner UIs and opt-in live evals.

To try Phase 2 without credentials, start the disposable fixture and add `https://github.com/qa/fastapi-app`, then press **Continue to Inspect app**:

```bash
node tests/browser/qa-fixture.mjs 3190 success ready
```

The fixture serves synthetic repositories at a synthetic commit (`fastapi-app`, `fastapi-nohealth`, `fastapi-localhost`, `fastapi-sqlite`, `django-site`) and a synthetic model that reads and proposes deterministically; see the [testing guide](docs/testing/phase-one-acceptance.md#phase-2-acceptance-inspect-app). From a ready contract, **Continue to Make launch-ready** shows the Phase 3 flow with a scripted runner in place of Docker: Continue with Server Guy stages and previews the change, Approve and Allow publishing then Publish create a synthetic pull request, writing `{"mergePull": 1, "mergeMethod": "squash"}` to the fixture's `state/github-scenario.json` merges it, Refresh records the candidate and Verify candidate runs the scripted checks. `state/conformance-scenario.json` with `{"docker": "missing"}`, `"stopped"`, `"denied"` or `"unverified"` shows the prerequisite states in Settings → Execution and the Record.

To exercise the real runner against the executable fixture applications, opt in with a reachable Docker Engine (pulls `astral/uv:python3.12-bookworm-slim` and `postgres:16-alpine`, about seven minutes):

```bash
SERVER_GUY_DOCKER_TESTS=1 npm test -- tests/application/integration/conformance-executor.docker.test.ts
```
