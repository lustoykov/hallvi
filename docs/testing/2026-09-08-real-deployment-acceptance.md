# First real deployment acceptance — 2026-09-08

The simplified happy path works through the product. This report records a real deployment from the integration worktree, not a prototype, mocked provider result or manual out-of-band deployment. It does not establish full Coolify parity or completion of all roadmap increments.

The later [hardening report](2026-09-08-deployment-hardening.md) records fixes, broader regression coverage and a second live verification. Results below describe the initial run.

## Deployment identity

| Fact | Observed value |
| --- | --- |
| Application | `Todo · first real deployment` / `ee2ae826-542b-45e0-834b-a23f95fcbf6f` |
| Deployment | `bbb70948-d715-4e1a-9e08-204f4bcbd983` |
| Source | `lustoykov/todo-fastapi` |
| Revision | `7f281ad255fcd9255dcc1f2d3d1d8359a3aea259` |
| Running image | `sha256:0dc50333e6f2229ef3f8fc5d5d8a67feb969c88ebd487979fc9b9f6cb9e16dad` |
| Hetzner server | `165201745` / `sg-bbb70948` |
| Size and location | CX23, 2 vCPU, 4 GB RAM, Falkenstein `fsn1` |
| Public application | <http://178.105.108.77> |
| Live quoted cost | €5.99/month gross including IPv4; €0.0096/hour |
| Product verification time | `2026-09-08T18:33:41.654Z` |

The owner authorized the smallest suitable test instance within approximately $17 credit. One server remains running at the end of this check; no second server was purchased on retry. These facts describe this acceptance run, not perpetual health or a fixed future provider price.

## Exercised product flow

1. Created an application and used its conversation/deployment panel with real GitHub access and the configured model.
2. Connected a scoped Hetzner project token through the inline password field. Reviewed and accepted the live priced offer through the product.
3. The planner inspected the pinned repository, generated the missing Dockerfile, and retained application source. The executor prepared a new Ubuntu host with Docker and Compose, established pinned SSH access, copied the exact source and built it remotely.
4. Compose started the FastAPI application on public port 80 and PostgreSQL 16 on a private container network. The database uses a named persistent volume and has no published port.
5. The worker verified the actual running image/revision and external behavior: `GET /health`, create a uniquely marked todo, read that same todo, then delete it. All checks passed.
6. The dashboard and conversation displayed the same host, revision, verification time, progress and unconfigured backup state. Refreshing application logs returned actual logs containing `/health` requests.
7. Asked the real conversation agent which revision was running and whether the database was backed up. It reported the recorded full SHA and that backups were not configured, with the observation time.
8. Stopped the local web controller and worker. The remote application's health endpoint remained reachable. Rebuilt and restarted the production controller and worker; the same deployment, server, image and verification record reappeared. A provider read confirmed exactly one server in the project.
9. Used the public application in a browser to create a todo, mark it completed and reload. Completion persisted. Deleted the temporary browser test item afterward.

## Failure and recovery observed

The first run built and started the containers but attempted the external health request before the application listener was ready. This produced a recorded failure rather than a fabricated success.

The correction adds bounded retry for non-mutating readiness requests. Mutating behavior checks are not blindly repeated. Selecting **Retry this deployment** reconciled the existing server and image, verified their identity and completed the external checks without another purchase or rebuild. Tests also cover an uncertain purchase response with no reconciled server: execution stops rather than buying again.

## Validation

| Check | Result |
| --- | --- |
| Application suite | 787 passed; 15 opt-in cases skipped; 72 test files passed, 2 skipped |
| New application-shell browser tests | 2 passed: durable conversations/navigation and independent applications sharing a repository |
| TypeScript | Passed |
| ESLint and formatting | Passed |
| Production build | Passed; latest build served on loopback port 3260 |
| Real provider/worker/model flow | Passed as described above |
| Desktop/mobile UI review | Captured at 1440×1000 and 390×844; secondary text contrast fixed and re-reviewed |

The browser regression tests use isolated fixtures. They supplement the separate real deployment evidence; they do not stand in for it. The complete legacy Playwright suite was not run against the replacement shell, and old phase-centric acceptance still needs reconciliation.

Local milestone images are under `tests/results/deployment-milestones/`, including recommendation, progress, live state, dashboard and mobile application interaction. They were shown to the owner during execution. These ignored local images and `/private/tmp/sg-deploy-*.log` files are supporting run artifacts, not durable checked-in dependencies of this report.

## Boundaries and next work

- This is one initial deployment per application: one HTTP source application with optional PostgreSQL. Broad Python/JavaScript/packaged-software compatibility is not proved.
- HTTP only. Domain, reverse proxy, trusted HTTPS and CDN setup remain to be implemented.
- PostgreSQL data is persistent on this VPS, but there are no configured off-host backups or restore tests.
- Health reflects the last successful verification. There is no continuous collector, monitoring or alert delivery yet.
- Routine releases, rollback, host retirement, BYOM adoption and replacement-host recovery remain future work. Existing deployment ownership blocks destructive application deletion/source replacement until lifecycle operations exist.
- The local controller manages a separate remote application host. Installing Server Guy on the application host has not been implemented or tested.
- Provider credentials, SSH keys and generated database credentials remain in private controller-local configuration. Automated backup/recovery of this material is unfinished. This report contains no secrets.
- Legacy preparation records and execution contexts remain during migration. PR #21's remaining acceptance and the complete source-write boundary require further work.
- Implementation and documentation are local to `codex/self-hosted-shell`; this acceptance run did not commit, push, merge or update PR #21.

[ROADMAP.md](../../ROADMAP.md) owns the remaining implementation sequence.
