# Hallvi

[Documentation map](docs/README.md) · [Operator redesign](docs/operator-design.md) · [Current implementation](docs/architecture.md)

**The agent for self-hosted software.** Deploy one application stack on a server you control, keep it healthy and protect its data. Conversation drives setup and operations; stable views show the same recorded facts and results.

## Install Hallvi

Hallvi runs in the background on your Mac or Linux machine. Use it in your
browser to connect your model account, add a repository and deploy it to a
Linux application server. The machine running Hallvi and the application
server have separate requirements.

**Private beta:** there is no public download yet. Obtain the platform release
archive, matching checksum and installer script from the maintainer; you do not
need to clone this repository or install Node.js, npm, Python or a compiler.

| Your machine | Start here |
| --- | --- |
| Apple-silicon macOS | [macOS installation](docs/installation.md#macos) |
| Ubuntu 24.04 x64 with systemd | [Linux installation](docs/installation.md#linux) |
| Another machine, including a Mac mini or Linux VM | [Remote browser access](docs/installation.md#on-another-machine) after installing there |

The [prebuilt installation candidate](docs/testing/2026-09-19-prebuilt-installation.md)
was exercised on Apple-silicon macOS and Ubuntu 24.04 x64. Each later archive
needs its own trial. See [supported machines](docs/installation.md#supported-machines).
The current main revision still needs a local Docker Engine before **Read repository**.
Direct repository execution with optional Docker is separate, unmerged work.

After a local installation, open <http://127.0.0.1:4747>. For a headless VPS,
use the [laptop browser handoff](docs/installation.md#on-another-machine).
Follow [your first deployment](docs/installation.md#your-first-deployment).
For service commands, upgrades and troubleshooting, see the
[full installation guide](docs/installation.md).

Application deployments target Docker Compose on one Linux instance, with
PostgreSQL or SQLite, required Redis/Valkey services, workers, scheduled
commands and persistent files. Compute starts with Hetzner or a machine you
provide; backups with R2 or S3.

## Current direction

Current `main` implements conversation-first repository intake, model and
GitHub setup, Hetzner or existing-machine connection, general server execution
with three permission modes, inline approval, recorded output and
evidence-backed application views. Other conversations have read-only tools.
The public beta candidate still needs exact installation and fresh-user real
deployment evidence; [Roadmap](ROADMAP.md#public-self-service-beta-preparation)
owns those gates.

[Design and prove the main deployment journey first](PRODUCT.md#development-priority), in reviewable stages from lightweight to more complicated applications; [Roadmap](ROADMAP.md) owns the checkpoints.

## Documentation

Start with [Product](PRODUCT.md), [Operator design](docs/operator-design.md) and [Roadmap](ROADMAP.md). [Architecture](docs/architecture.md) describes the existing implementation. The [documentation map](docs/README.md) links requirements, UI, setup and evidence; [CONTEXT.md](CONTEXT.md) owns terminology, the [component design reference](src/components/hallvi/DESIGN.md) owns visual language, and [tests/README.md](tests/README.md) owns test commands.

Keep each decision or requirement in its owning document. Update current wording and delete obsolete handoffs; Git retains development history. Documentation changes do not establish shipped support. The user separately authorized a fresh start for current development data and deletion of legacy code/tests. Relevant verification remains necessary; migration compatibility and dedicated recovery tools are not redesign requirements.

## Beta safety

Hallvi can execute commands on your application server with the connected account's permissions. Incorrect actions or prompt injection through logs, repository content or other tool results can cause downtime, data loss or disclosure of data the tools can access. Broad security hardening is planned for after beta; these precautions are guidance, not a guarantee of protection.

- Use the most capable supported model available to you. No model is immune to prompt injection, and general intelligence alone does not establish security.
- Prefer a dedicated test server and non-sensitive data during beta. Keep unrelated systems and credentials outside its reach, and scope connected accounts to the resources you intend Hallvi to manage.
- Use **Always ask** when you want to inspect commands before execution; the other two [permission modes](PRODUCT.md#permission-modes) ask less. Review matters even for reads that could disclose private data.
- Keep tested recovery copies that the managed server and its credentials cannot delete. Backups help recovery; they cannot undo data theft. Avoid exposing sensitive production data unless you accept the current access risks.

## Implementation status

A real repository-to-Hetzner deployment with private persistent PostgreSQL and external behavior checks was [verified on 8 September](docs/testing/README.md#dated-evidence), followed by [hardening](docs/testing/README.md#dated-evidence). The [UI reference](docs/design/screens.md) distinguishes real records from simulated scenarios.

The active path can inspect a repository, connect Hetzner or an existing
machine and carry deployment work through the main operator. Dated proofs
establish capability on earlier revisions; they do not replace the exact
candidate walkthrough still open in the roadmap.

## Development

<a id="run"></a>

To use Hallvi rather than develop it, install it as a background service:
[Installing Hallvi](docs/installation.md). `npm run package` builds the
archive, and `npm start` runs the same production pair in the foreground against
this checkout's `.hallvi` state. The
rest of this section is development.

Development runs locally on the owner's MacBook; the Mac mini is retired from development.
Before creating or retiring a branch, worktree, local runtime or cloud test resource,
read [development resource ownership and cleanup](docs/development-resources.md).
Finishing a task includes classifying its resources, preserving anything
valuable or uncertain, cleaning up only confirmed disposable resources, and
recording the result before its branch or worktree is retired.

Use Node.js 22, the checked-in CI baseline, with the locked dependencies. Pi is bundled; a separate Pi CLI installation is unnecessary. By default, Pi login and model preferences live in `~/.config/hallvi/pi`, so checkouts and preview ports on this machine reuse the connection. Application databases, executions and provider connections remain local to each controller. Set `HALLVI_PI_CONFIG_DIR` to choose another Pi account directory. An explicit `HALLVI_CONFIG_DIR` isolates Pi too unless `HALLVI_PI_CONFIG_DIR` is also supplied. Disconnecting or changing the Pi account/preferences affects all previews using that account directory. Configure the supported ChatGPT subscription in Settings and connect GitHub explicitly through the [GitHub App setup](docs/integrations/github.md).

```sh
npm ci
npm run db:push
npm run dev
```

Open <http://127.0.0.1:3000>. That one command starts three processes: the application, the Pi worker that carries its conversations, and a Drizzle Studio on the same database. The launcher loads `.env` and `.env.local`, resolves the database path, controller directory, Pi account directory and diagnostics directory once, and hands all three children the same values, so they cannot disagree about which database and which ChatGPT connection they are using. `HALLVI_DB_PATH` overrides the default `.hallvi/hallvi.db`. The Studio takes the first free port from 4983 or from `HALLVI_STUDIO_PORT`, and the application is told which port it chose.

The worker stays a separate process with its own exclusive lock ([what the launcher does when it stops](docs/architecture/development-start.md)). If it exits unexpectedly, the launcher says so and starts it once more; if it exits again, the launcher stops the children it started and exits non-zero rather than leaving the application in front of a queue nobody reads. A worker that finds another one already serving this database steps aside, and the launcher leaves that running worker alone. For debugging, `npm run worker` still starts one on its own from the same checkout.

Accepted messages are saved and stay queued until a worker picks them up. When none is running, the conversation says so above the composer and on the waiting message instead of showing a reply in progress. The current controller binds to loopback and rejects arbitrary Host headers; public deployment of the controller still needs authenticated setup.

### Private application access

Pi defaults to loopback-only application ports on the remote server and a local SSH tunnel. Open the `http://127.0.0.1:<port>` link Pi supplies on the PC running Hallvi. Public web access requires an explicit request. If the tunnel stops or the PC restarts, ask Pi to reopen private access; there is no automatic tunnel supervisor. The `open_server_port` tool verifies local HTTP status but does not change remote listeners or firewalls.

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

Open <http://127.0.0.1:3001>. The viewer opens on the newest application's main conversation, and the **Application** and **Conversation** menus in its bar switch to any other without a restart. The choice is the address — `?application=<id>&chat=<id>` — so a conversation can be linked to directly: in development the application top bar carries a **Transcript** link that opens the conversation you are reading. Startup flags still choose the first view: `-- --application <id> --chat <id> --port 3001`. It respects `HALLVI_DB_PATH` and `HALLVI_CONFIG_DIR` when exported in that terminal.

Recorded messages, reasoning and tool results refresh automatically. The current response text and running-command output update from the controller's saved state about every 750 ms. This is not a raw model-network capture: reasoning appears when Pi saves the assistant message. **Follow latest** scrolls to new content; turn it off to read earlier entries, or **Pause updates** to freeze the view. The inspector reads SQLite, native history and execution files without invoking Pi or running commands. Keep it local: conversation exports can contain private application data.

Local metadata-only diagnostics write rotating `diagnostics/replies.ndjson` and `diagnostics/spans.ndjson` beside the database, unless `HALLVI_LOG_DIR` overrides it. Settings exposes their paths and optional trace export. Product outcomes must remain understandable without a tracing account. Implementation: [local diagnostics](src/server/diagnostics.ts) and [trace configuration](src/server/tracing-config.ts).

## Verify

These are available checks, not a requirement to rerun every suite for every change. Select checks proportionate to the implementation stage; documentation-only edits need document/link checks rather than deployment proofs.

```sh
npm test
npm run lint
npm run build
npm run test:e2e:smoke
```

[tests/README.md](tests/README.md) describes full browser journeys, synthetic fixtures, Docker checks and opt-in real-model evals. `npm run test:dashboard` opens the local testing workbench at <http://127.0.0.1:4317>. Synthetic tests are not provider or deployment evidence. See the [testing index](docs/testing/README.md) for acceptance coverage and known limits.
