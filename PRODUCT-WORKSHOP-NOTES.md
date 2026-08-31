# Server Guy product workshop notes

Status: living planning notes, not a finished specification and not evidence of implementation.

Last updated: 2026-08-31

These notes preserve decisions, hypotheses, and unresolved questions from the product workshop. They should later be distilled into a tight product specification. Unresolved choices must not be presented as settled in that specification.

## Product thesis

Server Guy is an open-source, AI-native deployment and operations agent for individual software engineers who want to own and self-host their applications without repeatedly reconstructing infrastructure knowledge and configuration.

Its primary job is:

> Get my application live and keep it healthy.

It should be a genuinely useful product rather than a course toy. It is also intended to become the end project and teaching artifact for the user's agent-engineering course.

The initial user is an engineer or technically capable tinkerer who:

- wants to own the application and infrastructure;
- can collaborate on difficult engineering decisions;
- does not want to remember or manually repeat deployment and operational configuration;
- values inspectability and control more than a fully opaque managed platform;
- prefers using an existing Codex, Claude, Copilot, or similar subscription where practical instead of accumulating large API bills.

The product should eventually feel like giving an application to a capable server operator who can deploy it, observe it, diagnose it, collaborate when necessary, and produce reviewable evidence.

## Product positioning

Settled positioning:

> PaaS-like deployment and recovery on infrastructure the customer owns, with predictable VPS economics.

Server Guy should not compete merely as the cheapest hosting option. Its value is the managed-platform experience it creates on user-owned infrastructure: application deployment, observation, recovery, and operational evidence without surrendering infrastructure ownership or accepting opaque usage-based pricing. Hetzner remains the V1 reference infrastructure rather than the product's identity or permanent provider boundary.

## Central architecture principle

Product-owner correction:

> Server Guy is a model-native operations agent with user-selected approval modes.

"Model-native" means Pi is the operator and primary adaptive control loop, not a proposal generator filling slots in a conventional workflow. Server Guy should give Pi a durable workplace: application context, operational memory, broad tools, credential-scoped environments, independent observations, resumability, and an operator UI. The surrounding software should provide a reliable floor without replacing Pi's capability ceiling.

Pi supplies adaptive judgment and should be free to select actions, compose commands, and revise execution as new evidence appears. Server Guy should not require every useful operation to be represented as a predefined capability with fully bound parameters.

The user selects a small, explicit Approval Mode instead of constructing a detailed Operational Mandate or accumulating one-off approval rules. Depending on that mode, Pi may act without asking, decide for itself when approval is warranted, or be required to ask before every state-changing operation.

Server Guy should not infer future authority from approval history. It should record the active Approval Mode and any explicit approval as evidence of why an action was allowed at the time, but that Approval Record is not permission or precedent for a later operation.

Deterministic capability implementations remain useful for common, repeatable, or especially dangerous operations such as rollback, backup restoration, DNS mutation, and machine provisioning. They are trusted tools Pi may choose, not necessarily the exclusive route through which Pi can operate. A scoped shell or provider tool may be appropriate when novel work is required.

This is not a mostly deterministic workflow with a small AI feature. Many important operational steps require contextual, non-deterministic judgment: selecting relevant evidence, interpreting logs and metrics, diagnosing unfamiliar failures, composing an appropriate plan, adapting that plan, and assessing semantic recovery.

At the same time, Pi must not silently change the user-selected Approval Mode or the scope to which it applies. This is narrower than saying deterministic code must own every privileged action.

### Responsibility split

| Question or responsibility | Primary owner |
| --- | --- |
| Which observations are relevant? | Pi |
| What is probably happening? | Pi |
| Which action is operationally appropriate? | Pi |
| Who selects approval behavior? | The user, through an explicit Approval Mode |
| When is an approval requested? | The selected Approval Mode; Pi itself makes the judgment in Pi Decides mode |
| How is a privileged action performed? | Pi through a scoped shell/tool or a reusable deterministic capability |
| Did mandatory checks pass? | Deterministic verification |
| Do the results semantically indicate recovery? | Pi, constrained by mandatory checks |
| What operational state is recorded? | Server Guy code |

"Appropriate" and "approved" are intentionally different. Pi judges whether restarting PostgreSQL is appropriate; the selected Approval Mode determines whether it must ask first.

## The role of Pi

Current direction:

- Pi is Server Guy's only embedded Agent Runtime.
- All probabilistic reasoning performed inside Server Guy goes through Pi.
- The actual Model Backend may be Codex, Claude, Gemini, or another model supported through Pi.
- Server Guy does not independently build parallel OpenAI, Anthropic, or Pydantic AI agent loops in V1.
- Official API access, when needed, should also sit behind Pi rather than becoming another Server Guy reasoning runtime.
- Pi is central to the product, but Server Guy's domain, state, evidence, policy, and privileged capabilities should not be encoded only inside Pi-specific APIs.

Pi may serve two roles:

1. **Operational Reasoner**: inspect evidence, select relevant observations, diagnose, propose a plan, request more evidence, and assess results.
2. **Repository Executor**: work inside an isolated repository environment, edit and test code, and prepare a Remediation PR.

Pi must run inside an execution sandbox appropriate to its task. Its lack of a built-in permission boundary means that a tool allowlist alone is insufficient if it retains unrestricted shell access.

Subscription-backed local operation is an important cost advantage, but not every provider subscription behaves identically. In particular, Pi's current Claude subscription path may use separately billed extra usage rather than included plan limits. Always-on operation on a VPS also raises unresolved credential and provider-terms questions.

## Server Guy's durable product value

Pi supplies general reasoning, but Server Guy supplies opinionated operational knowledge and a controlled operational environment:

- application and infrastructure contracts;
- supported deployment profiles;
- evidence collection and provenance;
- operational capability implementations;
- incident and release state;
- safety policies and approval boundaries;
- stack- and provider-specific runbooks;
- mandatory verification rules;
- audit history and evidence bundles;
- handoff conventions for external coding agents.

This knowledge should not be dismissed as generic boilerplate. It is the reusable operational system that turns a general coding agent into Server Guy.

## Core operational model

Settled direction:

> The durable, resumable Operator Session is Server Guy's primary execution model. Pi controls the adaptive operational loop.

Inspect, Resolve profile, Plan, Policy, Approval, Execute, Verify, and Evidence may remain useful classifications for Session Events and UI presentation. They are not a required sequence imposed on Pi. Pi may inspect, act, gather more evidence, revise its explanation, ask the user, or enter a bounded Guided Operation as the situation requires.

Server Guy records Pi's visible intent, tool calls, commands, results, conclusions, approvals, and verification evidence. It does not expose or require private model reasoning.

A Guided Operation is a bounded rigid subflow inside an Operator Session. It is appropriate when the operation itself has a stable ordered protocol, especially for an external transaction, a destructive or difficult-to-reverse sequence, or a process requiring specific user-supplied information. It should not become the default shape of deployment or incident response.

Temporal is not planned for V1. It may be reconsidered only if the proven needs of durable Operator Sessions, long waits, retries, and recovery cannot be handled cleanly without it. The course stack is general orientation rather than a requirement that should distort the product.

## Product interfaces

Current V1 interface direction:

1. **Next.js operator UI** for engineers.
2. **Server Guy MCP server** for external agents.

No general-purpose public REST API or user-facing CLI is currently planned for V1. Internal service and transport boundaries may still use HTTP. A remotely hosted MCP endpoint also uses an HTTP transport underneath and therefore requires authentication, authorization, TLS, and application/incident scoping.

The first UI should make the Operator Session inspectable without reducing the product to chat. Conversation is an input and collaboration surface; it is not the whole interface.

The Operator View should include:

- applications and current status;
- per-application conversation with Server Guy;
- Pi's current objective and visible intent;
- live activity showing tools, commands, results, and status;
- proposed plans and approval requests;
- deployment and incident timelines;
- evidence and explanations;
- remediation and recovery progress;
- a few predefined operational views.

Structured cards, timelines, diffs, status indicators, and evidence views should be derived from the same Session Events that Pi produces while working. The UI should summarize noisy activity but always let the engineer inspect the underlying operational record.

Custom dashboard generation and richer analytics views may come later. Pi should eventually be able to build an on-demand dashboard from Server Guy's telemetry when that is more useful than a fixed view.

## Grounding use cases

The workshop is now grounded in [USE-CASES.md](./USE-CASES.md). Product and architecture choices should be tested against these journeys rather than discussed only in the abstract:

1. Application Launch from repository to live, externally observed service.
2. Detect application unavailability and Alert the engineer while the laptop may be offline.
3. Investigate an Incident Case, remediate it, and verify Recovery.
4. Connect Codex through MCP for evidence-backed investigation and repository remediation.
5. Ship a new Release of an already-live application and either verify or transition back.

The Operational Control Plane is the authoritative state and execution system. The Operator UI is how the engineer sees and controls it. The control plane must not be used as a synonym for a dashboard or application screen.

## Agent-neutral capabilities

Capabilities must belong to Server Guy, not to the Pi integration. Pi tools and MCP tools are adapters over the same typed application capabilities.

### Evidence capabilities

Read-only capabilities may expose:

- application and endpoint health;
- deployment and configuration history;
- relevant logs, traces, and metrics;
- infrastructure state;
- recent operational changes;
- CI and GitHub state;
- backup status;
- previous incidents;
- bounded Evidence Bundles for a Release or Incident Case.

### Proposal capabilities

Agents may be allowed to:

- record a Finding;
- propose a Diagnosis;
- propose or revise an Operational Plan;
- request more evidence;
- prepare a remediation assignment;
- register or submit a Candidate Fix or Remediation PR;
- request verification, deployment, or another controlled operation.

Submitting a proposal does not authorize or perform its privileged action.

### Privileged capabilities

Examples include deployment, rollback, restart, DNS mutation, machine provisioning, backup restoration, credential rotation, and release promotion. Pi may use these according to the selected Approval Mode. Reusable capabilities provide a reliable route for common operations without excluding scoped shell or provider tools for novel work.

## Evidence model

The following concepts must stay separate:

- **Observation**: a captured operational fact such as a log event, metric sample, trace, configuration value, command result, source revision, or provider response.
- **Evidence Selection**: observations Pi identifies as relevant to a particular claim.
- **Finding**: an agent's interpretation of selected evidence.
- **Diagnosis**: Server Guy's currently accepted explanation of an operational problem.
- **Evidence Bundle**: a bounded, structured, redacted, timestamped, source-attributed package assembled for a Release, Incident Case, or agent handoff.

Server Guy should preserve provenance and make Pi's evidence selection inspectable. A model conclusion must not silently become operational fact.

The same Evidence Bundle should be usable by Pi, Codex, Claude, and a human engineer. Each integration should not independently scrape dashboards and reconstruct operational context.

## External coding agents

Codex and Claude should be optional External Agent Clients rather than additional embedded runtimes.

Two distinct flows are intended:

```text
Engineer -> Server Guy UI -> Pi -> proposed operation -> Approval Mode -> execution
```

```text
Engineer -> Codex or Claude -> Server Guy MCP -> evidence and proposal tools
         -> repository work -> Candidate Fix -> Server Guy verification
```

An external agent already supplies its own reasoning, so Server Guy should not automatically create a nested Pi-to-Codex-to-Pi loop. Server Guy may publish agent-specific skills that teach Codex or Claude how to investigate with its MCP capabilities, but the canonical operational semantics live in Server Guy.

## Application-code remediation

Current direction:

- Server Guy focuses primarily on deployment, configuration, infrastructure, and operational work.
- It may produce application code when necessary, but application-code fixes are not its unique value.
- Pi, Codex, or Claude may author a Candidate Fix.
- Every application-code remediation should become a reviewable Remediation PR.
- Server Guy owns the Diagnosis, acceptance criteria, evidence handoff, verification, deployment, and recovery assessment even when another agent authors the code.
- Candidate Fixes remain untrusted until repository checks and Server Guy's recovery verification pass.

GitHub Actions should provide CI evidence and gates rather than become Server Guy's durable orchestrator. Agent-generated commit bursts may require coalescing or superseding obsolete runs, but that is an implementation detail to address later.

## Deployment and infrastructure direction

The first narrow provider spine is currently:

- Hetzner for the VPS;
- Cloudflare for DNS/domain-related capabilities and an always-on external observation component;
- Ubuntu LTS;
- Docker-based application packaging;
- PostgreSQL where required by the supported application profile.

The VPS and domain are separate user-owned actions with separate plans and approval gates.

Domain onboarding should initially be guided manual setup. Browser-based domain automation can be an experimental course exercise and possibly a later product capability, with explicit user approval before external account actions.

V1 Domain Setup should support both an already-owned domain and no-domain-yet starting paths. Server Guy guides purchase, zone addition, and nameserver delegation where needed; Pi begins automated Cloudflare DNS routing, HTTPS setup, and external verification only after domain control is observable.

The provider should eventually be replaceable through a contract, but a provider marketplace is not an initial objective. Hetzner and Cloudflare should be implemented deeply enough to discover the real abstraction before generalizing.

## Application contracts and profiles

Applications should conform to a Server Guy application contract rather than forcing Server Guy to infer every behavior from scratch. Server Guy may guide or prepare changes that make an application conformant.

The contract is expected to cover concerns such as:

- build and runtime entry points;
- health and readiness behavior;
- migrations;
- configuration and secrets;
- structured logs;
- telemetry;
- backup requirements;
- verification scenarios.

Current first-profile direction is Next.js + PostgreSQL and FastAPI + uv + PostgreSQL. TanStack Start is a likely later conformance profile. The exact number of profiles that must be complete in V1 remains unresolved.

The long-term extension model may support additional application profiles and infrastructure providers, but only after the initial contracts prove stable. Simplicity is more important than an early marketplace.

## Observation, analytics, backups, and cost

Server Guy should be a one-stop operational environment rather than requiring every user to assemble unrelated monitoring products.

Current direction:

- provide first-party health, log, trace, and telemetry ingestion suitable for Server Guy's control plane;
- offer an SDK or instrumentation contract where application changes are useful;
- support OpenTelemetry where practical instead of inventing a closed telemetry format;
- make operational data directly accessible to Pi and external agents;
- derive lightweight audience/product analytics from telemetry where technically and ethically appropriate;
- provide a few useful fixed views and eventually on-demand dashboards;
- include database backup awareness and eventually managed backup/restore workflows;
- provide lightweight cost-threshold monitoring by querying provider data rather than building a full FinOps product.

PostHog is a useful product reference for integrated capture, exploration, and actionable product insight. Server Guy's differentiator should be agent-accessible operational and usage data rather than embedding a separate agent harness into an analytics product.

Exact log, telemetry, and backup storage backends, retention periods, privacy defaults, and restore guarantees remain unresolved.

Dependency security updates and broad capacity optimization are later responsibilities rather than core V1 scope.

## Runtime topology

Current direction is local-first:

- the main Server Guy experience can run on the engineer's computer;
- a lightweight daemon or sentinel on/near the VPS continues basic observation and deterministic recovery signaling;
- a Cloudflare-hosted sentinel is the current always-on observation direction;
- when the local control plane starts, it can resume from durable events and evidence;
- a self-hosted always-on Server Guy deployment may be supported later;
- a Server Guy-operated cloud service should not be assumed for V1.

A remotely hosted Server Guy could expose an authenticated MCP endpoint so local or cloud Codex/Claude sessions can investigate it. This does not by itself solve unattended reasoning: Pi must also be running on always-on infrastructure with an acceptable model-authentication arrangement.

Cloud coding tasks may later investigate or prepare fixes while the user's computer is offline. They are optional workers, not the source of operational truth or the primary health-check mechanism.

## Trust and autonomy

Current high-level direction:

- Pi records a visible current intent or short plan before consequential action. This is a model-authored part of the Operator Session, not a fixed workflow gate.
- Read-only observation and evidence collection can generally run automatically.
- **Full Autonomy**: Pi may perform state-changing operations without required user approval. Pi may still ask when it lacks information or genuinely cannot infer the user's intent.
- **Pi Decides**: Pi decides whether a state-changing operation warrants user approval.
- **Always Ask**: Server Guy requires approval before every state-changing operation; read-only observation remains automatic.
- The active mode and explicit approvals are recorded in the Release or Incident Case as evidence, but past approvals never grant future permission.
- The scope at which a mode is selected, and whether any actions remain user-only even in Full Autonomy, are unresolved.

The product should prefer the smallest set of guardrails that preserves user intent without unnecessarily lowering Pi's capability ceiling. "Safe" must eventually be defined through explicit properties such as authorization, bounded scope, evidence, and escalation. Not every action needs to be predefined, reversible, idempotent, or reducible to deterministic parameters before Pi may perform it.

"Autonomous" refers specifically to Full Autonomy mode and must still identify the application, environment, and operational context in which Pi is acting.

## Course and evaluation direction

Server Guy should expose the important agent-engineering lessons naturally, but the product should not be distorted merely to include every item from the learning stack.

The current stack remains useful orientation: native model/provider concepts, Pi, Pydantic models/evals, durable workflows, FastAPI, pytest, OpenTelemetry/Logfire, and a Next.js operator UI. Temporal and Pydantic AI must earn their place through product needs or focused learning exercises.

Evaluation should combine:

- deterministic simulated repositories and infrastructure;
- replay/fake judgment backends for reliable tests;
- model-quality evaluations where interpretation or planning genuinely requires judgment;
- end-to-end scenarios that verify operational outcomes and evidence, not merely agent prose.

## Definition of V1 success

Settled:

> Server Guy takes a supported application from repository to live on Hetzner and Cloudflare, continuously observes it, detects a representative failure, uses Pi to diagnose and plan recovery, performs the remediation according to the selected Approval Mode, and verifies recovery with evidence.

This favors one narrow, complete deployment-to-recovery lifecycle over many partially supported stacks and incident types.

## Settled decisions

- Core job: get my application live and keep it healthy.
- V1 must prove the complete repository-to-deployment-to-incident-recovery loop for a narrow supported application.
- Product is for individual engineers and tinkerers first, not enterprises.
- Open-source and useful in its own right; also a course capstone.
- Pi is the only embedded Agent Runtime and is central to the product.
- A durable, resumable Operator Session is the primary execution model; Pi controls the adaptive operational loop.
- Inspect -> Resolve profile -> Plan -> Policy -> Approval -> Execute -> Verify -> Evidence is descriptive vocabulary for the record and UI, not an orchestrated sequence.
- The UI must make Pi's visible intent, live actions, commands, results, evidence, approvals, and progress inspectable without exposing private model reasoning.
- Rigid Guided Operations may exist as bounded subflows when the operation itself has a stable ordered protocol; they are not the default product architecture.
- The user selects approval behavior from a small number of explicit modes; Pi may perform privileged work according to the selected mode.
- UI is the first-class human interface; MCP is the first-class external-agent interface.
- No general public REST API or user-facing CLI is planned for V1.
- External agents receive evidence and submit proposals/candidates through Server Guy rather than bypassing it.
- Application-code fixes use reviewable Remediation PRs.
- Hetzner and Cloudflare form the first provider spine.
- Domain and VPS operations have separate plans and approval gates.
- V1 Domain Setup supports both existing-domain and no-domain-yet starting paths as guided flows; automated routing and verification begin after control is observed.
- Start with a precise application/provider contract; generalize only after proving it.
- Database backups belong in the product responsibility; dependency updates come later.
- Cost management should be lightweight and threshold-oriented.

## Current hypotheses requiring validation

- Pi is mature and stable enough to be the default local runtime.
- Pi's SDK or RPC boundary is sufficient without forcing Server Guy's backend to be TypeScript.
- Subscription-backed Pi operation produces an acceptable individual-user cost model.
- A Cloudflare sentinel plus local control plane provides enough continuity for the first product.
- Remote MCP is sufficient as the first public agent integration surface.
- OpenTelemetry can support both operational diagnosis and useful lightweight audience analytics without creating excessive instrumentation or privacy burden.
- The initial application contract can support both Next.js and FastAPI without becoming vague.

## High-leverage unresolved questions

1. At 03:00 the sentinel sees the application is down and the engineer's computer is offline. What has happened by the time the engineer opens Server Guy at 08:00: Alert only, deterministic reflex, or always-on Pi investigation and action?
2. Is the primary UI an application workspace containing an Operator View and conversation, or a conversation-first interface with operational views attached?
3. In Full Autonomy mode, are purchases, destructive data operations, backup restoration, machine deletion, and similarly consequential actions also ungated, or does a very small user-only category remain?
4. At what scope is an Approval Mode selected: application default, individual Release or Incident Case, or both through an explicit override?
5. Does V1 fully support one application profile or both Next.js and FastAPI?
6. What exact evidence and state must exist for Server Guy to declare a Release healthy or an Incident Case recovered?
7. How should Pi authentication work in a self-hosted always-on installation?
8. What evidence would justify reconsidering Temporal after V1?
9. What is the minimum telemetry and instrumentation contract for a conformant application?
10. Where are logs, traces, metrics, and backups stored, and what are the retention/privacy defaults?
11. What installation and onboarding flow makes the open-source product genuinely easy for the initial user?

## Independent review input

Fable reviewed these notes read-only on 2026-08-30 through the dedicated `codex-collab-server-guy-review` session. This subsection records reviewer input, not settled product decisions.

Verdict: proceed to specification after defining the authorization boundary precisely and resolving V1's autonomy posture.

Material points to carry into the workshop:

- **Policy inputs must be bounded.** A policy gate should evaluate capability, bound parameters and scope, environment, approval state, and deterministic preconditions computed from Observations. A Finding or Diagnosis should inform planning and the user but should not itself grant authority.
- **Approval needs an explicit unit.** The reviewer recommends authorization bound to concrete capability invocations with parameters, checked again at execution. A revised adaptive plan must not inherit authority for newly added operations merely because an earlier plan was approved.
- **External agent requests are not approvals.** An MCP client may request deployment or verification, but Codex or Claude tool approval must not substitute for approval inside Server Guy.
- **Privilege isolation must be an environment property.** The Operational Reasoner should have evidence adapters rather than unrestricted shell/filesystem access. A Repository Executor may have a sandboxed shell but must not have infrastructure credentials or a network path to privileged provider operations.
- **Recovery needs an asymmetry rule.** Mandatory checks must be necessary. Pi may veto, question, or escalate a recovery result, but it must not declare recovery over a failing mandatory check.
- **V1 should visibly prove governance.** The V1 record should include at least one meaningful gate outcome: either a pre-declared operation runs without a per-action prompt, or policy blocks/downgrades a Pi proposal, with both proposal and result preserved as evidence.
- **V1 capability and V1 proof may differ.** The specification must say whether MCP and the Remediation PR path are required parts of the demonstrated V1 loop or merely available capabilities.

The review's most important product-owner question is whether Server Guy V1 performs any consequential operation while the engineer is absent. This choice affects topology, approval semantics, the always-on component, Pi authentication, and how clearly V1 differs from a general coding agent plus scripts.

Workshop response: invocation-level authorization is considered too restrictive and has not been adopted. The current alternative is a small set of Approval Modes. In Pi Decides mode, Pi itself determines when to ask; Server Guy does not maintain a growing policy inferred from previous approvals.

## Model-native review input

Fable performed a second read-only review on 2026-08-30 after the Approval Mode correction. This subsection is reviewer input plus Codex synthesis, not a settled replacement architecture.

Reviewer verdict: the authority model is now genuinely model-native, but the surrounding architecture still uses workflow-native shapes that subordinate Pi.

Material corrections proposed by the reviewer:

- **The Pi session is the loop.** Server Guy should host and resume a durable Operator Session rather than orchestrate Pi through a fixed Inspect -> Plan -> Execute pipeline. The current pipeline may remain useful as descriptive timeline vocabulary.
- **Pi is the author of record.** Pi should write Findings, Diagnoses, Plans, and Assessments directly as versioned, disputable conclusions citing Observations. Proposal semantics remain useful for approval requests and External Agent Clients, not for every Pi action.
- **Broad tools are scoped by environment and credential custody.** Pi should have a real application-host shell for novel operations. Provider credentials should remain outside that shell and be available through provider tools. Approval Modes govern tool classes without parsing or predefining every command parameter.
- **Operational knowledge starts seeded and becomes model-grown.** Server Guy supplies application contracts and initial provider/stack skills, then preserves Pi-authored runbook notes, learned application quirks, topology, and explicit user intent.
- **Durable user intent matters in addition to Approval Mode.** A short user-authored prose brief can tell Pi what the user values without compiling that intent into rules or learning permission from old approvals.

The reviewer identifies the minimum non-model substrate as Approval Mode enforcement, credential custody, environment scoping, a durable resumable Operator Session, authoritative Release and Incident Case state, provenance-preserving Observations, independent sentinel checks, seed knowledge, model-grown memory, the operator UI, and authenticated MCP transport.

The proposed V1 proof is a failure that no predefined capability anticipates: Pi resumes with application history, diagnoses a full disk through a real shell, composes a repair, decides whether to ask from the selected mode and explicit user intent, verifies recovery using independent sentinel evidence, records the incident, updates application memory, and prepares a durable remediation change.

Codex synthesis:

- The central correction is valid: Pi should be the operational control loop, not merely a proposer inside Server Guy's loop.
- The typed pipeline, Temporal role, proposal language, and deterministic acceptance of a Diagnosis must be reconsidered against this principle.
- The user's previous "plan before action" decision should not be silently discarded. A model-written visible plan may still precede action without becoming a fixed workflow gate; its exact role remains an owner choice.
- Approval Records should remain audit evidence and should not be fed back to Pi by default as permission context. Explicit current user intent is a cleaner context channel.
- Credential isolation and independent observations preserve a minimum reliable floor without forcing Pi into predetermined operations.

## Use-case review input

Fable performed a third read-only review on 2026-08-30 against the first concrete use-case draft. This subsection records the material review and resulting corrections, not answers to the remaining owner choices.

Reviewer verdict: the requested journeys are sufficient to drive the specification after adding one routine journey and clarifying the always-on boundary.

Material corrections incorporated into the draft:

- Added shipping a new Release of an already-live application as a distinct use case. First Application Launch, routine Release deployment, and incident remediation are not the same journey.
- Distinguished Deployment from an Out-of-band Change so direct host repairs remain visible as drift until reconciled with a Release.
- Narrowed the initial alerting journey to detectable application unavailability based on the external Application Contract. Broader degradation depends on unresolved telemetry.
- Added missing engineer/Pi handoffs for Application Contract provenance, guided DNS work, PR merge, deployment, and verification.
- Distinguished the Operational Control Plane from the Operator UI.
- Required redaction on every MCP read path, not only preassembled Evidence Bundles.

The unresolved material issue is the sentinel boundary. Alerting with the laptop closed could be implemented as a prober that persists a detection event and sends a notification, as a small remote control-plane component that also creates Incident Cases, or as infrastructure capable of resuming Pi and acting. The 03:00-to-08:00 scenario is now the next product-owner question.

## Canonical working terms

- **Agent Runtime**: Pi's model, session, tool-loop, and agent execution environment.
- **Model Backend**: the model/provider accessed through Pi.
- **Operational Knowledge**: Server Guy's profiles, contracts, runbooks, policies, and verification knowledge.
- **Operational Control Plane**: authoritative operational state and execution coordination wherever its components run; it is not the Operator UI.
- **External Agent Client**: Codex, Claude, or another agent using Server Guy through MCP.
- **Operational Plan**: Pi-authored proposed approach, expected effects, checks, and escalation conditions; its implementation details may change as evidence appears.
- **Approval Mode**: the explicit user-selected rule governing whether Pi must request approval before state-changing operations: Full Autonomy, Pi Decides, or Always Ask.
- **Approval Record**: historical evidence of the Approval Mode and any explicit approval applicable when an operation occurred; it does not grant authority to future operations.
- **Observation**: a captured operational fact.
- **Evidence Selection**: observations selected as support for a claim.
- **Finding**: an agent interpretation of evidence.
- **Diagnosis**: Pi's current model-authored explanation of an Incident Case, kept distinct from the Observations it cites.
- **Evidence Bundle**: bounded, structured, redacted, source-attributed material for review or handoff.
- **Candidate Fix**: an untrusted proposed repository change.
- **Remediation PR**: the reviewable GitHub artifact for application-code remediation.
- **Release**: the versioned unit intended to run in an environment, identified by an application revision and deployment configuration identity.
- **Deployment**: a transition that moves a specific Release into an environment.
- **Out-of-band Change**: a recorded live-environment mutation not represented by the current Release and therefore visible as drift until reconciled.
- **Alert**: a notification sent to the engineer about a meaningful detection or Incident Case transition; it is not an operational state.
- **Incident Case**: the durable record of a suspected or confirmed service degradation and its investigation, actions, and outcome.
- **Remediation**: a durable operational or repository change intended to correct an incident's cause or prevent recurrence.
- **Recovery**: a recorded outcome supported by evidence that the application has returned to its contract-defined healthy condition.

## Deferred or explicitly non-primary work

- A Server Guy-operated hosted cloud platform.
- Broad enterprise governance and multi-tenant administration.
- A provider or stack marketplace before the initial contracts stabilize.
- Browser-driven account automation as a required V1 capability.
- Full product analytics replacement, full FinOps, broad capacity planning, or automated dependency maintenance.
- Rebuilding Codex or Claude as general coding products.
- Supporting many deployment providers or application stacks before one complete lifecycle works well.
