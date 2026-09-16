# Working on Server Guy

Read [README.md](README.md), [PRODUCT.md](PRODUCT.md),
[operator design](docs/operator-design.md) and [ROADMAP.md](ROADMAP.md).
[CONTEXT.md](CONTEXT.md) owns terminology; the
[component design](src/components/server-guy/DESIGN.md) owns the visual language.

## Development and cleanup

Development runs locally on the owner's MacBook, not on the Mac mini.
Before creating or retiring development resources, read and follow
[development resource ownership and cleanup](docs/development-resources.md).
These are contributor-only rules, never instructions for the product operator Pi.
Cleanup is limited to exact Server Guy development resources with verified
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
Preserve unrelated changes. Include a small decision-oriented diagram under
`docs/architecture/` in each PR and link it from the description.

Use an **80/20 testing approach**: keep a small, high-value suite protecting
core user journeys and concrete risks to data, credentials and truthful status.
Do not add tests by default for every edit, implementation detail or hypothetical
edge case. Remove obsolete and redundant coverage; test counts and coverage
percentages are not goals. [tests/README.md](tests/README.md) owns the selection
bar and commands. Choose checks proportionate to the change. Documentation
changes need document/link review, not a browser suite. Run `npm run format` before finishing. Verify host tools and
provider access before claiming support; unit tests do not prove deployment.

`.server-guy/`, `.next/` and `tests/results/` are local data; never commit them.
Keep decisions in their owning documents and update current wording instead
of appending handoffs. Documentation does not establish shipped support.

Scheduled tasks default to `gpt-5.6-sol` with medium reasoning unless the owner
explicitly requests otherwise.
