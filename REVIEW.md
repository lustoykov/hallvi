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

## Visual verification evidence

PRs affecting the user experience must attach or link visual evidence from the
implemented revision using representative application data. Prefer a few
captioned screenshots for layouts and resulting states. Use short video clips
when interaction, transitions, or a sequence matters to understanding the change.

Omit or accelerate waiting periods and clearly mark time skips. Preserve the
action and its result; link longer recordings only when useful for investigating
a failure. Aim for 2–5 screenshots or a 30–90-second clip when appropriate;
these are guidelines, not quotas or duration gates.

State the tested revision, environment, what the evidence demonstrates, and
material limitations. Never include credentials or sensitive user data. Visuals
show what the user saw; operational claims still need supporting execution or
external verification evidence, such as an actual restore behind a backup claim.

Documentation-only and backend-only changes do not require screenshots unless
they help explain the result. Use proportionate document or execution evidence
instead. This guidance does not change roadmap scope or deferred hardening.

## Write actionable findings

Order findings by severity. For each finding, identify the exact location,
explain the concrete failure or cost, and suggest the smallest viable correction.
Separate required fixes from optional observations.
