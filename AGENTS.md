# Working on Hallvi

Read [README.md](README.md), [PRODUCT.md](PRODUCT.md),
[operator design](docs/operator-design.md) and [ROADMAP.md](ROADMAP.md).
[CONTEXT.md](CONTEXT.md) owns terminology, the
[component design](src/components/hallvi/DESIGN.md) the visual language,
[developing Hallvi](docs/development.md) the local setup and
[tests/README.md](tests/README.md) the testing bar.

This file is for agents developing Hallvi, never the product operator Pi. Do
not inject contributor instructions, local agent skills or development
automation prompts into product sessions.

- Use Node.js 22 and `npm ci`. Work on a branch and open a pull request; never
  commit to `main`. Preserve unrelated changes. Run `npm run format` before
  finishing.
- Keep the test suite small and high-value, and choose checks proportionate to
  the change. Unit tests do not prove deployment.
- For relevant development work, both Codex and Claude Code must use
  [verify-hallvi](.agents/skills/verify-hallvi/SKILL.md) to choose proportionate
  checks. Maintaining that workflow is part of completing the task: fix
  inaccurate instructions, broken examples, missing steps and demonstrated
  recurring friction you encounter; validate those narrow improvements and
  include them in the same PR. If it worked, leave it alone; no improvement
  quota. Preserve the verification standard, task scope and permission
  boundaries. Record raw wishes and workflow friction as feedback; deliberate
  product proposals follow the feature research workflow below.
- During ordinary implementation, testing and review, record useful bugs,
  friction, wishes and ideas you encounter in
  [AGENT_FEEDBACK.md](AGENT_FEEDBACK.md). A short note is enough; no justification
  or research is required. Before finishing, capture useful observations from
  the task; invent nothing when there are none. Include them in the current PR
  or a feedback-only PR. Search before adding, and count one +1 per independent
  task. Feedback does not authorize implementation and is shared through merges.
- [AGENT_FEATURES.md](AGENT_FEATURES.md) holds researched product proposals and
  owns the research workflow. Read it for feature discovery, proposal updates
  or an explicitly assigned feature. Ordinary coding tasks still contribute
  feedback; they do not need a broad product research pass. The owner selects
  work, and [ROADMAP.md](ROADMAP.md) owns delivery order.
- For worker agents and automated or scheduled work in this repository, default to
  `gpt-6.1-sol` with `high` reasoning unless the owner requests otherwise.
- When a boundary or a flow changes, draw it as a Mermaid block in the pull
  request.
- Keep decisions in their owning documents and update current wording instead
  of appending handoffs.
- Keep verification screenshots, logs and per-run reports in ignored
  `tests/results/` or `work/`. Summarize checks in the PR; do not commit review
  artifacts or add reports under `docs/testing/`. Never force-add ignored
  artifacts. After review, remove only this task's temporary artifacts that
  are no longer needed.
- Never commit `.hallvi/`, `.next/` or `tests/results/`. Never print
  credentials or copy them into code, artifacts, commits or pull requests.
- Clean up what your task created and nothing else, as
  [development resources](docs/development-resources.md) describes.
