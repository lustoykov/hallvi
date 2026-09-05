# Workshop review input, 2026-08-30 (archived)

Status: historical reviewer input, moved out of [PRODUCT-WORKSHOP-NOTES.md](../PRODUCT-WORKSHOP-NOTES.md) on 2026-09-05. It records what three read-only Fable reviews said and how the workshop responded at the time. It is not the current data model or a settled specification: it predates the 2026-09-03 Phase 1 simplification, so it still says Operator Session where the product now says Chat, and it discusses Temporal, which is not planned. Current terminology lives in [CONTEXT.md](../../CONTEXT.md); current direction lives in the workshop notes, the [user journeys](../user-journeys/README.md) and the [roadmap](../../ROADMAP.md).

## Independent review input

Fable reviewed these notes read-only on 2026-08-30 through the dedicated `codex-collab-server-guy-review` session. This subsection records reviewer input, not settled product decisions.

Verdict: proceed to specification after defining the authorization boundary precisely and resolving V1's autonomy posture.

Material points to carry into the workshop:

- **Policy inputs must be bounded.** A policy gate should evaluate capability, bound parameters and scope, environment, approval state, and deterministic preconditions computed from Observations. A Finding or Diagnosis should inform planning and the user but should not itself grant authority.
- **Approval needs an explicit unit.** The reviewer recommends authorization bound to concrete capability invocations with parameters, checked again at execution. A revised adaptive plan must not inherit authority for newly added operations merely because an earlier plan was approved.
- **External agent requests are not approvals.** An MCP client may request deployment or verification, but Codex or Claude tool approval must not substitute for approval inside Server Guy.
- **Privilege isolation must be an environment property.** The Operational Reasoner should have evidence adapters rather than unrestricted shell/filesystem access. A Repository Executor may have a sandboxed shell but must not have infrastructure credentials or a network path to privileged provider operations.
- **Recovery needs an asymmetry rule.** Mandatory checks must be necessary. Pi may veto, question, or escalate a recovery result, but it must not declare recovery over a failing mandatory check.
- **V1 should visibly prove governance.** The V1 record should include at least one meaningful gate outcome: either a pre-declared operation runs without a per-action prompt, or policy blocks/downgrades a Pi proposal, with both proposal and result preserved as evidence.
- **V1 capability and V1 proof may differ.** The specification must say whether MCP and the Remediation PR path are required parts of the demonstrated V1 loop or merely available capabilities.

The review's most important product-owner question is whether Server Guy V1 performs any consequential operation while the engineer is absent. This choice affects topology, approval semantics, the always-on component, Pi authentication, and how clearly V1 differs from a general coding agent plus scripts.

Workshop response: invocation-level authorization is considered too restrictive and has not been adopted. The current alternative is a small set of Approval Modes. In Pi Decides mode, Pi itself determines when to ask; Server Guy does not maintain a growing policy inferred from previous approvals.

## Model-native review input

Fable performed a second read-only review on 2026-08-30 after the Approval Mode correction. This subsection is reviewer input plus Codex synthesis, not a settled replacement architecture.

Reviewer verdict: the authority model is now genuinely model-native, but the surrounding architecture still uses workflow-native shapes that subordinate Pi.

Material corrections proposed by the reviewer:

- **The Pi session is the loop.** Server Guy should host and resume a durable Operator Session rather than orchestrate Pi through a fixed Inspect -> Plan -> Execute pipeline. The current pipeline may remain useful as descriptive timeline vocabulary.
- **Pi is the author of record.** Pi should write Findings, Diagnoses, Plans, and Assessments directly as versioned, disputable conclusions citing Observations. Proposal semantics remain useful for approval requests and External Agent Clients, not for every Pi action.
- **Broad tools are scoped by environment and credential custody.** Pi should have a real application-host shell for novel operations. Provider credentials should remain outside that shell and be available through provider tools. Approval Modes govern tool classes without parsing or predefining every command parameter.
- **Operational knowledge starts seeded and becomes model-grown.** Server Guy supplies application contracts and initial provider/stack skills, then preserves Pi-authored runbook notes, learned application quirks, topology, and explicit user intent.
- **Durable user intent matters in addition to Approval Mode.** A short user-authored prose brief can tell Pi what the user values without compiling that intent into rules or learning permission from old approvals.

The reviewer identifies the minimum non-model substrate as Approval Mode enforcement, credential custody, environment scoping, a durable resumable Operator Session, authoritative Release and Incident Case state, provenance-preserving Observations, independent sentinel checks, seed knowledge, model-grown memory, the operator UI, and authenticated MCP transport.

The proposed V1 proof is a failure that no predefined capability anticipates: Pi resumes with application history, diagnoses a full disk through a real shell, composes a repair, decides whether to ask from the selected mode and explicit user intent, verifies recovery using independent sentinel evidence, records the incident, updates application memory, and prepares a durable remediation change.

Codex synthesis:

- The central correction is valid: Pi should be the operational control loop, not merely a proposer inside Server Guy's loop.
- The typed pipeline, Temporal role, proposal language, and deterministic acceptance of a Diagnosis must be reconsidered against this principle.
- The user's previous "plan before action" decision should not be silently discarded. A model-written visible plan may still precede action without becoming a fixed workflow gate; its exact role remains an owner choice.
- Approval Records should remain audit evidence and should not be fed back to Pi by default as permission context. Explicit current user intent is a cleaner context channel.
- Credential isolation and independent observations preserve a minimum reliable floor without forcing Pi into predetermined operations.

## Use-case review input

Fable performed a third read-only review on 2026-08-30 against the first concrete use-case draft. This subsection records the material review and resulting corrections, not answers to the remaining owner choices.

Reviewer verdict: the requested journeys are sufficient to drive the specification after adding one routine journey and clarifying the always-on boundary.

Material corrections incorporated into the draft:

- Added shipping a new Release of an already-live application as a distinct use case. First Application Launch, routine Release deployment, and incident remediation are not the same journey.
- Distinguished Deployment from an Out-of-band Change so direct host repairs remain visible as drift until reconciled with a Release.
- Narrowed the initial alerting journey to detectable application unavailability based on the external Application Contract. Broader degradation depends on unresolved telemetry.
- Added missing engineer/Pi handoffs for Application Contract provenance, guided DNS work, PR merge, deployment, and verification.
- Distinguished the Operational Control Plane from the Operator UI.
- Required redaction on every MCP read path, not only preassembled Evidence Bundles.

The unresolved material issue is the sentinel boundary. Alerting with the laptop closed could be implemented as a prober that persists a detection event and sends a notification, as a small remote control-plane component that also creates Incident Cases, or as infrastructure capable of resuming Pi and acting. The 03:00-to-08:00 scenario is now the next product-owner question.

