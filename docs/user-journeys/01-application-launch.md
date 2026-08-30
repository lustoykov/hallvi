# Journey 01: Launch an application

Status: workshop draft. This is a product-level journey, not an implementation plan.

[Open the two-diagram visual](./diagrams/01-application-launch.html)

## Product promise

> Give Server Guy a supported repository. Collaborate where necessary. Finish with the application live on infrastructure you own, externally observed, and ready for routine operations.

This journey is **Application Launch**. It is not merely a Deployment: it includes application conformance, infrastructure and domain setup, the first Release, verification, and the minimum ongoing operational baseline.

## Primary user

An individual engineer or technically capable tinkerer who wants to self-host but does not want to reconstruct VPS, DNS, runtime, database, backup, telemetry, and verification practices for every application.

## Starting state

- The engineer has a repository and access to its GitHub project.
- The application is not yet managed by Server Guy in the target environment.
- The engineer has or can create Hetzner and Cloudflare access.
- The repository may not yet conform to a supported Application Profile.

## User journey

| Phase | Engineer experience | Pi and Server Guy behavior | Phase exit |
| --- | --- | --- | --- |
| 1. Start | Selects a repository, target environment, Approval Mode, and a short intent brief such as cost sensitivity or data importance. | Creates the application workspace and a durable Operator Session. Makes missing prerequisites visible. | The application and authority context are explicit. |
| 2. Understand | Watches Pi inspect the repository and explain what it believes the application needs. Corrects wrong assumptions. | Resolves a supported Application Profile, drafts the Application Contract, and marks inferred, repository-declared, user-confirmed, and unknown fields distinctly. | A credible contract and a bounded list of conformance gaps exist. |
| 3. Conform | Reviews repository changes when the application needs health endpoints, configuration, logging, or deployment files. | Prepares a reviewable repository change when conformance requires source-controlled work. It does not call an unsupported application deployable. | Required conformance work is merged or explicitly unresolved. |
| 4. See the launch | Reviews Pi's visible launch intent: target topology, expected costs, provider actions, user actions, verification, and meaningful risks. | Adapts the plan as evidence changes. VPS provisioning and domain/DNS work remain separate visible operations. | The engineer understands what will be created and what participation is needed. |
| 5. Supply access | Connects provider access and performs any guided manual account action. Responds to approval requests required by the selected mode. | Validates access and preserves credential scope. Uses a Guided Operation only where a stable external protocol benefits from one. | Hetzner and Cloudflare prerequisites are ready. |
| 6. Establish operations | Watches host, database, runtime, secrets, backup, telemetry, logs, and sentinel work appear as inspectable activity rather than a spinner. | Provisions and configures the owned environment, using broad scoped tools and reusable capabilities as appropriate. | The environment can accept the first Release and expose operational evidence. |
| 7. Go live | Sees the exact revision being deployed and whether it is merely reachable or actually verified. | Creates and deploys the first Release, then runs contract-defined external checks and Pi-selected semantic checks. | Verification supports or rejects the live claim. |
| 8. Handoff | Lands in an application workspace showing current Release, health, costs, backups, telemetry, recent work, and ongoing observation. | Records topology, Release identity, evidence, outstanding gaps, and Pi-authored operational notes. | The application has entered ongoing operations. |

The phases are a user-facing progression, not a mandatory Pi call sequence. Pi may loop between inspection, conformance, provisioning, and verification when new facts invalidate an earlier assumption.

## What the Operator UI must make clear

- The current objective and Pi's visible intent.
- What Server Guy inferred versus what the repository or engineer declared.
- Which Application Profile matched and where conformance is incomplete.
- Estimated provider cost before paid resources are created.
- Separate status and approval moments for VPS work and domain/DNS work.
- Which exact revision and configuration identify the first Release.
- Whether the application is reachable, verified, or blocked; these are not synonyms.
- What Pi is doing now, what requires the engineer, and what is paused without changing state.

Conversation is available throughout, but the primary surface is a structured application workspace with an Operator View—not a chat transcript that hides state.

## Approval and trust behavior

- Read-only repository and provider inspection can normally begin automatically.
- State-changing work follows the selected Approval Mode: Full Autonomy, Pi Decides, or Always Ask.
- Provider access does not imply permission to create every possible resource.
- VPS and domain/DNS work are separate user-understandable operations even when Pi can perform both.
- An approval or active mode is recorded as evidence of why an action was allowed at that moment; it does not become future permission.

## Evidence produced

- Application Contract with provenance and unresolved fields.
- Application Profile match and conformance findings.
- Launch intent and user-supplied operating preferences.
- Provider responses and the identities of created resources.
- Repository revision and deployment configuration identity.
- Build, migration, Deployment, and external verification Observations.
- Backup, telemetry, log, and sentinel setup status.
- First Release and resulting application topology.

## Successful outcome

Server Guy may call the Application Launch complete only when:

- a specific Release is reachable through the intended domain;
- contract-defined external health and smoke checks pass;
- ongoing external observation is active;
- required backup, log, and telemetry responsibilities are configured or explicitly reported as incomplete;
- the user can inspect what happened and the evidence supporting the result.

“The container is running” is not sufficient. “The Deployment command returned success” is not sufficient.

## Important alternate paths

- **Unsupported repository:** Server Guy explains the unmatched contract instead of improvising an unbounded production setup.
- **Conformance needs code:** a reviewable pull request precedes the first Release.
- **Provider or account step blocks automation:** the Operator Session pauses with a precise user action and resumes without losing context.
- **Verification fails:** Pi investigates adaptively; the candidate is not presented as a healthy current Release merely because it was deployed.
- **Local interruption:** durable session state allows the launch to resume, but actions requiring a local Pi runtime cannot continue while it is offline.

## Product requirements derived from the journey

- One narrow Application Profile must work end to end before multiple profiles are claimed.
- The application workspace must survive interruptions and preserve provenance.
- Every paid or account-level operation must expose expected effect and external cost before it occurs.
- The product must establish the observation path during launch, not treat monitoring as optional post-launch housekeeping.
- Application Contract gaps must remain visible; Pi confidence must not silently erase an unknown.

## Outside this journey

- Provider and stack marketplaces.
- Broad multi-cloud portability.
- Browser-controlled domain purchasing as a required V1 capability.
- Dependency updates, capacity optimization, or complete product analytics.

## Consequential unresolved choices

1. **What is the minimum operational baseline required before Server Guy says “live”?** In particular: external sentinel, database backup, structured logs, traces/metrics, and restore verification.
2. Does V1 fully launch one Application Profile or both initial Next.js and FastAPI profiles?
3. Must the engineer confirm the initial Application Contract before paid infrastructure work begins, or is visible provenance enough in Full Autonomy and Pi Decides modes?
4. Which account actions, if any, remain user-only even in Full Autonomy?

## V1 acceptance scenario

A fresh supported repository is connected. Server Guy makes it conformant, creates the separately authorized Hetzner and Cloudflare setup, deploys an exact first Release, verifies it from outside the host, and leaves the engineer in an application workspace with ongoing observation and inspectable evidence.
