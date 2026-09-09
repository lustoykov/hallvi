# Homepage takeover

The selected D / Together homepage from `codex/homepage-exploration` at
`896337dc4f8acd7eb4ff959a6f0b57d85330a14e` now renders at `/applications` in
`.worktrees/self-hosted-shell` on `codex/single-instance-runtime`.

The final page uses the application's existing blue/slate colors and Geist
font, with distinct mascot colors as requested. The selected prototype's
Little Server geometry and gestures are retained, with offscreen rendering
suppressed. Only the selected page composition was ported; prototype fixtures,
fake chat, and fake actions were replaced with current application records and
real navigation. Preview artwork is labeled as illustration.

## Verification

- Production build, TypeScript, and targeted ESLint pass.
- Full unit run: 875 passed, 15 skipped; its only failure identified a missing
  journey tag on the previously integrated firewall browser test. Added the
  existing application-shell tag. The catalog and application-screen unit
  tests then passed (7 tests).
- A disposable browser fixture verifies the first-application empty state,
  creation of two synthetic records, keyboard selection, search, no results,
  motion controls, and opening the selected application's real chat.
- Live browser checks confirm pause and reduced motion yield stable canvas
  frames, requested backflip is rendered, and no-WebGL fallback remains visible.
- Desktop 1440 and 1331, short desktop 1164, and mobile 390 widths were inspected;
  no horizontal overflow or browser exceptions. Geist typography was checked
  again after the user's correction.
- The mechanical design scan returned advisory token differences for the
  prototype's miniature artwork and scoped layout; the current page font and
  theme were normalized to the existing application design language.

No remote push or provider changes. The source prototype server on 3291 and
its generated next-env.d.ts worktree change were preserved.
