# Codex cloud environment

Use the `server-guy` Codex environment for implementation, pull requests and
browser checks. It needs no provider credentials. Real provider access is a
separate configuration decision; adding a secret does not give the agent a
credential-free way to call that provider.

## Setup

In Codex environment settings, select `lustoykov/server-guy`, the universal
image and **Node.js 22** under preinstalled packages. Enable container caching.

Use these commands once the scripts are on the repository's default branch:

```sh
# Setup script
bash scripts/codex-setup.sh
```

```sh
# Maintenance script
bash scripts/codex-maintenance.sh
```

Codex builds the cache from the default branch before checking out the task
branch. Until these scripts are merged, paste their bodies into the corresponding
settings fields, omitting the line that changes directory relative to the script.
The live environment currently uses inline scripts for this reason.

Setup enforces Node 22, runs `npm ci`, installs Chromium and its system libraries,
and initializes the development database. Maintenance installs dependencies only
when the lockfile changes or `node_modules` is missing, ensures the matching
Chromium is available, and applies the checked-out branch's database schema.
A populated database with an incompatible retired schema causes setup to fail;
the script does not erase it.

| Environment variable | Value |
| --- | --- |
| `CI` | `1` |
| `NEXT_TELEMETRY_DISABLED` | `1` |
| `SERVER_GUY_CONFIG_DIR` | `/tmp/server-guy` |
| `SERVER_GUY_DB_PATH` | `/tmp/server-guy/server-guy.db` |
| `SERVER_GUY_LOG_DIR` | `/tmp/server-guy/diagnostics` |
| `SERVER_GUY_TRACING` | `0` |

GitHub App IDs and slugs are public configuration, but do not establish an
authenticated GitHub connection. Do not copy the laptop's `.env.local`, provider
connection files, model keys or backup credentials into this environment.

## Secrets and runtime access

[Codex environment documentation](https://developers.openai.com/codex/cloud/environments)
distinguishes two mechanisms:

- **Environment variables** are available during setup and the agent phase.
- **Secrets** are encrypted in storage and injected into setup; they are removed
  from the environment before the agent phase.

Our scripts do not persist setup secrets. Keep shell tracing disabled (`set +x`)
so future setup commands do not echo expanded credentials. Setup scripts and
installed dependencies still execute with any setup secrets supplied, so review
that code before granting access.

Writing a secret to `.env.local` or the configured
`hetzner-connection.json` preserves agent access to that credential, including
through the cached filesystem. Gitignore and mode 600 do not hide it from an
agent running as the same user, and do not prevent code from leaking it. If a
previous setup persisted credentials, revoke them and reset the container cache;
removing a secret from the UI alone does not revoke its provider token.

For real API operations during a task, choose explicitly between credentials
accessible to that task and a separate service that holds credentials and
executes permitted operations. The latter is not implemented by these scripts.
Do not describe either setup secrets or a second reviewing model as a guarantee
against prompt injection.

## Provider scope for a future live environment

Prefer the existing empty **Server Guy Codex Cloud** Hetzner project over
**Default**, even while everything is development. Default already contains
other development deployments. A separate project limits an automation error to
its own resources without requiring another running server.

[Hetzner tokens](https://docs.hetzner.com/cloud/api/getting-started/generating-api-token/)
are project scoped. Use Read for observation; Read & Write permits resource
creation, modification and deletion throughout that project. It cannot be scoped
to one server. Resources are real and billed: a task must specify what it may
create, its budget and what may remain running.

For Cloudflare, issue a dedicated token with only the operations required by the
test and a specific development zone. Do not reuse a token covering all zones or
assume that an existing domain or backup bucket is disposable.

- DNS changes need Zone / DNS / Edit on the selected zone. Add other zone
  permissions only when testing operations that need them.
- R2 **S3 object access** can use a separate Object Read & Write credential scoped
  to a dedicated test bucket. It must not reach the existing backup bucket.
- R2 **bucket management through the Cloudflare REST API** uses account-level
  Workers R2 Storage permissions. This is broader than a bucket-scoped S3 token;
  do not grant it for ordinary code or browser checks.

See [Cloudflare R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/).
The live `server-guy` Codex environment has no provider credentials configured.

## Network and verification boundaries

The live environment allows common dependency domains plus
`fonts.googleapis.com` and `fonts.gstatic.com`, with GET, HEAD and OPTIONS during
tasks. Setup has network access independently of that agent-phase policy.

If a separate live environment needs provider APIs, add only their required
origins (`api.hetzner.cloud` and `api.cloudflare.com`). Write operations also need
the appropriate HTTP methods. Network filtering supplements credential scope;
it does not make secrets unreadable or guarantee that permitted destinations
cannot receive sensitive data.

See [Codex internet access](https://developers.openai.com/codex/cloud/internet-access).
Outbound traffic uses an HTTP/HTTPS proxy; direct SSH into a provisioned server
is not part of this environment's supported verification path. Creating a VM
through an API is not proof that Server Guy can configure it. Full deployment
proofs stay on the owner's machine or a separate reachable Linux verifier.

## Checks and evidence

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e:smoke
```

These checks use disposable databases and synthetic provider responses. Preserve
the tested commit, exit statuses and relevant browser artifacts in task evidence.
Browser traces, failure screenshots and reports are written under
`tests/results/`; link or attach the relevant evidence before the task ends.
They are local artifacts and must not be committed.

There are no model credentials or authenticated GitHub App connection here.
The Docker workspace test requires a reachable Docker engine. Real model,
provider, SSH and backup proofs need separate authorization and infrastructure.
[tests/README.md](../../tests/README.md) lists those checks, and
[AGENTS.md](../../AGENTS.md) tells the cloud agent to report only what it verified.

[Architecture](../architecture/codex-cloud.md) shows these boundaries.
