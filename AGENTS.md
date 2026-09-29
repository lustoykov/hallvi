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
  boundaries. Larger workflow or product proposals belong in
  [AGENT_FEEDBACK.md](AGENT_FEEDBACK.md) for the owner's decision.
- Record bugs, friction and ideas you would like in
  [AGENT_FEEDBACK.md](AGENT_FEEDBACK.md). A short note is enough; no justification
  or evidence is required. Include it in the current PR or open a feedback-only
  PR whenever you wish. Search before adding, and count one +1 per independent
  task. The owner decides what is worth doing; feedback does not authorize
  implementation. The file is shared through merges, not live across worktrees.
- When a boundary or a flow changes, draw it as a Mermaid block in the pull
  request.
- Keep decisions in their owning documents and update current wording instead
  of appending handoffs.
- Never commit `.hallvi/`, `.next/` or `tests/results/`. Never print
  credentials or copy them into code, artifacts, commits or pull requests.
- Clean up what your task created and nothing else, as
  [development resources](docs/development-resources.md) describes.
