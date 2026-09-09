# Activity and Phase 1 audit — 2026-09-05

> Dated audit evidence, not a current UI contract or full-suite result. Current scope and delivery live in [Product](../PRODUCT.md) and [Roadmap](../ROADMAP.md).

Historical note: this audit covered the first slice, which placed every reply in **Activity**. The final 2026-09-06 correction removes Reply details, uses bounded local diagnostic logs, and restricts Activity to application events; see the [spec](../docs/archive/implementation/action-history-and-tracing.md#application-activity-inclusion-rules) and the [acceptance guide](../docs/archive/implementation/phase-one-acceptance.md#latest-verification) for current evidence. Screenshot paths below refer to the earlier layout.

Scope: the complete implemented Phase 1 desktop experience, not only Activity. No mobile QA. Work took place in an isolated worktree; destructive tests used disposable applications/configuration. The user's saved applications and credentials were not cleared or disconnected.

## Evidence and results

- Complete deterministic suite: 496 tests across 43 files. Covers domain transactions, native sessions, real process crash barriers, OAuth state/renewal races, test dashboard security, and nine new history/export checks.
- Complete desktop suite: **25/25 passed**, including the delayed-send-response regression, in 2.4 minutes. Current report: `tests/results/browser-report/index.html`; screenshots and failure traces: `tests/results/browser-artifacts/`.
- Live model: only `explicit-hosting-budget`, one repetition, Sol High. Code checks passed; saved LLM judge verdict is **pass**, not human sign-off. No bulk casebook rerun.
- Langfuse: authenticated project API returned 200. In-app Browser opened the actual trace `0e0d3e8e8f998491616d643f163ac970` and verified a root, queue/context steps, three generations, lookup/proposal tools, final save, and reported usage. Input/output were empty by design. The live report is `tests/results/evals/2026-09-05T18-35-36.130Z-rAhCd0/` (local, ignored).
- Final production build, type checking, ESLint and formatting checks passed.

## Manual in-app Browser journey

The manually operated app used `tests/browser/qa-fixture.mjs 3111 success fresh`: actual Next routes, SQLite, worker, native Pi SDK and tools; synthetic model and GitHub/OAuth adapters. This is not a claim of fresh real-provider OAuth authorization.

| Step | Observed behavior | Health |
| --- | --- | --- |
| Empty Applications | Clear first-application action and no deployment claim | Good |
| Fresh ChatGPT setup | No reusable login found; Connect enabled; model/defaults shown | Good |
| Privacy and disconnect | Disclosure opens/closes; disconnect confirmation focuses Cancel; cancellation preserves login | Good |
| GitHub setup | Existing login detected without adoption; alternate-account flow connects; no-app state explains what follows | Good |
| Add application | Invalid repository rejected with input editable; corrected repository opens exact workspace | Good |
| Repository evidence | Check drawer explains read access, links Settings and saved evidence; rerun updates receipt; Ask prefills/focuses composer | Good |
| Requirement + Activity | Real SDK tool fixture saves requirement; selected Activity tab stays open; execution expands and links saved record | Good, simplifications below |
| Slow response and cancellation | Live draft visible; cancel produces a cancelled attempt, separately expandable draft and Retry; Activity labels unfinished step incomplete | Good |
| Chat/application navigation | Created a separate chat and archived it; returned to main chat, with the archived transcript still listed. Full automated isolation, archive, reload, removal/recreation and keyboard-tab journeys also passed | Good |
| Langfuse | Actual exported real-model trace opened in authenticated project UI | Verified; metadata only |

## Material findings fixed

1. **Duplicate optimistic message (P1).** A screenshot caught the accepted user message and its Pending copy together after the reply was already visible. SSE may arrive before the POST response, or before its follow-up view fetch. Retire the optimistic copy at either acknowledgement, not only after the entire request chain finishes. New browser regression holds the POST response after server acceptance and asserts one message, no Saving message indicator.
2. **Accurate Activity boundaries.** Separate SQL app-context loading from native conversation/runtime preparation. Completed tool execution does not claim persistence; final save links exist only after the atomic domain transaction.
3. **Privacy and trace clarity.** Keep technical details collapsed. Document metadata export in privacy help; label Langfuse costs as API-price estimates, not subscription charges. Identify the service as `server-guy`, not the local Node executable path. No prompts, answers, raw tool payloads or errors enter telemetry.
4. **Stale recovery documentation.** README still described rebuilding missing native history, which the implemented design deliberately removed. Corrected to Start a new chat, with existing records retained.

## Limits

- Screenshots do not establish full WCAG compliance. Keyboard tabs/focus and semantic controls are exercised by browser tests; no mobile or screen-reader audit was performed.
- GitHub grants, organization approvals and real OAuth denial/expiration were simulated rather than changed on the user's accounts. Existing deterministic tests cover those state transitions and token exclusion.
- No claim of exhaustive model behavior: one selected live case confirms the real SDK/export path; the existing eval casebook was not rerun wholesale.
- This remains one local worker and a local single-user product, not multi-tenant access control. Langfuse trace links require project access and can be absent after export failure or process crash.
- Future operations, Sentry, retention policy UI and Phase 2 remain outside this slice.

## Screenshots

Current-run artifacts (generated, ignored):

- `tests/results/browser-artifacts/activity-history-Activity--e62ab-and-failures-across-refresh/activity-expanded.png`
- `tests/results/browser-artifacts/activity-history-Activity--e62ab-and-failures-across-refresh/activity-cancelled.png`
- Other journey screenshots and the full HTML report are under the results paths above.

The first screenshot inspection revealed the duplicate Pending copy. The final automated screenshot was inspected after the fix: one accepted user message, no duplicate Pending copy, and separate conversation-preparation and generation steps. Manual screenshots were also inspected inline in the task.
