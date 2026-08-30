# Server Guy

Canonical product language for Server Guy's deployment and operations domain.

## Language

**Model-Native Operation**:
An operating model in which Pi is the primary adaptive control loop and Server Guy supplies its durable context, memory, tools, observations, resumability, approval behavior, and operator interface.
_Avoid_: AI-assisted workflow, model-powered pipeline

**Operator Session**:
A durable, resumable unit of Pi-led operational work that preserves application context, activity, conclusions, approvals, and evidence across interruptions.
_Avoid_: Workflow run, pipeline execution

**Session Event**:
A recorded item in an Operator Session, such as Pi's visible intent, a tool call, command result, Observation, conclusion, approval, or recovery assessment.
_Avoid_: Chain of thought, raw agent trace

**Operator View**:
The structured UI projection of an Operator Session, combining conversation, current activity, timelines, evidence, approvals, and application status.
_Avoid_: Chat window, agent transcript

**Operator UI**:
The engineer-facing interface for viewing and controlling Server Guy's applications, Operator Sessions, Releases, Incident Cases, integrations, and evidence.
_Avoid_: Control plane, dashboard

**Operational Control Plane**:
The authoritative system of record and execution coordination for application state, Releases, Incident Cases, approvals, and operational actions, wherever its components run.
_Avoid_: Operator UI, dashboard

**Guided Operation**:
A bounded, ordered subflow used when an operational procedure itself requires a stable protocol; it exists inside an Operator Session rather than controlling the overall session.
_Avoid_: Main workflow, agent pipeline

**Application Launch**:
The end-to-end journey from repository through conformance, infrastructure setup, first Release, external verification, and minimum ongoing operations.
_Avoid_: Initial deployment, setup

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

**Remediation**:
A durable operational or repository change intended to correct an incident's cause or prevent recurrence.
_Avoid_: Recovery, fix

**Recovery**:
A recorded outcome in which evidence supports that the application has returned to its contract-defined healthy condition.
_Avoid_: Remediation, fix

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
