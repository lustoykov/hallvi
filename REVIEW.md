# Pull Request Review Guide

Review the proposed change only. Do not edit, commit, push, or make product and
design choices on the user's behalf.

## Report material issues

Report defects, security or data-loss risks, broken requirements, missing
verification, and complexity that materially increases maintenance or
operational risk. Do not report formatting preferences, vague concerns, or
speculative improvements.

If there are no material findings, say so directly.

## Prefer the simplest correct design

- Aggressively look for code, abstractions, dependencies, services, workers,
  queues, configuration, state, and workflow steps that can be removed or
  combined.
- Every new piece of machinery must satisfy a concrete current requirement.
  Future flexibility alone is not sufficient.
- Prefer direct code, existing platform capabilities, and small modules over
  generalized systems.
- Ask what required behavior would break if the machinery were deleted. If
  nothing required breaks, recommend deleting it.
- Preserve correctness and capabilities required by the stage under review.
  Do not turn deferred hardening or old acceptance rubrics into new blockers.
- Recommend the smallest corrective change. Do not propose a broad redesign
  unless the current design fundamentally prevents the requirement.

## Follow the agreed architecture

- Use [operator design](docs/operator-design.md) for the new architecture and
  [Roadmap](ROADMAP.md) for stage scope. Existing implementation descriptions
  and dated audits do not require retaining obsolete workflow gates.
- Expect one main operator, general tools, independent permission modes and
  shared knowledge with optional presentation. Reuse Pi's native capabilities.
- Welcome deletion of obsolete code, tests, migrations and recovery machinery.
  Existing development data is explicitly disposable; do not demand compatibility
  adapters or durable approval replay. Pi handles operational repair through general tools.
- Use exactly three permission modes with no provider exception to Bypass.
  Approval is a pending call awaiting the UI decision.
- Welcome deletion of obsolete hardening cases. Report a
  removed check only when the behavior it protected is still required.
- Prove the deployment path before defining all sidebar capabilities. Avoid
  exhaustive compatibility or failure matrices as requirements for early stages.

- Keep the current implementation a full-stack Next.js modular monolith until
  a concrete requirement proves that another service or process is necessary.
- Keep model-native judgment available where the problem is genuinely
  ambiguous. Do not add rigid workflow machinery merely to avoid model
  judgment.
- Keep actions, state changes, operational claims, and verification inspectable
  by the engineer.
- Treat product specifications and planning notes as context, not proof that an
  implementation works.
- Do not silently settle unresolved product decisions in an implementation PR.

## Check the pull request itself

- The PR states the concrete requirement and where reviewers should focus.
- The PR reviews `ROADMAP.md` and includes needed sprint status, scope or sequencing updates, or explains why none are needed. Local work must not be presented as already merged.
- Architecture or control-flow changes are explained with a diagram.
- Verification is proportionate to the risk and supports the claims being made.
- The change does not include unrelated refactors or preparatory machinery.

## Write actionable findings

Order findings by severity. For each finding, identify the exact location,
explain the concrete failure or cost, and suggest the smallest viable correction.
Separate required fixes from optional observations.
