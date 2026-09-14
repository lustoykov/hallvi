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

During beta, Codex cloud may use development provider credentials stored through
Codex Secrets and persisted by setup into application configuration files. The
agent can read these files; the owner accepts this trust model for beta. Use the
existing Default Hetzner project, not a separate cloud project. See
[docs/development/codex-cloud.md](docs/development/codex-cloud.md) for scope and
setup. Resources are real and billed. Create or destroy nothing unless the task
says so, name anything left running, and never print credentials or copy them
into code, test artifacts, commits or pull requests.

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

Model calls and authenticated GitHub flows need their own credentials. Provider
API checks require configured tokens and allowed network destinations/methods.
Cloud traffic uses an HTTP/HTTPS proxy. Direct SSH and full server configuration
have not been verified from this environment; do not infer SSH connectivity from
a successful provider API call. The Docker workspace test needs a reachable
engine. Report the exact checks run and their results; do not claim deployment
success from unit tests or VM creation alone.

## Conventions

- [CONTEXT.md](CONTEXT.md) owns terminology; use its words in code and UI.
- [src/components/server-guy/DESIGN.md](src/components/server-guy/DESIGN.md) owns
  the visual language.
- Keep each decision in its owning document, and update current wording instead
  of appending handoffs. Documentation changes do not establish shipped support.
- Work on a branch and open a pull request; never commit to `main`.
- `.server-guy/`, `.next/` and `tests/results/` are local data. Never commit them.
