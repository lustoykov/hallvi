# Working on Server Guy

Server Guy is the agent for self-hosted software: it deploys one application
stack on a server the owner controls and keeps it healthy. Read
[README.md](README.md) for how to run it, [PRODUCT.md](PRODUCT.md) and
[docs/operator-design.md](docs/operator-design.md) for what it is meant to be,
and [ROADMAP.md](ROADMAP.md) for the checkpoint currently being built.

## Environment

Node.js 22 with the locked dependencies. `npm ci`, never `npm install <pkg>@latest`.
The checks need no credentials: tests use disposable databases and synthetic
provider responses.

The ordinary Codex cloud environment has no provider credentials. Do not persist
setup secrets into files for the agent. See
[docs/development/codex-cloud.md](docs/development/codex-cloud.md) for setup and
provider-access boundaries. If a task explicitly configures live provider access,
resources are real and billed. Create or destroy nothing unless the task says
so, name in the final message anything you left running, and never copy tokens
from environment or connection files into code, output or a commit.

## Checks

```sh
npm test                 # application suite (vitest)
npm run lint             # eslint + prettier --check
npx tsc --noEmit
npm run build
npm run test:e2e:smoke   # browser smoke suite, Chromium
```

Choose checks proportionate to the change: a documentation edit needs document
and link review, not the browser suite. Run `npm run format` before finishing so
`npm run lint` stays clean. [tests/README.md](tests/README.md) owns the full test
commands.

## What this container cannot verify

No model calls, no GitHub connection, and no SSH: outbound traffic goes through
an HTTP proxy, so `ssh` to a server cannot connect even when the Hetzner API
can. A cloud task can therefore create a machine but not configure it. The
Docker workspace test is opt-in and needs a reachable engine.

Deployment, provider and model proofs happen on the owner's machine against real
infrastructure. Do not claim one from here — say which checks you actually ran.

## Conventions

- [CONTEXT.md](CONTEXT.md) owns terminology; use its words in code and UI.
- [src/components/server-guy/DESIGN.md](src/components/server-guy/DESIGN.md) owns
  the visual language.
- Keep each decision in its owning document, and update current wording instead
  of appending handoffs. Documentation changes do not establish shipped support.
- Work on a branch and open a pull request; never commit to `main`.
- `.server-guy/`, `.next/` and `tests/results/` are local data. Never commit them.
