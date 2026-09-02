# Learn the Agent-Engineering Stack Through Server Guy

**Status:** Living learning guide

**Last revised:** 2026-09-01

**Canonical stack:** [`STACK.md`](../../../ai-agent-engineer-roadmap/STACK.md)

## Purpose

Use Server Guy as the practical spine for learning the capabilities in `STACK.md`.

Server Guy is not a container for every named technology. A tool belongs in the product only when a current product requirement justifies it. Capabilities that do not belong in Server Guy should be learned through applications Server Guy operates or through bounded comparison and deployment labs.

The learning objective is production ownership:

> Build a real capability, break it deliberately, recover it, prove the result, and explain the mechanism and tradeoff.

Installing a dependency does not demonstrate that capability.

## Learning architecture

```text
                              Server Guy
                  operational control plane and operator
             approvals · state · evidence · deploy · recover
                                   │
                  ┌────────────────┴────────────────┐
                  │                                 │
         TypeScript agent app              Python service/app
      Next.js · AI SDK · Zod           FastAPI · Pydantic AI
      Workflow DevKit · Drizzle        SQLAlchemy · Alembic
      PostgreSQL                       asyncio worker · PostgreSQL
                  │                                 │
                  └────────── Docker contract ──────┘
                                   │
                            Deployment Host
         Hetzner VPS now · EC2 Host Adapter and AWS labs later
```

There are therefore two learning surfaces:

1. **Server Guy itself** teaches operational system ownership: durable records, typed boundaries, authorization, approvals, idempotency, reconciliation, evidence, observability, deployment, and recovery.
2. **Applications managed by Server Guy** teach the TypeScript and Python application verticals without forcing both runtimes into Server Guy.

## Current baseline

The implemented Phase 1 is a full-stack Next.js modular monolith:

```text
Next.js
├── Operator UI
├── Route Handlers
├── Phase 1 domain logic
├── SQLite Operator Record
├── GitHub adapter
└── Pi SDK adapter
```

It already provides direct practice with:

- React, Next.js App Router, TypeScript, Node, and Vitest;
- relational modeling, constraints, indexes, and transactions through SQLite;
- deterministic application state around a probabilistic model;
- GitHub integration and source-attributed Observations;
- idempotent intake, policy conflicts, provenance stability, and malformed-model-output tests.

Pi's model comes from Pi's own configuration; Server Guy does not currently select a provider or model tier.

It does **not** yet provide direct practice with the stack's default model provider through AI SDK, AI SDK Core, Zod, PostgreSQL/Drizzle, versioned migrations, Workflow DevKit, Promptfoo, Langfuse/OpenTelemetry, Sentry, Docker delivery, a Fastify service, Supabase, `pgvector`, MCP, or ECS/Fargate. Its toolchain is npm and ESLint rather than the stack's pnpm, Biome, and Playwright. Conceptual overlap does not count as direct tool experience.

The current modular monolith is the right product architecture. Do not add a separate API service or worker until a real request-lifetime, retry, timer, concurrency, or crash-survival requirement demands one.

## Map the Server Guy journey to the stack

| Server Guy milestone | Primary learning | Required proof |
| --- | --- | --- |
| **Phase 1 hardening — Start** | TypeScript boundaries, Zod, adversarial tests | Schema-validate API input and Pi output; reject malformed, unsupported, oversized, or fabricated decisions. |
| **Phase 2 — Inspect app** | Typed tools, agent boundaries, Application Contracts, evals, provenance | Every material contract field is schema-valid and cites a repository fact, profile rule, Observation, or explicit decision. Unsupported claims become visible gaps. |
| **Phase 3 — Make launch-ready** | GitHub integration, CI, repository mutation safety, Docker contracts | One exact candidate revision passes profile checks; every required change maps to a reviewed diff and independent evidence. |
| **Phase 4 — Review launch plan** | Deterministic planning, responsibility boundaries, current provider facts | The plan separates provider, Pi, and engineer actions and includes sourced cost, risks, effects, verification, and rollback. |
| **Phase 5 — Set up server** | Authorization, approvals, idempotency, durable Operation state, reconciliation | A provider effect survives duplicate delivery, denial, timeouts, partial success, process crash, and restart without creating a duplicate resource. |
| **Phase 6 — Connect domain** | DNS, TLS, networking, propagation, external verification | Public DNS and HTTPS are observed independently; waits and conflicts remain visible rather than being declared complete. |
| **Phase 7 — Configure and protect** | Secrets, persistence, backup/restore, structured logs, OpenTelemetry, external observer liveness | Required runtime, configuration, telemetry, external observation, and tested recovery evidence are current and inspectable. |
| **Phase 8 — Go live** | Immutable releases, image digests, migrations, semantic checks, rollback | The exact candidate is deployed, externally verified through its intended hostname, deliberately broken, rolled back, and re-verified. |
| **Phase 9 — Handoff** | Operational readiness, evidence bundles, ownership | Current topology, release, health, cost, gaps, drift, responsibilities, runbook, and evidence are available outside completed chats. |
| **Incident recovery journey** | Detection, diagnosis, safe remediation, recovery | Observations remain distinct from model-authored diagnosis; recovery is declared only after fresh contract checks pass. |

## The first learning slice: Phase 2 Application Contract

Implement Phase 2 as a read-only vertical slice before performing infrastructure mutations.

### Build

- Define a Zod schema for build, runtime, port, health, persistence, migrations, configuration, telemetry, and verification requirements.
- Collect repository facts deterministically with source identity and timestamps.
- Let Pi interpret ambiguity and propose contract fields.
- Accept model output only when deterministic validation and evidence support it.
- Store unsupported or unknown fields as explicit gaps.
- Carry one trace ID through inspection, model interaction, validation, and database writes.

### Break

Test at least these cases:

- the valid `todo-fastapi` repository;
- a missing health endpoint;
- a process that binds only to localhost;
- undeclared durable SQLite data inside disposable container storage;
- a malicious README that instructs the agent to ignore policy;
- model output containing invented repository facts;
- a model timeout or malformed structured response.

### AI SDK comparison

Server Guy currently uses Pi. Do not replace it merely to match `STACK.md`.

Implement the same bounded extraction once with AI SDK Core and the same Zod contract. Use the stack's default provider for the comparison, currently OpenAI through AI SDK's OpenAI provider on the Responses API, and keep the provider and model identifiers in configuration so the comparison also proves that a provider change is a configuration change. Compare structured output, cancellation, telemetry, error behavior, and testability. Merge the alternative only if the evidence shows that it improves Server Guy. Until then:

- agent-system capability: practiced through Pi;
- AI SDK Core and the default model provider: practiced only when the comparison or a managed TypeScript application uses them.

## The central reliability exercise: one durable Operation

The first state-changing provider action should use an explicit lifecycle:

```text
proposed
   ↓
awaiting_approval
   ↓
executing
   ↓
verifying
   ├──→ succeeded
   └──→ blocked → reconcile → verifying
```

At minimum, an Operation records:

- stable intent and idempotency identity;
- exact requested arguments and relevant resource version;
- governing policy and approval evidence;
- attempts and external receipts;
- fresh post-action Observations;
- reconciliation result;
- recovery or operator-action state.

The Operator Record is the system of record. Every step that takes an external effect writes its intent, approval, receipt, and outcome there, so a run can be reconciled, replaced, or audited without any workflow engine. If Workflow DevKit is introduced later, its event log is never the system of record.

### Required failure drill

1. Server Guy requests a Deployment Host from Hetzner.
2. Hetzner creates it.
3. Server Guy crashes before recording the receipt.
4. On restart, Server Guy queries fresh provider state.
5. It recognizes the existing server through a stable identity.
6. It records and verifies that server instead of creating another one.

Also test duplicate delivery, permission denial, stale approval, timeout before the external effect, timeout after the effect, and verification failure.

This exercise combines SQL transactions, authorization, idempotency, partial external success, reconciliation, evidence, and recovery. It is the core of the stack's reliability commitment.

## Deployment ladder

Most of the stack can be learned while Server Guy runs locally or on infrastructure owned by the user. The runtime location is not the capability.

```text
Mac development
      ↓
Production-like local Docker
      ↓
Always-on user-owned/home server
      ↓
Public VPS with HTTPS
      ↓
One managed-platform lab
      ↓
One guided AWS lab
```

### 1. Mac development

Develop the UI and deterministic domain behavior. `npm run dev` is a development environment; it does not demonstrate production operation.

### 2. Production-like local Docker

Run the controller, database, and, once it exists, the Fastify workflow service with declared ports, health checks, validated configuration, persistent volumes, migrations, structured logs, and restart tests.

### 3. Always-on user-owned or home server

Exercise LAN authentication, stable addressing, process supervision, upgrades, backups, restore verification, restart behavior, and access from another machine. The controller owns its database; do not synchronize the database file between machines.

### 4. Public VPS

Exercise DNS, TLS, external health checks, monitoring, immutable image-based releases, secret provisioning, backup/restore, rollback, and independent verification.

### 5. Managed-platform lab

Deploy one bounded TypeScript application through Vercel and Supabase to learn previews, runtime constraints, managed Auth/Storage/PostgreSQL behavior, and platform rollback. Run its durable agent loop as a Workflow DevKit workflow in the Vercel World. Server Guy does not need to become a managed-cloud product.

### 6. Guided AWS lab

Manually deploy the same application through GitHub Actions → ECR → ECS/Fargate with an Application Load Balancer, RDS, Secrets Manager, and CloudWatch; cause a failure, roll back, and verify recovery. Inside Server Guy, AWS enters first as an EC2 Host Adapter that emits the same Host Record as the Hetzner path. Keep the AWS ECS/Fargate Deployment Target outside Server Guy automation until concrete demand justifies it; see [AWS integration direction](../integrations/aws.md).

## Learn the two application verticals through managed applications

### TypeScript vertical

Build or select one small but real agent application using:

- React and Next.js App Router;
- AI SDK UI streaming that returns a run ID, reconnects from the last index, and recovers state from PostgreSQL rather than from the stream;
- AI SDK Core with the stack's default model provider configured, not hard-coded;
- Zod tool and output contracts;
- a Workflow DevKit agent loop whose model calls, tool executions, and authoritative writes are `"use step"` units, with `needsApproval` waits for approvals;
- PostgreSQL and Drizzle, with `supabase-js` only on the managed path;
- Vitest plus repository-owned evals, Promptfoo matrices gating CI, and Playwright for the streaming and approval flows;
- pnpm, pinned Node LTS, and Biome;
- Docker and a declared operational contract.

Make Server Guy inspect, deploy, observe, break, recover, and hand off that application.

This application is also the reference system that `STACK.md` names as its evidence. Until it runs, every `STACK.md` choice is a provisional recommendation, so record what the application proves or contradicts.

### Python vertical

Use `todo-fastapi` as the initial client-owned Python service that Server Guy must inspect, containerize, deploy, and recover. Practice FastAPI, Pydantic configuration, SQLAlchemy/Alembic, `uv`, Ruff, Pyright, pytest, Pydantic Evals, health, migrations, telemetry, and rollback through the application contract.

When the service needs background work, use a plain `asyncio` worker whose durability comes from PostgreSQL-recorded operation state and idempotent restarts. Add Pydantic AI's DBOS integration only for resumable multi-step runs.

Add Pydantic AI only when a Python service has a genuine agent responsibility. Do not rewrite Server Guy in Python to manufacture tool coverage.

## Introduce supporting systems only at their trigger

| Capability or tool | Trigger |
| --- | --- |
| **PostgreSQL + Drizzle** | Introduce for direct practice or when shared controller/worker state, concurrency, or operational scale makes SQLite insufficient. Preserve the same domain invariants and rerun the same tests. |
| **Workflow DevKit in a Fastify service** | Introduce when monitoring, timers, autonomous retries, or crash-surviving reconciliation can no longer remain request-bound. Run the work as Workflow DevKit workflows in the Postgres World inside a containerized Fastify service, which requires PostgreSQL first. The Operator Record stays the system of record; the workflow event log never is. |
| **Run-ID streaming** | Introduce when a Pi turn outlives one request or the Operator View must survive a reload mid-turn: the request returns a run ID, the UI streams and reconnects from its last index, and state is recovered from the Operator Record rather than from the stream. |
| **Structured logs + OpenTelemetry** | Add before the first multi-component operation; propagate one trace ID through model, domain, provider, and verification boundaries. |
| **Langfuse** | Add for model and agent traces/evaluations after telemetry is instrumented. Installation alone does not produce useful traces. |
| **Sentry** | Add when external users receive releases and application exceptions need release-aware grouping. |
| **Promptfoo** | Add when prompt/model matrices, adversarial suites, or CI gates are valuable beyond repository-owned fixtures. |
| **MCP** | Add a basic, least-privilege interface when an External Agent Client needs bounded Server Guy observations or operations. |
| **PostgreSQL full-text search** | Add when the Operator Record becomes difficult to search with ordinary queries. |
| **pgvector** | Add only after measured retrieval quality justifies semantic or hybrid retrieval, using the stack's default embedding model; add a reranker only when measured retrieval quality justifies it. |
| **Playwright** | Add when the Operator UI has a streaming or approval flow worth an end-to-end test, starting with the first approved Operation. |
| **pnpm and Biome** | Practice through the managed TypeScript application; do not churn Server Guy's npm and ESLint setup without a concrete reason. |
| **Temporal** | Add only when a client already runs it or cross-service orchestration with in-flight versioning needs a workflow platform beyond Workflow DevKit. |
| **Inngest, Braintrust, OpenTofu, Vault, Kubernetes, PostHog, deeper AWS** | Keep on demand until a current product or client requirement justifies them, as `STACK.md` defines. |

## Observability learning target

One operation should be traceable as:

```text
Operator message
   → Pi/model interaction
   → validated decision or proposed Operation
   → policy and approval evaluation
   → provider call
   → provider receipt
   → fresh verification probe
   → Operational Claim
```

Use the same correlation identity across:

- Langfuse for model and agent behavior;
- OpenTelemetry and structured logs for runtime operations;
- Sentry for release-aware application exceptions;
- the Operator Record for durable approvals, effects, receipts, and claims.

Telemetry explains behavior. It does not replace authorization, approval, authoritative state, audit evidence, or external verification. Exclude secrets and unnecessary sensitive data.

## Learning definition of done for every PR

```text
Solve → Break → Prove → Explain → Transfer
```

1. **Solve:** deliver one real user outcome.
2. **Break:** inject at least three relevant failure modes.
3. **Prove:** verify the final state with automated tests, evals, and fresh external evidence where applicable.
4. **Explain:** document the mechanism, boundaries, data flow, unchanged areas, and tradeoff in the PR description; medium and large PRs also include the `diagram-design` architecture explanation under `docs/architecture/`.
5. **Transfer:** explain how the same capability would change with another provider, framework, runtime, or deployment environment.

Record learning evidence in the PR:

- capability exercised;
- failure modes tested;
- tests, evals, and external evidence;
- recovery result;
- architecture explanation;
- what remains unpracticed;
- next product trigger, if any.

## Recommended milestone order

1. Harden Phase 1 inputs and Pi output with Zod and adversarial tests.
2. Implement the Phase 2 Application Contract as a read-only vertical slice.
3. Compare the same bounded extraction with AI SDK Core.
4. Specify and test the durable Operation lifecycle without a provider mutation.
5. Reconcile the first real Hetzner host effect through approval and verification.
6. Containerize and deploy the first exact application Release to a VPS.
7. Add structured logs, OpenTelemetry, and Langfuse with one correlation identity.
8. Introduce Workflow DevKit in the Postgres World inside a Fastify service, after PostgreSQL, when continuous observation or retries require it.
9. Break, recover, roll back, and externally re-verify a deployed application.
10. Add the EC2 Host Adapter that emits the same Host Record and reuses the Linux-host lifecycle.
11. Complete the home-server, managed-platform, Python, and AWS ECS/Fargate transfer labs without expanding Server Guy's V1 product boundary.

## Guardrails

- Prefer the simplest architecture that satisfies the current Server Guy requirement.
- Keep deterministic code responsible for permissions, authoritative writes, state transitions, stop rules, and verification.
- Use Pi for interpretation, ambiguity, diagnosis, and revision—not as the authorization or state boundary.
- Distinguish an Observation from a model-authored Finding or Diagnosis and from a user-visible Operational Claim.
- Do not declare success from a command exit code alone; verify the intended external state.
- Untrusted content such as a README, model output, or provider response cannot change policy or trigger an unapproved effect.
- Keep the model provider and model identifiers in configuration so a provider change is a configuration change, not a rewrite.
- Do not add a technology solely to mark it as learned.
- Keep vendor-specific practice bounded and keep the Server Guy product provider-independent where intended.

## References

- [`STACK.md`](../../../ai-agent-engineer-roadmap/STACK.md)
- [`ROADMAP.md`](../../../ai-agent-engineer-roadmap/ROADMAP.md)
- [Journey 1: Application Launch](../user-journeys/01-application-launch.md)
- [AWS integration direction](../integrations/aws.md)
- [Shared discussion: Connect Server Guy to `STACK.md`](https://chatgpt.com/s/cx_6a9714af692c819182087392e7a2105b)
