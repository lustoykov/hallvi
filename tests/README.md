# Server Guy testing

**Start here:** `npm run test:dashboard` → [local testing page](http://127.0.0.1:4317).

Run checks, see model usage/CI policy, inspect recent runs, and review saved **live agent eval** answers. Nothing runs just by opening it. Live agent evals and LLM judgments use your subscription, so they start from one confirmation dialog; a live run judges its own answers when it finishes unless you untick that. Human verdicts and LLM judgments remain separate records.

- **Run checks:** the suite table shows each suite's scope, model usage, CI policy and its last recorded result. Recent runs list status, scope (selected journeys, cases × repetitions, or judged answers), commit, start time and duration; clicking a run expands its command and bounded output inline. A running check shows a live elapsed time and a Stop control.
- **Choose journeys:** opens a dialog beside the run action, without scrolling the page. Inspect descriptions and select any of nine desktop journeys (eight product journeys plus the dashboard). The shared catalog and exact test tags live in [e2e/journeys.ts](e2e/journeys.ts). Smoke still runs just two.
- **Choose live eval cases:** a dialog with expected behavior, exact inputs and 1–5 repetitions, defaulting to **one**. It shows `cases × repetitions = planned answers` before spending confirmation. Cancel preserves the selection. Saved-run counts are historical, not today's defaults; interrupted runs may have fewer answers.
- **Run case again…:** on an individual answer, runs that case **once** using the current code/case definition and confirmed model settings, even if the original run or picker used more repetitions. Creates a new saved run and never overwrites old answers/reviews; like any live run it is judged automatically afterwards unless you untick that in the confirmation. Also available when the case failed before replying; removed cases cannot be rerun.
- **Eval runs:** the topbar switches between **Run checks** (`/`) and **Eval runs** (`/evals`); the Eval runs link carries a count of answers needing attention, and **View saved runs** under Live agent evals opens the same page. Direct links, refresh, new tabs and browser Back/Forward work. In-page route changes preserve unsaved review drafts and selections. The sidebar lists runs (newest first, archived ones in a collapsed group) and the open run's answers; the main column shows one answer with Previous/Next and J/K navigation. Repetitions of a case sit together. **Run evals** generates answers and, by default, judges them as soon as the run finishes with the same model. The run header's **Judge** button covers older runs: it targets the answers the current judge policy has not judged yet, or everything again once all are judged.
- **Judge-first triage:** the **Attention** filter is the default: unjudged answers, failures and uncertain judgments. **Failed**, **Cleared**, **Reviewed** and **All** are the other filters, each with its count. The run header shows one bar of the whole run's triage plus a line such as “11 need attention · 4 LLM-cleared · 3 of 16 human-reviewed”. In the queue, not-judged answers show a quiet dot and every other status a labeled chip; the open answer shows one status line with its triage label and reason. Current-policy judge passes clear only with passing recorded code checks; missing evidence, errors and old-policy advice cannot clear an answer. A human pass is labeled separately; neither a model nor a human pass hides failed code checks. Triage is derived, never written over original results or human verdicts.
- **Spot-checking the judge:** open the **Cleared** filter now and then and grade a few answers yourself. Before trusting clearance, compare the judge with your own labels on a small representative set including known bad answers; uncertainty reported by the judge does not catch confidently wrong passes. See the [acceptance guide](../docs/testing/phase-one-acceptance.md#calibrating-the-judge).
- **Judging:** one control, **Judge** in the run header, labeled with what it will do (the answers the current policy has not judged, or everything again). It opens the same one-step confirmation (count, model/effort behind Change, Start). One isolated judgment per saved answer, sequentially; failure/timeout stops later judgments and keeps earlier verdicts. No human approval or app rerun.
- **Archive run / Restore run:** move the **entire open run** into or out of the sidebar's Archived runs group, independently of checked answers. Archived runs leave the pending count but stay readable and reviewable; new runs start active. Evidence and verdicts are untouched; archiving is not approval. Failed/empty runs can also be archived. The private `run-state.json` stores one boolean bound to the original results hash. No automatic age-based archiving.
- **Your verdict:** one click on **Pass**, **Fail** or **Discuss** (or the P / F / D keys) saves it and moves to the next answer in the queue. No name or reason is asked: the record carries your local username, and **Add a note** is optional. The button matching the saved **LLM judgment** carries a small LLM tag; the judgment never fills in or changes your verdict. The header's human-reviewed count never includes LLM clearance.
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
| Judge saved answers | Automatic after a dashboard live run; otherwise Eval runs → Judge in the run header | Separate opt-in Pi session per answer |

Install Chromium once with `npx playwright install chromium`. Desktop only. Browser scenarios launch disposable Next.js fixtures on 3180+, never use/reset the app on port 3000 and block external browser requests. Their synthetic model responses prove UI/state behavior, not model quality.

CI runs Vitest, lint, TypeScript, build and **two** browser smoke journeys. Full desktop coverage is manual through GitHub Actions' `full_browser_suite` option. Neither uses model credits; hosted CI uses Actions minutes. Real model evals and judgments remain local and opt-in. See the [workflow](../.github/workflows/checks.yml).
