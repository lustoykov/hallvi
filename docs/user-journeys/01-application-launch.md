# Journey 01: Launch an application

Status: workshop draft. This is a product-level journey, not an implementation plan.

[Open the three-diagram visual](./diagrams/01-application-launch.html)

## Product promise

> Give Server Guy a supported repository. Collaborate where necessary. Finish with the application live on infrastructure you own, externally observed, and ready for routine operations.

This journey is **Application Launch**. It is not merely a Deployment: it includes application conformance, infrastructure and domain setup, the first Release, verification, and the minimum ongoing operational baseline.

## Primary user

An individual engineer or technically capable tinkerer who wants to self-host but does not want to reconstruct VPS, DNS, runtime, database, backup, telemetry, and verification practices for every application.

## Starting state

- The engineer has a repository and access to its GitHub project.
- The application is not yet managed by Server Guy in the target environment.
- The engineer has or can create Hetzner and Cloudflare access.
- The engineer may already control a domain or may need a guided path to acquire and delegate one.
- The repository may not yet conform to a supported Application Profile.

## User journey

| Phase | Engineer experience | Pi and Server Guy behavior | Phase exit |
| --- | --- | --- | --- |
| 1. Start | Selects a repository, target environment, Approval Mode, and a short intent brief such as cost sensitivity or data importance. | Creates the application workspace and a durable Operator Session. Makes missing prerequisites visible. | The application and authority context are explicit. |
| 2. Understand | Watches Pi inspect the repository and explain what it believes the application needs. Corrects wrong assumptions. | Resolves a supported Application Profile, drafts the Application Contract, and marks inferred, repository-declared, user-confirmed, and unknown fields distinctly. | A credible contract and a bounded list of conformance gaps exist. |
| 3. Conform | Reviews repository changes when the application needs health endpoints, configuration, logging, or deployment files. | Prepares a reviewable repository change when conformance requires source-controlled work. It does not call an unsupported application deployable. | Required conformance work is merged or explicitly unresolved. |
| 4. See the launch | Reviews Pi's visible launch intent: target topology, expected costs, provider actions, user actions, verification, and meaningful risks. | Adapts the plan as evidence changes. VPS provisioning and domain/DNS work remain separate visible operations. | The engineer understands what will be created and what participation is needed. |
| 5. Establish the VPS | Connects Hetzner access and handles the VPS approval required by the selected mode. | Validates provider access, creates the planned machine, and records its identity and cost separately from domain work. | The owned host exists and is ready for application configuration. |
| 6. Establish the domain | Chooses the intended hostname. Uses an existing Cloudflare-controlled domain or follows a guided manual path to acquire, add, or delegate one. | Runs Domain Setup as a bounded Guided Operation: confirms control, configures DNS routing and HTTPS through Cloudflare, waits through propagation, and verifies the public hostname from outside the host. | The intended HTTPS hostname is verified or visibly waiting/blocked. |
| 7. Establish operations | Watches host, database, runtime, secrets, backup, telemetry, logs, and sentinel work appear as inspectable activity rather than a spinner. | Configures the owned environment, using broad scoped tools and reusable capabilities as appropriate. | The environment can accept the first Release and expose operational evidence. |
| 8. Go live | Sees the exact revision being deployed and whether it is merely reachable or actually verified through the intended hostname. | Creates and deploys the first Release, then runs contract-defined external checks and Pi-selected semantic checks through the public route. | Verification supports or rejects the live claim. |
| 9. Handoff | Lands in an application workspace showing current Release, domain, health, costs, backups, telemetry, recent work, and ongoing observation. | Records topology, domain state, Release identity, evidence, outstanding gaps, and Pi-authored operational notes. | The application has entered ongoing operations. |

The phases are a user-facing progression, not a mandatory Pi call sequence. Pi may loop between inspection, conformance, provisioning, and verification when new facts invalidate an earlier assumption.

## What the Operator UI must make clear

- The current objective and Pi's visible intent.
- What Server Guy inferred versus what the repository or engineer declared.
- Which Application Profile matched and where conformance is incomplete.
- Estimated provider cost before paid resources are created.
- Separate status and approval moments for VPS work and domain/DNS work.
- Intended hostname, registrar/zone location, control status, nameserver/delegation work, DNS route, HTTPS status, propagation state, and external verification.
- Which exact revision and configuration identify the first Release.
- Whether the application is reachable, verified, or blocked; these are not synonyms.
- What Pi is doing now, what requires the engineer, and what is paused without changing state.

Conversation is available throughout, but the primary surface is a structured application workspace with an Operator View—not a chat transcript that hides state.

## Approval and trust behavior

- Read-only repository and provider inspection can normally begin automatically.
- State-changing work follows the selected Approval Mode: Full Autonomy, Pi Decides, or Always Ask.
- Provider access does not imply permission to create every possible resource.
- VPS and domain/DNS work are separate user-understandable operations even when Pi can perform both.
- Domain acquisition, registrar checkout, and nameserver delegation begin as guided user-owned account steps; after Cloudflare control is established, Pi can configure and verify the route according to Approval Mode.
- An approval or active mode is recorded as evidence of why an action was allowed at that moment; it does not become future permission.

## Evidence produced

- Application Contract with provenance and unresolved fields.
- Application Profile match and conformance findings.
- Launch intent and user-supplied operating preferences.
- Provider responses and the identities of created resources.
- Intended hostname, domain-control evidence, DNS changes, propagation observations, HTTPS result, and external hostname verification.
- Repository revision and deployment configuration identity.
- Build, migration, Deployment, and external verification Observations.
- Backup, telemetry, log, and sentinel setup status.
- First Release and resulting application topology.

## Successful outcome

Server Guy may call the Application Launch complete only when:

- the intended hostname resolves through Cloudflare to the application and serves valid HTTPS;
- a specific Release is reachable and externally verified through that hostname;
- contract-defined external health and smoke checks pass;
- ongoing external observation is active;
- required backup, log, and telemetry responsibilities are configured or explicitly reported as incomplete;
- the user can inspect what happened and the evidence supporting the result.

“The container is running” is not sufficient. “The Deployment command returned success” is not sufficient.

## Important alternate paths

- **Unsupported repository:** Server Guy explains the unmatched contract instead of improvising an unbounded production setup.
- **Conformance needs code:** a reviewable pull request precedes the first Release.
- **Provider or account step blocks automation:** the Operator Session pauses with a precise user action and resumes without losing context.
- **No domain is owned yet:** Server Guy guides acquisition/addition in Cloudflare, then resumes only after it can observe control.
- **Domain is registered elsewhere:** Server Guy guides zone creation and nameserver delegation without pretending propagation is immediate.
- **Existing DNS conflicts:** Pi presents the conflict and expected impact rather than overwriting unrelated records silently.
- **DNS or certificate propagation is pending:** Domain Setup remains waiting, with observed state and a resumable next check.
- **Verification fails:** Pi investigates adaptively; the candidate is not presented as a healthy current Release merely because it was deployed.
- **Local interruption:** durable session state allows the launch to resume, but actions requiring a local Pi runtime cannot continue while it is offline.

## Product requirements derived from the journey

- One narrow Application Profile must work end to end before multiple profiles are claimed.
- The application workspace must survive interruptions and preserve provenance.
- Every paid or account-level operation must expose expected effect and external cost before it occurs.
- Domain Setup must be a resumable product state, not an instruction page the user leaves and manually reconciles later.
- Public verification must use the intended HTTPS hostname, not only an IP address or localhost check.
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
5. Must V1 support both an already-owned domain and guided acquisition of a new Cloudflare domain, or only one starting path?

## V1 acceptance scenario

A fresh supported repository is connected. Server Guy makes it conformant, creates the separately authorized Hetzner VPS, guides or completes Domain Setup through Cloudflare, deploys an exact first Release, verifies it through the intended public HTTPS hostname, and leaves the engineer in an application workspace with ongoing observation and inspectable evidence.
