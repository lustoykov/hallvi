# Server Guy

Canonical product language for Server Guy's deployment and operations domain.

## Language

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
