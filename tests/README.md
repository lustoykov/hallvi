# Server Guy testing

**Start here:** `npm run test:dashboard` → [local testing page](http://127.0.0.1:4317).

Run checks, see model usage/CI policy, inspect recent runs, and review saved Server Guy answers. Nothing runs just by opening it. Live agent evals and optional LLM judgments require explicit subscription-usage confirmation. Human reviews and LLM advice remain separate.

## Files

```text
tests/
├── *.test.ts(x)         Vitest: application and testing-tool rules
├── vitest.config.mjs    Ordinary tests only; excludes live evals
├── e2e/                Desktop Playwright tests, config and fixture launcher
├── browser-fixtures/   Synthetic Pi, GitHub and login adapters
├── evals/              Live Server Guy cases/checks/runner; saved-answer judge
├── dashboard/          Separate loopback-only Node server and static UI
└── results/            Private generated output; gitignored
    ├── runs/           Dashboard command history and bounded logs
    ├── browser-report/ Playwright HTML report
    ├── browser-artifacts/ Traces and screenshots
    └── evals/<run>/    results.json, review.md, reviews/*.json
```

The product's acceptance cases and dated verification evidence stay in the single [Phase 1 acceptance guide](../docs/testing/phase-one-acceptance.md). Implementation order stays in [ROADMAP.md](../ROADMAP.md). This file is an index, not another plan. Temporary fixture apps/databases are scratch state outside the repository; their results belong here. Do not commit private outputs or credentials.

## Commands

| Task | Command | Model calls |
| --- | --- | --- |
| Testing dashboard | `npm run test:dashboard` | None until explicit live start |
| Application/runner unit tests | `npm test` | None |
| Interactive Vitest | `npm run test:ui` | None |
| Two desktop smoke journeys | `npm run test:e2e:smoke` | None |
| Full desktop suite | `npm run test:e2e` | None |
| Interactive Playwright | `npm run test:e2e:ui` | None |
| Saved browser report | `npx playwright show-report tests/results/browser-report` | None |
| Eight real agent eval cases | `SERVER_GUY_LIVE_EVALS=1 npm run eval:pi` | ChatGPT subscription via configured Pi |
| Judge one saved answer | Dashboard → Review answers → Ask an LLM judge | Separate opt-in Pi session |

Install Chromium once with `npx playwright install chromium`. Desktop only. Browser scenarios launch disposable Next.js fixtures on 3180+, never use/reset the app on port 3000 and block external browser requests. Their synthetic model responses prove UI/state behavior, not model quality.

CI runs Vitest, lint, TypeScript, build and **two** browser smoke journeys. Full desktop coverage is manual through GitHub Actions' `full_browser_suite` option. Neither uses model credits; hosted CI uses Actions minutes. Real model evals and judgments remain local and opt-in. See the [workflow](../.github/workflows/checks.yml).
