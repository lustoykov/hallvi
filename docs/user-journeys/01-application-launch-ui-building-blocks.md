# Journey 01 UI building-block catalog

Status: workshop draft. This catalog defines a proposed product grammar for the Application Launch experience. It is not an implementation schema and is not evidence that the product exists.

Sources:

- [Journey 01: Launch an application](./01-application-launch.md)
- [Journey 01 Operator UI state map](./01-application-launch-ui-map.md)
- [Visual catalog: stable workspace and operation projections](./diagrams/01-ui-building-block-catalog.html)

## Product decision captured here

Server Guy uses one stable application workspace. Pi may adapt its investigation, explanation, proposed action, and use of typed presentations, but it does not rearrange navigation, move panes, invent statuses, or generate arbitrary interface structures.

The stable workspace contains:

1. application and Operator Session navigation;
2. application identity, environment, Approval Mode, and concise status;
3. the nine-phase Launch map, current Phase Deliverable, and Exit Gate progress;
4. Chat with Pi as the primary interaction surface;
5. a fixed Inspector with **Record**, **Changes**, and **Evidence** destinations;
6. a persistent composer and stable takeover paths.

Dynamic situations are expressed by composing a small set of typed records, presentation families, and detail renderers inside those fixed regions.

```text
canonical operational records
            ↓
seven presentation families
            ↓
Chat · Record · Changes · Evidence
            ↓
one stable application workspace
```

## Three layers that must not be confused

| Layer | Question it answers | Examples |
| --- | --- | --- |
| **Domain record** | What durable operational thing exists? | Operation, Gate Check, Observation, Decision Record |
| **Presentation family** | What kind of interaction is happening? | Approval, Intervention, Outcome |
| **Detail renderer** | How is one technical artifact inspected? | pull-request diff, command output, provider receipt |

A DNS conflict is not a special screen. It is an **Intervention** presentation composed from a Blocker, affected Gate Checks, current Observations, proposed Operations, and DNS-specific change/evidence renderers.

## Canonical records used by the grammar

The catalog reuses the canonical terms in [`CONTEXT.md`](../../CONTEXT.md). It deliberately avoids turning every UI field into a new domain object.

| Record | What it contributes to the UI |
| --- | --- |
| **Phase Deliverable** | The durable outcome Pi is working toward in the current Launch Phase. |
| **Gate Check** | The observable condition controlling whether the phase can advance. |
| **Decision Record** | A user choice or constraint recognized from conversation, including its origin and affected scope. |
| **Operation** | One intended external effect and its current proposal, authority, execution, reconciliation, verification, and outcome state. |
| **Approval Record** | Historical evidence explaining why an Operation was permitted at that time. |
| **Observation** | A source-attributed and timestamped result such as a command output, provider response, log event, probe, revision, or configuration value. |
| **Operational Claim** | A user-visible assertion supported by cited records and Observations. |
| **Evidence Reference** | The inspectable route from a claim to its source, time, collection method, raw result, and limits. |
| **Blocker** | A precise unresolved condition preventing an Operation or Exit Gate from advancing. |

The following are fields or relationships, not additional top-level product nouns:

- subject identity: repository, host, domain, Release, pull request, worker, or provider object;
- actor: engineer, Pi, External Agent Client, Server Guy component, or provider;
- authority context: active Approval Mode, affected scope, and any explicit approval;
- provenance and freshness;
- affected Gate Checks and downstream claims;
- proposed and available actions.

Repository work handed to Pi, Codex, Claude, or the engineer is a specialized collaboration over a bounded brief, starting revision, returned artifacts, and acceptance evidence. We should not introduce a separate workflow engine merely to render it.

## Universal information contract

Every presentation family must make these questions answerable. A field may be compact or opened on demand, but it must have a stable home.

| Information group | The user must be able to learn | Default home |
| --- | --- | --- |
| **Orientation** | What application, environment, Launch Phase, deliverable, and subject am I looking at? | Header, Launch map, presentation title |
| **Current condition** | What is happening now, what status vocabulary applies, and who is acting? | Chat activity and Record |
| **Meaning** | Why does this matter now and what is Pi currently trying to accomplish? | Chat with Pi |
| **Gate impact** | Which Gate Check or outcome is advanced, waiting, or blocked? | Record |
| **Authority and consequence** | Would this change external state, who would perform it, what material scope or cost is involved, and does the current Approval Mode require input? | Record and Approval presentation |
| **Provenance and freshness** | Where did the value come from, when was it observed, and could it now be stale? | Record summary and Evidence |
| **Net change** | What code, configuration, provider object, or Release would differ? | Changes |
| **Proof and limits** | Which Observations support the claim, what raw output exists, and what does the evidence not prove? | Evidence |
| **Control** | Can I ask Pi, inspect the source, modify or take over, approve/reject where applicable, stop, or re-run verification? | Chat actions and Inspector links |
| **Transition** | What can happen next, and what observable bar must pass? | Chat and Record |

The UI may progressively disclose dense technical material, but it must never replace provenance or evidence with Pi-authored prose.

## Seven presentation families

### 1. Input / Decision

Use when the engineer must provide information, choose a path, correct a value, or confirm an interpretation.

Must surface:

- the question or decision and why it matters now;
- required versus optional inputs;
- known defaults and their provenance;
- available paths and material consequences;
- whether the choice may be deferred;
- affected Phase Deliverable and Gate Checks;
- current value and originating Operator Session after recognition;
- free-text collaboration plus structured controls where they reduce ambiguity.

Variants: collect, prerequisite, choose path, correct, confirm.

Journey examples: `L1.1`, `L1.2`, `L5.1`, `L6.1`.

### 2. Review / Proposal

Use when Pi has formed a structured interpretation, contract, plan, candidate, or proposed change for engineer review.

Must surface:

- the exact subject and current versus proposed state;
- assumptions, unknowns, provenance, and evidence freshness;
- material cost, risk, and user/provider responsibilities;
- affected Gate Checks and acceptance conditions;
- a net diff when revising an earlier proposal;
- actions to correct, ask Pi, inspect sources, or continue.

Variants: contract, plan, plan diff, candidate, responsibility matrix.

Journey examples: `L2.2`, `L3.1`, `L4.1`, `L4.2`, `L7.1`, `L8.1`.

### 3. Approval

Use when the current Approval Mode requires the engineer to authorize a proposed state-changing Operation.

Must surface:

- intended effect, target environment, and actor;
- material scope, recurring or one-time cost, risk, and reversibility;
- why approval is requested under the active Approval Mode;
- verification and recovery intent;
- what will not be changed;
- approve, reject, modify, inspect, and ask-Pi actions;
- freshness: a materially changed proposal requires a new approval decision.

The presentation binds approval to understandable intent and material scope. It does not need to expose every low-level argument when doing so would create false precision or obstruct Pi's adaptive execution.

Variants: approve/reject/modify, approval not required, approval stale.

Journey example: `L5.2`.

### 4. Operation

Use while Pi or another actor is inspecting, executing, reconciling, or waiting on one bounded operational objective.

Must surface:

- Operation identity, intended effect, actor, target, and status;
- current objective and most recent meaningful event;
- affected Gate Checks;
- concise commands or tool actions and their outcomes;
- provider receipts, resource identities, and reconciliation state when relevant;
- whether external state is currently changing;
- pause, stop, inspect, take-over, or check-now controls where meaningful;
- the next observation or completion bar.

Variants: inspecting, executing, reconciling, waiting externally.

Journey examples: `L2.1`, `L5.3`, `L6.5`, `L6.7`, `L7.2`, `L8.2`.

### 5. Intervention

Use when progress cannot continue normally: unsupported input, conflict, missing responsibility, failed verification, or a reachable-but-unverified candidate.

Must surface:

- the precise problem and affected subject;
- supporting and missing evidence;
- affected Gate Checks and operational consequence;
- Pi's interpretation kept distinct from the Observations;
- current safe or predecessor state where relevant;
- bounded resolution options and their expected effects;
- owner of the next action;
- stop, investigate, modify, retry, or take-over paths.

Variants: blocked, conflict, failed, incomplete, reachable-not-verified.

Journey examples: `L2.3`, `L6.6`, `L7.3`, `L8.3`, `L8.4`.

### 6. Outcome

Use when a meaningful result is ready, complete, complete with gaps, verified, or operational.

Must surface:

- exact subject and resulting identity;
- passed and remaining Gate Checks;
- supporting claims and Evidence References;
- evidence time and point-in-time limits;
- accepted gaps, ownership, and consequences;
- net changes and artifacts produced;
- next Phase or ongoing operational responsibility;
- inspect, refresh, continue, or address-gap actions.

Variants: ready, complete, complete-with-gaps, verified, operational.

Journey examples: `L1.3`, `L5.4`, `L6.8`, `L7.4`, `L8.5`, `L9.1–L9.3`.

### 7. Handoff

Use when work crosses into another working environment or a user-owned external account step.

Must surface:

- bounded objective and acceptance conditions;
- selected actor or working environment;
- starting revision or external starting state;
- supplied context and evidence boundaries;
- active, paused, and resumable status;
- returned branch, artifacts, provider state, tests, and evidence;
- what Server Guy has independently re-verified versus what the worker merely reported;
- resume, switch, inspect, take-over, or run-acceptance-check actions.

Variants: choose worker, active work, returned result, user-owned account step.

Journey examples: `L3.W1–L3.W3`, `L3.2`, `L6.3`, `L6.4`.

## Fixed Inspector destinations

One canonical record is projected differently rather than copied into several competing summaries.

| Surface | Stable responsibility | It must not become |
| --- | --- | --- |
| **Chat** | Chronological intent, interpretation, questions, concise activity, and next action. | The only source of operational truth or a full log dump. |
| **Record** | Current durable facts, decisions, Operation status, authority context, Gate Checks, blockers, and claim status. | A second chat transcript or a wall of provider detail. |
| **Changes** | Net effect on repository files, configuration, provider objects, infrastructure, and Releases, with review controls. | Evidence that the result works merely because a change exists. |
| **Evidence** | Observations, receipts, logs, traces, probes, raw output, timestamps, collection methods, artifacts, and limits. | Pi's interpretation or product documentation. |

Repeat only the subject title, stable identity, and status when needed for orientation. Everything else should be projected from the same underlying records.

Example:

```text
op_dns_route_017
├── Chat      why Pi proposed it, progress, and next action
├── Record    current status, scope, authority, blocker, and gate impact
├── Changes   DNS record diff and affected Cloudflare objects
└── Evidence  API receipt, DNS answers, TLS probe, time, and raw output
```

The product must not switch Inspector tabs automatically. Chat and Record may link directly to the relevant Changes or Evidence item while preserving the user's current location until they choose to open it.

## Technical detail renderers

These render technical artifacts inside **Changes** or **Evidence**. They are not new workflow presentations.

| Renderer | Required information | Primary destination |
| --- | --- | --- |
| **Command result** | actor/tool, command or operation summary, target, start/end time, exit/result, concise output, raw-output link, redaction note | Evidence; concise event in Chat |
| **File or configuration diff** | source identity, base/current revisions, changed paths/keys, semantic summary, exact diff, review/open-source actions | Changes |
| **Commit or pull request** | repository, branch, base, commit, author/worker, status, changed files, linked objective and checks | Changes |
| **CI or check list** | run identity, exact revision, individual check state, duration, logs, rerun source, staleness | Changes with evidence links |
| **Log or trace stream** | source/service, environment, time range, query/filter, ordered events/spans, truncation and retention limits | Evidence |
| **Provider object, request, or receipt** | provider, account/project scope, object identity, intended/applied values, request/receipt identity, provider status and time | Changes for net effect; Evidence for receipt |
| **External probe** | vantage point, target, protocol, request, response, timing, TLS/DNS details, collection time and raw result | Evidence |
| **Immutable artifact** | artifact type, digest/identity, producing revision/run, creation time, storage location and verification | Changes and Evidence |

Full diffs, logs, traces, and raw command output remain collapsed or linked by default. Chat shows the concise event and result; the Inspector shows the technical depth.

## Coverage of all 39 Journey 1 states

The family is selected by the interaction taking place, not by a hard-coded screen ID.

| State | Primary family | Important variant or renderer |
| --- | --- | --- |
| `L1.1` Start launch | Input / Decision | collect |
| `L1.2` Prerequisites visible | Input / Decision | prerequisite |
| `L1.3` Workspace created | Outcome | ready |
| `L2.1` Repository inspection | Operation | inspecting; command/observation |
| `L2.2` Contract review | Review / Proposal | contract |
| `L2.3` Profile gap or unsupported repository | Intervention | blocked |
| `L3.1` Conformance plan | Review / Proposal | plan |
| `L3.W1` Choose repository working environment | Handoff | choose worker |
| `L3.W2` Repository work active | Handoff | active work |
| `L3.W3` Repository result returned | Handoff | returned result |
| `L3.2` Reviewable repository change | Handoff | pull request, diff, CI |
| `L3.3` Conformance outcome | Outcome | complete or complete-with-gaps |
| `L4.1` Launch intent review | Review / Proposal | plan |
| `L4.2` Launch intent revised by evidence | Review / Proposal | plan diff |
| `L4.3` Ready to establish infrastructure | Outcome | ready |
| `L5.1` Hetzner access | Input / Decision | prerequisite and correction |
| `L5.2` VPS action gate | Approval | intended paid effect |
| `L5.3` VPS provisioning | Operation | executing and provider receipt |
| `L5.4` Owned host ready | Outcome | ready and provider object |
| `L6.1` Choose hostname and path | Input / Decision | choose path |
| `L6.2` Existing Cloudflare-controlled domain | Review / Proposal | route proposal |
| `L6.3` Domain registered elsewhere | Handoff | user-owned account step |
| `L6.4` No domain owned | Handoff | user-owned checkout boundary |
| `L6.5` Waiting for control or propagation | Operation | waiting externally and probe |
| `L6.6` Existing DNS conflict | Intervention | conflict and provider diff |
| `L6.7` Configure route and HTTPS | Operation | executing and provider receipts |
| `L6.8` Public hostname verified | Outcome | verified and external probe |
| `L7.1` Operational baseline scope | Review / Proposal | responsibility matrix |
| `L7.2` Establish operations | Operation | executing with mixed renderers |
| `L7.3` Operational responsibility incomplete | Intervention | incomplete or accepted gap |
| `L7.4` Environment ready for Release | Outcome | ready or complete-with-gaps |
| `L8.1` First Release candidate | Review / Proposal | candidate and immutable artifact |
| `L8.2` Deploying | Operation | executing, migrations, deployment, probes |
| `L8.3` Reachable, not Verified | Intervention | reachable-not-verified |
| `L8.4` Verification failed | Intervention | failed, predecessor, logs and probes |
| `L8.5` Verified live | Outcome | verified Release and evidence |
| `L9.1` Operational handoff overview | Outcome | operational summary |
| `L9.2` Evidence and outstanding gaps | Outcome | complete-with-gaps and evidence |
| `L9.3` Ongoing application workspace | Outcome | operational |

## Stress tests for the grammar

### Existing DNS conflict

```text
Intervention
├── Blocker: conflicting DNS record
├── affected Gate Check: intended route unresolved
├── Observations: current Cloudflare and public DNS answers
├── proposed Operation: modify or preserve named records
├── Changes renderer: before/after DNS diff
└── Evidence renderer: API receipt and refreshed external DNS answer
```

No special `L6.6` workflow is required. A new conflict type should add records, resolution options, and a verifier—not a new application shell.

### Reviewable repository change

```text
Handoff
├── bounded repository objective and acceptance checks
├── worker and starting revision
├── returned branch or pull request
├── Changes: commit, file diff, CI checks
├── Evidence: test logs and harness artifacts
└── Server Guy re-verification against the Application Contract
```

A coding agent's claim that work is complete is progress evidence, not a conformant outcome by itself.

### DNS propagation wait

```text
Operation · waiting externally
├── latest NS / SOA / DNS Observations
├── elapsed time and next planned check
├── no external effect in flight
└── check now · continue waiting · inspect source
```

### Failed Release verification

```text
Intervention · failed
├── exact candidate Release
├── failed Gate Check and current evidence
├── predecessor availability
├── Pi's revisable diagnosis
├── proposed remediation or recovery Operation
└── logs · traces · probes · deployment receipts
```

## Rules that keep the product predictable

- Pi may select the relevant presentation family and populate model-authored explanation; it may not invent new layout regions or visual meanings.
- Navigation, pane placement, Inspector destinations, Launch-map placement, status vocabulary, approval affordances, and evidence/takeover locations remain stable.
- A presentation is rendered from canonical records. It must not maintain an independent status that can drift from the Operator Record.
- A material claim always exposes an Evidence Reference or clearly states that supporting evidence is missing.
- Pi prose remains visibly interpretive; it does not render as an Observation, Gate Check result, or approval.
- New situations should first be expressed as existing family + records + detail renderers. A new family is justified only when the user's interaction and information needs are materially different.
- Expert depth is progressively disclosed, not hidden behind an “expert mode.”
- Automatic tab switching, arbitrary pane creation, phase-specific navigation changes, and expanded raw logs in Chat are prohibited.

## Catalog acceptance checks

The catalog is ready to drive the next prototype when:

- all 39 mapped states have a primary family;
- the `L3.W1–L3.W3` handoff states are selectable and inspectable, not hidden as an uncounted side flow;
- each family identifies its default information, evidence, actions, and next transition;
- every developer artifact has a stable Changes or Evidence renderer;
- the same Operation can be traced across Chat, Record, Changes, and Evidence without copied, contradictory summaries;
- a first-time self-hoster can understand the meaning and next action while a senior engineer can inspect and take over;
- DNS conflict, propagation waiting, repository handoff, and failed Release verification require no bespoke shell.

## Open design questions to test in the prototype

1. Does **Handoff** remain coherent when it covers both coding-agent collaboration and user-owned registrar/checkout steps, or do those interactions require separate families?
2. Does **Changes** remain understandable when it includes code, configuration, provider-object, infrastructure, and Release changes?
3. How much command and check detail can Chat show before it stops feeling like the primary collaborative surface?

These are prototype questions, not reasons to add more families preemptively.
