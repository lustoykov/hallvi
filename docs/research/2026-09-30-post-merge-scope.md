# Post-merge fixes and simplification

**Status: In progress.** After reviewing the scopes, the owner selected all ten
work packages on 30 September 2026 in task
`01a0f19e-1f49-7d70-947b-28c911465e09`: implement, verify, review and simplify
in bounded increments. Implementation starts from
[`d5094503`](https://github.com/lustoykov/hallvi/commit/d50945031e9242983ce91ff59e5407def15e1a94).
The original audit cutoff below remains unchanged.

The goal is to understand recent changes, keep useful capabilities, remove
unnecessary complexity, find bugs, simplify the experience, and establish which
application shapes actually work. The original 54-PR audit ends at
[`9c99cf3b`](https://github.com/lustoykov/hallvi/commit/9c99cf3b61375d97688e400b2cd665124c446315).
This scope was refreshed against remote main
[`5f42edd7`](https://github.com/lustoykov/hallvi/commit/5f42edd7746707a89632671e2330d54871656577).
The four reproduced Traffic implementations and the three test-cleanup targets
are unchanged between those revisions. That is a source check, not a new test run.

## Selected correctness and test work

The owner selected five independently reviewable changes together with the
follow-up work. T1–T4 carry focused regression evidence; T5 prunes against the
behavior coverage that remains.

| Scope | Concrete change and preserved behavior | Acceptance |
| --- | --- | --- |
| **T1 — Safe script installation for multiple apps** ([AF-030](../../AGENT_FEEDBACK.md#af-030--make-the-traffic-script-template-safe-for-a-shared-traefik)) | Derive stable Traefik router/service identities from the existing application identity and pass them through the existing Pi tool. Cover Docker-label and file-provider templates. Reuse the shared script file; avoid a new registry or deployment manager. | Two hosts under one Traefik both serve the expected script and record their own events; configuring one again creates no duplicate route; removing one preserves the other. Exercise the actual templates in local containers. |
| **T2 — Traffic database work off the caller's thread** ([AF-029](../../AGENT_FEEDBACK.md#af-029--keep-traffic-database-waits-off-the-event-loop)) | Move synchronous Traffic storage behind the existing named-operation worker pattern. Keep traffic.db separate, its format compatible, and each read/check/write transaction atomic. Avoid a new storage framework. Check queue ownership so an analytics lock does not make unrelated main-record work wait behind it. | Hold a disposable Traffic write lock while an unrelated HTTP/chat operation and timer make progress. Stop/Forget must still defeat late writes. Reopen existing totals after restart. Verify the shipping build includes and starts the worker. Adding async wrappers alone does not satisfy this. |
| **T3 — Explicit hash-route support** ([AF-031](../../AGENT_FEEDBACK.md#af-031--account-for-hash-routed-pages-before-promising-spa-coverage)) | Add an explicit routing choice to the existing configuration/tag path for supported hash routes such as /#/inbox. Preserve current history/query defaults and data minimization. Do not interpret every fragment as a route or add a settings wizard. State unsupported forms honestly. | The shipped script in a browser counts initial load, navigation and back/forward once per page in history, configured query and configured hash modes. Ordinary anchors and token-bearing fragments remain excluded. Use a few contrasting cases, not every framework/version combination. |
| **T4 — Remove or bound the live country cache** ([AF-032](../../AGENT_FEEDBACK.md#af-032--bound-the-live-traffic-country-cache)) | First measure lookup cost on representative input. Prefer removing the cache; if it earns its cost, keep a small bounded/expiring cache with bot entries covered too. Preserve country labels and existing live-window privacy. | Repeated arrival/expiry cycles reach a stable retained-entry bound, including bot identities. Labels remain correct. Compare lookup and event-loop cost before/after; an entry-count check does not establish production memory usage. |
| **T5 — Focused test pruning** ([AF-039](../../AGENT_FEEDBACK.md#af-039--keep-new-tests-tied-to-useful-behavior)) | Delete the redundant script-compilation/comment-format test. Replace the exact chart class/attribute assertion with proof of the visible gap state. Limit installer-link checks to current install entry points, allowing labelled historical examples. Keep privacy, missing-data, stale-installer and real failure regressions. | The retained behavior tests pass; a syntax failure still fails script execution, a real gap still appears, and current installation instructions still resolve to the intended installer. Run the retained default suite once after pruning. No arbitrary test-count or line-reduction target. |

The main source areas are
[script templates](../../src/server/traffic/script.ts),
[Pi setup tools](../../src/server/traffic/pi-tools.ts),
[Traffic store](../../src/server/traffic/store.ts),
[database client](../../src/server/database-client.ts),
[browser script](../../src/traffic-script/hv.js), and
[live arrivals](../../src/server/access-log.ts).
T3 also needs the existing access-log record/contract updated consistently.

## Small UI pass after the correctness work

**T6 — Make the script offer accurate and easier to scan.** Keep the requested
visible Add script action and accepted checklist treatment. Remove the generic
`more → time → “this app”` claim, which has no application-specific evidence.
Trim repeated explanation where it does not help a decision. Inspect no-log,
log-only, script-active and script-silent states at desktop and narrow widths.
Accept when the next action and measurement limits are clear, with matched
before/after screenshots. Use the existing fold state if a more compact default
is selected; changing that default is a product choice, not a pre-approved
reversal of the owner's checklist preference. No new dismissals service,
onboarding wizard or layout-only test suite.

## Broader acceptance after the fixes

**T7 — One bounded acceptance pass**, with small durable regressions only for
important failures. Use the existing runners and retained-app workflow.

| Contrasting case | What it establishes |
| --- | --- |
| Two applications behind each of Caddy, nginx and Traefik | Host isolation, expected script bytes, event responses/logging and removal of one app without breaking the other. Keep each proxy's real ordering/logging requirements. Use local containers first; T1 owns the Traefik regression. |
| History, query-key and explicitly configured hash navigation | Route identity and privacy using the actual browser script; ordinary anchors must not become new views. T3 owns the focused regression. |
| A server-rendered app and one stateful Compose stack | Avoid another hello-world-only proof. Prefer available, exclusively owned Ghost/MySQL or Paperless/PostgreSQL/Valkey/Celery fixtures; establish behavior on the selected revision rather than citing the historical proof as current. |
| One real lifecycle through the normal Pi path | Deploy, open in the owner's browser, use a named saved item, restart/return and reconnect while preserving exposure and approval behavior. Verify backup/restore into a disposable target when making a recovery claim. Record the actual stack and preserved data. |
| 1, 5 and 10 open views, including a long-lived stream | Measure SSH followers, process/event-loop cost and retained state. Forced-lock and expiry checks test correctness; they do not substitute for throughput measurements. |

Choose representative combinations, not the Cartesian product of all proxies,
frameworks and lifecycle states. Real provider writes, retained ownership and
costs stay within the execution task's authorized scope. No new scheduler or
mandatory cloud test on every PR. The owner does not use CI as a merge gate;
required local acceptance remains explicit.

## T8 — Measured reductions

- **Traffic simulator and fixtures:** the generator/data add 5,619 lines and the
  UI fixture 1,279. Trace which audience/network variants exercise distinct
  behavior. Remove unneeded realism and share scenario descriptions where it
  actually reduces maintenance. Keep real-log generation, independently derived
  expected counts and cheap UI-state rendering separate where they prove
  different things. No replacement simulation framework or invented deletion
  estimate. Review first and implement only reductions supported by that review.
- **Repeated log followers:** use T7's measurements to decide whether multiple
  views create meaningful avoidable work. If justified, scope one reader per
  application/source with bounded fanout and correct disconnect cleanup.
  Otherwise leave it alone. Do not build a generic event bus preemptively.
- **Feature removal:** goals, page-speed metrics and release comparisons need
  evidence of user value before deletion. Code size alone does not settle that
  decision. Preserve safeguards with known data/privacy/approval consequences.

## T9 — Supplemental audit and report

Goal 1 already has the local HTML report and matched screenshots. Append work
status and before/after evidence as scopes finish; keep the original cutoff and
the difference between merged, tested, installed and deployed visible.

[#283](https://github.com/lustoykov/hallvi/pull/283),
[#293](https://github.com/lustoykov/hallvi/pull/293) and
[#295](https://github.com/lustoykov/hallvi/pull/295) merged after the original
cutoff. Release [#296](https://github.com/lustoykov/hallvi/pull/296) followed during scoping; its installed-dependency follow-up (AF-038) remains separate existing feedback. Give these a bounded supplemental review for duplicated operator state,
setup requests and native-host behavior before proposing new cuts. The stale
setup-request repair is already merged. Open
[#294](https://github.com/lustoykov/hallvi/pull/294) owns plugin-update work;
do not duplicate it. The supplemental source review covers those PRs plus #298/#299 through
`f63092bb`. [#307](https://github.com/lustoykov/hallvi/pull/307) fixes failed-write
draft/request-key retention and removes the unused sent-key set. Native host
rendering and remote SSH transport remain separate evidence boundaries.

## T10 — Fresh-user walkthrough

Run the existing [beta walkthrough](../beta-walkthrough.md) against the combined
changes with fresh isolated controller state. Follow setup, deployment, useful
application behavior and return through the browser; fix concrete friction or
bugs found. Keep real-account reuse, scripted fixtures and unfamiliar-user
comprehension distinct. An agent rehearsal cannot prove external-user
comprehension. Preserve all existing retained application records and data.

Each implementation PR should state its trigger and resulting behavior, what
was removed or simplified, evidence for acceptance, and remaining stack limits.
Include a Mermaid flow when an ownership boundary changes and before/after
screenshots when user-visible behavior changes. Keep raw screenshots, logs and
per-run reports in ignored output directories. The original scoping pass
performed no production fixes or new application acceptance. Subsequent fixes
are in [#302](https://github.com/lustoykov/hallvi/pull/302) (shared proxy routes),
[#310](https://github.com/lustoykov/hallvi/pull/310) (Traffic worker ownership),
[#303](https://github.com/lustoykov/hallvi/pull/303) and
[#308](https://github.com/lustoykov/hallvi/pull/308) (route identities),
[#312](https://github.com/lustoykov/hallvi/pull/312) (simulator wait cleanup),
[#307](https://github.com/lustoykov/hallvi/pull/307) (plugin draft retention),
and [#301](https://github.com/lustoykov/hallvi/pull/301) (cache, tests, checklist
and combined acceptance). Their descriptions and the local HTML report retain
the detailed evidence. The measured reader load justified retaining the current
per-subscription follower; independent generator, oracle and UI fixtures retain
different verification roles. No generic reader bus or simulation framework
was added.
