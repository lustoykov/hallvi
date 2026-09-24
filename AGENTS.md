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
- When a boundary or a flow changes, draw it as a Mermaid block in the pull
  request.
- Keep decisions in their owning documents and update current wording instead
  of appending handoffs.
- Never commit `.hallvi/`, `.next/` or `tests/results/`. Never print
  credentials or copy them into code, artifacts, commits or pull requests.
- Clean up what your task created and nothing else, as
  [development resources](docs/development-resources.md) describes.
