# Learn the Agent-Engineering Stack Through Server Guy

**Status:** Living learning guide

**Last revised:** 2026-09-05

**Canonical stack:** [`STACK.md`](../../../ai-agent-engineer-roadmap/STACK.md)

## Purpose

Use Server Guy as the practical spine for learning the capabilities in `STACK.md`.

This guide owns capability mapping and learning exercises. The [development roadmap](../../ROADMAP.md) owns build order and implementation status; [user journeys](../user-journeys/README.md) own product behavior; the [testing guide](../testing/phase-one-acceptance.md) owns executable acceptance and verification evidence. Learning exercises below are not an independent backlog or a replacement for product exit gates.

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
       Next.js · Pi · Zod              FastAPI · Pydantic AI
       Node worker · Drizzle            SQLAlchemy · Alembic
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

The implemented Phase 1 is a Next.js modular monolith plus one local Node worker. The [README architecture section](../../README.md#architecture) shows the current shape and the [roadmap](../../ROADMAP.md#development-sequence) owns what is merged, open or planned; this guide does not repeat that status.

It already provides direct practice with:

- React, Next.js App Router, TypeScript, Node, Zod, and Vitest;
- relational modeling, constraints, indexes, and transactions through SQLite, with Drizzle as the typed schema and query layer;
- deterministic application state around a probabilistic model;
- explicit Pi setup and explicit GitHub connection: credential detection without silent adoption, scoped repository verification, and source-attributed Observations;
- durable requests: idempotent acceptance, one local worker, cancellation, timeout, interruption and linked retry, revisioned messages, reconnectable SSE, native conversation persistence/compaction and current-state retrieval;
- schema-validated request and model boundaries, policy conflicts, provenance stability, and adversarial malformed-model-output tests;
- desktop Playwright journeys over real Next.js, SQLite and worker processes with synthetic providers, plus opt-in real-Pi evals with exact state checks, human verdicts and an advisory LLM judge.

Pi is Server Guy's only model and agent runtime. The [roadmap's Pi setup decision](../../ROADMAP.md#configure-pi-explicitly) records how login, model and effort are chosen and stored. Server Guy does not import machine tools, extensions or instructions, copy Codex CLI credentials, overwrite global Pi model settings, or automatically fall back to API billing.

The [Phase 1 acceptance contract](../testing/phase-one-acceptance.md) turns the journey into observable pass/fail cases: Vitest for rules and atomic writes, checked-in desktop Playwright journeys for navigation and recovery, and separate opt-in real-Pi cases for model behavior. A passing synthetic test proves UI and state behavior, not live model quality.

The [real-Pi casebook](../testing/phase-one-acceptance.md#real-pi-casebook-and-remaining-phase-1-gates) makes that distinction executable. Course exercise: show that a structurally valid, correctly persisted Decision can still misrepresent a question as a commitment; write an eval for that mistake, run the real model, review meaning, then measure a change against the same cases. Add evals alongside each phase instead of postponing them to a final testing chapter. The runner is Vitest with exact state checks; human verdicts and the optional advisory judge live in the local testing dashboard, not a new eval platform, and LLM advice never counts as human sign-off.

Server Guy does **not** yet provide direct practice with PostgreSQL, versioned migrations, Workflow DevKit, Promptfoo, Langfuse/OpenTelemetry, Sentry, Docker delivery, Supabase, `pgvector`, MCP, or ECS/Fargate. Its toolchain is npm and ESLint rather than the stack's pnpm and Biome. Conceptual overlap does not count as direct tool experience. AI SDK and `useChat` are intentionally not Server Guy dependencies: Pi owns model interaction, while application code owns durable state, validation, authorization, evidence, and reconnection.

The current modular monolith is the right product architecture. Keep the UI, API, and domain logic together, and do not add a separate general-purpose API service. Treat independent worker processes as the [horizontal worker scaling study](../../ROADMAP.md#later-architecture-study--horizontal-workers-and-durable-queues), not hidden scope.

## Map the Server Guy journey to the stack

The phase names refer to the [product journey](../user-journeys/01-application-launch.md#nine-phase-journey). This table maps learning opportunities, not development order or completion status.

| Launch phase / journey | Primary learning | Learning proof |
| --- | --- | --- |
| **Phase 1 — Start** | TypeScript boundaries, Zod, TypeBox, adversarial tests, intent evals | Validate API input with Zod and Pi tool arguments with TypeBox; reject invalid writes. Separately evaluate whether real Pi proposals reflect the user's intent, with exact state checks and human meaning review. |
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

Use the Phase 2 read-only Application Contract slice for the exercises below. Its scheduling and prerequisites live in the [development sequence](../../ROADMAP.md#development-sequence).

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
- a model timeout, missing assistant message, or malformed Decision tool call.

### Pi runtime boundary

Server Guy calls Pi directly. Pi returns normal conversational text and may call the typed `propose_decision` tool for a durable user choice. The Pi SDK validates Decision arguments with TypeBox; application code normalizes accepted values, validates the final message, checks Decision domain rules, and commits the completed assistant answer and Decisions together; the user message was already saved at acceptance. Pi never becomes the authorization, persistence, gate-evaluation, or evidence boundary.

Do not add AI SDK Core or `useChat` as an additional model abstraction or streaming layer. Durable Pi runs use SQLite-backed Pi Run and accumulated assistant-message state, one local Node worker process, and a reconnectable SSE endpoint; the [durable requests contract](../specs/durable-pi-requests.md) owns that behavior. The message's persisted content, status, and revision are authoritative; SSE frames are delivery notifications rather than token-per-row records. Revisit Workflow DevKit only when timers, autonomous retries, monitoring, or multi-step crash recovery create a concrete need beyond that design.

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

Server Guy's durable application records are the system of record. Every step that takes an external effect writes its intent, approval, receipt, and outcome there, so a run can be reconciled, replaced, or audited without any workflow engine. If Workflow DevKit is introduced later, its event log is never the system of record.

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

Run the controller, database, and Node worker with declared ports, health checks, validated configuration, persistent volumes, migrations, structured logs, and restart tests.

### 3. Always-on user-owned or home server

Exercise LAN authentication, stable addressing, process supervision, upgrades, backups, restore verification, restart behavior, and access from another machine. The controller owns its database; do not synchronize the database file between machines.

### 4. Public VPS

Exercise DNS, TLS, external health checks, monitoring, immutable image-based releases, secret provisioning, backup/restore, rollback, and independent verification.

### 5. Managed-platform lab

Deploy one bounded TypeScript application through Vercel and Supabase to learn previews, runtime constraints, managed Auth/Storage/PostgreSQL behavior, and platform rollback. A Workflow DevKit lab may be added when the application has a real durability trigger. Server Guy does not need to become a managed-cloud product.

### 6. Guided AWS lab

Manually deploy the same application through GitHub Actions → ECR → ECS/Fargate with an Application Load Balancer, RDS, Secrets Manager, and CloudWatch; cause a failure, roll back, and verify recovery. Inside Server Guy, AWS enters first as an EC2 Host Adapter that emits the same Host Record as the Hetzner path. Keep the AWS ECS/Fargate Deployment Target outside Server Guy automation until concrete demand justifies it; see [AWS integration direction](../integrations/aws.md).

## Learn the two application verticals through managed applications

### TypeScript vertical

Build or select one small but real agent application using:

- React and Next.js App Router;
- Pi as the direct agent runtime, with its provider and model selected through explicit configuration;
- streaming that returns a run ID, reloads the latest message revision, reconnects to SSE, and recovers state from PostgreSQL rather than from the stream;
- typed tool and output contracts;
- a plain durable worker first; add a Workflow DevKit loop only after a concrete trigger proves it reduces operational complexity;
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
| **Drizzle over SQLite** | Introduced as the typed schema/query layer before durable Pi state. SQLite, `better-sqlite3`, WAL, foreign keys, transactions, and the prototype reset policy remain; `drizzle-kit push` explicitly applies the TypeScript schema. |
| **PostgreSQL** | Introduce for direct practice or when shared controller/worker state, concurrency, or operational scale makes SQLite insufficient. Preserve the same Drizzle domain schema and invariants where the database differences allow it, and rerun the same tests. |
| **SQLite + Node worker** | Introduced with [durable Pi requests](../specs/durable-pi-requests.md) because a Pi turn outlives one request: Pi Run and assistant-message state persist, one local worker process schedules work, and disconnects or process restarts recover from saved state. No leases; treat independent workers as a separate architecture study rather than silently expanding this design. |
| **Workflow DevKit** | Re-evaluate when monitoring, timers, autonomous retries, or multi-step crash recovery make the SQLite-and-Node-worker design difficult to operate. Durable application records remain authoritative. |
| **Run-ID streaming** | Introduced with the durable Pi worker: the request returns a run ID, the UI reloads the current message revision and reconnects to SSE, and state is recovered from SQLite rather than from the stream. |
| **Structured logs + OpenTelemetry** | Add before the first multi-component operation; propagate one trace ID through model, domain, provider, and verification boundaries. |
| **Langfuse** | Add for model and agent traces/evaluations after telemetry is instrumented. Installation alone does not produce useful traces. |
| **Sentry** | Add when external users receive releases and application exceptions need release-aware grouping. |
| **Promptfoo** | Add when prompt/model matrices, adversarial suites, or CI gates are valuable beyond repository-owned fixtures. |
| **MCP** | Add a basic, least-privilege interface when an External Agent Client needs bounded Server Guy observations or operations. |
| **PostgreSQL full-text search** | Add when durable application records become difficult to search with ordinary queries. |
| **pgvector** | Add only after measured retrieval quality justifies semantic or hybrid retrieval, using the stack's default embedding model; add a reranker only when measured retrieval quality justifies it. |
| **Playwright** | Introduced for checked-in desktop journeys over real Next.js, SQLite and worker processes with synthetic providers: two smoke journeys in CI, the full suite on demand. Extend it to approval flows with the first approved Operation. |
| **pnpm and Biome** | Practice through the managed TypeScript application; do not churn Server Guy's npm and ESLint setup without a concrete reason. |
| **Temporal** | Add only when a client already runs it or cross-service orchestration with in-flight versioning needs a workflow platform beyond Workflow DevKit. |
| **Inngest, Braintrust, OpenTofu, Vault, Kubernetes, PostHog, deeper AWS** | Keep on demand until a current product or client requirement justifies them, as `STACK.md` defines. |

Horizontal worker scaling is deliberately deferred, not solved by the table above. When a release or client design genuinely needs independent workers, use the [horizontal worker scaling study](../../ROADMAP.md#later-architecture-study--horizontal-workers-and-durable-queues) to reproduce claim and crash failures, compare database queues, message queues, and durable workflows, and choose from measured requirements. The result should be an ADR and runnable failure scenarios, not an assumed default technology.

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
- Server Guy's durable application records for approvals, effects, receipts, and claims.

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

Moved to the [development roadmap](../../ROADMAP.md#development-sequence). Keep the sequence and its status there; use this guide for the learning exercises attached to each milestone.

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
- [Server Guy development roadmap](../../ROADMAP.md)
- [AI Agent Engineer course roadmap (separate project)](../../../ai-agent-engineer-roadmap/ROADMAP.md)
- [Journey 1: Application Launch](../user-journeys/01-application-launch.md)
- [AWS integration direction](../integrations/aws.md)
- [Shared discussion: Connect Server Guy to `STACK.md`](https://chatgpt.com/s/cx_6a9714af692c819182087392e7a2105b)
