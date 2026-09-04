# Phase 1 acceptance: repeatable desktop journeys

Status: maintained acceptance contract and test plan, 2026-09-04. This is the single testing guide for Phase 1. Vitest, checked-in desktop Playwright journeys, an opt-in real-Pi casebook and a local testing dashboard run today. Automated eval checks do not imply human-reviewed model quality or complete Phase 1 acceptance. All executable testing code, runner configurations and generated reports live under [tests/](../../tests/README.md).

This guide owns acceptance cases, test/eval procedures, and dated verification evidence. The [journey](../user-journeys/01-application-launch.md) owns expected product behavior; the [roadmap](../../ROADMAP.md) owns development order and implementation status. Failures found here become linked roadmap work, not a competing build plan.

## What “done” means

Acceptance is observable evidence that an engineer can complete a workflow and recover from its expected failures. It is not just a green test count or a model saying that work is complete.

There are two different completion claims:

- **An application's Launch Brief is ready:** its four current checks pass: recorded identity, readable repository at a recorded commit, explicit target environment, and explicit permission policy. This does not mean the application is deployed.
- **Phase 1 product work is complete:** the current journey below passes, plus the explicit GitHub connection and durable-request follow-ups in the [roadmap](../../ROADMAP.md#phase-1-implementation-backlog) pass their acceptance cases. Those follow-ups are still pending. Do not treat the four checks as evidence that the entire product phase is done.

Desktop only. Do not add mobile checks unless the user changes the project scope.

## Current entry points and setup rules

| Entry | Expected behavior |
| --- | --- |
| `/` | Redirects to `/applications`, never automatically selects the newest application. |
| `/applications` | Lists application/repository identity, target and passing-check count; empty state offers Add application. |
| `/applications/new` | Blank HTTPS/SSH GitHub repository input and explicit permission policy, initially Pi decides. Success opens the returned workspace. |
| `/applications/[applicationId]` | Selected application's chats/checks; application-name menu provides switching, adding and confirmed removal. Unknown or removed identity returns 404, never another app. |
| `/setup/pi` | Settings: account first, model/effort, then View applications. Changed preferences save before navigation. Storage & privacy opens technical details. |

Pi configuration is installation-wide; chats, Decisions, Observations and checks are application-scoped. Switching applications clears transient drafts, drawers, errors and busy state. Production is a target, not evidence of deployment. Prototype A is the real setup screen; no variant parameter or demo controls are required.

Reuse must import the detected model/effort with explicit consent. Separate sign-in preserves the draft selection and writes a new attempt-specific credential file. Only successful login activates it by atomically replacing Server Guy's configuration pointer; cancellation/failure leaves the old login and preferences intact. Existing accepted credentials remain available to in-flight turns. Global Pi model preferences are never overwritten; unrelated tools/extensions/instructions are never imported. Reading saved credentials does not prove live provider access.

Technical help must accurately explain credential paths, shared versus separate storage, owner-only permissions for new files, lack of application-level token encryption, and the distinction between the server machine and the browser device. Keep these details out of repeated main-card copy.

## Test layers and tooling

| Layer | Tool | What it proves |
| --- | --- | --- |
| Schemas, domain rules, transactions, login coordination | Existing Vitest | Deterministic rules, isolation, atomic writes, cancellation and failure handling. |
| Browser journey through real routes and SQLite | `npm run test:e2e`, Playwright Test | Forms, navigation, dialogs, visible errors, keyboard behavior, reload and recovery. External Pi/GitHub calls use deterministic fixtures. |
| Real Pi behavior | Opt-in `npm run eval:pi`, using existing Vitest and the actual Pi adapter | Exact proposal/state assertions plus a separate human meaning review. A synthetic fixture cannot prove real model behavior. |
| Meaning of a saved Server Guy answer | Human review; optional opt-in LLM judge | Rubric-based semantic review. LLM advice never changes automatic results, application state, or human sign-off. |

Playwright provides [fixtures](https://playwright.dev/docs/test-fixtures), isolated [browser contexts](https://playwright.dev/docs/browser-contexts), and [failure traces](https://playwright.dev/docs/trace-viewer). Next.js also recommends E2E testing for [async Server Components](https://nextjs.org/docs/app/guides/testing). This fits our server-rendered entry pages and multi-screen workflow.

Use Vitest + Playwright Test with the small casebook, not an additional evaluation platform or workflow engine. The local dashboard only launches fixed commands and reads/writes private result artifacts. It is not part of the production Next.js application.

## Current journey contract

Each case needs assertions about both what the engineer sees and the resulting state. Expected errors are successful tests only when recovery and unchanged data are also checked.

| ID | Steps | Required result |
| --- | --- | --- |
| P1-01 Fresh setup | Open Settings without Server Guy configuration, with and without a reusable Pi login; repeat with broken saved configuration or missing credentials. | Discovery is automatic and read-only. Reuse requires explicit consent; otherwise Connect ChatGPT is offered. No OAuth access/refresh tokens appear in page data (a device code during explicit sign-in is intentional). Chat stays unavailable until setup succeeds. |
| P1-02 Account setup | Complete, cancel, reject, and expire device-code login; repeat when replacing a saved connection. | Success activates the chosen login. Cancel/failure preserves the old connection. Late completion cannot revive a cancelled attempt. Retryable errors leave recovery controls available. |
| P1-03 Preferences | Choose a supported model/effort, save, reload, and send. Try unavailable model and quota/auth failures. | Preferences persist only in Server Guy. Unsupported choices are rejected; provider failures are visible and never silently change provider or billing mode. “Login saved” is not a claim that provider access was tested. |
| P1-04 Add application | Home → Applications → Add application. Supply HTTPS/SSH repository and a permission policy. Try invalid URL, unreadable repository and duplicate with a conflicting policy. | Valid creation opens the exact new workspace. Invalid input remains editable. Failed access is represented by a failed check, not a false pass. Policy conflict preserves the existing record. Creation does not deploy or modify the repository. |
| P1-05 Isolation | Add two applications; send a distinct message/Decision in each; switch, reload, and open a second chat. | Application records never leak across applications. Chats share application Decisions but retain separate transcripts. Switching clears unsent composer text and open drawers. |
| P1-06 Decisions | State an explicit launch priority; revise it using an existing Decision; also send an ordinary greeting. | Explicit priority/revision has the correct source-message provenance and supersession. Greeting creates no invented Decision. Visible reply agrees with accepted machine-readable proposals. |
| P1-07 Failure atomicity | Trigger provider failure, malformed proposal, unsupported kind, or fabricated replacement ID; retry when appropriate. | No partial successful turn: user/assistant messages and accepted Decisions commit together only after the turn passes validation. Existing records remain unchanged; the UI preserves a usable retry path. |
| P1-08 Evidence | Inspect repository check details; fail inspection, then rerun successfully. Inspect other record tabs and reopen the page. | Check status follows stored evidence, with source/identity/time inspectable. A newer failed check must not leave an obsolete pass in force. Pending later-phase requirements are not presented as completed deployment. |
| P1-09 Fresh application state | App-name menu → Remove application. Cancel, try wrong confirmation, then confirm the exact owner/name on disposable data. Add that repository again. | Cancel/wrong confirmation changes nothing. Only that application's records are removed; other apps and login are preserved. Re-adding gets new IDs and no old chats/Decisions. Late results tied to old IDs cannot refill the fresh application. |
| P1-10 Disconnect | Settings → Disconnect. Cancel, then confirm on disposable configuration; reload and attempt a new message. | New Pi turns require setup again. All applications/chats and credential files remain. Pending login attempts are cancelled. Read-only discovery may still find a login but cannot adopt it automatically. An already-running turn may finish. |
| P1-11 Desktop usability | Complete the main path with keyboard; open help/menu/dialog, Escape/Cancel, and inspect busy/error states. | Named controls, visible focus, modal focus containment, sensible focus restoration, no unintended submission or navigation, no unexpected console errors. Storage details are behind Storage & privacy, not repeated prose on the form. |
| P1-12 Chat lifecycle | Create a secondary chat, send, archive, reopen and reload it; inspect the primary chat. | Archived chat stays readable but cannot accept messages. The primary chat has no archive action. History and shared Decisions remain intact. |
| P1-13 Slow actions and navigation | Double-press Enter during a slow send; type a new draft while the response is pending. Start slow repository creation and leave the form. | One submission produces one user/assistant pair. New draft survives completion. Leaving creation is navigation, not cancellation: creation may finish, but must not redirect the engineer away from their new location. |
| P1-14 Check drawer and record tabs | Open each check; navigate Record/Activity/Changes/Receipts; close via X, Escape and backdrop; choose Ask Pi. | Correct evidence and history; no invented external changes. Modal contains focus and restores it on close. Ask Pi closes the drawer, prefills and focuses the composer. |
| P1-15 Login transport and late callbacks | Interrupt an attempt-status poll then restore it; return 404 for a missing attempt; cancel before a late callback; simulate SDK post-write synchronization failure. | Transient failure retries with Cancel available; 404 is terminal. Late callbacks cannot revive cancellation. A saved login plus local sync failure is distinguished from failed OAuth, without serializing the credential-bearing error. |
| P1-16 Model/runtime boundary | Reuse non-default supported model/effort; change away from a Max-capable model; tamper with saved provider/effort/API credentials; inspect already-running versus new turn configuration. | Reuse uses detected settings, invalid combinations are rejected or reset visibly, and new turns use saved preferences while in-flight turns keep their snapshot. API-key/other-provider fallback is rejected before provider authentication. |

P1-06 has two layers: deterministic fixture tests prove persistence/UI plumbing; live Pi cases prove model behavior. Do not substitute one for the other.

## Reset and disconnect: deliberately separate

**Start an application from scratch:** open its name in the workspace header, choose **Remove application…**, type the displayed `owner/name`, and confirm. Removal is permanent; it is not chat archival and has no undo. Re-add the same repository in the form that opens afterward. Its GitHub repository, all other applications and installation-wide login are untouched.

**Disconnect ChatGPT from Server Guy:** open **Settings → Disconnect**. This removes `pi-settings.json` (the saved consent/connection/model selection) and cancels pending sign-in attempts. It does **not** delete accepted OAuth files, revoke provider tokens, sign out ChatGPT/Pi, or clear application records. Shared Pi login files must never be deleted by this control. Reconnecting requires another explicit choice.

No “nuke everything” browser endpoint is needed. For repeated automated runs, use isolated temporary databases/configuration instead of clearing the user's working installation.

## Run today's checks

The easiest entry point is:

```sh
npm run test:dashboard
```

Open **http://127.0.0.1:4317**. Nothing runs automatically. **Run checks** shows each suite's scope, model usage, CI policy, recent runs and bounded logs. **Review live eval answers** opens existing saved evals without rerunning Server Guy. **Where everything lives** is the file index. The page binds to loopback only, rejects foreign Host/Origin requests, requires same-origin JSON and a per-process token for controls, and runs one allowlisted command at a time. Do not expose it through a tunnel. Live SDK logs are deliberately not retained because they can contain sensitive diagnostics.

CLI alternatives, from the repository:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run test:e2e:smoke
npm run test:e2e
# Interactive runner UIs:
npm run test:ui
npm run test:e2e:ui
```

Install Chromium once after `npm ci`: `npx playwright install chromium`. On Linux CI use `npx playwright install --with-deps chromium`. The dashboard and runner UIs require no model calls just to open or inspect saved output.

Start a disposable desktop fixture in another terminal:

```sh
node tests/e2e/qa-fixture.mjs 3112 success fresh
```

Open `http://127.0.0.1:3112/`. Each invocation creates a new temporary app copy, SQLite database and Pi/config directories. It does not copy `.server-guy`, `.env` or user credentials. The startup output names those directories. Stop with Ctrl+C; temporary files are retained for diagnosis. Use another free port from 3100–3999 for a separate run, never the user's port 3000.

Options: `success`/`failure` chooses synthetic OAuth outcome; `fresh`/`ready` chooses starting configuration. These replace OAuth routes: real coordinator races are covered by the Vitest tests, not this simulated login UI.

Useful fixture inputs:

| Input | Scenario |
| --- | --- |
| `https://github.com/qa/example` | Synthetic readable repository; no GitHub write. |
| Repository name containing `missing`, `offline`, or `recovering` | Access failure, network failure, or first-check failure followed by recovery. |
| Repository name containing `slow-create` | Slow creation; leaving the form must not trigger late navigation. |
| `priority: Fast recovery matters most` | A synthetic typed Decision proposal. |
| `replace-priority: Simplicity matters most` | A synthetic replacement proposal. |
| `invalid-replacement: test` | Invalid replacement must reject the turn. |
| Message containing `[fail-once]` or `[slow]` | Recoverable provider error or a delayed turn. |

The synthetic Pi adapter bypasses real provider authentication and generation. Use real-adapter Vitest tests for configuration enforcement; use opt-in live checks for actual provider behavior. Browser success alone is not enough.

## How to run an agent audit

Split independent agents by account/setup (P1-01–03, P1-10–11, P1-15–16), application/chat journeys (P1-04–09, P1-11–14), and server/transaction invariants (cross-check both). Each browser agent owns its own fixture port, server/config/database and tabs; never reset shared port 3000, read real credentials, call live providers, or run schema push against the user's database.

Report each case as **passed**, **failed**, **partial**, **blocked**, or **not run**, with concrete steps, expected/observed result, source locations where relevant, and the evidence layer: browser, HTTP, unit test, source-only, or live provider. Capture and inspect screenshots for meaningful UI states/findings. A fixture limitation is not a product failure; a mocked success is not evidence of provider correctness. Do not inherit a pass from an old report. Keep the latest run summary here and detailed disposable evidence outside this maintained docs folder.

This workflow authorizes audit/test work, not unrelated product fixes or new dependencies. Record reproducible defects for the next implementation pass. Automated browser submission of destructive actions must follow the active tool's confirmation policy; if blocked, test the UI up to confirmation and report API/domain coverage separately.

## Desktop automation and CI policy

The [checked-in desktop suite](../../tests/e2e/phase-one.spec.ts) has eight application scenarios, plus a [dashboard review scenario](../../tests/e2e/dashboard.spec.ts). These cover selected branches of the contract, not every branch of all sixteen cases. Fresh setup/device-code variants, further evidence/chat-lifecycle paths and the complete keyboard audit remain broader acceptance work.

The dashboard's **Choose journeys** dialog describes each scenario and runs only the selected stable tags from [the shared catalog](../../tests/e2e/journeys.ts), without scrolling away from the suite table. Empty, duplicate and unknown selections are rejected. Browser smoke remains the two tagged smoke journeys; selecting a local subset does not change CI.

- One Chromium worker, desktop 1440 × 1000, no automatic test retries. Each application-suite worker owns a disposable app/database/configuration; scenarios use distinct repository identities and restore synthetic model preferences. Contexts isolate browser state; they do not by themselves isolate SQLite.
- Tests assert UI behavior and saved state: priority provenance, exact replacement, provider retry recovery, application isolation, typed removal confirmation, disconnect/reuse and double-send handling. Accessible labels/roles are preferred over coordinates or generated-prose snapshots.
- Reports live in `tests/results/browser-report/`; traces and screenshots in `tests/results/browser-artifacts/`. Open a saved report with `npx playwright show-report tests/results/browser-report`. Do not upload real OAuth codes/tokens, account details, or private transcripts.

| Trigger | Checks | Model usage |
| --- | --- | --- |
| Every PR / push to main | Vitest, lint, TypeScript, production build, **two** browser smoke journeys | None; GitHub-hosted runners consume Actions minutes, not Codex/Pi credits. |
| Manual GitHub Actions run with full suite selected | Above plus all desktop scenarios instead of smoke | None; synthetic adapters only. |
| Local explicit start | Selected real Server Guy agent eval cases or selected saved-answer LLM judgments | Uses configured ChatGPT subscription; never silently falls back to API billing. |

The [workflow](../../.github/workflows/checks.yml) uploads only synthetic browser failure artifacts, retained seven days. Live evals and judge results are never uploaded by this workflow. Workflow configuration is not proof of a successful hosted CI run.

## Real Pi casebook and remaining Phase 1 gates

The runnable [casebook](../../tests/evals/phase-one-cases.ts) contains eight fixed inputs and meaning rubrics: greeting, explicit priority, question versus commitment, hypothetical, exact revision, unresolved conflict, same-message retraction, and quoted untrusted instructions. This is a small regression set, not a broad reliability benchmark.

```sh
# Eight real Pi turns using your saved Server Guy model/effort and subscription.
SERVER_GUY_LIVE_EVALS=1 npm run eval:pi

# Repeat each case to expose variation: 16 turns, sequentially.
SERVER_GUY_LIVE_EVALS=1 PI_EVAL_REPEATS=2 npm run eval:pi

# Only two cases, once each. The dashboard also offers this selection.
SERVER_GUY_LIVE_EVALS=1 PI_EVAL_CASES=greeting,hypothetical npm run eval:pi

# Run just one case again, once, as a new saved run.
SERVER_GUY_LIVE_EVALS=1 PI_EVAL_CASES=greeting npm run eval:pi
```

Without opt-in, the command fails before running the suite. Repeats default to one and are limited to 1–5 (8–40 turns with all eight cases selected). Unknown, duplicate or empty case selections fail before provider work. The dashboard shows selected cases × repetitions before spending confirmation. A turn may involve multiple model requests because of tool calls. `npm test` never discovers the `.eval.ts` file and never calls the provider. No additional eval library or API key is needed.

The [runner](../../tests/evals/phase-one.eval.ts) seeds a private temporary SQLite database, snapshots the saved model preferences and invokes the real `sendChatMessage → askPi → SQLite transaction` path. It does not read your existing applications/transcripts or contact GitHub. The configured credential file remains the auth source; normal Pi OAuth refresh may update it. Credentials are not copied into temporary configuration or reports. The runner does not retry cases or change models/billing; a Pi runtime/provider failure stops later turns. **Pi's existing internal retries remain active in the actual application adapter**, so tool calls and retries can produce multiple requests per turn. Eight cases does not mean eight requests.

Each run creates a git-ignored `tests/results/evals/<run>/results.json` and `review.md`: fixed inputs, current context, accepted tool proposals, resulting records, timings, model/effort, Pi version, commit/dirty flag and source hashes. It records accepted proposals, not a full SDK trace. Temporary state remains for diagnosis. Never publish results containing real private data.

The [exact checks](../../tests/evals/check-phase-one.ts) verify proposal count, supported shape, replacement IDs, source-message provenance, one persisted message pair and supersession. Meaning is assessed separately against each case's rubric, using optional judge-first triage and human review. Exit code zero means the automated checks passed, not that the model is semantically correct or the phase complete. LLM clearance is not human sign-off. Open **Live agent evals → View saved runs** to judge answers or save human pass/fail/needs-discussion with your name and reason. Do not assert exact generated wording.

The answer card's **Run case again…** starts only that current case, once, after confirming model/effort and subscription usage. It uses today's code and case definition, not a replay of historical saved input. Each start creates a new run; old answers and reviews remain unchanged. A failed case can be rerun even without a saved reply. Removed case IDs stay readable but cannot be rerun. This does not invoke the judge.

### Reviewing saved output, with optional judge-first triage

Choose a saved run and case. Read its original rubric, engineer message, answer, proposals and before/after state. Human reviews append private JSON records in `tests/results/evals/<run>/reviews/`. They never rewrite `results.json` or the original `review.md`. Correcting a verdict appends another record; the dashboard shows the latest. A source-data hash prevents attaching a review to changed results. Existing handwritten notes in `review.md` or `assistant-review.md` are not automatically imported as human approval.

The topbar switches between **Run checks** (`/`) and **Eval runs** (`/evals`); the Eval runs link shows how many answers need attention, and **View saved runs** under Live agent evals opens the same page. Both routes support direct entry, reload, new tabs and browser Back/Forward. Navigating between them in the same page preserves in-memory review drafts and selection; reloading still requires saving a verdict first.

The review page contains **live agent eval answers, not browser test output**. The run header reports the saved run's case/repetition plan separately from actual saved answers (the historical eight-case, two-repeat baseline has sixteen answers), one bar of the run's triage (failures, needs review, not judged, LLM-cleared, human pass) with a text line counting answers needing attention, LLM clearance and human reviews, and, for multi-repetition runs, a note that each case was answered N times from a fresh application. Missing historical repetition metadata is shown as not recorded, never filled from current defaults.

The fully expanded sidebar lists runs newest first (archived runs in a collapsed group) and the open run's answer queue; the main column shows one answer at a time with Previous/Next and J/K; saving a verdict advances to the next row. Repetitions sit together. **Attention** defaults to unjudged answers, failures and uncertain judgments; **Failed**, **Cleared**, **Reviewed** and **All** provide other views, each with its count. Not-judged answers show a quiet dot in the queue and other statuses a labeled chip; the open answer shows one status line with its triage label and reason. Verdicts are per answer: **Pass**, **Fail** or **Discuss** (P / F / D) saves with one click and no dialog; no name or reason is required (the record carries the local username, and a note is optional). The bulk endpoint still validates every answer/hash before writing and reports partial storage failure honestly, but the page has no bulk selection. All earlier verdicts remain in append-only history.

Triage is derived from immutable source results and the latest matching reviews, not stored as an extra approval record. A failed automatic outcome, an individual failed check or a saved error is always a failure, even if a human or model says pass. Otherwise the latest human verdict takes precedence. A current-policy LLM pass clears only an answer with saved input/reply and nonempty passing code checks. A model failure stays in Failures; uncertainty/missing evidence needs review. Old prompt-version judgments remain readable but cannot clear answers under the new policy. The header's human-reviewed count never includes LLM clearance; where both a human verdict and a current-policy judgment exist, the header counts how often the judge agreed and the answer's status line says whether it did. **Judge** in the run header targets every answer without a current-policy judgment, including ones you already graded, so calibration pairs keep accumulating. The **Cleared** filter is where you spot-check the judge; opening an answer never changes it.

**Archive run** moves the entire open run into the sidebar's Archived runs group and out of the awaiting-review count, regardless of answer selection; it stays readable there and **Restore run** returns it. New runs start active; no old run is archived automatically. Evidence and verdicts are untouched. Private `run-state.json` stores a hash-bound `archived` boolean, not a second audit log. Corrupt/unsafe metadata leaves the run visible with a warning and blocks writes; changed source hashes invalidate old archival state. Failed and empty runs are archivable; individual answers are no longer archived. Archived answers stay readable and reviewable. The earlier prototype's per-answer `archive.json` files are neither read nor deleted.

A live run started from the dashboard judges its saved answers automatically when it finishes, with the same model and effort, unless **Judge the answers automatically when the run finishes** is unticked in the run confirmation. For older runs, click **Judge** in the run header (it targets the answers the current policy has not judged, or everything again once all are judged), or **Judge this answer…** in the open answer's judgment section to judge one repetition. The judge is strict about rubric evidence, not stylistic nitpicking: pass requires every applicable criterion, fail must name a concrete violation, and insufficient/ambiguous evidence requires needs-discussion. The judge receives the saved rubric, input, answer, automatic checks/outcome/error and before/after state, not today's casebook or prior reviewers' opinions. The adapter independently prevents a model pass from overriding failed/missing automatic evidence. It uses an isolated Pi session with only constrained `submit_judgment`, no application/file/browser tools, no imported instructions/extensions, and no session/provider retries. Judgments append with model/effort, Pi version, prompt version and source hash; they never rewrite original output or human verdicts. Isolation prevents tool side effects, not rating bias or prompt-injection influence. Operational runner success is not semantic acceptance.

**Judge** in the run header grades the open run's unjudged saved input/answer pairs, independent of the current filter; answers that never existed cannot be judged. It shows the exact count, the model/effort that will be used (Change to edit) and keys/limits before a single Start click; once everything is judged it judges everything again, with earlier judgments preserved. The entire selection is validated before authentication, then judged sequentially in fresh sessions. First runner failure, cancellation or the 15-minute limit stops later work; saved judgments remain. A semantic fail is a valid judgment, not a runner failure. No durable queue or retries are added. The CLI keeps `PI_JUDGE_CASES` and the previous single `PI_JUDGE_CASE` option.

Generating answers and judging them are separate runner processes and separate saved records, but one confirmation covers both: the automatic judge run after a live eval uses the settings shown in that dialog, and the dashboard's run log records when it started or why it could not. The live runner refuses settings changed after confirmation. Opening and reading reports spends nothing. Stop cannot refund sent requests. The CLI judge still requires `SERVER_GUY_LIVE_JUDGE=1` and an exact saved run/hash/case selection. No live judge-quality claim is made until an explicitly approved provider run is recorded.

### Calibrating the judge

Before relying on LLM clearance, label a small representative set yourself: clear passes, real failures, borderline cases, fabricated consent and missing evidence. Then judge those same saved answers without exposing your verdict to the model. Compare disagreements, especially **human fail / model pass**; fix the rubric or judge prompt and bump its version rather than forcing agreement through case-specific instructions. Recheck on held-out examples. The existing synthetic runner/UI tests verify this machinery, not the judge's real accuracy.

Once agreement is useful, prioritize failures and uncertainty, and periodically open **Cleared** to spot-check a few answers yourself. Uncertainty alone is not a safety net: a judge may be confidently wrong. Save human corrections and add missed failures to future regression cases. This follows [OpenAI's guidance to validate judges against human labels](https://developers.openai.com/api/docs/guides/evaluation-best-practices#llm-as-a-judge-and-model-graders). There is no calibrated accuracy claim, confidence threshold, automatic archive or automatic human sign-off.

For each later phase, define cases before implementation, run them as the real behavior becomes available, and rerun relevant earlier cases before acceptance. Add observed failures as regressions. Do not prebuild eval machinery for unimplemented phases; UI/login/database behavior still belongs in ordinary application tests.

Live account checks are opt-in, user-approved and use the configured Pi runtime/subscription. Record model ID, effort, prompt version, inputs, tool proposals, resulting records and semantic pass/fail reason, never OAuth secrets. Check ordinary chat, explicit priority, valid revision, conflicting/retracted instructions, injected repository text and provider rejection. Judge whether the response agrees with the accepted Decision, not whether it matches one exact sentence. Label human judgments as human-reviewed; do not let another model's rating be the sole authority for state correctness.

Before declaring the complete Phase 1 follow-up sequence done, also prove:

- **GitHub connection:** explicit authorization/reuse consent; denied/cancelled login; missing scope; revoked/expired credentials; inaccessible private repo; exact repository identity and permissions recorded.
- **Durable requests:** queueing, duplicate delivery, client disconnect/reconnect, timeout, cancellation, worker crash/restart and state reconstruction. No blind retry of potentially completed external effects. These cases become executable when the worker is implemented; they do not pass today.

Deployment, infrastructure provisioning, monitoring automations, and Phase 2 work remain outside this Phase 1 acceptance contract. Workflow DevKit is still a later complexity-triggered choice, not a test runner.

## Latest verification

**2026-09-04 — one-click review and automatic judging:** 266 Vitest tests passed (the new dashboard tests cover reviewer-less verdicts and the automatic judge run after a live eval); the desktop dashboard journey passed (5.6 seconds) covering the single-step run and judge confirmations, one-click and keyboard verdicts with auto-advance, optional notes, bulk Pass/Fail, judging unjudged answers by default, archive/restore and the 16-answer queue. Lint and TypeScript passed. `tests/journey-catalog.test.ts` fails only because two additional `@journey-dashboard` spec files were added concurrently outside this change. Synthetic saved data only; no live model calls.

**2026-09-04 — declutter pass on Eval runs and Run checks:** 263 Vitest tests in 21 files passed; the desktop dashboard journey passed (6.3 seconds) covering topbar page navigation, the single triage status line, sidebar filter counts, the run-level triage bar text, spot-check, judge/rerun confirmations, bulk verdicts, archive/restore and the 16-answer queue. Lint and TypeScript passed. Synthetic saved data only; no live model calls or mobile checks.

**2026-09-04 — separate eval route, single-case reruns and judge-first triage:** 263 Vitest tests passed; the focused desktop dashboard journey passed (6.1 seconds). Coverage includes direct `/evals` entry and reload, browser Back/Forward, draft/selection preservation across routes, one-repetition defaults, one-case rerun consent without judging, current-policy triage, hard-check precedence and human correction of a cleared answer. Lint, TypeScript and diff checks passed. The live dashboard was refreshed and visually checked; the existing sixteen-answer run and its review were unchanged. No live model calls or mobile testing; judge accuracy is not established by these synthetic checks.

**2026-09-04 — desktop visual consistency pass:** 250 Vitest tests passed; the focused dashboard browser journey passed after preserving the review redesign and correcting table-cell alignment, review-only bulk toolbar visibility, expanded page-scrolling answer lists, status alignment and long-title wrapping. Regression checks cover all five cells sharing a row boundary, retaining selection across tabs without showing review actions on Run checks, all sixteen answers without nested scrolling, and long labels staying inside their columns at 1100px desktop width. TypeScript, lint and diff checks passed. Existing saved user answers/reviews were unchanged; no live model calls or mobile testing.

**2026-09-04 — review queue redesign and Run checks refinements:** 250 Vitest tests in 20 files passed; the desktop dashboard journey passed (4.9 seconds) covering the answer queue with repetition groups, required reviewer name/verdict/reason, draft preservation and J/K navigation, LLM advice shown beside an unchanged human verdict, filtered select-all with the floating toolbar for bulk human verdicts and bulk LLM advice consent, failed archive requests keeping selection, archive/restore through the sidebar group, run isolation with unreviewable failed answers, and a sixteen-answer queue. ESLint and TypeScript passed. No live model calls; no server or API changes; existing user runs and reviews were not modified.

**2026-09-04 — run-level inbox correction and integrated review:** 250 Vitest tests passed; the focused desktop dashboard journey passed (5.0 seconds), including full-run selection, archive/restore across reload, isolation of old versus new runs, stale-request failure, and archived-run pending counts. A synthetic LLM pass is displayed beside a persisted human needs-discussion verdict without changing it. TypeScript, lint and diff checks passed. No live judge/eval calls or mobile tests. This supersedes the earlier case-type grouping and per-answer archival below. Existing user runs/reviews were not archived or changed during testing.

**2026-09-04 — modal pickers, eval-class selection and reversible archival:** 250 Vitest tests in 20 files passed; all nine desktop Playwright journeys passed (47.7 seconds). Dashboard coverage includes modal cancellation/focus, retained choices, class tri-state selection, direct bulk-judge consent/model changes, bulk human persistence, failed archive requests, empty inboxes, restore/reload and selection isolation across runs. Original results and reviews stay unchanged by archive operations; stale hashes and malformed/symlinked metadata are rejected. TypeScript, lint and diff checks passed. No new live model calls or mobile checks. Local success does not resolve the existing remote CI cold-navigation timeout.

Fable reviewed the earlier dashboard source and saved desktop screenshots, not a live browser. Adopted: modal pickers, visible bulk actions, class grouping, consolidated judge settings and less repeated page chrome. Kept archival as simple reversible hash-bound inbox metadata rather than adding another append-only event log; existing evidence/verdict histories remain authoritative. The layout detector ran with missing parser dependencies and fell back to limited regex checks; desktop visual inspection remains the relevant layout evidence.

**2026-09-04 — journey selection, explicit live-eval counts and bulk review:** 246 Vitest tests in 20 files passed; all nine desktop Playwright journeys passed (40.4 seconds), including synthetic selection/consent requests and actual bulk human-review persistence. TypeScript, lint and diff checks passed. The catalog parity test checks every selectable journey against Playwright's discovered tags. Judge selection/stop-on-first-failure tests use no model; real bulk LLM judging was not executed. Desktop screenshots cover the selectors and bulk form. Existing live results and human verdicts were not changed by verification.

**2026-09-04 — testing dashboard / checked-in runner follow-up, `codex/phase-one-evals`.** Selected desktop application scenarios are now executable under `tests/e2e/`. Dashboard and judge safety tests use synthetic saved data; no paid judge run or new live baseline was started for this follow-up. The previous live baseline was moved intact into `tests/results/evals/`; its source fingerprints remain historical, and its human meaning review is still pending. Hosted CI results must be checked separately after the workflow runs.

- **237/237 Vitest tests** across 18 files passed; opening the dashboard and starting its Application tests control also completed successfully.
- **9/9 desktop Playwright scenarios** passed (eight application journeys plus dashboard review), 38.6 seconds. Includes draft preservation/focus between review cases, saved-review reload, explicit spend confirmation, exact application removal/recreation and disconnect/reuse on disposable state.
- TypeScript, lint and whitespace checks passed. An isolated production **webpack** build passed without disturbing the development server or its `.next` output. Hosted CI uses the normal build command and is a separate verification surface.
- Dashboard desktop captures were saved and inspected under `tests/results/dashboard-review/`. No mobile checks or new provider calls were made. The existing live baseline's `results.json` SHA-256 stayed `4cc302e04317f368ff6af44b17ce3447d09553e02cb51f17bf7fe8fed7c5de65` after relocation.

The dashboard is a local convenience over fixed runners and artifacts, not a product control plane. Fable's focused read-only architecture review supported this scope and highlighted explicit spend consent, same-origin controls, isolated judging, immutable source evidence and keeping CI smoke small. These boundaries are implemented and regression-tested; an isolated judge can still produce a biased or mistaken rating.

### Earlier evidence (historical, not a fresh full-contract pass)

**2026-09-04 — audit follow-up and first live baseline on the dirty `codex/pi-setup` checkout, based on `2f82308`. The complete contract is not passing yet.** The two confirmed audit defects are now fixed; the earlier three-agent journey evidence below is supplemented by targeted regression checks and a real-Pi run.

Fresh checks:

- Current deterministic Vitest suite: **223/223** tests passed across 15 files, including Origin checks on all mutation handlers, saved-setting preservation and tests of the eval checks themselves. These tests make no model calls.
- Fresh targeted checks: actual Next route rejects hostile-Origin `text/plain` setup POST without modifying saved configuration, accepts same-origin JSON; desktop Cancel and Escape both restore focus to Disconnect.
- Earlier three-agent audit: **44 HTTP/SQLite assertions**, **20 read-only HTTP assertions** against browser-created state and **15 extra disposable boundary tests** passed. These were not all rerun during the targeted fix pass; the current ordinary suite and targeted checks above were rerun.
- TypeScript, lint, whitespace checks and an isolated production build passed.
- First real-Pi baseline: **16/16 automated cases passed** (eight inputs, two repetitions), `gpt-5.6-sol` / `high`, Pi `0.84.4`, 84.26 seconds. Source fingerprints stayed unchanged. Human meaning review remains pending: both unresolved-conflict replies recommended a concrete compromise without recording a Decision, which needs interpretation against the initial rubric. The assistant's review is not human approval. Local artifacts now: `tests/results/evals/2026-09-04T08-42-41.046Z-Q6vAk1/`.
- Real production login start/poll/cancel routes shared the same attempt correctly. The invalid-model probe stopped before provider authentication. The earlier coordinator-sharing concern was not reproduced; this says nothing about restart recovery or multiple processes.

| Cases | Current evidence / status |
| --- | --- |
| P1-01, P1-03 | Discovery, consent UI, recovery and preferences passed in deterministic tests; the setup Origin defect is now fixed and regression-tested. The configured live model ran successfully; live quota/auth failure acceptance was not run. |
| P1-02 | **Partial:** synthetic fresh/replacement success and failed/cancelled replacement preservation passed; real provider rejection/expiry was not exercised. |
| P1-04–05, P1-07–08, P1-12–13 | Exercised deterministic browser/server paths **passed:** creation, isolation, rollback/retry, evidence, archival, double-send prevention, draft preservation and slow-create navigation. Pi/GitHub adapters were synthetic. |
| P1-06 | **Partial:** real-Pi proposal count, persistence/provenance/supersession passed on the eight-case baseline. Human meaning review and the unresolved-conflict expectation remain open. |
| P1-09–10 | **Partial:** browser confirmation/cancellation and separate HTTP/domain deletion/disconnect passed, including fresh IDs, late-result rejection and preservation of other records/credentials. Final destructive browser clicks were not submitted. |
| P1-11 | **Partial:** Disconnect focus restoration is now fixed and both dismissal paths passed in the desktop browser. Application-removal restoration passed in the earlier audit. A full keyboard-only/screen-reader audit was not completed. |
| P1-14 | Drawer evidence/tabs, X/Escape/backdrop restoration and Ask Pi prefill/focus **passed**. No background application control received focus in the native modal traversal; full accessibility/focus-wrap verification remains partial. |
| P1-15–16 | Deterministic checks **passed:** visible 503 retry/recovery, terminal 404, late callback handling, detected/draft model settings, invalid combinations and real-adapter configuration boundaries. This is not live OAuth/model acceptance. |

Audit fixes and remaining work are tracked in the [roadmap](../../ROADMAP.md#configure-pi-explicitly):

1. **Fixed: setup Origin bypass.** The earlier hostile-Origin `text/plain` POST could create or overwrite configuration. [`parseJsonRequest`](../../src/server/schemas.ts) now guards every JSON mutation; bodyless archive/rerun/login-cancel handlers guard explicitly. All 11 mutation handlers have positive/negative regression coverage. This does not add authentication or claim the local app is safe to expose publicly. Browser delivery/exploitability of the original defect was **not** tested.
2. **Fixed: Disconnect focus loss.** [`ConfirmActionDialog`](../../src/components/server-guy/confirm-action-dialog.tsx) restores its connected opener after unmount/close. Both Escape and Cancel returned focus to Disconnect in the targeted browser check. The checked-in Playwright smoke suite now covers cancellation focus restoration too.

Earlier audit screenshots were inspected inline without saved image artifacts; that was not a complete saved-screenshot visual audit. The new Playwright runner retains synthetic failure evidence under `tests/results/`. No mobile checks were made. The opt-in baseline used the existing Pi login for real model calls, not a fresh OAuth flow or GitHub access. Broader Pi behavior, explicit GitHub onboarding and durable-worker acceptance remain unverified or unimplemented. Historical temporary audit evidence remains under `/tmp/server-guy-phase1-audit-dBJnR5` if the machine has retained it.

Design provenance only: the retired A/B/C prototype source is preserved on local branch `codex/archive-pi-setup-prototypes-2026-09-04`, commit `449b59d10366b0cd816433508aa0c1b175b98230`. It is not the current implementation or current acceptance evidence.
