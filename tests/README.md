# Server Guy testing

**Start here:** `npm run test:dashboard` → [local testing page](http://127.0.0.1:4317).

Run checks, see model usage/CI policy, inspect recent runs, and review saved **live agent eval** answers. Nothing runs just by opening it. Live agent evals and optional LLM judgments require explicit subscription-usage confirmation. Human reviews and LLM advice remain separate.

- **Run checks:** the suite table shows each suite's scope, model usage, CI policy and its last recorded result. Recent runs list status, scope (selected journeys, cases × repetitions, or judged answers), commit, start time and duration; clicking a run expands its command and bounded output inline. A running check shows a live elapsed time and a Stop control.
- **Choose journeys:** opens a dialog beside the run action, without scrolling the page. Inspect descriptions and select any of nine desktop journeys (eight product journeys plus the dashboard). The shared catalog and exact test tags live in [e2e/journeys.ts](e2e/journeys.ts). Smoke still runs just two.
- **Choose live eval cases:** a dialog with expected behavior, exact inputs and 1–5 repetitions, defaulting to **one**. It shows `cases × repetitions = planned answers` before spending confirmation. Cancel preserves the selection. Saved-run counts are historical, not today's defaults; interrupted runs may have fewer answers.
- **Run case again…:** on an individual answer, runs that case **once** using the current code/case definition and confirmed model settings, even if the original run or picker used more repetitions. Creates a new saved run, never overwrites old answers/reviews and never judges automatically. Also available when the case failed before replying; removed cases cannot be rerun. Requires fresh subscription confirmation.
- **View saved runs:** links from **Live agent evals** to `/evals`; `/` is Run checks. Direct links, refresh, new tabs and browser Back/Forward work. In-page route changes preserve unsaved review drafts and selections. The fully expanded sidebar lists runs (newest first, archived ones in a collapsed group) and the open run's answers. The main column shows one answer with Previous/Next and J/K navigation. Repetitions of a case sit together. **Run evals** only generates answers; **Judge run…** separately grades every saved input/answer pair in that run, independent of the display filter. No automatic chaining.
- **Judge-first triage:** **Needs attention** is the default: unjudged answers, failures and uncertain judgments. **Failures**, **LLM-cleared**, **Human reviewed** and **All** are separate filters. Current-policy judge passes clear only with passing recorded code checks; missing evidence, errors and old-policy advice cannot clear an answer. A human pass is labeled separately; neither a model nor a human pass hides failed code checks. Triage is derived, never written over original results or human verdicts.
- **Spot-check a cleared answer:** opens one random LLM-cleared answer without grading or changing it. Before trusting the judge, compare its judgments with human labels on a small representative set including known bad answers. Keep spot-checking afterwards: uncertainty reported by the judge does not catch confidently wrong passes. See the [acceptance guide](../docs/testing/phase-one-acceptance.md#calibrating-the-judge).
- **Selection toolbar:** floats at the bottom while answers are selected. **Judge selected (N)…** opens count/model/effort and spending confirmation; changing the model resets consent. **Judge answer…** (or **Judge again…**) is also available on every answer. One isolated judgment per saved answer, sequentially; failure/timeout stops later judgments and keeps earlier verdicts. Existing judgments in the selection are rerun only after this confirmation. No human approval or app rerun. **Set human verdict (N)…** opens a shared-verdict dialog.
- **Archive run / Restore run:** move the **entire open run** into or out of the sidebar's Archived runs group, independently of checked answers. Archived runs leave the pending count but stay readable and reviewable; new runs start active. Evidence and verdicts are untouched; archiving is not approval. Failed/empty runs can also be archived. The private `run-state.json` stores one boolean bound to the original results hash. No automatic age-based archiving.
- **Your verdict:** set your name once under **Reviewing as**; each answer takes an explicit Pass / Fail / Needs discussion choice and a reason (⌘↩ saves). Saved **LLM judgment** sits above the form. Reading advice never overwrites your verdict or unsaved draft, and requesting a judgment still requires spending confirmation. The progress bar counts human reviews only; the separate triage summary counts clearance, failures and attention.
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
| Judge saved answers | Live agent evals → View saved runs → Judge run / Judge answer / Judge selected | Separate opt-in Pi session per answer |

Install Chromium once with `npx playwright install chromium`. Desktop only. Browser scenarios launch disposable Next.js fixtures on 3180+, never use/reset the app on port 3000 and block external browser requests. Their synthetic model responses prove UI/state behavior, not model quality.

CI runs Vitest, lint, TypeScript, build and **two** browser smoke journeys. Full desktop coverage is manual through GitHub Actions' `full_browser_suite` option. Neither uses model credits; hosted CI uses Actions minutes. Real model evals and judgments remain local and opt-in. See the [workflow](../.github/workflows/checks.yml).
