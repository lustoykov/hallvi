# Server Guy product workshop notes

Status: living planning notes, not a finished specification and not evidence of implementation.

Last updated: 2026-08-30

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

## Central architecture principle

Settled principle:

> Server Guy is an agent-authored, code-governed operational system.

Pi supplies adaptive judgment. Deterministic Server Guy code constrains, authorizes, executes, records, and audits that judgment.

This is not a mostly deterministic workflow with a small AI feature. Many important operational steps require contextual, non-deterministic judgment: selecting relevant evidence, interpreting logs and metrics, diagnosing unfamiliar failures, composing an appropriate plan, adapting that plan, and assessing semantic recovery.

At the same time, Pi must not directly own credentials, authorization, privileged infrastructure mutations, or authoritative operational state.

### Responsibility split

| Question or responsibility | Primary owner |
| --- | --- |
| Which observations are relevant? | Pi |
| What is probably happening? | Pi |
| Which action is operationally appropriate? | Pi |
| Is the action permitted? | Deterministic policy and, when required, the user |
| How is a privileged action performed? | Deterministic capability implementation |
| Did mandatory checks pass? | Deterministic verification |
| Do the results semantically indicate recovery? | Pi, constrained by mandatory checks |
| What operational state is recorded? | Server Guy code |

"Appropriate" and "permitted" are intentionally different. Pi may judge that restarting PostgreSQL is appropriate while Server Guy policy determines that production database restarts require approval.

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

## Core operational pipeline

Current typed pipeline:

```text
Inspect
  -> Resolve profile
  -> Plan
  -> Policy
  -> Approval
  -> Execute
  -> Verify
  -> Evidence
```

The pipeline is adaptive rather than strictly linear. Execution may produce new observations that send Pi back to diagnosis or planning. The durable record must show each proposal, gate, action, result, and revision.

Temporal is the current candidate for durable workflow state, waits, retries, and resumability, but its necessity is still being evaluated. The course stack is now general orientation rather than a requirement that should distort the product.

## Product interfaces

Current V1 interface direction:

1. **Next.js operator UI** for engineers.
2. **Server Guy MCP server** for external agents.

No general-purpose public REST API or user-facing CLI is currently planned for V1. Internal service and transport boundaries may still use HTTP. A remotely hosted MCP endpoint also uses an HTTP transport underneath and therefore requires authentication, authorization, TLS, and application/incident scoping.

The first UI should be thin but useful:

- applications and current status;
- per-application conversation with Server Guy;
- proposed plans and approval requests;
- deployment and incident timelines;
- evidence and explanations;
- remediation and recovery progress;
- a few predefined operational views.

Custom dashboard generation and richer analytics views may come later. Pi should eventually be able to build an on-demand dashboard from Server Guy's telemetry when that is more useful than a fixed view.

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

Examples include deployment, rollback, restart, DNS mutation, machine provisioning, backup restoration, credential rotation, and release promotion. These remain behind Server Guy's policy and approval pipeline rather than being offered as unrestricted agent tools.

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
Engineer -> Server Guy UI -> Pi -> proposed operation -> policy/approval -> execution
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

- Pi creates a visible plan before consequential action.
- Read-only observation and evidence collection can generally run automatically.
- Deterministic, explicitly pre-approved operations may run without per-action approval.
- Purchases, domain actions, machine provisioning, destructive operations, credential changes, and actions outside the configured safety envelope require separate gates.
- Broader emergency authority may eventually be pre-approved, but incident-specific rollback and emergency rules should be designed after the core flow is clear.

"Safe" must eventually be defined through explicit properties: bounded blast radius, authorization, reversibility where possible, preconditions, idempotency, postconditions, evidence, and a stop/escalation rule. It must not mean merely "the model thought it was safe."

"Autonomous" must always specify the capability, environment, policy envelope, and approval state under which Server Guy may act.

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

> Server Guy takes a supported application from repository to live on Hetzner and Cloudflare, continuously observes it, detects a representative failure, uses Pi to diagnose and plan recovery, performs the approved remediation, and verifies recovery with evidence.

This favors one narrow, complete deployment-to-recovery lifecycle over many partially supported stacks and incident types.

## Settled decisions

- Core job: get my application live and keep it healthy.
- V1 must prove the complete repository-to-deployment-to-incident-recovery loop for a narrow supported application.
- Product is for individual engineers and tinkerers first, not enterprises.
- Open-source and useful in its own right; also a course capstone.
- Agent-authored, code-governed operations is the central architecture principle.
- Pi is the only embedded Agent Runtime and is central to the product.
- Server Guy owns operational state, evidence, policy, approvals, privileged capabilities, and verification records.
- UI is the first-class human interface; MCP is the first-class external-agent interface.
- No general public REST API or user-facing CLI is planned for V1.
- External agents receive evidence and submit proposals/candidates through Server Guy rather than bypassing it.
- Application-code fixes use reviewable Remediation PRs.
- Hetzner and Cloudflare form the first provider spine.
- Domain and VPS operations have separate plans and approval gates.
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

1. What is V1's autonomy posture: may any consequential action occur while the engineer is absent, and if so, through a deterministic reflex or through always-on Pi?
2. Does V1 fully support one application profile or both Next.js and FastAPI?
3. What is the minimum useful always-on behavior when the local control plane and Pi are offline?
4. Which actions are pre-approved in normal operation, and which always require the user?
5. What exact evidence and state must exist for Server Guy to declare a Release healthy or an Incident Case recovered?
6. How should Pi authentication work in a self-hosted always-on installation?
7. Does Temporal solve enough durable-workflow complexity to justify requiring it?
8. What is the minimum telemetry and instrumentation contract for a conformant application?
9. Where are logs, traces, metrics, and backups stored, and what are the retention/privacy defaults?
10. What installation and onboarding flow makes the open-source product genuinely easy for the initial user?

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

## Canonical working terms

- **Agent Runtime**: Pi's model, session, tool-loop, and agent execution environment.
- **Model Backend**: the model/provider accessed through Pi.
- **Operational Knowledge**: Server Guy's profiles, contracts, runbooks, policies, and verification knowledge.
- **Operational Control Plane**: authoritative state, evidence, approvals, and controlled execution.
- **External Agent Client**: Codex, Claude, or another agent using Server Guy through MCP.
- **Operational Plan**: Pi-authored proposed sequence of capabilities, checks, expected effects, and escalation conditions.
- **Safety Envelope**: deterministic limits governing which capabilities may run, over what scope, under which approval.
- **Observation**: a captured operational fact.
- **Evidence Selection**: observations selected as support for a claim.
- **Finding**: an agent interpretation of evidence.
- **Diagnosis**: the currently accepted explanation of an Incident Case.
- **Evidence Bundle**: bounded, structured, redacted, source-attributed material for review or handoff.
- **Candidate Fix**: an untrusted proposed repository change.
- **Remediation PR**: the reviewable GitHub artifact for application-code remediation.
- **Release**: a specific application revision and configuration being moved toward live service.
- **Incident Case**: the durable record of a suspected or confirmed service degradation and its investigation, actions, and outcome.
- **Recovery**: a recorded outcome supported by mandatory checks and, when necessary, Pi's semantic assessment.

## Deferred or explicitly non-primary work

- A Server Guy-operated hosted cloud platform.
- Broad enterprise governance and multi-tenant administration.
- A provider or stack marketplace before the initial contracts stabilize.
- Browser-driven account automation as a required V1 capability.
- Full product analytics replacement, full FinOps, broad capacity planning, or automated dependency maintenance.
- Rebuilding Codex or Claude as general coding products.
- Supporting many deployment providers or application stacks before one complete lifecycle works well.
