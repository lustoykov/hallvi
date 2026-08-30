# Journey 01: Launch an application

Status: workshop draft. This is a product-level journey, not an implementation plan.

[Open the three-diagram visual](./diagrams/01-application-launch.html)

[Open the source-linked Operator UI state map](./01-application-launch-ui-map.md)

[Open the interactive 36-state UI storyboard](../../prototypes/application-launch-ui/README.md)

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

Each phase is organized around a named **Phase Deliverable**. Pi may reason and act adaptively, but its visible intent must say which deliverable it is working toward. Application Launch advances only when the phase's **Exit Gate** is satisfied. A blocked or waiting gate remains visible; the UI must not imply that clicking “next” completes it.

| Phase | Phase Deliverable | Engineer experience | Pi and Server Guy behavior | Exit Gate |
| --- | --- | --- | --- | --- |
| 1. Start | **Launch Brief** — application identity, repository, environment, Approval Mode, operating intent, and known prerequisites. | Selects a repository, target environment, Approval Mode, and a short intent brief such as cost sensitivity or data importance. | Creates the application workspace and a durable Operator Session. Makes missing prerequisites visible. | Application identity is recorded; the repository is readable; environment, authority, and operating intent are explicit. |
| 2. Understand | **Application Contract** — profile resolution, operational contract, provenance, and bounded gaps. | Watches Pi inspect the repository and explain what it believes the application needs. Corrects wrong assumptions. | Resolves an Application Profile match or explicit mismatch, drafts the Application Contract, and marks inferred, repository-declared, user-confirmed, and unknown fields distinctly. | Profile resolution is recorded; material contract fields have provenance; every material unknown is resolved or named as a conformance blocker. |
| 3. Conform | **Conformance Result** — exact eligible revision plus evidence that required profile checks pass. | Reviews repository changes when the application needs health endpoints, configuration, logging, or deployment files. | Prepares a reviewable repository change when conformance requires source-controlled work. It does not call an unsupported application deployable. | Required changes are merged; profile checks pass for the exact revision; unresolved required gaps stop the launch. |
| 4. See the launch | **Launch Plan** — topology, cost, actions, participation, verification, and material risks. | Reviews Pi's visible launch intent: target topology, expected costs, provider actions, user actions, verification, and meaningful risks. | Adapts the plan as evidence changes. VPS provisioning and domain/DNS work remain separate visible operations. | Target topology and expected cost are explicit; provider and engineer actions are separated; verification and material risks are named. |
| 5. Establish the VPS | **Host Record** — owned machine identity, cost, reachability, and readiness evidence. | Connects Hetzner access and handles the VPS approval required by the selected mode. | Validates provider access, creates the planned machine, and records its identity and cost separately from domain work. | The intended host exists; its identity and actual cost are recorded; readiness checks show it can accept operational setup. |
| 6. Establish the domain | **Domain Route** — authoritative hostname, DNS route, HTTPS state, and external observations. | Chooses the intended hostname. Uses an existing Cloudflare-controlled domain or follows a guided manual path to acquire, add, or delegate one. | Runs Domain Setup as a bounded Guided Operation: confirms control, configures DNS routing and HTTPS through Cloudflare, waits through propagation, and verifies the public hostname from outside the host. | Domain control is observed; intended DNS and valid HTTPS are observed externally; unresolved propagation or conflicts block advancement. |
| 7. Establish operations | **Operational Baseline** — runtime, database, secrets, backup, logs, telemetry, and sentinel responsibilities with evidence. | Watches host, database, runtime, secrets, backup, telemetry, logs, and sentinel work appear as inspectable activity rather than a spinner. | Configures the owned environment, using broad scoped tools and reusable capabilities as appropriate. | Required baseline responsibilities are explicit; required services are ready; operational evidence channels are reporting. |
| 8. Go live | **Verified Release** — exact revision and configuration supported as live by external contract and semantic checks. | Sees the exact revision being deployed and whether it is merely reachable or actually verified through the intended hostname. | Creates and deploys the first Release, then runs contract-defined external checks and Pi-selected semantic checks through the public route. | The exact candidate is deployed; contract checks pass through the intended hostname; required semantic checks pass and the Release is recorded as current. |
| 9. Handoff | **Operations Handoff** — current topology, Release, health, cost, evidence, gaps, and active observation. | Lands in an application workspace showing current Release, domain, health, costs, backups, telemetry, recent work, and ongoing observation. | Records topology, domain state, Release identity, evidence, outstanding gaps, and Pi-authored operational notes. | Launch evidence is assembled; accepted gaps and ownership are visible; ongoing observation is active in the normal application workspace. |

The phases are a user-facing progression, not a mandatory Pi call sequence. Pi may loop between inspection, conformance, provisioning, and verification when new facts invalidate an earlier assumption.

## What the Operator UI must make clear

- The current objective and Pi's visible intent.
- The current Phase Deliverable, the Exit Gate conditions, and which condition blocks advancement.
- What Server Guy inferred versus what the repository or engineer declared.
- Which Application Profile matched and where conformance is incomplete.
- Estimated provider cost before paid resources are created.
- Separate status and approval moments for VPS work and domain/DNS work.
- Intended hostname, registrar/zone location, control status, nameserver/delegation work, DNS route, HTTPS status, propagation state, and external verification.
- Which exact revision and configuration identify the first Release.
- Whether the application is reachable, verified, or blocked; these are not synonyms.
- What Pi is doing now, what requires the engineer, and what is paused without changing state.

Conversation with Pi is the primary interaction surface throughout Application Launch. A persistent structured Operator Record sits beside it and reflects the current phase, decisions, facts, approvals, resources, blockers, and evidence produced through the conversation. Chat drives collaboration; the Operator Record prevents that collaboration from hiding or losing operational state.

An application may have multiple Operator Sessions. The engineer can start, switch, resume, and archive them. Each session keeps its own conversation and activity history while reading from and contributing recognized outcomes to the same application-scoped Operator Record. Archiving a session removes it from the active chat list; it does not erase decisions, evidence, or operational state already recorded.

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

## Settled decisions for this journey

- V1 Domain Setup supports both starting paths: the engineer already owns a domain, or the engineer needs to acquire one.
- An existing domain may remain registered elsewhere; Server Guy guides adding the Cloudflare zone and nameserver delegation when Cloudflare is not yet authoritative.
- When no domain is owned, Server Guy guides the user through the Cloudflare acquisition/account step.
- Pi begins automated DNS routing, HTTPS setup, and external verification only after Server Guy can observe domain control.

## Consequential unresolved choices

1. **What is the minimum operational baseline required before Server Guy says “live”?** In particular: external sentinel, database backup, structured logs, traces/metrics, and restore verification.
2. Does V1 fully launch one Application Profile or both initial Next.js and FastAPI profiles?
3. Must the engineer confirm the initial Application Contract before paid infrastructure work begins, or is visible provenance enough in Full Autonomy and Pi Decides modes?
4. Which account actions, if any, remain user-only even in Full Autonomy?

## V1 acceptance scenario

A fresh supported repository is connected. Server Guy makes it conformant, creates the separately authorized Hetzner VPS, guides or completes Domain Setup through Cloudflare, deploys an exact first Release, verifies it through the intended public HTTPS hostname, and leaves the engineer in an application workspace with ongoing observation and inspectable evidence.
