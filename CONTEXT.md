# Domain language

Definitions used by the [product](PRODUCT.md), [architecture](docs/architecture.md) and code. This glossary does not schedule implementation or claim that every concept has a dedicated database table. [Operator design](docs/operator-design.md) defines the intended architecture. Terms explicitly marked current implementation explain existing code and records, not constraints on the redesign.

## Operator redesign vocabulary

**Application operator**: The persistent owner of operational work for one application, using Pi's native runtime and general tools.

**Main conversation**: The conversation through which the operator executes commands and changes. It accepts queued follow-ups and steering while work is active.

**Side conversation**: A separate read-only discussion of relevant application context and evidence. It does not independently change the application.

**Queued follow-up**: A message Pi processes after its current work finishes, using its native follow-up mechanism. Distinct from the existing operation change queue.

**Steering**: Direction delivered to the active Pi session after the current turn's tool calls finish, before the next model call. It does not itself stop a running command.

**Execution**: A tool invocation with its target, input/command, permission context, output, timing and known or uncertain outcome, recorded automatically.

**Saved application knowledge**: Information Pi deliberately preserves for retrieval. The same record may also be presented to the user; there is no separate mandatory memory/UI copy.

**Presentation / placement**: Optional information assigning a saved record to one or more existing views, with an appropriate summary or role. Exact fields remain a design proposal.

**Permission mode**: Always ask (approval for every code execution), Pi decides (the model judges when to ask), or Bypass (no approval prompts). Independent of operational workflow types.

**Wakeup**: A user message, scheduled trigger or incoming signal that brings work to the application operator. Detailed background care is deferred.

**Complexity tier**: A lightweight, medium or more complicated application used to prove the same architecture progressively. Not a runtime stage or user-selected application category.

## Application and collaboration

**Application**: One independently named deployment of a software stack, with configuration, host, releases, conversations and operational history. Deploying the same source independently creates another Application.

**Stack**: The services, worker processes, schedules, private connections and persistent state required by one Application on one instance.

**Application requirement**: A declared need for running or checking an Application, grounded in its software configuration, documentation or the owner's request. Declaring a requirement does not establish that Server Guy can fulfill it.

**Conversation (Chat in existing code)**: An application-owned transcript and native model session. Conversations have separate drafts/history and share the application's operational state. In the redesign, only the main conversation owns changes; side conversations are read-only.

**Application view**: An inspectable projection of recorded application facts and work, such as deployment, data or health. Chat receipts and views refer to the same records.

**Operation receipt (current implementation)**: The interactive presentation of an operation's origin, progress, required decision, evidence and outcome. A receipt is not a second copy of execution state.

**Pi Run (current implementation)**: One durable attempt to answer an accepted conversation message using the embedded Pi runtime. Retry creates a linked attempt; a successful reply does not prove an external effect.

## Execution and evidence

**Operation (current implementation)**: Application-owned work with a target, origin, state and evidence, shared by every conversation and view.

**Change (current implementation)**: An operation that modifies the application or its surroundings. Only one change executes at a time for an Application.

**Inspection (current implementation)**: An operation that reads evidence without changing the application. Inspections can run alongside changes.

**Queued change (current implementation)**: An approved operation waiting for an earlier change. Its assumptions must still hold when execution begins; changed assumptions require a new decision.

**Cancelled operation (current implementation)**: A proposal or stopped attempt the user chose not to continue. Its record remains part of the application's history.

**Unknown remote outcome**: An attempted external action whose result has not been established. A stopped controller does not establish that the external action stopped.

**Owner attestation (current implementation)**: The owner's recorded statement of what they verified, which releases the change-queue hold of an operation whose capability was retired. Server Guy records the statement without verifying it.
_Avoid_: Acknowledgement

**Observation**: A timestamped fact attributed to its source, such as a probe result, command output, metric sample or provider response.

**Behavior criterion**: An observable outcome chosen to establish that an Application performs an intended task. An observation can satisfy or fail a criterion; a running process alone does not establish useful behavior.

**Finding / diagnosis**: The agent's interpretation of observations, including uncertainty and possible cause. It remains distinguishable from the observations themselves.

**Decision (current implementation)**: An explicit application-specific user requirement or choice, saved with its origin. A replacement supersedes the earlier decision without erasing history.

**Authority**: The permitted target, effects and limits for an action, including required user approval. A model recommendation or available credential does not widen it.

**Release authorization (current implementation)**: Permission to update one application to a selected revision on its existing host, within stated data, exposure and execution limits. A corrected configuration can remain within that permission while creating a distinct release and attempt.

**Activity event**: A meaningful application change or consequential operational result. It is not every message or internal tool call.

**Evidence packet**: A bounded, redacted bundle of application/revision identity, observations, impact and a verification target that an owner or coding agent can use.

## Hosting and releases

**Deployment host**: The user-controlled Linux instance running an application's stack, provisioned through Hetzner or adopted through BYOM.

**Controller**: The Server Guy web/worker installation coordinating work and retaining product records. It can be on the application host or a separate machine.

**Release**: A selected immutable source/image identity and deployment configuration intended to run for an Application.

**Converted release (current implementation)**: A release recorded before schema 14 whose retired deployment plan was converted once into native Compose under its original release identity. Execution reads only its native configuration.
_Avoid_: Legacy plan, DeploymentPlan

**Deployment attempt (current implementation)**: One execution to put a specific release onto an application host and verify it. A retry or container recreation is another attempt, even when its release and host stay the same.

**Last verified runtime**: The release, host and running images established by a completed verification at a recorded time. A later possible remote change makes the current runtime unknown without erasing this historical observation.

**Operational inventory**: An application's identifiable services, storage and network resources, with their source and observation time. Intended configuration and observed runtime are distinct inventory facts.

**Observed runtime**: The application configuration and running images established on a host at a recorded time, whether or not its intended behavior has been verified. A known running configuration and a working application are separate claims.

**Operability change**: A change needed to run or check the application, such as a health endpoint, its start entrypoint or an environment-driven port. Server Guy hands application-code changes to the owner, who merges them before a release deploys them.

**Service role**: The responsibility of a running component within a stack: serving HTTP, consuming background work, brokering work, or providing another private service. A role does not prove health or behavior.

## Background work and protection

**Scheduled job**: An existing application command triggered at specified times with a timezone. A recorded schedule is not evidence that a run succeeded.

**Queue**: Application-owned storage of pending work, implemented by the existing queue library and PostgreSQL or a supported broker.

**Worker**: An application process consuming queued work. Its health and logs are observable independently from the web service; the library owns delivery and retries.

**Backup**: A consistent recoverable copy of specified application or controller state. Creation, off-host transfer and restore verification are separate outcomes.

**Backup capture plan (current implementation)**: The application data to protect, the services that can change it, and the consistency procedure used to capture it together. It describes data and writers rather than supported application names.

**Compatible rollback**: Returning to a previously verified release whose configuration and application code can still use the current data. It does not reverse database migrations or restore an earlier copy of the data.

**Recovery point**: The state/time represented by a particular usable backup. It is not the last time the backup schedule was edited.

**Diagnostic archive**: Retained logs, samples and check results copied off-host. It preserves evidence, not application recovery data or guaranteed live monitoring.

**Issue**: A persistent observed problem with evidence and a next action. A notification delivers attention to an issue; reading it does not resolve the problem.

## Retired and optional terms

**Retired record**: A record of Server Guy's retired preparation workflow, kept read-only as an Observation under its original identity. It grants no authority and never runs again.
_Avoid_: Phase Workspace, Gate Check, Application Contract, Conformance Result, Launch Brief

**Plugin**: The reserved term for an optional future extension with UI and authorized behavior. Plugin implementation is deferred; built-in views do not depend on it.
