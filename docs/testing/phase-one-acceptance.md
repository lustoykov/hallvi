# Phase 1 acceptance: repeatable desktop journeys

Status: maintained acceptance contract and test plan, 2026-09-04. This is the single testing guide for Phase 1, consolidating the former setup/prototype/application QA reports. Vitest, disposable browser fixtures and an opt-in real-Pi casebook run today. A Playwright Test runner is still a follow-up. Automated eval checks do not imply human-reviewed model quality or complete Phase 1 acceptance.

## What “done” means

Acceptance is observable evidence that an engineer can complete a workflow and recover from its expected failures. It is not just a green test count or a model saying that work is complete.

There are two different completion claims:

- **An application's Launch Brief is ready:** its four current checks pass: recorded identity, readable repository at a recorded commit, explicit target environment, and explicit permission policy. This does not mean the application is deployed.
- **Phase 1 product work is complete:** the current journey below passes, plus the explicit GitHub connection and durable-request follow-ups in [TODO](../../TODO.md) pass their acceptance cases. Those follow-ups are still pending. Do not treat the four checks as evidence that the entire product phase is done.

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
| Browser journey through real routes and SQLite | Recommend Playwright Test | Forms, navigation, dialogs, visible errors, keyboard behavior, reload and recovery. Replace external Pi/GitHub calls with deterministic fixtures. |
| Real Pi behavior | Opt-in `npm run eval:pi`, using existing Vitest and the actual Pi adapter | Exact proposal/state assertions plus a separate human meaning review. A synthetic fixture cannot prove real model behavior. |

Playwright provides [fixtures](https://playwright.dev/docs/test-fixtures), isolated [browser contexts](https://playwright.dev/docs/browser-contexts), and [failure traces](https://playwright.dev/docs/trace-viewer). Next.js also recommends E2E testing for [async Server Components](https://nextjs.org/docs/app/guides/testing). This fits our server-rendered entry pages and multi-screen workflow.

Start with Vitest + Playwright Test, not an additional workflow engine. If the live-model casebook grows into a model/prompt comparison matrix, consider [Promptfoo's custom JavaScript provider](https://www.promptfoo.dev/docs/providers/custom-api/) calling our Pi adapter. That would not replace Pi, introduce AI SDK, or silently switch to API billing.

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

From the repository:

```sh
npm test
npx tsc --noEmit
npm run lint
```

Start a disposable desktop fixture in another terminal:

```sh
node scripts/qa-fixture.mjs 3112 success fresh
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

## Playwright follow-up scope

- Install `@playwright/test` and add a desktop-only `test:e2e` command. Keep it distinct from `npm test` and opt-in live evaluations.
- Port the case IDs above into tests using accessible labels/roles and state assertions, not fragile coordinates or exact generated-prose snapshots.
- Give each worker its own fixture server, database, configuration and external-adapter state. Start each independent scenario with fresh data. A separate browser context does **not** isolate server-side SQLite or login state.
- Keep traces/screenshots on failures in the synthetic environment. Do not upload real OAuth codes/tokens, account details, or private transcripts to CI artifacts.
- Run deterministic checks in CI. A failed critical case blocks completion; retries must not hide a reproducible failure. Record test command, commit, fixture mode and evidence with each acceptance report.

## Real Pi casebook and remaining Phase 1 gates

The runnable [casebook](../../evals/phase-one-cases.ts) contains eight fixed inputs and meaning rubrics: greeting, explicit priority, question versus commitment, hypothetical, exact revision, unresolved conflict, same-message retraction, and quoted untrusted instructions. This is a small regression set, not a broad reliability benchmark.

```sh
# Eight real Pi turns using your saved Server Guy model/effort and subscription.
SERVER_GUY_LIVE_EVALS=1 npm run eval:pi

# Repeat each case to expose variation: 16 turns, sequentially.
SERVER_GUY_LIVE_EVALS=1 PI_EVAL_REPEATS=2 npm run eval:pi
```

Without opt-in, the command fails before running the suite. Repeats default to one and are limited to 1–5 (8–40 turns). A turn may involve multiple model requests because of tool calls. `npm test` never discovers the `.eval.ts` file and never calls the provider. No additional eval library or API key is needed.

The [runner](../../evals/phase-one.eval.ts) seeds a private temporary SQLite database, snapshots the saved model preferences and invokes the real `sendChatMessage → askPi → SQLite transaction` path. It does not read your existing applications/transcripts or contact GitHub. The configured credential file remains the auth source; normal Pi OAuth refresh may update it. Credentials are not copied into the temporary configuration or serialized into reports. There are no automatic provider retries or model/billing fallbacks; a Pi runtime/provider failure stops further turns.

Each run creates a git-ignored `eval-results/<run>/results.json` and `review.md`: fixed inputs, current context, accepted tool proposals, resulting records, timings, model/effort, Pi version, commit/dirty flag and source hashes. It records accepted proposals, not a full SDK trace. Temporary state remains for diagnosis. Never publish results containing real private data.

The [exact checks](../../evals/check-phase-one.ts) verify proposal count, supported shape, replacement IDs, source-message provenance, one persisted message pair and supersession. Meaning is a separate **pending human review** against each case's rubric. Exit code zero means the automated checks passed, not that the model is semantically correct or the phase complete. An assistant can suggest a verdict but cannot supply human sign-off. Review `review.md`, record pass/fail with reasons, and retain that reviewed baseline before accepting prompt/tool/model changes. Do not assert exact generated wording.

For each later phase, define cases before implementation, run them as the real behavior becomes available, and rerun relevant earlier cases before acceptance. Add observed failures as regressions. Do not prebuild eval machinery for unimplemented phases; UI/login/database behavior still belongs in ordinary application tests.

Live account checks are opt-in, user-approved and use the configured Pi runtime/subscription. Record model ID, effort, prompt version, inputs, tool proposals, resulting records and semantic pass/fail reason, never OAuth secrets. Check ordinary chat, explicit priority, valid revision, conflicting/retracted instructions, injected repository text and provider rejection. Judge whether the response agrees with the accepted Decision, not whether it matches one exact sentence. Label human judgments as human-reviewed; do not let another model's rating be the sole authority for state correctness.

Before declaring the complete Phase 1 follow-up sequence done, also prove:

- **GitHub connection:** explicit authorization/reuse consent; denied/cancelled login; missing scope; revoked/expired credentials; inaccessible private repo; exact repository identity and permissions recorded.
- **Durable requests:** queueing, duplicate delivery, client disconnect/reconnect, timeout, cancellation, worker crash/restart and state reconstruction. No blind retry of potentially completed external effects. These cases become executable when the worker is implemented; they do not pass today.

Deployment, infrastructure provisioning, monitoring automations, and Phase 2 work remain outside this Phase 1 acceptance contract. Workflow DevKit is still a later complexity-triggered choice, not a test runner.

## Latest verification

**2026-09-04 — audit follow-up and first live baseline on the dirty `codex/pi-setup` checkout, based on `2f82308`. The complete contract is not passing yet.** The two confirmed audit defects are now fixed; the earlier three-agent journey evidence below is supplemented by targeted regression checks and a real-Pi run.

Fresh checks:

- Current deterministic Vitest suite: **223/223** tests passed across 15 files, including Origin checks on all mutation handlers, saved-setting preservation and tests of the eval checks themselves. These tests make no model calls.
- Fresh targeted checks: actual Next route rejects hostile-Origin `text/plain` setup POST without modifying saved configuration, accepts same-origin JSON; desktop Cancel and Escape both restore focus to Disconnect.
- Earlier three-agent audit: **44 HTTP/SQLite assertions**, **20 read-only HTTP assertions** against browser-created state and **15 extra disposable boundary tests** passed. These were not all rerun during the targeted fix pass; the current ordinary suite and targeted checks above were rerun.
- TypeScript, lint, whitespace checks and an isolated production build passed.
- First real-Pi baseline: **16/16 automated cases passed** (eight inputs, two repetitions), `gpt-5.6-sol` / `high`, Pi `0.84.4`, 84.26 seconds. Source fingerprints stayed unchanged. Human meaning review remains pending: both unresolved-conflict replies recommended a concrete compromise without recording a Decision, which needs interpretation against the initial rubric. The assistant's review is not human approval. Local artifacts: `eval-results/2026-09-04T08-42-41.046Z-Q6vAk1/`.
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

Audit fixes and remaining work are tracked in [TODO](../../TODO.md):

1. **Fixed: setup Origin bypass.** The earlier hostile-Origin `text/plain` POST could create or overwrite configuration. [`parseJsonRequest`](../../src/server/schemas.ts) now guards every JSON mutation; bodyless archive/rerun/login-cancel handlers guard explicitly. All 11 mutation handlers have positive/negative regression coverage. This does not add authentication or claim the local app is safe to expose publicly. Browser delivery/exploitability of the original defect was **not** tested.
2. **Fixed: Disconnect focus loss.** [`ConfirmActionDialog`](../../src/components/server-guy/confirm-action-dialog.tsx) now restores its connected opener after unmount/close. Both Escape and Cancel returned focus to Disconnect in the fresh browser regression check. A checked-in automated browser regression remains part of the Playwright follow-up.

Screenshot captures were inspected inline, but the browser tool exposed no supported local-image persistence mechanism; this is not a complete saved-screenshot visual audit. No mobile checks were made. The opt-in baseline used the existing Pi login for real model calls, not a fresh OAuth flow or GitHub access. Broader Pi behavior, explicit GitHub onboarding and durable-worker acceptance remain unverified or unimplemented. Earlier temporary audit evidence remains under `/tmp/server-guy-phase1-audit-dBJnR5`; the new real-Pi runner now exists in the repository, but a desktop E2E runner is still pending.

Design provenance only: the retired A/B/C prototype source is preserved on local branch `codex/archive-pi-setup-prototypes-2026-09-04`, commit `449b59d10366b0cd816433508aa0c1b175b98230`. It is not the current implementation or current acceptance evidence.
