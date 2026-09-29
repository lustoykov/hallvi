---
name: verify-hallvi
description: Choose and perform proportionate verification for Hallvi development changes, including documentation, UI, CLI, operator behavior and retained-state compatibility. Use when implementing, fixing or validating work in this repository; not for Pi operating a user's application.
---

# Verify Hallvi

Read [the verification guide](../../../docs/verification.md) and use the
parts relevant to the change. Run commands from the repository root. Both
the canonical `.agents/skills/verify-hallvi` directory and its
`.claude/skills/verify-hallvi` symlink resolve these relative links there.

Choose a concrete behavior and the cheapest environment that can establish it:
offline scenarios for ordinary UI work, disposable fixtures for destructive
checks, a credential-free snapshot for old records, or an exclusively attached
retained application for real Pi work. Documentation changes need document and
example checks, not a mandatory live-model run.

For operational checks, use the named controller's `apps → exec → wait →
inspect` path in the guide. Match the request to its operation and execution
evidence, then independently verify useful application behavior where relevant.
Keep completion, approval/input, unknown outcomes and timeout distinct. Use
the browser for rendering and interactions. Follow existing ownership,
compatibility and cleanup rules; this skill grants no additional authority.

Include actual observations and limitations in the existing PR verification
section, not merely a declaration that this skill was used. Follow
[AGENTS.md](../../../AGENTS.md) for maintenance: correct demonstrated workflow
defects in the same PR, validate the correction, and leave working guidance
alone. Larger proposals go to [agent feedback](../../../AGENT_FEEDBACK.md).

This is contributor guidance. Never load it or its supporting guide into Pi's
product sessions; send only the scoped application request.
