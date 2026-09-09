# Application Contract: Phase 2, Inspect app

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../PRODUCT.md) and [Roadmap](../../../ROADMAP.md).

Implementation reference: this document describes the existing backend. The [accepted architecture](../../architecture/agent-directed-operations.md) changes the target collaboration/UI model and application-code scope; those migrations remain pending in [ROADMAP.md](../../../ROADMAP.md#integration-acceptance-and-remaining-reconciliation). Existing phase, tool and preview behavior below must not be mistaken for the new product boundary.

Status: implemented on `codex/phase-two-application-contract` as a read-only vertical slice. This document is the implementation contract for Phase 2: the phase transition, repository inspection, the supported Application Profile, the Application Contract schema and provenance rules, the Phase 2 Gate Checks, Pi's scoped tools, and the boundaries this slice deliberately leaves alone. The [journey](../previous-direction/docs/user-journeys/01-application-launch-phase-reference.md#phase-2--inspect-app) owns the product behavior and gate definitions; [ROADMAP.md](../../../ROADMAP.md) owns current build order and the [implementation history](../previous-direction/docs/plans/implementation-history.md#phase-2-application-contract) retains earlier status; the [testing guide](phase-one-acceptance.md#phase-2-acceptance-inspect-app) owns acceptance cases and dated evidence.

## Outcome

An engineer whose Launch Brief is ready presses **Continue to Inspect app**. Server Guy pins the repository's default branch to one commit, records the tree and starts one request of its own: inspect the repository and propose the Application Contract. Pi chooses the files to read and proposes a supported Application Profile with citations and an explanation through the contract tool; every read is saved as a source-attributed Observation before the model sees the content. Pi proposes the contract through a typed tool that validates provenance immediately and again in the final transaction. The engineer sees every field with its source, the conformance work Phase 3 owes, the values that need their decision, and the product policies that stay open until later gates. They can correct a field in chat, re-inspect after a push, and read Phase 1 as completed, read-only history.

```text
Launch Brief ready ──Continue──▶ one immediate transaction
                                  ├── re-evaluate the four Phase 1 checks; refuse if any fails
                                  ├── refuse while any Run is queued or running
                                  ├── complete the Phase 1 workspace, retaining its evidence
                                  └── create the Inspect app workspace and its primary Chat
                                ▼
                     deterministic inspection (network, outside the transaction)
                                  ├── identity + default-branch commit (existing GitHub adapter)
                                  ├── bounded recursive tree at that commit
                                  └── no automatic file reads or stack classification
                                ▼
                     one Run, requested by Server Guy, attributed to Server Guy
                                  ├── get_repository_inspection   (local)
                                  ├── read_repository_file        (pinned read → Observation → model)
                                  ├── get_application_contract    (local)
                                  └── propose_application_contract (validate → stage)
                                ▼
                     final transaction: answer + Decisions + contract vN + Activity
```

## Confirmed product decisions

These were confirmed with the user on September 6, 2026 and are recorded in the journey:

1. **Phase 2 establishes what the application requires; Phase 3 makes and verifies the changes.** A known requirement with a known code change, such as a required `/health` endpoint the repository lacks, is recorded on the contract as a **conformance item** for Phase 3. It does not block Phase 2.
2. **Unknown, contradictory or unsupported required values still block Phase 2.** They are recorded as unresolved fields with a blocker kind and keep P2.G4 Unsatisfied until the engineer decides or the evidence changes.
3. **Open product policies stay visible and are required at their later gates**, never defaulted and never silently waived: backup and restore (U1, P7.G3), required telemetry (U1, P7.G4), migration rollback expectation (U16, P8.G2), the mandatory verification set (U15, P4.G4) and, when no Dockerfile exists, build ownership (F-8, P8.G1).

No U-code is decided here. U2 (profile count) and U3 (explicit contract confirmation before paid work) remain open; the slice implements one profile and no confirmation gate.

## Phase transition

The transition is explicit. Nothing moves to Phase 2 automatically, because gate results are projections that can regress (a GitHub disconnect makes a passing repository check not current).

- `POST /api/applications/{id}/phases/inspect-app` (same-origin) runs `completeLaunchBrief`. In one immediate SQLite transaction it re-evaluates the four Phase 1 checks and refuses if any is not passed, refuses while any Pi Run for the application is queued or running, marks the Phase 1 workspace `completed_at` with `deliverable_evidence` (the check results as evaluated, the cited repository Observation, commit, connection, environment, Approval Mode and scope), creates the `inspect-app` workspace with its primary Chat **Application Contract** and an opening Server Guy message, and records **Launch Brief completed** in the Phase 1 feed and **Inspect app started** in the Phase 2 feed.
- Repeating the request returns the current view; the unique `(application, phase)` constraint guarantees one workspace. Concurrent requests cannot create two.
- After the commit, the inspection runs (below). If repository access and tree inspection pass, one Run is enqueued whose accepted message is `Inspect the repository and propose the Application Contract.` with `source: server-guy`. The chat renders it as **Server Guy · Started automatically**, never as the engineer's words. Without a worker it stays visibly queued. If the inspection did not pass, no Run starts and a Server Guy message explains the result and points to **Re-inspect repository**.
- A completed workspace is read-only at every boundary: `sendChatMessage`, `retryPiRun`, `archiveChat`, the worker's pre-model check and `completePiRun` reject it the way they reject archived Chats, so an attempt that outlives a phase completion fails instead of writing across it. Its chats stay readable; new chats always open in the current phase.
- The Operator View distinguishes the **current** phase (the latest workspace) from the **viewed** phase (the selected chat's). Viewing a completed phase shows its retained evidence as recorded, marked as not re-evaluated; later changes show in the current phase's checks. Future workspaces are not pre-created, and Phase 3 has no Continue in this build.

## Repository inspection

`inspectRepository` is deterministic, read-only and pinned to one commit. It reuses the Phase 1 GitHub adapter for identity and access verification, then reads through the same `githubJson` boundary with the connection the engineer chose.

| Step | Bound or rule |
| --- | --- |
| Identity and commit | `inspectGithubRepository` verifies account, repository ID, App installation and default-branch head exactly as Phase 1 does. A failure records a failed or unavailable inspection Observation and no Run. |
| Tree | `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1`, at most 3,000 entries retained, `truncated` recorded when GitHub or the bound cuts it. |
| Repository context | Only repository identity and tree are read initially. Every file path is Pi's choice during a Run; manifest names never reject an application before Pi investigates it. |
| File reads | Contents API at the pinned commit; files over 512 KiB are refused, content over 64 KiB is cut and flagged, binary files store no content, credential-shaped values are redacted and counted. |
| Deny list | `.env*` except `.env.example`-style samples, key material (`.pem`, `.key`, `.p12`, `id_rsa*`), `.netrc`, registry credential files and paths naming secrets or credentials are never fetched. Content is scanned regardless of filename. |
| Per-Run budget | 24 network reads and 256 KiB per Run; the model receives at most 24,000 characters per read. A path already saved at that commit is served from the Observation without a network call. |
| Time and cancellation | Every GitHub request stops at 20 seconds; a read inside a Run also stops with the Run's cancellation or deadline through `AbortSignal.any`. |
| Connection change | A read requires the current connection to be the one the inspection used; otherwise the tool asks for a re-inspection. |

Observations:

- `github-repository-inspection`: status, summary, the tree entries, truncation, commit, default branch, connection, limits. No file contents are fetched by this step. Activity: **Repository inspected** or **Repository inspection did not pass**.
- `github-repository-file`: one per path and commit, with the (bounded, redacted) content, blob SHA, size, flags and the connection used. Saved inside the tool before the content reaches the model, so it survives cancellation. No Activity: reads are diagnostic steps (`read_repository_file`) in local logs and optional spans.

The tree decides absence: a path missing from an untruncated tree is reported as absent with the inspection Observation to cite; a provider failure is a failed read and never proof that a file is absent.

## Application Profile `fastapi-uv` v1

The one supported profile in this build: a single FastAPI service managed with uv, started by an ASGI server in a container, with PostgreSQL as the intended database. Its definition is versioned in [`application-profile.ts`](../../../src/server/application-profile.ts); changing a convention is a new version, which makes contracts built under the old version stale until revised. This does not decide how many profiles V1 supports (U2). PostgreSQL is the profile's target, not an observed fact about any repository.

Profile selection is model-authored interpretation, saved on the Application Contract as `profileSelection` (supported profile ID, rationale and citations). The model distinguishes actual runtime components from development tooling and may use unfamiliar layouts. There is no pyproject parser, required manifest list or competing-manifest classifier. Code validates the selected capability exists and every cited snippet belongs to this application's inspected commit; those checks establish source attribution, not correctness of the interpretation or successful execution. Unsupported applications must be described accurately in the reply rather than relabeled to fit the available profile.

Before that selection exists, profile status is `pending`: repository context is available and Pi can investigate. The selection and complete contract are saved together only after a successful reply, using the existing proposal transaction. A cancelled or stale proposal does not publish a profile selection. Revisions can reuse a saved selection only when its evidence still resolves at the selected commit.

Profile rules with stable identities (`fastapi-uv@1/<rule>`), each governing exactly one material field: `package-manager` = uv (`build.packageManager`), `port` = 8000 (`network.port`), `bind-host` = 0.0.0.0 (`network.bindHost`), `health-path` = /health (`health.path`), `database` = PostgreSQL (`persistence.database`), `logging` = stdout (`observability.logging`).

Material fields (19), grouped for the Record:

| Group | Fields | Notes |
| --- | --- | --- |
| Build | `build.packageManager`, `build.pythonVersion`, `build.containerImage` | Container build is unresolved under F-8 (required before P8.G1) unless a repository Dockerfile exists. |
| Runtime | `runtime.startCommand`, `runtime.application` | |
| Port and bind | `network.port`, `network.bindHost` | A localhost-only bind is conformance work against the `bind-host` rule. |
| Health and readiness | `health.path` | A missing route is conformance work against the `health-path` rule. |
| Persistence | `persistence.database`, `persistence.connectionSetting` | SQLite in container storage contradicts the `database` rule: unresolved, blocker `contradiction`, engineer decision required. Values of connection settings are never recorded. |
| Migrations | `migrations.tool`, `migrations.rollbackPolicy` | Rollback expectation is a policy field (U16, before P8.G2). |
| Configuration and secrets | `configuration.requiredVariables`, `configuration.secretVariables` | Names only. |
| Logs and telemetry | `observability.logging`, `observability.telemetry` | Telemetry is a policy field (U1, before P7.G4). |
| Backup | `backup.policy` | Policy field (U1, before P7.G3). |
| Verification | `verification.smokeChecks`, `verification.requiredChecks` | The required set is a policy field (U15, before P4.G4). |

## Application Contract

Stored as `application_contracts` rows: application, workspace, `version`, profile identity and version, `commit_sha`, the source message, the JSON body and `superseded_by_id`. A revision is a new full row that supersedes the previous one with the same guarded update the Decision replacement uses; nothing is edited in place and prior versions remain readable at `/api/contracts/{id}`. Rows are written only inside the worker's final Run transaction, together with the answer, Decisions and Activity.

Body: `{ profileId, profileVersion, commitSha, summary, fields[] }` where each field is `{ key, value | null, provenance, conformance? }`. Profile identity and commit are bound by the server from the current inspection; the model cannot choose a commit. The schema is TypeBox, shared between the tool parameters and the stored body, because the Pi SDK validates tool arguments with TypeBox; a second Zod copy of the same shape would only drift. The learning guide's Zod exercise is satisfied by this one typed schema plus the deterministic checks below.

### Provenance kinds are not interchangeable

| Kind | Meaning | Validation at proposal and at commit |
| --- | --- | --- |
| `repository-declared` | The value appears verbatim in the repository. | The cited Observation is a passed `github-repository-file` read of this application at the contract's commit, the cited path matches, the quoted snippet occurs verbatim in the saved content, and the value is a verbatim part of the snippet. The source line is computed from the content, never model-supplied. |
| `profile-rule` | The value is a profile convention. | The rule exists in the current profile version, governs this exact field, and the value equals the rule's value exactly. A different value is not a profile rule, and a rule cited for another field (`health.path` justified by the `database` rule) is rejected at proposal time and reported by the provenance review of a stored contract. |
| `user-confirmed` | The engineer chose it. | Either a quote that occurs verbatim in one of the engineer's own messages in this application (`source: user`, never a Server Guy request), or an active saved Decision of this application. |
| `inferred` | Server Guy's interpretation of cited content. | The citation resolves like a declaration, but the value need not be verbatim. Visibly labeled **Inferred** in the Record. |
| `unresolved` (`unknown`, `contradiction`, `unsupported`) | No supported value. | Value must be null; a reason is required; an optional citation resolves like a declaration. Blocks P2.G4. |
| `unresolved` (`policy`) | An open product policy. | Only for the profile's policy fields, with the field's exact dependency; value null. Visible, does not block P2.G4. A policy field given a value is rejected. |

`provider-observed` from the journey is not accepted in this slice: no provider Observation exists yet, and validation of cited records would reject it. A path existing, a snippet matching or the schema validating never proves an arbitrary value; the verbatim and rule-equality checks are what make a declaration or rule claim deterministic, and everything else is labeled as interpretation or left unresolved.

Absence is citable: `{ observationId, absent }` names a passed inspection of this application at the contract commit whose untruncated tree does not contain the path.

Further rules: every material field exactly once; unknown keys rejected; conformance items need a required value plus `observed` and `change`; `revises` must name the current contract when one exists and be absent otherwise. Rejections return numbered reasons to the model as a tool error so it can correct the proposal; a second proposal in the same Run replaces the first.

Credential shapes: right after the schema check and before any other validation, every string of the proposal (summary, values, engineer quotes, citation snippets and paths, reasons, observed text) is matched against the same supported credential patterns that redact repository reads. A match rejects the proposal naming only the JSON path of the offending string, so no later reason, Activity or log can echo the value. This bounds the existing guard; pattern matching does not detect every secret, and the deny list and redaction remain the primary protection for repository content.

Staged identity: a proposal is bound to the inspection commit and profile identity it was validated against. The final transaction first compares that bound commit and profile with the current evidence and fails the Run when either changed, naming both commits, then validates again against current records; a stale `revises` fails the same way. Nothing is re-bound to whatever inspection is current at commit time, so a proposal whose fields are all engineer-confirmed, and therefore cites no read that would otherwise catch the change, cannot be saved at a commit the model never saw. The failure rolls back the answer, Decisions, the contract version, the supersede and Activity together; the chat shows the reason, and the engineer asks again to propose from the current inspection.

Derived, never stored: the **gap report** (blockers, conformance items, open policies) and the **provenance review** (fields whose cited read, rule, message or Decision no longer resolves).

## Phase 2 Gate Checks

Projections computed on every read from the latest inspection, its connection, the profile resolution, the current contract and the provenance review; never stored, never satisfied by history. The evidence keeps connection identity separate from outcome: an inspection made with a replaced login (or after GitHub was disconnected) asks for a fresh one whatever its result, while a failed or unavailable inspection made with the current login keeps its own reason (access denied blocks; a timeout is not-yet) instead of claiming a previous login was used. The tool path applies the same order.

| Check | Passed when | Otherwise |
| --- | --- | --- |
| P2.G1 Supported application profile | The latest inspection passed with the current connection and the current contract contains a cited selection of the supported profile. | Not yet without a current inspection or while Pi has not selected a profile; blocked for failed access or unsupported selections. Offers **Inspect repository** / **Re-inspect repository**. |
| P2.G2 Application Contract complete | A current contract exists at the latest inspection commit under the current profile version with every material field. | Not yet without a contract; blocked when the repository or the profile definition changed since the contract was built. |
| P2.G3 Every field has a source | The provenance review finds every citation, rule, quote and Decision still current. | Blocked naming the fields whose source no longer resolves. |
| P2.G4 No unresolved contract gaps | No unresolved field carries `unknown`, `contradiction` or `unsupported`. | Blocked listing the values that need a decision. Conformance items and policy fields are reported in the result and never block. |

Invalidation: a replaced or removed GitHub login makes the inspection not current (P2.G1 not yet) and records **Repository inspection invalidated** once per inspection; a re-inspection at a new commit blocks P2.G2 until a revision built from reads at that commit; a superseded cited Decision or a missing read blocks P2.G3. Saved file reads keep their content and become citable again after a re-inspection at the same commit. Phase 1 is not reopened automatically; its regression appears in the Phase 2 checks and its completed view stays as recorded.

## Pi in Phase 2

The Run's workspace phase selects a stable system prompt and the tool set; a Chat never changes phase, so its instruction prefix never changes. Phase 1 Runs keep their exact prompt and three tools. Phase 2 Runs add:

| Tool | Input | Effect |
| --- | --- | --- |
| `get_repository_inspection` | `{ prefix? }` | Local read: commit, default branch, bounded tree listing (400 paths per call), the profile resolution with criteria, rules and material fields, files already read, limits. |
| `read_repository_file` | `{ path }` | Pinned read at the inspection commit; saves the Observation before returning `observationId`, content (bounded), size, truncation, redaction and binary flags; reports absence from the tree; denied paths, directories and provider failures are tool errors. |
| `get_application_contract` | `{}` | The current saved contract with ID, version, fields and derived gaps, or `current: null`. |
| `propose_application_contract` | `{ summary, fields, revises? }` | Validates and stages one proposal per Run; returns `pending, not saved` with the derived blockers, conformance items and open policies, or the rejection reasons. |

`get_application_status` is phase-aware: workspace, checks and evidence come from the Chat's phase, and Phase 2 adds a bounded inspection and contract summary within the 12,000-character bound. `search_decisions` and `propose_decision` stay available; a constraint such as "customer data stays in the EU" is a Decision, a field correction such as "health is /healthz" is a contract revision with user-confirmed provenance quoting the message. The Run context carries `userMessageId` so the model can quote the accepted message.

Repository content, READMEs and comments are data: the prompt says so, the tool result wraps them as JSON, the Record renders them as text, and the validator ignores anything they claim. Tool executions are diagnostic steps (`get_repository_inspection`, `read_repository_file`, `get_application_contract`, `propose_application_contract`) in local logs and optional spans; none is Activity. **Application Contract established** and **Application Contract revised** (old → new for up to five fields) are the only contract events.

### Cancellation boundary

Facts and effects differ. A file read saved during a Run is a durable receipt of what the repository contained at that commit; cancellation, timeout, failure or interruption keeps it. The staged contract proposal is an effect that only the final transaction publishes; the same outcomes discard it, and the next Run's context reports the previous attempt as not saved. Retry is a new linked Run that reuses the saved reads without fetching them again.

## Schema

Prototype schema **version 8**. Version 7 was an abandoned branch with incompatible tables; `db:push` refuses it and every other version except 6, which it upgrades in place after writing a `.pre-v8-<id>.backup` copy: two nullable workspace columns are added, Drizzle creates `application_contracts`, and the file is stamped 8. Development databases remain disposable; the upgrade exists so a working checkout keeps its records, not as a general migration facility.

## Implementation map

- [`workspaces.ts`](../../../src/server/workspaces.ts): application/chat loading across phases, the read-only rule.
- [`phase-transition.ts`](../../../src/server/phase-transition.ts): `completeLaunchBrief`.
- [`phase-two.ts`](../../../src/server/phase-two.ts): inspection, pinned reads with budgets, staged proposals, guarded commit, contract view.
- [`application-profile.ts`](../../../src/server/application-profile.ts), [`application-contract.ts`](../../../src/server/application-contract.ts), [`phase-two-spec.ts`](../../../src/server/phase-two-spec.ts): profile, contract schema and validator, checks.
- [`github-inspection.ts`](../../../src/server/github-inspection.ts) and [`secrets.ts`](../../../src/server/secrets.ts): bounded tree and file reads, deny list, redaction.
- [`operator-view.ts`](../../../src/server/operator-view.ts): the phase-aware Operator View and status projection.
- [`pi.ts`](../../../src/server/pi.ts), [`pi-repository.ts`](../../../src/server/pi-repository.ts), [`pi-contract.ts`](../../../src/server/pi-contract.ts): per-phase prompt and tools.
- UI: [`contract-record.tsx`](../../../src/components/server-guy/contract-record.tsx), the phase strip, chat list, chat pane, inspector and check drawer.

## Deliberately out of scope

No deployment, provisioning, DNS, paid infrastructure, repository writes or pull requests; no clone, install, build or code execution; no second profile; no Phase 3 conformance execution or Continue; no U3 contract-confirmation gate; no defaults for U1, U15, U16 or F-8; no reopening of completed phases; no file reads outside a Run; no legacy import; no workflow engine, queue service, second worker or telemetry backend. Real-repository inspection and live model behavior are separate, explicitly authorized checks.

## Image build selection

The model may include `imageBuild: { dockerfile, context?, target? }` in a contract proposal. Paths are repository-relative and validated before saving; context defaults to the repository root and omission uses the standard root Dockerfile. The `build.containerImage` field explains the choice with repository evidence. The saved recipe becomes part of execution configuration, so changing it requires new verification. The builder implements Dockerfile semantics independently of the supported runtime profile; it does not generate a Python-specific image behind the user's back.
