# Application status lookup for Pi

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../PRODUCT.md) and [Roadmap](../../../ROADMAP.md).

Current delivery order is consolidated in [ROADMAP.md](../../../ROADMAP.md). Historical milestone references below preserve implementation evidence and do not schedule new work.

Status: agreed and merged September 6, 2026 in [PR #17](https://github.com/lustoykov/server-guy/pull/17), after [PR #16](https://github.com/lustoykov/server-guy/pull/16) (Activity/tracing). Build order and the implementation checklist stay in [implementation history](../previous-direction/docs/plans/implementation-history.md#application-status-lookup), after Activity/tracing and before Phase 2.

## Purpose

`get_application_status` is a read-only tool that returns the current application's saved configuration, evaluated launch checks, and recorded evidence. Pi calls it when an answer depends on application state. The backend owns database access and the scope of the result.

Before this change, the worker called `buildViewSummary` before each reply and appended the summary as a hidden `server-guy-run` message. This repeated application details even for greetings and acknowledgements. The automatic summary is replaced with an on-demand lookup, following the existing scoped `search_decisions` pattern.

For example, “Thanks” needs no lookup. “Can you still read my repository?” requires one. The answer should describe the latest recorded repository check and its observation time, not imply the lookup contacted GitHub again.

## Phase awareness

Since Phase 2, the projection follows the Chat's phase: `workspace` and `checks` come from the workspace the Chat belongs to (the retained Launch Brief evidence for a completed Phase 1 chat; the Phase 2 checks for an Inspect app chat), and Phase 2 adds a bounded `inspection` summary (Observation ID, status, commit, whether it was made with the current connection, profile resolution status) and a `contract` summary (ID, version, commit, profile, field count, blockers, conformance items, open policies) within the same 12,000-character bound. The full contract and evidence come from `get_application_contract` and `get_repository_inspection`, specified in the [Application Contract spec](application-contract.md). Everything below is unchanged.

## Tool contract

| Part | Contract |
| --- | --- |
| Name | `get_application_status` |
| Inputs | Empty object `{}`; reject additional properties. No application ID, SQL, filters, or provider-refresh option. |
| Scope | Bind application and Chat scope from the accepted Pi Run. Revalidate that the application/workspace/Chat still belong together when executing the tool. The model cannot select another application. |
| Reads | Current local application/workspace records, the latest relevant saved repository Observation, and current GitHub connection identity needed to evaluate that evidence. Reuse the same check evaluation as the Operator View. |
| Result | A compact structured projection described below, returned in model-visible tool content. |
| Effects | No domain writes, provider calls, check reruns, repository reads, or infrastructure changes. Existing native tool history and reply diagnostics may record the execution. |
| Errors | Missing/inaccessible application or failed storage read is a tool error, not an empty successful result. Missing repository evidence is a successful lookup with the existing `not-yet` check result. Respect Run cancellation. |

Suggested tool description:

> Read this application's current saved configuration, launch checks, and recorded evidence. Use before answering questions about current status, repository access, approval mode, blockers, or next steps that depend on those records. This reads local records; it does not recheck GitHub or verify a deployment.

### Successful result

Use these fields; reuse existing domain types where appropriate rather than serializing the entire Operator View:

| Field | Contents and meaning |
| --- | --- |
| `retrievedAt` | UTC time this local snapshot was read. This is not the time an external system was checked. |
| `application` | `id`, `name`, `repositoryUrl`, `environment`, `approvalMode` (key and display label), and `updatedAt`, drawn from saved configuration. Do not hardcode Production instead of reading the saved environment. |
| `workspace` | Current `phaseKey`, `phaseNumber`, `deliverable`, and evaluated `status`, using the existing workspace/view semantics. Phase 1 readiness means its Launch Brief checks pass. |
| `checks` | Each current check's `key`, `label`, `status`, `result`, and supporting `evidence` references. Preserve check statuses and public result text from domain evaluation. |
| `checks[].evidence` | Bounded references: `recordType`, `recordId`, `label`, `href`, and `observedAt`. For an application record, this timestamp is its update time; for an Observation, it is when the check was performed. Return only evidence applicable to the current check; an invalidated Observation must not appear as support for current access. |
| `upcomingRequirements` | Catalog entries containing `key`, `label`, `requiredBeforePhase`, and `resolutionPath`. These describe product requirements, not verified provider access. Do not turn catalog defaults into claims that a provider was checked or is unavailable. |

Return only this projection: no credentials, raw provider payloads, connection records, full transcripts, Activity history, or saved Decision lists. Saved requirements remain available through `search_decisions`. The finite Phase 1 check/catalog lists need no pagination or separate retrieval service. Use existing public text limits; do not silently drop checks if a malformed result exceeds the supported bound—return a tool error.

## Evidence and freshness

Every invocation reads current local records. Do not cache a result across Runs. Preserve the existing repository rules: use the latest Observation, require it to match the current GitHub connection, and never fall back to an older passing result after failure or invalidation. Share this logic with the UI instead of implementing a second gate evaluator.

Two kinds of freshness are different:

- The tool reads the current saved state at `retrievedAt`.
- A repository result describes what was observed at its own `observedAt`, which may be older.

A lookup does not renew an Observation. If the user asks for a live recheck, explain the recorded result and the existing way to rerun the repository check; this tool itself cannot perform it. Do not invent an expiry policy or a background refresh mechanism for this slice.

Repository readability proves the recorded access check, not code review, tests, deployability, or continuing access forever. Phase 1 status does not establish whether the application has been deployed elsewhere. Without deployment evidence, say that deployment has not been verified here rather than “it has not been deployed.” Hetzner/Cloudflare phase requirements come from the product catalog, not model discovery or provider inspection.

## Prompt and worker changes

Keep stable behavior instructions in the system prompt. Remove instructions claiming that the latest Run context already supplies application checks or Approval Mode. Direct Pi to call `get_application_status` in the current Run before answering current-state questions or making recommendations that depend on those values. Previous conversation, old context messages, summaries, and earlier tool results may be outdated.

Pi can reuse a successful result within the same Run unless it has reason to believe the relevant state changed. It should not mechanically call the tool for every message. General explanations, greetings, acknowledgements, and requests solely about saved requirements do not require this lookup. Requirements-dependent answers still use `search_decisions`; some questions need both tools.

Remove `currentApplication` and the `buildViewSummary` call from automatic per-Run context. Retain the small execution envelope: Run/application/Chat identity, context creation time, and the previous attempt's actual status and saved outcome. That outcome prevents failed or cancelled proposals from being mistaken for committed Decisions. It is not a substitute for reading current application state.

Register `get_application_status` alongside `search_decisions` and `propose_decision`. Keep built-in tools disabled and preserve native Pi sessions, existing resource restrictions, and guarded final commits. A model lookup is evidence for an answer, not authorization for a write; backend validation remains authoritative.

Do not rewrite old native history or delete prior context messages. New instructions must identify those snapshots as historical. New Runs stop injecting application summaries. Tool results still occupy native history and can be compacted normally; this change reduces unnecessary injection, not all repetition or token usage. A lookup adds a tool round trip when needed; do not claim measured cost or latency improvements without measurements.

## Activity and UI

A status read creates no application Activity item: it changes no application state. Show its execution in the existing reply details, with a plain label such as “Look up application status,” using the established diagnostics path. Keep optional telemetry metadata-only and do not export tool payloads. No new status page, approval dialog, or evidence browser is required.

## Acceptance scenarios

| Scenario | Required behavior |
| --- | --- |
| “Thanks” or a general conceptual question | Pi answers without `get_application_status`; the worker has not injected an application summary. |
| “What's the status?” / “What's blocking the next step?” | Pi calls the tool and grounds its answer in the returned phase/checks and catalog requirements. |
| “Can you still read my repository?” | Pi retrieves the current check, distinguishes recorded access from a live recheck, and makes the observation time available in its answer when freshness matters. |
| Old chat says access passed; the latest check failed | A current-Run lookup returns the failure; the answer does not reuse the older success. |
| Connection changed or disconnected after an earlier success | Current domain evaluation invalidates the old evidence; the result does not present that Observation as proof of current access. |
| Saved Approval Mode changes between messages | The next relevant question triggers a fresh lookup and uses the new mode. |
| All Phase 1 checks pass; user asks whether the app is deployed | Pi explains Phase 1 readiness and the lack of deployment verification; it does not infer global deployment status. |
| No repository Observation exists | Successful lookup returns `not-yet` with the existing resolution guidance; it does not manufacture evidence. |
| Lookup fails | Pi reports that it could not retrieve current status, without falling back to old history as current evidence or claiming checks passed. |
| Model supplies another application ID or extra fields | Input validation rejects the call; no other application's records are returned. Deleted or mismatched scope also fails. |
| Prior Run failed/cancelled after proposing a Decision | The retained attempt outcome and existing Decision lookup still prevent false saved claims. |
| Lookup completes | No domain or application Activity records are created; reply diagnostics may show the tool execution. Secrets/raw payloads remain absent from model results and telemetry. |

Use deterministic tests for scoping, projections, timestamps, invalidation, errors, context removal, and absence of domain effects. Extend the existing synthetic real-Pi eval cases for lookup selection, stale-history correction, and evidence wording. Unit tests alone do not prove that the model chooses the tool correctly. Reuse disposable fixtures; no real account or provider mutations are needed.

## Implementation

- [Tool schema and bounded read](../../../src/server/pi-status.ts): `applicationStatusParameters` is an empty object schema with `additionalProperties: false`; `readPiApplicationStatus` serializes the projection and turns an oversized result into a tool error.
- [Projection](../../../src/server/phase-one.ts): `getApplicationStatus(applicationId, chatId)` revalidates the application/workspace/Chat through `loadChat`, evaluates the checks with the same `computeChecks` call as the Operator View, and keeps a repository Observation as evidence only when the shared `observationMatchesConnection` predicate in [phase-one-spec.ts](../../../src/server/phase-one-spec.ts) accepts it. The `ApplicationStatus` type lives in [types.ts](../../../src/server/types.ts). `buildViewSummary` is removed.
- [Tool registration and instructions](../../../src/server/pi.ts): `get_application_status` is registered beside `propose_decision` and `search_decisions`, bound to the accepted Run's application and Chat through the tool closure, and the stable system prompt directs current-state questions to it.
- [Run context](../../../src/server/pi-run-context.ts) and [worker](../../../src/server/pi-worker.ts): the `server-guy-run` message now carries only `createdAt`, Run/application/Chat identity, and `previousAttempt`. The worker's first diagnostic step is "Load request context".
- [Diagnostics](../../../src/server/diagnostics.ts) record the execution as a `get_application_status` step ("Look up application status") in the bounded local log, and [tracing](../../../src/server/tracing.ts) exports it as a metadata-only tool span. No Activity Event is written. The "existing reply details" surface named above no longer exists: PR #16's final revision removed the Reply details panel, so the step is visible to operators in local logs and optional traces only.
- Deterministic coverage: `tests/application/integration/pi-status.test.ts` (projection, scope, latest/invalidated evidence, no writes, lookup errors, the actual SDK tool loop with a synthetic provider), `tests/application/unit/pi.test.ts` (registration, binding, cancellation, instructions), and the updated Run-context, diagnostics, Activity and eval-seed tests. Live coverage: seven `Application status` cases plus status-lookup expectations on the greeting and GitHub cases in [tests/evals/phase-one-cases.ts](../../../tests/evals/phase-one-cases.ts); see the [testing guide](phase-one-acceptance.md#real-pi-casebook-and-remaining-phase-1-gates) for what has actually been run.
- Related contracts: [native sessions and Decision lookup](native-pi-and-permissions.md) and [Activity inclusion](action-history-and-tracing.md).
