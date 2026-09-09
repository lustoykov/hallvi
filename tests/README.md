# Testing Server Guy

Run `npm run test:dashboard` and open <http://127.0.0.1:4317> to launch suites, inspect recorded runs and review saved model answers. Opening the dashboard runs nothing. It is a separate local developer tool, not the product UI.

[Current acceptance](../docs/testing/README.md) connects journeys, compatibility targets and dated evidence. The [archived phase casebook](../docs/archive/implementation/phase-one-acceptance.md) preserves regression rubrics and older results. [Roadmap](../ROADMAP.md) alone owns implementation order.

## Suites and files

| Location | What it verifies | Limit |
| --- | --- | --- |
| `application/unit/`, `application/integration/` | Rules, routes/components and SQLite/filesystem/HTTP boundaries. | External services/model responses are mocked unless a test explicitly opts in. |
| `browser/`, `browser-fixtures/` | Real product routes and UI with disposable synthetic providers. | UI/state correctness, not live provider or model behavior. |
| `fixtures/` | Shared synthetic repositories and scripted contract inputs. | Not the private real application's layout. |
| `evals/` | Real Pi judgments against synthetic application/history cases; optional saved-answer judge. | Automated checks do not replace human semantic review. |
| `dashboard/` | Local runner/review UI. | No production application state or credentials should be committed with it. |
| `results/` | Private generated run logs, browser reports, answers and reviews. | Gitignored evidence; historical results apply to their recorded candidate. |

The browser group/tag source is [browser/journeys.ts](browser/journeys.ts). Smoke includes the application shell/deployment flow, application creation and settings; use the catalog rather than a hardcoded count in another document. Full coverage is broader than the smoke subset.

## Commands

| Task | Command |
| --- | --- |
| Application unit/integration suite | `npm test` |
| Interactive Vitest | `npm run test:ui` |
| Browser smoke | `npm run test:e2e:smoke` |
| Full browser suite | `npm run test:e2e` |
| Interactive Playwright | `npm run test:e2e:ui` |
| Saved browser report | `npx playwright show-report tests/results/browser-report` |
| Testing dashboard | `npm run test:dashboard` |
| Real Pi evals, explicit opt-in | `SERVER_GUY_LIVE_EVALS=1 npm run eval:pi` |
| Real local Docker executor, explicit opt-in | `SERVER_GUY_DOCKER_TESTS=1 npm test -- tests/application/integration/conformance-executor.docker.test.ts` |

Install Chromium with `npx playwright install chromium`. Browser scenarios use disposable fixtures on 3180+ and block external browser requests; do not point fixture resets at the real app. The Docker opt-in requires a reachable engine and downloads images/packages. Neither synthetic browser tests nor ordinary application tests use model credits.

Select a browser group with `npm run test:e2e -- --grep @journey-github-connection`. For model cases, set `PI_EVAL_CASES` to comma-separated case IDs, or use the dashboard picker. The CLI defaults to all cases when that filter is absent; inspect the case list before starting a live run.

## Model answers and review

Live evals use the configured ChatGPT subscription through Pi. The dashboard shows the selected cases/repetitions and asks before starting model work. It selects unattempted cases by default; rerunning a case creates new evidence instead of replacing earlier answers.

A dashboard live run can automatically judge its saved answers when selected at confirmation. Judging saved answers also makes model calls. Human verdicts and model judgments remain separate. Judge-first triage cannot clear failed code checks, missing evidence or old-policy judgments; spot-check model-cleared answers against human labels. See [judge calibration](../docs/archive/implementation/phase-one-acceptance.md#calibrating-the-judge).

Run history records candidate, scope, command, timing and bounded output. Archive/restore changes visibility, not verdicts. Keep saved reports and reviews private; temporary eval databases/native sessions are disposable. Detailed UI behavior lives in the [testing design reference](dashboard/DESIGN.md).

## CI and acceptance

The [workflow](../.github/workflows/checks.yml) runs application tests, lint/format, TypeScript, build and the tagged browser smoke subset. Manual workflow dispatch can enable `full_browser_suite`. Real model evals and judgments stay local and opt-in; hosted CI uses Actions minutes.

Phase-era fixtures still exercise provenance, preparation and local verification. Their names do not prescribe the new UI or limit packaged-software scope. When replacing legacy behavior, preserve or explicitly retire its relevant acceptance expectations. Run affected checks on the final candidate; a saved passing result is not a current full-suite pass.
