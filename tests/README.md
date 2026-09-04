# Server Guy testing

**Start here:** `npm run test:dashboard` → [local testing page](http://127.0.0.1:4317).

Run checks, see model usage/CI policy, inspect recent runs, and review saved **live agent eval** answers. Nothing runs just by opening it. Live agent evals and optional LLM judgments require explicit subscription-usage confirmation. Human reviews and LLM advice remain separate.

- **Choose journeys:** opens a dialog beside the run action, without scrolling the page. Inspect descriptions and select any of nine desktop journeys (eight product journeys plus the dashboard). The shared catalog and exact test tags live in [e2e/journeys.ts](e2e/journeys.ts). Smoke still runs just two.
- **Choose live eval cases:** a dialog with expected behavior, exact inputs and 1–5 repetitions. It shows `cases × repetitions = planned answers` before spending confirmation. Cancel preserves the selection. Saved-run counts are historical, not today's defaults; interrupted runs may have fewer answers.
- **Review live eval answers:** grouped by **run**, newest first—not by case type. Open a run to see its flat answer list. Its checkbox (or **Select whole run**) selects all reviewable answers; a mixed checkbox means only some are selected. Individual and unreviewed selection are also available, scoped to one run at a time.
- **Judge selected:** prominent toolbar action; one click opens count/model/effort and spending confirmation. Changing the model resets consent. One isolated judgment per saved answer, sequentially; failure/timeout stops later judgments and keeps earlier verdicts. No human approval or app rerun. **Human verdict…** opens a separate shared-verdict form.
- **Archive run / Restore run:** move the **entire selected run** between Active runs and Archived runs, independently of checked answers. Old runs leave the active list and pending count; new runs start active. Evidence and verdicts are untouched; archiving is not approval. Failed/empty runs can also be archived. The private `run-state.json` stores one boolean bound to the original results hash. No automatic age-based archiving.
- **Review this answer:** your verdict and LLM advice appear alongside each other, with **Ask LLM for advice…** beside the shared heading. Reading advice never overwrites your verdict or unsaved draft. Requesting new advice still requires spending confirmation.
- Each new dashboard run records its shell-quoted command and explicit runner options with its output. Inherited environment variables and credentials are not recorded.

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
    └── evals/<run>/    results.json, review.md, reviews/*.json, run-state.json
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
| Judge saved answers | Dashboard → Review live eval answers → select a run's answers → Judge selected | Separate opt-in Pi session per answer |

Install Chromium once with `npx playwright install chromium`. Desktop only. Browser scenarios launch disposable Next.js fixtures on 3180+, never use/reset the app on port 3000 and block external browser requests. Their synthetic model responses prove UI/state behavior, not model quality.

CI runs Vitest, lint, TypeScript, build and **two** browser smoke journeys. Full desktop coverage is manual through GitHub Actions' `full_browser_suite` option. Neither uses model credits; hosted CI uses Actions minutes. Real model evals and judgments remain local and opt-in. See the [workflow](../.github/workflows/checks.yml).
