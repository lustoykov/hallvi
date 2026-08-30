# Server Guy use cases

Status: workshop draft, not a finished specification and not evidence of implementation.

Detailed product journeys and companion diagrams now live in [`docs/user-journeys/`](./docs/user-journeys/README.md). This file remains the compact cross-journey summary.

These concrete journeys should drive product and architecture decisions. Each use case intentionally leaves consequential product-owner choices explicit.

Canonical distinctions used by the journeys:

- **Application Launch** takes a repository through conformance, infrastructure setup, first Release, external verification, and minimum ongoing operations.
- **Deployment** moves a specific Release into an environment. It does not name every host mutation.
- **Out-of-band Change** is an operational mutation made directly to a live host outside a Release. It remains visible as drift until folded into a Release or explicitly reconciled.
- **Incident Signal** is an Observation suggesting possible unavailability. An **Alert** is a notification sent to the engineer; it is not itself an incident state.
- **Recovery** means service has returned to the contract-defined healthy condition. **Remediation** is the durable change intended to correct the failure or prevent recurrence.
- The **Operational Control Plane** owns authoritative operational state and execution coordination. The **Operator UI** displays and controls that system; the terms are not interchangeable.

## UC1: Launch an application from repository to live service

### User outcome

> Take this repository, get the application live on infrastructure I own, and establish the minimum operations needed to keep it healthy.

### Trigger

The engineer connects or selects a repository and asks Server Guy to launch it.

### Main journey

1. Server Guy creates the application workspace and resumes or starts its Operator Session.
2. The engineer selects an Approval Mode and provides any short prose describing important intent, such as cost sensitivity, acceptable downtime, and data importance.
3. Pi inspects the repository and determines whether it matches a supported Application Profile.
4. Pi drafts or updates the Application Contract and identifies changes needed for conformance. The contract's provenance and confirmation status remain visible; repository changes become a reviewable pull request when appropriate.
5. Pi records a visible launch plan covering the target environment, expected infrastructure, estimated external cost, domain work, and verification approach.
6. Server Guy collects provider access and required user-owned information. VPS provisioning and Domain Setup remain separate operations.
7. Domain Setup runs as a bounded Guided Operation: the engineer chooses the intended hostname; when control is not established, the engineer completes guided acquisition, zone, or nameserver steps; Pi then configures the Cloudflare route and HTTPS and verifies the public hostname externally.
8. Pi provisions through Hetzner tools and configures the application host through a real scoped shell. It may use reusable Guided Operations where the provider or transaction has a stable required protocol.
9. Pi establishes the runtime, PostgreSQL when required, secrets, backups, telemetry, logs, and the external sentinel needed by the Application Contract.
10. Pi deploys the first Release.
11. The sentinel and application-specific checks verify the service from outside the host. Pi assesses the result and resolves any failures adaptively.
12. Server Guy records the live Release, application topology, Pi-authored operational notes, verification evidence, and ongoing health status.

### Successful outcome

- A specific Release is reachable through the intended hostname with valid HTTPS.
- Contract-defined health and smoke checks pass.
- The external sentinel is observing the application.
- Required backup and telemetry responsibilities are visibly configured or explicitly incomplete.
- The user can inspect what Pi did and the evidence supporting the live status.

### Open choices exposed by this journey

- Whether V1 launches one Application Profile or both initial profiles.
- Which infrastructure and domain actions remain user-gated in each Approval Mode.
- Whether initial application-conformance changes are part of the required V1 proof.
- Whether user confirmation of Pi's initial Application Contract is required before first launch or merely reflected as provenance.
- What minimum backup and telemetry setup is required before Server Guy calls the application live.
- Whether V1 supports both an already-owned domain and guided acquisition of a new Cloudflare domain.

## UC2: Detect unavailability and alert the engineer

### User outcome

> Tell me promptly when my application is probably unhealthy, with enough context to understand whether Server Guy is already handling it.

### Trigger

The always-on sentinel captures Incident Signals showing that the application's contract-defined external health check is failing. Broader performance degradation may later enter the same incident model after the telemetry contract is proven.

### Main journey

1. The sentinel records timestamped, source-attributed Observations even if the local Operational Control Plane and Pi are offline.
2. An always-on component applies a contract-defined failure threshold so that one transient failed probe does not necessarily alert the engineer.
3. If the sentinel is only a prober, it persists the minimal detection event and sends an Alert; the Operational Control Plane creates the Incident Case when it next synchronizes. If the sentinel is a small remote control-plane component, it opens or updates the Incident Case before alerting. This topology is unresolved.
4. The Incident Case links the affected application, current Release, recent changes, initial observations, and detection source.
5. If an always-on Pi runtime is available, Server Guy resumes the Operator Session and Pi begins investigation according to the selected Approval Mode.
6. The Alert identifies the application, observed unavailability, detection time, and a route into Server Guy. Pi activity appears in the initial Alert only when it is already known; otherwise it becomes a later status update.
7. Further observations, Pi activity, user messages, and status changes update the same Incident Case rather than producing disconnected alerts.

### Successful outcome

- The engineer receives one understandable Alert through a configured channel.
- The Alert says what is known, what remains uncertain, and whether action is already underway.
- The detection event survives outside the laptop and the resulting Incident Case becomes durable and inspectable from the Operator UI.
- Detection continues to work when the engineer's laptop is closed.

### Open choices exposed by this journey

- Which always-on component owns Incident Case creation and notification while the local Operational Control Plane is offline.
- Initial Alert channels and delivery guarantees.
- Whether Pi investigation begins before, alongside, or only after the first Alert.
- What minimum persistence is required outside the user's laptop.

## UC3: Investigate an incident and verify recovery

### User outcome

> Restore the application, tell me what happened, and prove that it recovered.

### Trigger

An Incident Case exists, whether created by the sentinel, Pi, the engineer, or an External Agent Client.

### Main journey

1. Server Guy resumes the application's Operator Session with the Incident Case, current Release, recent changes, Application Contract, previous incidents, Pi-authored operational notes, and current user intent.
2. Pi chooses what to inspect and gathers Observations through telemetry, provider tools, repository state, and the application-host shell.
3. Pi records Findings and a current Diagnosis as model-authored conclusions citing the relevant Observations. The UI keeps conclusions distinct from facts.
4. Pi records its visible remediation intent or short plan.
5. Pi acts according to the selected Approval Mode. It may compose novel host commands, use a reusable capability, ask the engineer, or request repository work. Direct live-host mutations are recorded as Out-of-band Changes.
6. If application-code work is needed, Pi or an External Agent Client prepares a Candidate Fix and reviewable Remediation PR. CI results become additional evidence.
7. The Remediation PR is reviewed and merged by the engineer or by Pi when the selected Approval Mode permits it. The resulting revision follows UC5 to become a Release.
8. Infrastructure or configuration remediation that does not use a repository change is applied according to the selected Approval Mode and either reconciled into a Release or remains visible as drift.
9. Independent sentinel checks and contract-defined verification produce new Observations. Pi may add semantic checks and may continue investigating when the evidence is insufficient.
10. Pi records Recovery only when the evidence supports it. The Incident Case remains open if recovery is partial or uncertain.
11. Server Guy presents the operational timeline, exact actions, approval history, evidence, remediation artifact, any unreconciled drift, and follow-up work.

### Successful outcome

- The application has a verified operational outcome, not merely an agent claim.
- The user can inspect what Pi observed, concluded, changed, and verified.
- Temporary recovery is distinguished from durable remediation.
- Repository changes are reviewable and linked to the Incident Case.

### Open choices exposed by this journey

- Whether V1 must demonstrate infrastructure/configuration remediation, application-code remediation, or both.
- Which recovery checks are declared by the Application Contract and which Pi selects dynamically.
- Whether any remediation may occur while the engineer and local control plane are offline.
- When an Incident Case can close after service recovery but before durable follow-up is complete.

## UC4: Use Codex through Server Guy to investigate and remediate

### User outcome

> Let Codex understand my application's operational state and prepare or request a fix without manually copying logs and infrastructure context between tools.

### Connection model

Codex connects to Server Guy through MCP. A command may launch the local MCP transport, but this does not require a broad user-facing Server Guy CLI.

### Main journey

1. The engineer configures Codex with Server Guy's MCP endpoint and grants access to a specific Server Guy installation and application scope.
2. Codex discovers applications, active Incident Cases, Releases, Application Contracts, and available tool categories.
3. Codex retrieves a bounded Evidence Bundle or queries relevant redacted Observations, logs, traces, metrics, deployment history, CI state, and Pi-authored operational notes. Redaction applies to every MCP read path, not only preassembled bundles.
4. Codex investigates using its own reasoning and repository tools. It does not need a nested Pi session merely to interpret Server Guy evidence.
5. Codex edits and tests the repository when code or deployment configuration changes are needed.
6. Codex registers a Candidate Fix or Remediation PR with the relevant Incident Case, expected outcome, and verification request.
7. The engineer or Pi merges the Remediation PR according to the selected Approval Mode; UC5 moves the resulting revision through deployment and verification.
8. Server Guy resumes Pi or performs any additional requested verification and operational follow-up according to the selected Approval Mode.
9. Codex and the engineer can inspect the resulting observations, deployment result, and recovery evidence through the same MCP-backed record.

### Initial MCP tool families

- **Application context**: discover applications; read Application Contract, topology, current Release, health, and Pi-authored operational notes.
- **Incident and evidence**: discover Incident Cases; request creation or update of an Incident Case; read timelines; query redacted Observations; obtain bounded Evidence Bundles.
- **Release and repository handoff**: read verification expectations; register a Candidate Fix or Remediation PR; associate commits, CI runs, and claims with an Incident Case.
- **Operational requests**: request verification, deployment, additional evidence collection, or Pi attention through Server Guy rather than pretending that Codex's own tool approval is a Server Guy approval.

### Successful outcome

- Codex receives structured, current operational context without dashboard scraping or manual copy-paste.
- Codex can contribute a reviewable remediation artifact and request operational verification.
- Server Guy remains the shared record of application state, actions, and recovery evidence.

### Open choices exposed by this journey

- Whether Codex is only a contributor or may become an alternative mode-governed operator with host/provider mutation tools.
- Whether V1 includes remote MCP or local MCP only.
- The minimum authentication and application-scoping model.
- Whether Server Guy asks Pi to review every external Candidate Fix or can verify some requests without a nested Pi turn.

## UC5: Ship a new Release of a live application

### User outcome

> Move a new revision of my already-live application into production and either prove it healthy or return to the previous working Release.

### Trigger

A revision is ready after a merged pull request, an explicit engineer request, or an incident remediation handoff.

### Main journey

1. Server Guy associates the revision, deployment configuration identity, predecessor Release, and target environment with a candidate Release.
2. Pi inspects the change and records a visible release intent, including migrations, expected effects, verification, and rollback considerations relevant to this application.
3. Build and CI evidence is collected. Pi resolves failures or asks for repository work when necessary.
4. Pi handles required migrations and deployment according to the selected Approval Mode and the application's current operational context.
5. Contract-defined external checks and Pi-selected semantic checks verify the candidate against the live environment.
6. If verification succeeds, Server Guy records the candidate as the current Release and preserves its predecessor. If it fails, Pi investigates, repairs adaptively, or transitions back to the predecessor Release.
7. Server Guy records the Release timeline, exact operational actions, Out-of-band Changes, evidence, and resulting application status.

### Successful outcome

- One specific Release is recorded as current, with its predecessor and configuration identity known.
- Verification evidence supports the live status.
- A failed candidate does not silently replace the last known-good Release.
- Any live-host drift remains visible until reconciled.

### Open choices exposed by this journey

- Whether every repository merge triggers a candidate Release or deployment is explicitly requested.
- How database migration compatibility and rollback expectations enter the Application Contract.
- What Full Autonomy permits Pi to merge, deploy, repair, or roll back without the engineer.
- Whether rollback is always a previous Release transition or can include a recorded Out-of-band Change.

## Operator UI derived from the use cases

The Operational Control Plane is the authoritative state and execution system wherever it runs. The Operator UI is the set of views through which the engineer understands that state and collaborates with operational agents.

### Portfolio view or application list

This may be only a simple application switcher in a one-application V1 rather than a full dashboard.

- applications and current health;
- active incidents and unresolved alerts;
- current Release and recent change status;
- backup, sentinel, and integration warnings;
- work currently being performed by Pi.

### Application workspace

- current health, Release, domain, infrastructure, and high-level topology;
- live Operator View with Pi's objective, visible intent, activity, commands, results, and conversation;
- Approval Mode and pending approval requests;
- logs, telemetry, costs, backups, and predefined operational views;
- launch/deployment history and Pi-authored operational notes.

### Incident view

- current impact and status;
- detection source, Alert history, and linked Release/recent changes;
- Findings and Diagnosis with cited Observations;
- live remediation activity, approvals, and repository artifacts;
- verification evidence, Recovery assessment, and follow-up work.

### Release history

This may be a section of the Application workspace rather than a separate V1 view.

- revision, configuration identity, environment, and deployment status;
- build, CI, migration, deployment, and verification evidence;
- predecessor/successor Releases and rollback information;
- linked Incident Cases and remediation artifacts.

### Integration and setup view

- repository, Hetzner, Cloudflare, notification, MCP, sentinel, telemetry, and backup connections;
- connection health and scope;
- setup work or user input still required.

## Cross-use-case questions

1. At 03:00 the sentinel sees the application is down and the engineer's computer is offline. What has happened by the time the engineer opens Server Guy at 08:00?
2. Does Pi remain the only operational operator, or can Codex/Claude become mode-governed operators through MCP?
3. Which information is authoritative state, which is an Observation, and which is a model-authored conclusion?
4. Which rigid Guided Operations are necessary for V1, if any?
5. Which use-case path must the V1 demonstration exercise end to end?
