# Server Guy

[Documentation map](docs/README.md) · [Operator redesign](docs/operator-design.md) · [Current implementation](docs/architecture.md)

**The agent for self-hosted software.** Deploy one application stack on a server you control, keep it healthy and protect its data. Conversation drives setup and operations; stable views show the same recorded facts and results.

The target is Docker Compose on one instance, with PostgreSQL or SQLite, required Redis/Valkey services, workers, scheduled commands and persistent files. Compute starts with Hetzner + BYOM; backups with R2 + S3. **Coolify is a reference, not a parity requirement.**

## Current direction

The first [operator redesign](docs/operator-design.md) checkpoint is implemented: the main conversation has general server Bash, three permission modes, inline approval and recorded command output. Other conversations have read-only tools. The execution backend has been verified with a temporary SSH target; server selection will arrive with deployment setup. The four-table controller model and shared-information cards are implemented locally; see [storage verification](docs/testing/2026-09-12-operator-storage.md). Review this checkpoint before Hetzner provisioning, then a verified lightweight deployment. Queue/steer and further side-chat work are deferred until that experience is established.

Prove the deployment journey in reviewable stages using lightweight, medium and more complicated applications. Then review each sidebar view's capabilities. Verify real behavior with focused checks and delete obsolete code/tests; broad hardening and application-error monitoring are deferred. [Roadmap](ROADMAP.md) owns the checkpoints.

## Documentation

Start with [Product](PRODUCT.md), [Operator design](docs/operator-design.md) and [Roadmap](ROADMAP.md). [Architecture](docs/architecture.md) describes the existing implementation. The [documentation map](docs/README.md) links requirements, UI, setup and evidence; [CONTEXT.md](CONTEXT.md) owns terminology, the [component design reference](src/components/server-guy/DESIGN.md) owns visual language, and [tests/README.md](tests/README.md) owns test commands.

Keep each decision or requirement in its owning document. Update current wording and delete obsolete handoffs; Git retains development history. Documentation changes do not establish shipped support. The user separately authorized a fresh start for current development data and deletion of legacy code/tests. Relevant verification remains necessary; migration compatibility and dedicated recovery tools are not redesign requirements.

## Beta safety

Server Guy can execute commands on your application server with the connected account's permissions. Incorrect actions or prompt injection through logs, repository content or other tool results can cause downtime, data loss or disclosure of data the tools can access. Broad security hardening is planned for after beta; these precautions are guidance, not a guarantee of protection.

- Use the most capable supported model available to you. No model is immune to prompt injection, and general intelligence alone does not establish security.
- Prefer a dedicated test server and non-sensitive data during beta. Keep unrelated systems and credentials outside its reach, and scope connected accounts to the resources you intend Server Guy to manage.
- Use **Always ask** when you want to inspect commands before execution. **Pi decides** relies on the model's judgment about asking; **Bypass** runs without approval prompts. Review matters even for reads that could disclose private data.
- Keep tested recovery copies that the managed server and its credentials cannot delete. Backups help recovery; they cannot undo data theft. Avoid exposing sensitive production data unless you accept the current access risks.

## Implementation status

A real repository-to-Hetzner deployment with private persistent PostgreSQL and external behavior checks was [verified on 8 September](docs/testing/README.md#dated-evidence), followed by [hardening](docs/testing/README.md#dated-evidence). The [UI reference](docs/design/screens.md) distinguishes real records from simulated scenarios.

The old deployment/operation workers, mutation endpoints and approval cards have been removed from the active path. Their underlying modules and data model are being replaced incrementally. This checkpoint can execute on an existing SSH server; the replacement repository-to-provider deployment journey is not complete. Historical deployment proofs describe the previous architecture.

## Run

Before creating or retiring a branch, worktree, local runtime or test resource,
read [development resource ownership and cleanup](docs/development-resources.md).
Finishing a task includes classifying its resources, preserving anything
valuable or uncertain, cleaning up only confirmed disposable resources, and
recording the result before its branch or worktree is retired.

Use Node.js 22, the checked-in CI baseline, with the locked dependencies. Pi is bundled; a separate Pi CLI installation is unnecessary. By default, Pi login and model preferences live in `~/.config/server-guy/pi`, so checkouts and preview ports on this machine reuse the connection. Application databases, executions and provider connections remain local to each controller. Set `SERVER_GUY_PI_CONFIG_DIR` to choose another Pi account directory. An explicit `SERVER_GUY_CONFIG_DIR` isolates Pi too unless `SERVER_GUY_PI_CONFIG_DIR` is also supplied. Disconnecting or changing the Pi account/preferences affects all previews using that account directory. Configure the supported ChatGPT subscription in Settings and connect GitHub explicitly through the [GitHub App setup](docs/integrations/github.md).

```sh
npm install
npm run db:push
npm run dev
```

Open <http://127.0.0.1:3000>. In another terminal from the same checkout:

```sh
npm run worker
```

Both processes must use the same database/configuration. The worker loads `.env` and `.env.local`. `SERVER_GUY_DB_PATH` overrides the default `.server-guy/server-guy.db`. `npm run dev` also starts a Drizzle Studio on that same database, taking the first free port from 4983 or from `SERVER_GUY_STUDIO_PORT`, and tells the application which port it chose. Without the worker, accepted requests remain queued. The current controller binds to loopback and rejects arbitrary Host headers; public deployment of the controller still needs authenticated setup.

### Private application access

Pi defaults to loopback-only application ports on the remote server and a local SSH tunnel. Open the `http://127.0.0.1:<port>` link Pi supplies on the PC running Server Guy. Public web access requires an explicit request. If the tunnel stops or the PC restarts, ask Pi to reopen private access; there is no automatic tunnel supervisor. The `open_server_port` tool verifies local HTTP status but does not change remote listeners or firewalls.

### Data and migrations

Stop the web process and worker before applying schema changes. Schema 15 uses four tables: applications, conversations, messages and saved information. Initialize a fresh development database with `npm run db:push`; there is no compatibility migration from the retired schemas. Keep environment and account configuration separate from any application-data reset. `src/server/db-schema.ts` owns the schema.

To read the rows, use the **Database** link in the application top bar in development. It addresses the Drizzle Studio that `npm run dev` started on this database (`https://local.drizzle.studio/?port=<port>`), which is the point: SQLite is a file rather than a service, and a Studio started by hand serves whichever database its own working directory resolves, so one left running in another checkout will show that checkout's rows. Studio takes `host`, `port`, `vendor` and `themeId` from its URL and has no address for a table or a row, so the link opens the whole controller database — find the application by its ID once inside. The link is absent when no Studio was started beside the application.

Native conversation histories live beside the database in `pi-sessions/<application-id>/<chat-id>.jsonl`. For a consistent offline controller backup, stop both processes and preserve SQLite, native sessions, configuration and execution/credential material privately. Restoring SQLite alone cannot restore missing native history. This developer procedure is not the planned automated application-backup feature.

### Diagnostics

Server commands show a live output block inside their chat message. The block follows new output until you scroll back; **Follow latest** resumes following, and **Copy** copies the command and recorded output. Completion keeps the block open and shows the exit code. Output remains redacted and limited to the most recent 100,000 characters by the existing execution recorder.

For a live, read-only view of Pi's full recorded conversation, run this in another terminal using Node 22:

```sh
npm run inspect:conversation
```

Open <http://127.0.0.1:3001>. The viewer opens on the newest application's main conversation, and the **Application** and **Conversation** menus in its bar switch to any other without a restart. The choice is the address — `?application=<id>&chat=<id>` — so a conversation can be linked to directly: in development the application top bar carries a **Transcript** link that opens the conversation you are reading. Startup flags still choose the first view: `-- --application <id> --chat <id> --port 3001`. It respects `SERVER_GUY_DB_PATH` and `SERVER_GUY_CONFIG_DIR` when exported in that terminal.

Recorded messages, reasoning and tool results refresh automatically. The current response text and running-command output update from the controller's saved state about every 750 ms. This is not a raw model-network capture: reasoning appears when Pi saves the assistant message. **Follow latest** scrolls to new content; turn it off to read earlier entries, or **Pause updates** to freeze the view. The inspector reads SQLite, native history and execution files without invoking Pi or running commands. Keep it local: conversation exports can contain private application data.

Local metadata-only diagnostics write rotating `diagnostics/replies.ndjson` and `diagnostics/spans.ndjson` beside the database, unless `SERVER_GUY_LOG_DIR` overrides it. Settings exposes their paths and optional trace export. Product outcomes must remain understandable without a tracing account. Implementation: [local diagnostics](src/server/diagnostics.ts) and [trace configuration](src/server/tracing-config.ts).

## Verify

These are available checks, not a requirement to rerun every suite for every change. Select checks proportionate to the implementation stage; documentation-only edits need document/link checks rather than deployment proofs.

```sh
npm test
npm run lint
npm run build
npm run test:e2e:smoke
```

[tests/README.md](tests/README.md) describes full browser journeys, synthetic fixtures, Docker checks and opt-in real-model evals. `npm run test:dashboard` opens the local testing workbench at <http://127.0.0.1:4317>. Synthetic tests are not provider or deployment evidence. See the [testing index](docs/testing/README.md) for acceptance coverage and known limits.
