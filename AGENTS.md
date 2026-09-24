# Working on Hallvi

Read [README.md](README.md), [PRODUCT.md](PRODUCT.md),
[operator design](docs/operator-design.md) and [ROADMAP.md](ROADMAP.md).
[CONTEXT.md](CONTEXT.md) owns terminology; the
[component design](src/components/hallvi/DESIGN.md) owns the visual language.

## Development and cleanup

Development runs locally on the owner's MacBook, not on the Mac mini. Work in a
worktree: it runs its own Hallvi on its own state and shares only the
account-level logins, never copying a connection between checkouts. Worktrees
go when their session is archived, in Claude Code and Codex alike; never remove
one by hand.

Before building a fixture, check the
[development environment](docs/development-environment.md): four really
deployed applications kept between tasks. Say which one you are taking, take it
with `node scripts/retained-application.mjs attach <name>`, and detach when you
are done; the lock refuses any second owner. Use a disposable fixture for
deletion, failure and recovery work.

Before creating or removing development resources, read
[development resources](docs/development-resources.md). Create billed fixtures
in the Default Hetzner project whenever the work needs them; label and register
them, and delete them when the task ends. After your work merges, give the owner
the [GO/NO-GO list](docs/development-resources.md#after-your-work-merges) and
wait for fresh approval before deleting anything under `~/biz/` or in Docker.
Never delete what you did not create, never broadly prune Docker, and preserve
dirty work, unique data, credentials, retained evidence and anything uncertain.
Never print credentials or copy them into code, artifacts, commits or pull
requests.

Leave the preview the owner will review running and give its link in the
handoff. Stop it by PID when that review ends, at the latest once the work
merges, then run `node scripts/check-preview-processes.mjs`. See
[local preview processes](docs/development-resources.md#local-preview-processes).

This file is for agents developing Hallvi, never the product operator Pi. Pi
has separate runtime instructions; do not inject contributor instructions,
local agent skills or development automation prompts into product sessions.

## Changes and checks

Use Node.js 22 and locked dependencies: `npm ci`, never latest-version installs.
Work on a branch and open a pull request; never commit directly to `main`.
Preserve unrelated changes. Draw a diagram when a boundary or a flow changes:
a Mermaid block in the pull request explains the change to its reviewer, and a
diagram worth keeping lives in, or is linked from, the document that owns the
decision it explains. A trivial change does not manufacture an artifact.
[Diagrams](docs/architecture/README.md) indexes the ones that exist.

Use an **80/20 testing approach**: keep a small, high-value suite protecting
core user journeys and concrete risks to data, credentials and truthful status.
Do not add tests by default for every edit, implementation detail or hypothetical
edge case. Remove obsolete and redundant coverage; test counts and coverage
percentages are not goals. [tests/README.md](tests/README.md) owns the selection
bar and commands. Choose checks proportionate to the change. Documentation
changes need document/link review, not a browser suite. Run `npm run format` before finishing. Verify host tools and
provider access before claiming support; unit tests do not prove deployment.

`.hallvi/`, `.next/` and `tests/results/` are local data; never commit them.
Keep decisions in their owning documents and update current wording instead
of appending handoffs. Documentation does not establish shipped support.

Scheduled tasks default to `gpt-5.6-sol` with medium reasoning unless the owner
explicitly requests otherwise.
