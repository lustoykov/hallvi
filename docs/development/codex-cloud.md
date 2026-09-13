# Codex cloud environment

A cloud container for checks and pull requests, so the laptop is not the only
place Server Guy can be built. It runs the application suite, lint, types, the
Next build and the browser smoke suite. It cannot reach a model, GitHub, Hetzner
or a real server, so deployment, provider and model proofs still happen locally.

## Create the environment

In ChatGPT, open **Codex → Settings → Environments → Create environment** and
point it at `lustoykov/server-guy`.

**Environment variables**

| Name | Value | Why |
| --- | --- | --- |
| `CODEX_ENV_NODE_VERSION` | `22` | The CI baseline; the container defaults to a newer Node. |
| `SERVER_GUY_TRACING` | `0` | No trace export from a container with no account. |
| `NEXT_TELEMETRY_DISABLED` | `1` | Keeps the build quiet and offline. |

Add no secrets. The Pi/ChatGPT login, GitHub App identifiers, Hetzner token and
SSH keys have no use in this container, and a cloud agent has no reason to hold
credentials for the owner's real servers.

**Setup script**

```sh
bash scripts/codex-setup.sh
```

**Maintenance script**

```sh
bash scripts/codex-maintenance.sh
```

**Internet access.** The setup script needs it, for the npm registry and the
Playwright download host. Leave it off during task runs: every check listed below
is local. Turn it on, or rebuild the container, only when a task must add a
dependency.

## What the container installs

[scripts/codex-setup.sh](../../scripts/codex-setup.sh) warns if Node is not 22,
runs `npm ci`, installs Chromium for the browser suite, and initializes a fresh
development database with `npm run db:push`. It then records the lockfile hash,
so [scripts/codex-maintenance.sh](../../scripts/codex-maintenance.sh) reinstalls
on a resumed container only when the lockfile has actually changed.

Chromium is installed at build time on purpose: with internet access off, a task
that first reaches for the browser suite cannot download it.

## What a cloud task can prove

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e:smoke
```

Those use disposable databases and synthetic provider responses. Everything else
in [tests/README.md](../../tests/README.md) — the Docker workspace test, live
model evals, provisioning — needs an engine, an account or infrastructure that
this container does not have. [AGENTS.md](../../AGENTS.md) tells the cloud agent
the same thing, so it reports which checks it ran rather than claiming a
deployment was verified.

## Local disk

Working in the cloud does not shrink the checkout that is already here. The
local weight is development data, not the repository: `.server-guy/` holds the
controller database, native sessions and any backup proofs, and `.next/` is build
output. Both are gitignored and safe to delete when no application or worker is
running; `npm run db:push` recreates an empty database.
