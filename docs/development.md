# Developing Hallvi

## Run locally

To use Hallvi rather than develop it, install it as a background service:
[Installing Hallvi](installation.md). `npm run package` builds the
archive, and `npm start` runs the same production pair in the foreground against
this checkout's `.hallvi` state. This guide is for development.

Build in a worktree, which runs its own Hallvi with its own state and fixtures
and shares only the account-level logins; never copy a connection between
checkouts. If you keep a [development environment](development-environment.md)
— applications really deployed and kept between tasks — look there before
building a fixture: `node scripts/retained-application.mjs attach <name>` runs
that application in your worktree until it detaches, and a second checkout is
refused. To send it work and read what it recorded from a terminal, use the
[request commands](cli.md#from-a-development-checkout). Clean up what a task creates as
[development resources](development-resources.md) describes.

Use Node.js 22, the checked-in CI baseline, with the locked dependencies. Pi is bundled; a separate Pi CLI installation is unnecessary. By default, the account level — the ChatGPT login and model preferences, and the GitHub, Hetzner and Cloudflare connections — lives in `~/.config/hallvi/pi`, so every checkout and preview port on the machine reuses the same logins and none of them copies one (a copied GitHub login dies when either copy renews). Application databases, executions, SSH keys and secrets remain local to each controller. Set `HALLVI_PI_CONFIG_DIR` to choose another account directory. An explicit `HALLVI_CONFIG_DIR` isolates the account level too unless `HALLVI_PI_CONFIG_DIR` is also supplied, which is what keeps test fixtures apart. Disconnecting or changing anything at the account level affects every controller using that directory. Configure the supported ChatGPT subscription in Settings and connect GitHub explicitly through the [GitHub App setup](integrations/github.md).

On an installed controller's next start, legacy GitHub, Hetzner and Cloudflare
connections move from its config directory into the selected account directory,
only where no account file already exists. A saved disconnect (`null`) counts
as existing. The launcher finishes this before starting the interface or worker;
`--check-installed` changes no credentials. Existing shared files win and any
conflicting legacy files remain untouched. Development checkouts do not import
legacy connections automatically.

GitHub renewal takes a file lock in that account directory. A second controller
waits, then reads the rotated token instead of spending the same refresh grant.
Recovery copies include the authoritative shared files once, under the restored
controller's config directory, and exclude stale controller copies.

```mermaid
flowchart LR
    A[Controller A: own database and application secrets] --> S[Shared account directory]
    B[Controller B: own database and application secrets] --> S
    S --> L[GitHub renewal file lock]
    S --> R[Recovery copy: one current file per account]
```

```sh
npm ci
npm run db:push
npm run dev
```

Open the app and developer dashboard at the two addresses printed by `npm run dev` (normally <http://127.0.0.1:3000> and <http://127.0.0.1:4317>). They link to each other. Each worktree gets its own pair on free local ports; the dashboard runs checks and reports for that checkout. An explicit `PORT`, including a retained application's own port, is kept exactly and must be free. `HALLVI_DASHBOARD_PORT` similarly pins a dashboard port when needed.

That one command starts four processes: the application, the Pi worker that carries its conversations, a Drizzle Studio on the same database, and the local developer dashboard. The launcher loads `.env` and `.env.local`, resolves the database path, controller directory, Pi account directory and diagnostics directory once, and hands the children the same values, so they cannot disagree about which database and which ChatGPT connection they are using. `HALLVI_DB_PATH` overrides the default `.hallvi/hallvi.db`. The Studio takes the first free port from 4983 or from `HALLVI_STUDIO_PORT`, and the application is told which port it chose.

The worker stays a separate process, the only one that opens Pi's sessions; the app reaches it over a socket beside the database ([what the launcher does when it stops](architecture/development-start.md)). If it exits unexpectedly, the launcher says so and starts it once more; if it exits again, the launcher stops the children it started and exits non-zero rather than leaving the application unable to accept a message. A worker that finds another one already serving this database steps aside, and the launcher leaves that running worker alone. For debugging, `npm run worker` still starts one on its own from the same checkout.

Messages are accepted only after the running worker has saved them in Pi. When no worker is available, sending fails visibly and the composer keeps the draft. After a restart, Pi keeps unfinished work until the owner chooses Continue or Stop. The current controller binds to loopback and rejects arbitrary Host headers; public deployment of the controller still needs authenticated setup.

### Instance label

The top strip and browser tab identify the computer running Hallvi, including
when its loopback address is forwarded over SSH. On macOS this uses the friendly
Computer Name from System Settings; other hosts use their hostname. Set
`HALLVI_HOST_LABEL` in the server environment (for example `MacBook Pro` in
`.env.local`) to override the displayed name, then restart Hallvi. The label
identifies the controller, not the server hosting a deployed application.

### Private application access

Pi defaults to loopback-only application ports on the remote server and a local SSH tunnel. Open the `http://127.0.0.1:<port>` link Pi supplies on the PC running Hallvi. Public web access requires an explicit request. If the tunnel stops or the PC restarts, ask Pi to reopen private access; there is no automatic tunnel supervisor. The `open_server_port` tool verifies local HTTP status but does not change remote listeners or firewalls.

### Data and migrations

Stop the web process and worker before applying schema changes. Schema 18 uses
three current tables: applications, conversations and saved information.
Initialize a fresh development database with `npm run db:push`; upgrade an
existing schema 15 database with `npm run db:upgrade`. Other transitions are
not supported. Keep environment and account configuration separate from any
application-data reset. [db-schema.ts](../src/server/db-schema.ts) owns the
schema and [migrations.mjs](../scripts/migrations.mjs) owns supported upgrades.

To read the rows, use the **Database** link in the application top bar in development. It addresses the Drizzle Studio that `npm run dev` started on this database (`https://local.drizzle.studio/?port=<port>`), which is the point: SQLite is a file rather than a service, and a Studio started by hand serves whichever database its own working directory resolves, so one left running in another checkout will show that checkout's rows. Studio takes `host`, `port`, `vendor` and `themeId` from its URL and has no address for a table or a row, so the link opens the whole controller database — find the application by its ID once inside. The link is absent when no Studio was started beside the application.

Native conversation histories live beside the database in `pi-sessions/<application-id>/<chat-id>/`, in Pi's own session format; a `<chat-id>.jsonl` beside that directory is the untouched history from before the upgrade. For a consistent offline controller backup, stop both processes and preserve SQLite, native sessions, configuration and execution/credential material privately. Restoring SQLite alone cannot restore missing native history. This developer procedure is not the planned automated application-backup feature.

### Diagnostics

Server commands show a live output block inside their chat message. The block follows new output until you scroll back; **Follow latest** resumes following, and **Copy** copies the command and recorded output. Completion keeps the block open and shows the exit code. Output remains redacted and limited to the most recent 100,000 characters by the existing execution recorder.

For answer text or calls omitted by the bounded [request commands](cli.md),
open the matching application and conversation on the controller being checked.
Expand the call's disclosure and, when it has execution evidence, its command
output. The page uses the worker's current conversation projection and shows
recorded messages, calls and live output. Tool arguments and results remain
redacted, bounded previews; command output is limited to the most recent
100,000 recorded characters. Opening the page cannot recover output discarded
by the execution recorder.

Raw recorded reasoning and Pi's session tree currently have no supported
developer export. The old standalone inspector was removed because it read
retired database fields and the pre-upgrade session format. Do not open current
Pi files with the legacy HTML exporter or treat missing evidence as a clean
run. If the page and execution record still omit what a check needs, report
the verification gap.

Local metadata-only diagnostics write rotating `diagnostics/replies.ndjson` and `diagnostics/spans.ndjson` beside the database, unless `HALLVI_LOG_DIR` overrides it. Settings exposes their paths and optional trace export. Product outcomes must remain understandable without a tracing account. Implementation: [local diagnostics](../src/server/diagnostics.ts) and [trace configuration](../src/server/tracing-config.ts).

## Verify

Use the repository [verify-hallvi skill](../.agents/skills/verify-hallvi/SKILL.md)
and its [verification guide](verification.md) to select an environment, follow
a CLI request to its evidence, check useful behavior and clean up. The
standing use and maintenance rule lives in [AGENTS.md](../AGENTS.md).

These are available checks, not a requirement to rerun every suite for every change. Select checks proportionate to the implementation stage; documentation-only edits need document/link checks rather than deployment proofs.

Record useful bugs, friction and wishes encountered during ordinary development
in [Agent feedback](../AGENT_FEEDBACK.md#how-to-contribute), including when there
are no code changes. A short note is enough; no research or evidence is required.
Capture useful observations before finishing and include them in your current
PR or a feedback-only PR. Invent nothing when there is no feedback to add.
That file owns deduplication and +1 counting.

[Agent features](../AGENT_FEATURES.md) separately holds researched product
proposals, selection and assignment. It owns the initial, weekly and targeted
research workflow. The developer dashboard exposes both documents as separate
read-only pages. The owner selects features; the roadmap owns delivery order.
Neither contributor workflow belongs in Pi's product sessions.

```sh
npm test
npm run lint
npm run build
npm run test:e2e:smoke
```

`npm run checks` runs what the `Hallvi checks` GitHub workflow runs — the
application tests, lint and formatting, types, the production build and the
browser smoke suite — on Node 22, and ends with a summary naming the revision
and each step's result. While that workflow is disabled, the summary is how a
pull request records them.

[tests/README.md](../tests/README.md) describes browser journeys, synthetic fixtures, Docker checks and the limits of archived evals. `npm run dev` starts the local testing workbench beside the app; `npm run test:dashboard` can still run it alone on <http://127.0.0.1:4317> when that port is free. Synthetic tests are not provider or deployment evidence. See the [testing index](testing/README.md) for acceptance coverage and known limits.

### Shared agent skill discovery

The canonical skill is `.agents/skills/verify-hallvi/SKILL.md`, discovered by
[Codex](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).
[Claude Code](https://code.claude.com/docs/en/skills#choose-where-skills-load)
discovers the relative `.claude/skills/verify-hallvi` symlink to that directory.
Root `CLAUDE.md` [imports](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools)
`AGENTS.md`, so both tools receive the same contributor policy. Automatic
selection remains enabled; no personal installation or runtime configuration
is needed. Start a fresh session in the checkout to verify discovery, using
`$verify-hallvi` in Codex or `/verify-hallvi` in Claude if checking it explicitly.
Keep Git symlinks enabled when checking out the repository; local overrides
that disable skills or project instructions can prevent discovery.

The next three real development tasks are the trial of this default workflow.
Use their existing PR evidence to assess it; no extra report or automation.
