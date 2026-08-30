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

**Guided Operation**:
A bounded, ordered subflow used when an operational procedure itself requires a stable protocol; it exists inside an Operator Session rather than controlling the overall session.
_Avoid_: Main workflow, agent pipeline

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
