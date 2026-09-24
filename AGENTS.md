# Working on Hallvi

Read [README.md](README.md), [PRODUCT.md](PRODUCT.md),
[operator design](docs/operator-design.md) and [ROADMAP.md](ROADMAP.md).
[CONTEXT.md](CONTEXT.md) owns terminology; the
[component design](src/components/hallvi/DESIGN.md) owns the visual language.

## Development and cleanup

Development runs locally on the owner's MacBook, not on the Mac mini.
Before creating or retiring development resources, read and follow
[development resource ownership and cleanup](docs/development-resources.md).
Before building a fixture, check whether the
[development environment](docs/development-environment.md) already has one:
four really deployed applications, each with its conversation and data kept
in a state directory of its own outside every checkout. Say which one you are
taking, take it with `node scripts/retained-application.mjs attach <name>`,
and detach when you are done; use a disposable fixture for deletion, failure
and recovery work. Work happens in a worktree, which runs its own Hallvi on
its own state by default and shares only the account-level logins; it never
copies a connection between checkouts. One runtime owns an application's
records at a time — the lock refuses everyone else, including a second
`npm run dev` pointed at the directory. See
[one application, one owner](docs/development-environment.md#one-application-one-owner).
This file is for agents developing Hallvi, never the product operator Pi.
Pi has separate runtime instructions; do not inject contributor instructions,
local agent skills or development automation prompts into product sessions.
Cleanup is limited to exact Hallvi development resources with verified
ownership and disposable contents; a project folder is not blanket permission
to remove user data. Never extend cleanup to unrelated folders or resources.
Record ownership and retention outside worktrees. Task completion includes
verified cleanup or an explicit retained-resource handoff. The local daily
Dev Cleanup task is the fallback; it also owns shared cloud cleanup.

Use the existing authorized Default Hetzner project. On 14 September 2026 the
owner standing-authorized creating billed development resources there whenever
the work needs them; prefer a real host over a stand-in when the step is about
deployment itself. That covers creation and use, never deletion of anything you
did not create: label it, register it, and retire it when the task ends.

Never print credentials or copy them into code, artifacts, commits or pull
requests. Preserve dirty work, unique data, credentials, retained evidence and
uncertain resources. Never broadly prune Docker volumes or force-remove
worktrees.

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
