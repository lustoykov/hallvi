# Server Guy

Canonical product language for Server Guy's deployment and operations domain.

## Language

**Model-Native Operation**:
An operating model in which Pi handles interpretation, ambiguity, diagnosis, and plan revision while Server Guy supplies durable context, tools, observations, resumability, approval behavior, and inspectable execution. A model-native product may still use deterministic procedures wherever the next valid operation follows from explicit desired state and fresh observations.
_Avoid_: AI-assisted workflow, model-powered pipeline

**Chat**:
A durable conversation between the engineer and Pi inside one Phase Workspace. A phase may contain many Chats with separate transcripts and shared operational state.
_Avoid_: Operator Session, workflow run, pipeline execution

**Phase Workspace**:
The durable collaboration boundary for one Launch Phase, containing every Chat created to produce the shared Phase Deliverable and satisfy its Exit Gate. Completing the phase makes its Chats read-only together; no single Chat owns phase progress.
_Avoid_: Phase chat, workflow run, second application record

**Launch Phase**:
A user-visible segment of Application Launch organized around one Phase Workspace, one Phase Deliverable, and one Exit Gate. It describes progress for the engineer without prescribing Pi's internal reasoning sequence.
_Avoid_: Agent step, pipeline stage

**Phase Deliverable**:
The named, durable outcome a Launch Phase must produce, such as an Application Contract, Host Record, or Verified Release.
_Avoid_: Task list, phase goal

**Exit Gate**:
The small set of observable conditions that must be satisfied before Application Launch advances to the next Launch Phase. An unmet condition remains visible as waiting or blocked rather than being treated as progress.
_Avoid_: Vague completion, confidence score, checklist progress

**Gate Requirement**:
A stable product rule defining one condition that must be satisfied before an Exit Gate passes. It names the required evidence but is not itself application state.
_Avoid_: Gate Check result, database rule, manual checkbox

**Gate Check**:
One observable condition inside an Exit Gate whose current result is recomputed from its source and supporting evidence. Its human-readable condition is its name; any stable identifier is only a reference for records and evidence. It is not a decision and cannot be manually marked as passed.
_Avoid_: Decision, manual checkbox, confidence judgment, internal reference as the name

**Decision**:
A durable, revisable choice or constraint recognized from a Chat and stored with its originating message and affected application. A replacement supersedes the prior Decision without erasing its history.
_Avoid_: Chat message, Gate Check, application configuration, product rule, permanent preference

**Control Point**:
A user-facing path from a Decision, Gate Check, Operational Claim, or operational fact to its meaning, provenance, affected source, takeover actions, and re-verification. It keeps model-authored explanation, the governing rule, and supporting evidence distinguishable.
_Avoid_: Help tooltip, status override

**Operator Takeover**:
The engineer or an External Agent Client inspecting and changing the underlying decision, repository, configuration, or provider state before Server Guy re-verifies the result.
_Avoid_: Manual pass, bypass, leaving Server Guy

**Activity Event**:
A durable historical item such as a Chat creation, tool call, command result, Decision change, Observation, approval, or recovery assessment.
_Avoid_: Chain of thought, raw agent trace

**Operator View**:
The generated application view combining the selected Chat, current Decisions, Observations, Gate Checks, upcoming requirements, and activity. It is rebuilt from durable records rather than stored as one polymorphic record.
_Avoid_: Operator Record, Chat transcript, dashboard state

**Operator UI**:
The engineer-facing interface for viewing and controlling Server Guy's applications, Chats, Releases, Incident Cases, integrations, and evidence.
_Avoid_: Control plane, dashboard

**Operational Control Plane**:
The authoritative system of record and execution coordination for application state, Releases, Incident Cases, approvals, and operational actions, wherever its components run.
_Avoid_: Operator UI, dashboard

**Guided Operation**:
A bounded, ordered subflow used when an operational procedure itself requires a stable protocol; it exists inside a Chat rather than controlling the overall conversation.
_Avoid_: Main workflow, agent pipeline

**Launch Reconciliation**:
The repeated comparison of an Application Contract's desired state with fresh repository, provider, host, and public Observations, followed by a dependency-ordered plan that brings actual state toward the contract. Supported launch paths are deterministic until the evidence cannot identify one valid resolution.
_Avoid_: Deployment wizard, opaque agent run, one-shot setup

**Operation Graph**:
The inspectable, dependency-ordered set of Operations currently required by Launch Reconciliation. It is recomputed when desired state or material Observations change rather than treated as a permanent script.
_Avoid_: Agent plan, hidden tool sequence, checklist

**Judgment Point**:
An explicit condition where current evidence and rules do not determine one valid next state. Pi investigates, explains, recommends, or asks for user intent; the resulting desired state is then re-planned through Launch Reconciliation.
_Avoid_: Every model call, silent guess, generic approval

**Operation**:
A durable record of one intended external effect, including its subject, actor, authority context, execution or reconciliation state, verification, evidence, and outcome.
_Avoid_: Workflow run, agent step, tool call

**Blocker**:
A precise explanation derived when an unresolved condition prevents an Operation or Exit Gate from advancing, including its affected scope, supporting evidence, owner, and possible resolutions.
_Avoid_: Generic error, vague risk, failed task

**Application Profile**:
A supported stack-specific interpretation of the Application Contract, including the conventions Server Guy can inspect, establish, and operate.
_Avoid_: Plugin, deployment template

**Application Contract**:
The explicit operational agreement describing how an application is built, configured, checked, observed, backed up, migrated, and verified, including the provenance of each field.
_Avoid_: Inferred setup, runbook

**Deployment Host**:
The provider-independent Linux machine accepted by Server Guy as the place where application Releases run, whether the machine was adopted or provisioned. Its provider identity, capabilities, reachability, cost, and readiness are captured in a Host Record.
_Avoid_: Hetzner server, EC2 instance, managed application platform

**Application Launch**:
The end-to-end journey from repository through conformance, infrastructure setup, first Release, external verification, and minimum ongoing operations.
_Avoid_: Initial deployment, setup

**Domain Setup**:
The user-visible operation that makes an intended hostname authoritative for an application, including domain control, DNS routing, HTTPS, and external verification.
_Avoid_: DNS configuration, domain purchase

**Release**:
The versioned unit intended to be running in an environment, identified by an application revision and deployment configuration identity.
_Avoid_: Deployment, server state

**Deployment**:
A transition that moves a specific Release into a target environment.
_Avoid_: Application Launch, host change

**Out-of-band Change**:
A recorded mutation to a live environment that is not represented by its current Release and therefore remains visible as drift until reconciled.
_Avoid_: Hotfix, invisible manual change

**Incident Signal**:
An Observation suggesting that an application may be unavailable or unhealthy; it does not by itself establish an Incident Case.
_Avoid_: Alert, incident

**Alert**:
A notification sent to the engineer about a meaningful Incident Case or detection transition. It is a delivery event, not an operational state.
_Avoid_: Incident, alarm state

**Incident Case**:
The durable record of suspected or confirmed service trouble, including its observations, conclusions, actions, approvals, artifacts, and outcome.
_Avoid_: Alert, outage

**Observation**:
A source-attributed, timestamped operational fact such as a probe result, log event, metric sample, trace, command result, revision, configuration value, or provider response.
_Avoid_: Finding, Diagnosis, evidence claim

**Operational Claim**:
A user-visible assertion about an application's current or past operational state, such as “public health check passed” or “Release verified.” It must cite the Observations, Decisions, or receipts that support it and must not imply more certainty or duration than those sources establish.
_Avoid_: Observation, source fact, unsupported status

**Evidence Reference**:
An inspectable link from an Operational Claim to a supporting Observation or receipt, including source identity, observation time, collection method, raw result, and artifact identity when available.
_Avoid_: Product definition link, confidence score, explanation without proof

**Finding**:
A model-authored interpretation of selected Observations, kept revisable and distinct from the facts it cites.
_Avoid_: Observation, confirmed fact

**Diagnosis**:
Pi's current model-authored explanation of an Incident Case, supported by cited Observations and open to revision as evidence changes.
_Avoid_: Root-cause fact, Observation

**Evidence Bundle**:
A bounded, structured, redacted, timestamped, and source-attributed package assembled for a Release, Incident Case, engineer review, or External Agent Client.
_Avoid_: Log dump, context paste

**Remediation**:
A durable operational or repository change intended to correct an incident's cause or prevent recurrence.
_Avoid_: Recovery, fix

**Recovery**:
A recorded outcome in which evidence supports that the application has returned to its contract-defined healthy condition.
_Avoid_: Remediation, fix

**Candidate Fix**:
An untrusted proposed repository change intended to address an Incident Case or operational requirement; it has not earned acceptance merely by existing or passing local tests.
_Avoid_: Fix, Recovery

**Remediation PR**:
The reviewable GitHub pull request that carries an application-code Candidate Fix and links it to its expected operational outcome and verification.
_Avoid_: Fix PR, automatic repair

**External Agent Client**:
Codex, Claude, or another independent agent that uses Server Guy through MCP while retaining its own reasoning and repository tools.
_Avoid_: Embedded runtime, Pi worker

**Approval Mode**:
The explicit user-selected rule governing whether Pi must request approval before state-changing operations.
_Avoid_: Permission template, Operational Mandate

**Full Autonomy**:
An Approval Mode in which Pi may perform state-changing operations without required user approval.
_Avoid_: Bypass permissions

**Pi Decides**:
An Approval Mode in which Pi decides whether a state-changing operation warrants user approval.
_Avoid_: Auto-approve, ask when risky

**Always Ask**:
An Approval Mode in which user approval is required before every state-changing operation; read-only observation remains automatic.
_Avoid_: Restricted mode

**Approval Record**:
Historical evidence of the Approval Mode and any explicit approval applicable when an operation occurred. It is not permission or precedent for future operations.
_Avoid_: Learned permission, approval memory
