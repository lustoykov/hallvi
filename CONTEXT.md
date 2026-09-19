# Domain language

Definitions used by the [product](PRODUCT.md), [architecture](docs/architecture.md) and code. This glossary does not schedule implementation or claim that every concept has a dedicated database table. [Operator design](docs/operator-design.md) defines the intended architecture. Terms marked *projection* are read out of saved records rather than stored as their own entity: they have no table, and the module that derives them is named.

## Operator redesign vocabulary

**Application operator**: The persistent owner of operational work for one application, using Pi's native runtime and general tools.

**Main conversation**: The conversation through which the operator executes commands and changes. It accepts queued follow-ups and steering while work is active.

**Side conversation**: A separate read-only discussion of relevant application context and evidence. It does not independently change the application.

**Queued follow-up**: A message Pi processes after its current work finishes, using its native follow-up mechanism. Distinct from the existing operation change queue.

**Steering**: Direction delivered to the active Pi session after the current turn's tool calls finish, before the next model call. It does not itself stop a running command.

**Execution**: A tool invocation with its target, input/command, permission context, output, timing and known or uncertain outcome, recorded automatically.

**Saved application knowledge**: Information Pi deliberately preserves for retrieval. The same record may also be presented to the user; there is no separate mandatory memory/UI copy.

**Presentation / placement**: Optional information assigning a saved record to one or more existing views, with an appropriate summary or role. Exact fields remain a design proposal.

**Permission mode**: One of the three modes defined in [Product](PRODUCT.md#permission-modes), independent of operational workflow types.

**Wakeup**: A user message, scheduled trigger or incoming signal that brings work to the application operator. Detailed background care is deferred.

**Complexity tier**: A lightweight, medium or more complicated application used to prove the same architecture progressively. Not a runtime stage or user-selected application category.

## Application and collaboration

**Application**: One independently named deployment of a software stack, with configuration, host, releases, conversations and operational history. Deploying the same source independently creates another Application.

**Stack**: The services, worker processes, schedules, private connections and persistent state required by one Application on one instance.

**Application requirement**: A declared need for running or checking an Application, grounded in its software configuration, documentation or the owner's request. Declaring a requirement does not establish that Hallvi can fulfill it.

**Conversation (Chat in existing code)**: An application-owned transcript and native model session. Conversations have separate drafts/history and share the application's operational state. In the redesign, only the main conversation owns changes; side conversations are read-only.

**Application view**: An inspectable projection of recorded application facts and work, such as deployment, data or health. Chat receipts and views refer to the same records.

**Operation receipt**: The interactive presentation of an operation's origin, progress, required decision, evidence and outcome, drawn by `operation-receipt.tsx`. A receipt is not a second copy of execution state.

**Reply** (`pi-conversation.ts`): What Pi said and did between two of the owner's messages, as one transcript row. Its evidence and approvals attach to it. It is not a unit of scheduling: Pi's native session decides what runs and when, and Hallvi records what happened. It says how it ended (completed, failed, stopped, interrupted); a completed reply does not prove an external effect.

**Waiting message**: An accepted message Pi has not read yet. It becomes *delivered* when Pi reads it, *cancelled* when the conversation is stopped first or Pi could not be started, or *interrupted* when Hallvi stopped as Pi read it and Pi kept no record. Only a waiting message is ever handed to Pi.

## Execution and evidence

**Operation** (*projection*, `operation-record.ts`): Application-owned work with a target, origin, state and evidence, shared by every conversation and destination. It is assembled from saved records and execution evidence; no table holds one.

**Change** (*projection*): An operation that modifies the application or its surroundings. The worker runs one turn at a time, so one change executes at a time.

**Inspection** (*projection*): An operation that reads evidence without changing the application.

**Unknown remote outcome**: An attempted external action whose result has not been established. A stopped controller does not establish that the external action stopped.

**Observation**: A timestamped fact attributed to its source, such as a probe result, command output, metric sample or provider response.

**Behavior criterion**: An observable outcome chosen to establish that an Application performs an intended task. An observation can satisfy or fail a criterion; a running process alone does not establish useful behavior.

**Finding / diagnosis**: The agent's interpretation of observations, including uncertainty and possible cause. It remains distinguishable from the observations themselves.

**Decision**: An explicit application-specific user requirement or choice, saved with its origin. A replacement supersedes the earlier decision without erasing history. The `Decision` type survives in `types.ts`, but nothing populates it: the operator view returns an empty list, so a requirement Pi should keep is saved information like anything else.

**Authority**: The permitted target, effects and limits for an action, including required user approval. A model recommendation or available credential does not widen it.

**Activity event**: A meaningful application change or consequential operational result. It is not every message or internal tool call.

**Evidence packet**: A bounded, redacted bundle of application/revision identity, observations, impact and a verification target that an owner or coding agent can use.

## Hosting and releases

**Deployment host**: The user-controlled Linux instance running an application's stack, provisioned through Hetzner or adopted through BYOM.

**Controller**: The Hallvi web/worker installation coordinating work and retaining product records. It can be on the application host or a separate machine.

**Release**: A selected immutable source/image identity and deployment configuration intended to run for an Application.

**Deployment attempt**: One execution to put a specific release onto an application host and verify it. A retry or container recreation is another attempt, even when its release and host stay the same. It is recorded as saved information about the release, not as an attempt row.

**Last verified runtime**: The release, host and running images established by a completed verification at a recorded time. A later possible remote change makes the current runtime unknown without erasing this historical observation.

**Operational inventory**: An application's identifiable services, storage and network resources, with their source and observation time. Intended configuration and observed runtime are distinct inventory facts.

**Observed runtime**: The application configuration and running images established on a host at a recorded time, whether or not its intended behavior has been verified. A known running configuration and a working application are separate claims.

**Operability change**: A change needed to run or check the application, such as a health endpoint, its start entrypoint or an environment-driven port. Hallvi hands application-code changes to the owner, who merges them before a release deploys them.

**Service role**: The responsibility of a running component within a stack: serving HTTP, consuming background work, brokering work, or providing another private service. A role does not prove health or behavior.

## Background work and protection

**Scheduled job**: An existing application command triggered at specified times with a timezone. A recorded schedule is not evidence that a run succeeded.

**Queue**: Application-owned storage of pending work, implemented by the existing queue library and PostgreSQL or a supported broker.

**Worker**: An application process consuming queued work. Its health and logs are observable independently from the web service; the library owns delivery and retries.

**Backup**: A consistent recoverable copy of specified application or controller state. Creation, off-host transfer and restore verification are separate outcomes.

**Compatible rollback**: Returning to a previously verified release whose configuration and application code can still use the current data. It does not reverse database migrations or restore an earlier copy of the data.

**Recovery point**: The state/time represented by a particular usable backup. It is not the last time the backup schedule was edited.

**Diagnostic archive**: Retained logs, samples and check results copied off-host. It preserves evidence, not application recovery data or guaranteed live monitoring.

**Issue**: A persistent observed problem with evidence and a next action. A notification delivers attention to an issue; reading it does not resolve the problem.

## Retired and optional terms

**Retired record**: A record of Hallvi's retired preparation workflow, kept read-only as an Observation under its original identity. It grants no authority and never runs again.
_Avoid_: Phase Workspace, Gate Check, Application Contract, Conformance Result, Launch Brief

**Plugin**: The reserved term for an optional future extension with UI and authorized behavior. Plugin implementation is deferred; built-in views do not depend on it.
