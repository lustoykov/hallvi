# Codex cloud environment

A cloud container for checks and pull requests, so the laptop is not the only
place Server Guy can be built. It runs the application suite, lint, types, the
Next build and the browser smoke suite. Given provider tokens it can also reach
the Hetzner and Cloudflare APIs; it cannot SSH into a server, so the
configure-the-machine half of a deployment stays local.

## Create the environment

In ChatGPT, open **Codex → Settings → Environments → Create environment** and
point it at `lustoykov/server-guy`.

**Setup script**

```sh
bash scripts/codex-setup.sh
```

**Maintenance script**

```sh
bash scripts/codex-maintenance.sh
```

## Environment variables and secrets

Codex keeps two kinds of value, and the difference decides the whole design:

- **Environment variables** persist through the entire task: setup script and
  agent phase alike. They are configuration, not protection.
- **Secrets** are encrypted and are _only_ available to the setup script. Codex
  removes them before the agent phase starts.

So a credential added as a secret is invisible to the task that needs it —
unless the setup script writes it down while it still can. That is what
[scripts/codex-setup.sh](../../scripts/codex-setup.sh) does, into the two places
the application already reads.

| Name | Kind | Where it ends up |
| --- | --- | --- |
| `CODEX_ENV_NODE_VERSION` | variable | Selects Node 22, the CI baseline. |
| `SERVER_GUY_TRACING` | variable (`0`) | No trace export from a container with no account. |
| `NEXT_TELEMETRY_DISABLED` | variable (`1`) | Keeps the build quiet and offline. |
| `HETZNER_API_TOKEN` | secret | `connectHetzner` verifies it and writes `.server-guy/hetzner-connection.json`, exactly as Settings does. |
| `CLOUDFLARE_API_TOKEN` | secret | `.env.local`, which the worker, `next dev` and `next build` load. |
| `CLOUDFLARE_ACCOUNT_ID` | secret | `.env.local`, beside the token; R2 is addressed per account. |

Both destinations are gitignored, so neither can reach a pull request by
accident. Be clear about what this buys: the credential is not exposed in the
environment's configuration page and is not sitting in the process environment
of every command, but a task can still read those files. It limits exposure, not
what the agent is able to do.

Rotating or removing a credential means editing it in the Codex UI **and**
rebuilding the container, because the file a previous setup wrote survives in
the cached image.

## Scope the tokens to the cloud

The tokens on the laptop reach the real servers. These should not.

- **Hetzner.** API tokens belong to a project, so create a separate project for
  the cloud and issue the token there. A task that goes wrong can then only
  create and destroy machines the cloud made itself.
- **Cloudflare.** Use an API token scoped to the one zone it needs (DNS edit)
  and the R2 bucket, never a Global API Key, which carries the whole account.

Servers created from a cloud task are real and are billed. The container is
disposable, so nothing stops it from leaving a machine running — say in the task
what should exist at the end, and check the Hetzner project afterwards.

## Internet access during a task

Setup always has network. The agent phase has none by default, and provider work
needs it turned on as **limited** access with `api.hetzner.cloud` and
`api.cloudflare.com` added to the allowlist.

Leave the **GET, HEAD and OPTIONS** restriction on as the normal setting: the
controller can then read servers, DNS records and buckets, and cannot create,
change or delete any of them. Lift it only for a task that is meant to provision
something, and put it back afterwards.

Codex's own warning applies with force once a token is in the container: content
the agent reads — an issue body, a dependency, a page — can carry instructions,
and an open allowlist is the exfiltration route. Keep the list to the hosts a
task actually needs.

## What this container cannot do

It has no model and no GitHub App connection, so Pi conversations and repository
connection flows do not run here. The Docker workspace test needs an engine.

The hard limit is SSH. Server Guy configures a server by running the `ssh`
binary against it ([src/server/server-access.ts](../../src/server/server-access.ts)),
and Codex routes outbound traffic through an HTTP/HTTPS proxy, so a port 22
connection to a new machine is not available. A cloud task can create a server
and a DNS record through the APIs; it cannot install anything on the result.
Deployment proofs stay on the owner's machine.

## What the container installs

[scripts/codex-setup.sh](../../scripts/codex-setup.sh) warns if Node is not 22,
runs `npm ci`, installs Chromium for the browser suite, initializes a fresh
development database with `npm run db:push`, and connects whichever provider
credentials were supplied. It then records the lockfile hash, so
[scripts/codex-maintenance.sh](../../scripts/codex-maintenance.sh) reinstalls on
a resumed container only when the lockfile has actually changed.

Chromium is installed at build time on purpose: with the allowlist tight, a task
that first reaches for the browser suite cannot download it.

A bad Hetzner token fails the setup script, which is deliberate — the container
build is the right place to find out.

## The checks

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e:smoke
```

These use disposable databases and synthetic provider responses; they need no
credentials and no network. Everything else in
[tests/README.md](../../tests/README.md) — the Docker workspace test, live model
evals, provisioning — needs an engine, an account or infrastructure this
container does not have. [AGENTS.md](../../AGENTS.md) tells the cloud agent the
same, so it reports which checks it ran rather than claiming a deployment was
verified.

## Local disk

Working in the cloud does not shrink the checkout that is already here. The
local weight is development data, not the repository: `.server-guy/` holds the
controller database, native sessions and any backup proofs, and `.next/` is build
output. Both are gitignored and safe to delete when no application or worker is
running; `npm run db:push` recreates an empty database.
