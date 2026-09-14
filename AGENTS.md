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

Development agents run on the owner's Mac Mini. Use the existing Default
Hetzner project. Provider resources are real and billed: create or destroy
nothing unless the task says so, name anything left running, and never print
credentials or copy them into code, artifacts, commits or pull requests.
See [remote development](docs/development/mac-mini.md).

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

## Verification boundaries

Check the current host's tools, credentials and connectivity before claiming
provider, model, GitHub or deployment support. SSH reachability and successful
API calls are separate checks. The Docker workspace test needs a reachable
engine. Report the exact checks run; unit tests do not prove deployment success.

## Conventions

- [CONTEXT.md](CONTEXT.md) owns terminology; use its words in code and UI.
- [src/components/server-guy/DESIGN.md](src/components/server-guy/DESIGN.md) owns
  the visual language.
- Keep each decision in its owning document, and update current wording instead
  of appending handoffs. Documentation changes do not establish shipped support.
- Work on a branch and open a pull request; never commit to `main`.
- `.server-guy/`, `.next/` and `tests/results/` are local data. Never commit them.
